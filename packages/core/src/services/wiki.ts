import { diffText } from '../diff';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import {
  docToText,
  emptyDoc,
  has,
  newId,
  Permission,
  RESERVED_WIKI_SLUGS,
  sanitizeDoc,
  slugifyTitle,
  wikiPageInputSchema,
} from '@magnox/shared';
import { z } from 'zod';
import { requirePerm, type MemberContext } from '../access';
import { AppError, forbidden, notFound } from '../errors';
import { communityChanged } from '../emitter';
import { enforceRateLimit } from '../ratelimit';
import { audit } from './audit';
import { queueMediaCleanup } from './media-cleanup';
import { queueFanout } from './notify';

export type WikiPageRow = typeof schema.wikiPages.$inferSelect;

export interface WikiTreeNode {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
  protected: boolean;
  children: WikiTreeNode[];
}

export function canEditWiki(ctx: MemberContext, page?: Pick<WikiPageRow, 'protected'>): boolean {
  if (!ctx.userId || !ctx.isMember) return false;
  if (has(ctx.base, Permission.MANAGE_WIKI)) return true;
  return has(ctx.base, Permission.EDIT_WIKI) && !page?.protected;
}

export async function listWikiTree(ctx: MemberContext): Promise<WikiTreeNode[]> {
  const rows = await db
    .select({
      id: schema.wikiPages.id,
      slug: schema.wikiPages.slug,
      title: schema.wikiPages.title,
      parentId: schema.wikiPages.parentId,
      protected: schema.wikiPages.protected,
    })
    .from(schema.wikiPages)
    .where(
      and(eq(schema.wikiPages.communityId, ctx.community.id), isNull(schema.wikiPages.deletedAt)),
    )
    .orderBy(asc(schema.wikiPages.position), asc(schema.wikiPages.title));
  const nodes = new Map<string, WikiTreeNode>(rows.map((r) => [r.id, { ...r, children: [] }]));
  const roots: WikiTreeNode[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  return roots;
}

export async function getWikiPage(
  ctx: MemberContext,
  slug: string,
): Promise<WikiPageRow & { editorName: string | null }> {
  const rows = await db
    .select({ page: schema.wikiPages, editorName: schema.users.name })
    .from(schema.wikiPages)
    .leftJoin(schema.users, eq(schema.users.id, schema.wikiPages.updatedBy))
    .where(
      and(
        eq(schema.wikiPages.communityId, ctx.community.id),
        eq(schema.wikiPages.slug, slug.toLowerCase()),
        isNull(schema.wikiPages.deletedAt),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) throw notFound('Page');
  return { ...row.page, editorName: row.editorName };
}

async function uniqueSlug(communityId: string, title: string, exceptId?: string): Promise<string> {
  const base = slugifyTitle(title) || 'page';
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (RESERVED_WIKI_SLUGS.has(slug)) continue;
    const existing = await db.query.wikiPages.findFirst({
      where: and(eq(schema.wikiPages.communityId, communityId), eq(schema.wikiPages.slug, slug)),
    });
    if (!existing || existing.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function assertParent(ctx: MemberContext, parentId: string | null, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) throw new AppError('validation', 'A page can’t be its own parent.');
  // Walk up to make sure we don't create a cycle.
  let current: string | null = parentId;
  for (let depth = 0; current && depth < 20; depth++) {
    const p: WikiPageRow | undefined = await db.query.wikiPages.findFirst({
      where: and(
        eq(schema.wikiPages.id, current),
        eq(schema.wikiPages.communityId, ctx.community.id),
      ),
    });
    if (!p) throw new AppError('validation', 'Choose a valid parent page.');
    if (p.id === selfId) throw new AppError('validation', 'That would put the page inside itself.');
    current = p.parentId;
  }
}

export async function createWikiPage(ctx: MemberContext, raw: unknown): Promise<{ slug: string }> {
  if (!canEditWiki(ctx)) throw forbidden("You can't edit this wiki.");
  const input = wikiPageInputSchema.parse(raw);
  await enforceRateLimit(`wiki:${ctx.userId}`, 30, 600);
  await assertParent(ctx, input.parentId);
  const body = sanitizeDoc(input.body);
  const text = docToText(body, 200_000);
  const slug = await uniqueSlug(ctx.community.id, input.title);
  const pageId = newId();
  const revisionId = newId();
  await db.transaction(async (tx) => {
    await tx.insert(schema.wikiPages).values({
      id: pageId,
      communityId: ctx.community.id,
      parentId: input.parentId,
      slug,
      title: input.title,
      body,
      bodyText: text,
      currentRevisionId: revisionId,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });
    await tx.insert(schema.wikiRevisions).values({
      id: revisionId,
      pageId,
      authorId: ctx.userId,
      title: input.title,
      body,
      bodyText: text,
      summary: input.summary || 'Created page',
    });
  });
  communityChanged(ctx.community.id, ctx.userId);
  return { slug };
}

export async function updateWikiPage(
  ctx: MemberContext,
  pageId: string,
  raw: unknown,
): Promise<{ slug: string }> {
  const page = await loadPage(ctx, pageId);
  if (!canEditWiki(ctx, page))
    throw forbidden(page.protected ? 'This page is protected.' : "You can't edit this wiki.");
  const input = wikiPageInputSchema.parse(raw);
  if (input.baseRevisionId && input.baseRevisionId !== page.currentRevisionId) {
    throw new AppError(
      'conflict',
      'Someone else saved this page while you were editing. Copy your changes, reload, and apply them again.',
    );
  }
  await enforceRateLimit(`wiki:${ctx.userId}`, 30, 600);
  await assertParent(ctx, input.parentId, page.id);
  const body = sanitizeDoc(input.body);
  const text = docToText(body, 200_000);
  const slug =
    input.title !== page.title
      ? await uniqueSlug(ctx.community.id, input.title, page.id)
      : page.slug;
  const revisionId = newId();
  await db.transaction(async (tx) => {
    await tx.insert(schema.wikiRevisions).values({
      id: revisionId,
      pageId: page.id,
      authorId: ctx.userId,
      title: input.title,
      body,
      bodyText: text,
      summary: input.summary,
    });
    await tx
      .update(schema.wikiPages)
      .set({
        title: input.title,
        slug,
        body,
        bodyText: text,
        parentId: input.parentId,
        currentRevisionId: revisionId,
        updatedBy: ctx.userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.wikiPages.id, page.id));
  });
  await queueFanout({ kind: 'wiki_edit', pageId: page.id, revisionId });
  communityChanged(ctx.community.id, ctx.userId);
  return { slug };
}

async function loadPage(ctx: MemberContext, pageId: string): Promise<WikiPageRow> {
  const page = await db.query.wikiPages.findFirst({
    where: and(
      eq(schema.wikiPages.id, pageId),
      eq(schema.wikiPages.communityId, ctx.community.id),
      isNull(schema.wikiPages.deletedAt),
    ),
  });
  if (!page) throw notFound('Page');
  return page;
}

export async function wikiHistory(ctx: MemberContext, pageId: string) {
  await loadPage(ctx, pageId);
  return db
    .select({
      id: schema.wikiRevisions.id,
      title: schema.wikiRevisions.title,
      summary: schema.wikiRevisions.summary,
      createdAt: schema.wikiRevisions.createdAt,
      restoredFromId: schema.wikiRevisions.restoredFromId,
      authorName: schema.users.name,
      authorUsername: schema.users.username,
      size: sql<number>`length(${schema.wikiRevisions.bodyText})`,
    })
    .from(schema.wikiRevisions)
    .leftJoin(schema.users, eq(schema.users.id, schema.wikiRevisions.authorId))
    .where(eq(schema.wikiRevisions.pageId, pageId))
    .orderBy(desc(schema.wikiRevisions.id))
    .limit(200);
}

export { diffText, type DiffPart } from '../diff';

export async function compareRevision(ctx: MemberContext, pageId: string, revisionId: string) {
  await loadPage(ctx, pageId);
  const rev = await db.query.wikiRevisions.findFirst({
    where: and(eq(schema.wikiRevisions.id, revisionId), eq(schema.wikiRevisions.pageId, pageId)),
  });
  if (!rev) throw notFound('Revision');
  const [previous] = await db
    .select()
    .from(schema.wikiRevisions)
    .where(
      and(eq(schema.wikiRevisions.pageId, pageId), sql`${schema.wikiRevisions.id} < ${rev.id}`),
    )
    .orderBy(desc(schema.wikiRevisions.id))
    .limit(1);
  const author = rev.authorId
    ? await db.query.users.findFirst({ where: eq(schema.users.id, rev.authorId) })
    : null;
  return {
    revision: { ...rev, authorName: author?.name ?? null },
    previous: previous ?? null,
    titleChanged: previous ? previous.title !== rev.title : false,
    parts: diffText(previous?.bodyText ?? '', rev.bodyText),
  };
}

export async function restoreRevision(
  ctx: MemberContext,
  pageId: string,
  revisionId: string,
): Promise<void> {
  const page = await loadPage(ctx, pageId);
  if (!canEditWiki(ctx, page)) throw forbidden();
  const rev = await db.query.wikiRevisions.findFirst({
    where: and(eq(schema.wikiRevisions.id, revisionId), eq(schema.wikiRevisions.pageId, pageId)),
  });
  if (!rev) throw notFound('Revision');
  const newRevId = newId();
  await db.transaction(async (tx) => {
    await tx.insert(schema.wikiRevisions).values({
      id: newRevId,
      pageId,
      authorId: ctx.userId,
      title: rev.title,
      body: rev.body,
      bodyText: rev.bodyText,
      summary: `Restored revision from ${rev.createdAt.toISOString().slice(0, 16).replace('T', ' ')}`,
      restoredFromId: rev.id,
    });
    await tx
      .update(schema.wikiPages)
      .set({
        title: rev.title,
        body: rev.body,
        bodyText: rev.bodyText,
        currentRevisionId: newRevId,
        updatedBy: ctx.userId,
        updatedAt: new Date(),
      })
      .where(eq(schema.wikiPages.id, pageId));
  });
  communityChanged(ctx.community.id, ctx.userId);
}

export async function setWikiProtected(
  ctx: MemberContext,
  pageId: string,
  value: boolean,
): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_WIKI);
  await loadPage(ctx, pageId);
  await db
    .update(schema.wikiPages)
    .set({ protected: value })
    .where(eq(schema.wikiPages.id, pageId));
  await audit(db, {
    communityId: ctx.community.id,
    actorId: ctx.userId,
    action: value ? 'wiki.protect' : 'wiki.unprotect',
    targetType: 'wiki_page',
    targetId: pageId,
  });
}

export async function deleteWikiPage(ctx: MemberContext, pageId: string): Promise<void> {
  requirePerm(ctx, Permission.MANAGE_WIKI);
  const page = await loadPage(ctx, pageId);
  await db.transaction(async (tx) => {
    // Children move up to the deleted page's parent.
    await tx
      .update(schema.wikiPages)
      .set({ parentId: page.parentId })
      .where(eq(schema.wikiPages.parentId, page.id));
    await tx
      .update(schema.wikiPages)
      .set({ deletedAt: new Date(), slug: `deleted-${page.id}` })
      .where(eq(schema.wikiPages.id, page.id));
    await audit(tx, {
      communityId: ctx.community.id,
      actorId: ctx.userId,
      action: 'wiki.delete',
      targetType: 'wiki_page',
      targetId: page.id,
      diff: { title: page.title },
    });
  });
  await queueMediaCleanup({ kind: 'wiki-page', id: page.id });
}

export async function searchWiki(ctx: MemberContext, rawQ: string, limit = 20) {
  const q = rawQ.trim().slice(0, 100);
  if (q.length < 2) return [];
  const tsq = sql`websearch_to_tsquery('simple', ${q})`;
  return db
    .select({
      slug: schema.wikiPages.slug,
      title: schema.wikiPages.title,
      snippet: sql<string>`ts_headline('simple', ${schema.wikiPages.bodyText}, ${tsq}, 'MaxFragments=1,MaxWords=24,MinWords=8,StartSel=«,StopSel=»')`,
    })
    .from(schema.wikiPages)
    .where(
      and(
        eq(schema.wikiPages.communityId, ctx.community.id),
        isNull(schema.wikiPages.deletedAt),
        sql`${schema.wikiPages.search} @@ ${tsq}`,
      ),
    )
    .orderBy(desc(sql`ts_rank(${schema.wikiPages.search}, ${tsq})`))
    .limit(limit);
}

export const wikiEmptyDoc = emptyDoc;
export const pageIdSchema = z.string().uuid();
