import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db, schema } from '@magnox/db';
import { MEDIA_KEY_RE as KEY_RE, variantKey } from '@magnox/shared';
import { enforceRateLimit } from '../ratelimit';
import { enqueue, QUEUES } from '../queues';
import { logger } from '../logger';
import { storage } from '../storage';

const log = logger('media-cleanup');

/** A file used by a piece of content, and who wrote that content. */
export interface MediaRef {
  key: string;
  authorId: string | null;
}

/**
 * What was deleted. Soft-deleted content is looked up when the job runs (and skipped if it's no
 * longer deleted); content that's gone from the database is passed as the files it used.
 */
export type MediaCleanup =
  | { kind: 'refs'; refs: MediaRef[] }
  | { kind: 'posts'; ids: string[] }
  | { kind: 'threads'; ids: string[] }
  | { kind: 'wiki-page'; id: string }
  | { kind: 'community'; id: string }
  /** A deleted custom emoji's image. */
  | { kind: 'emoji'; communityId: string; key: string }
  /** A deleted account: its profile pictures, and (if they asked) files in what they wrote. */
  | { kind: 'user'; userId: string; content: boolean };

/** Uploads people put in what they write: chat attachments, forum and wiki images. */
const CONTENT_PURPOSES = ['content', 'video'];
/** A community's own images, which go with it. */
const COMMUNITY_PURPOSES = [
  'icon',
  'banner',
  'background',
  'channel-background',
  'gallery',
  'emoji',
  'role-icon',
];

const KEY_PATTERN = '(u/[a-z0-9]{8,40}\\.(?:webp|png|jpg|gif|mp4|webm))';
/** Image sources anywhere in a rich text document. */
const IMAGE_SRC = 'lax $.** ? (@.type == "image").attrs.src';
const BATCH = 500;

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const textArray = (items: string[]) =>
  sql`ARRAY[${sql.join(
    items.map((i) => sql`${i}`),
    sql`, `,
  )}]::text[]`;

/**
 * Remove the files that deleted content used, in the background (with retries, so a storage
 * hiccup doesn't leave files behind). Never throws: deleting content mustn't fail over this.
 */
export async function queueMediaCleanup(job: MediaCleanup): Promise<void> {
  const jobs: MediaCleanup[] =
    job.kind === 'refs'
      ? chunks(
          job.refs.filter((r) => r.authorId && KEY_RE.test(r.key)),
          BATCH,
        ).map((refs) => ({ kind: 'refs', refs }))
      : job.kind === 'posts' || job.kind === 'threads'
        ? chunks(job.ids, BATCH).map((ids) => ({ kind: job.kind, ids }))
        : [job];
  for (const data of jobs) {
    try {
      await enqueue(QUEUES.media, 'media-cleanup', data, {
        attempts: 6,
        backoff: { type: 'exponential', delay: 30_000 },
      });
    } catch (err) {
      log.error({ err, kind: data.kind }, 'could not queue media cleanup');
    }
  }
}

/** Remove an upload that was never used, e.g. an attachment taken off a message before sending. */
export async function discardUpload(userId: string, key: string): Promise<void> {
  if (!KEY_RE.test(key)) return;
  await enforceRateLimit(`discard:${userId}`, 60, 600, 'Too many requests. Please slow down.');
  await queueMediaCleanup({ kind: 'refs', refs: [{ key, authorId: userId }] });
}

/** The worker's side: find what the deleted content used and remove it. Returns files removed. */
export async function cleanupMedia(job: MediaCleanup): Promise<number> {
  switch (job.kind) {
    case 'refs':
      return purgeRefs(job.refs);
    case 'posts':
      if (!job.ids.length) return 0;
      return purgeRefs(
        await postRefs(sql`p.id = any(${uuidArray(job.ids)}) and p.deleted_at is not null`),
      );
    case 'threads':
      if (!job.ids.length) return 0;
      return purgeRefs(
        await postRefs(
          sql`p.thread_id in (select id from threads where id = any(${uuidArray(job.ids)}) and deleted_at is not null)`,
        ),
      );
    case 'wiki-page':
      return purgeRefs(await wikiRefs(sql`w.id = ${job.id} and w.deleted_at is not null`));
    case 'community':
      return purgeCommunity(job.id);
    case 'emoji':
      return purgeEmojiImage(job.communityId, job.key);
    case 'user':
      return purgeUserFiles(job.userId, job.content);
  }
}

/** A deleted account's own pictures, and its content files once nothing live shows them. */
async function purgeUserFiles(userId: string, content: boolean): Promise<number> {
  const rows = await db
    .select({
      key: schema.uploads.key,
      ownerId: schema.uploads.ownerId,
      communityId: schema.uploads.communityId,
      posterKey: schema.uploads.posterKey,
      purpose: schema.uploads.purpose,
    })
    .from(schema.uploads)
    .where(
      and(
        eq(schema.uploads.ownerId, userId),
        inArray(schema.uploads.purpose, ['avatar', 'banner', ...(content ? CONTENT_PURPOSES : [])]),
      ),
    );
  // Profile pictures (no community); a community banner they uploaded stays with the community.
  const own = rows.filter((r) => r.purpose !== 'banner' || !r.communityId);
  const files = own.filter((r) => r.purpose === 'avatar' || r.purpose === 'banner');
  const inUse = await stillInUse(own.filter((r) => CONTENT_PURPOSES.includes(r.purpose)));
  const contentFiles = own.filter((r) => CONTENT_PURPOSES.includes(r.purpose) && !inUse.has(r.key));
  let removed = 0;
  for (const batch of chunks([...files, ...contentFiles], BATCH)) {
    removed += await removeUploads(batch);
  }
  return removed;
}

/** A custom emoji's image, once no emoji in its community uses it. */
async function purgeEmojiImage(communityId: string, key: string): Promise<number> {
  if (!KEY_RE.test(key)) return 0;
  const used = await db.query.customEmoji.findFirst({
    where: eq(schema.customEmoji.imageKey, key),
    columns: { id: true },
  });
  if (used) return 0;
  const rows = await db
    .select({ key: schema.uploads.key, posterKey: schema.uploads.posterKey })
    .from(schema.uploads)
    .where(
      and(
        eq(schema.uploads.key, key),
        eq(schema.uploads.communityId, communityId),
        eq(schema.uploads.purpose, 'emoji'),
      ),
    );
  return removeUploads(rows);
}

const uuidArray = (ids: string[]) =>
  sql`ARRAY[${sql.join(
    ids.map((i) => sql`${i}`),
    sql`, `,
  )}]::uuid[]`;

/** Attachments on chat messages matching `where` (on `messages m`). */
export async function messageRefs(where: SQL): Promise<MediaRef[]> {
  return db.execute<{ key: string; authorId: string | null }>(sql`
    select a->>'key' as key, m.author_id as "authorId"
    from messages m
    cross join lateral jsonb_array_elements(m.attachments) a
    where ${where} and jsonb_array_length(m.attachments) > 0
  `);
}

/** Images in forum posts matching `where` (on `posts p`), including their edit history. */
export async function postRefs(where: SQL): Promise<MediaRef[]> {
  return db.execute<{ key: string; authorId: string | null }>(sql`
    select distinct s.src as key, p.author_id as "authorId"
    from posts p
    cross join lateral (
      select jsonb_path_query(p.body, ${IMAGE_SRC}::jsonpath) #>> '{}' as src
      union
      select jsonb_path_query(r.body, ${IMAGE_SRC}::jsonpath) #>> '{}'
      from post_revisions r where r.post_id = p.id
    ) s
    where ${where}
  `);
}

/** Images in the revisions of wiki pages matching `where` (on `wiki_pages w`). */
async function wikiRefs(where: SQL): Promise<MediaRef[]> {
  return db.execute<{ key: string; authorId: string | null }>(sql`
    select distinct s.src as key, r.author_id as "authorId"
    from wiki_revisions r
    join wiki_pages w on w.id = r.page_id
    cross join lateral (select jsonb_path_query(r.body, ${IMAGE_SRC}::jsonpath) #>> '{}' as src) s
    where ${where}
  `);
}

/**
 * Remove the uploads behind these references, but only uploads the content's own author made
 * (anyone can paste someone else's image into a post, and deleting that post mustn't delete
 * their file) and only if nothing else of theirs still shows it.
 */
async function purgeRefs(refs: MediaRef[]): Promise<number> {
  const valid = refs.filter((r) => r.authorId && KEY_RE.test(r.key));
  if (!valid.length) return 0;
  const allowed = new Set(valid.map((r) => `${r.key}|${r.authorId}`));
  let removed = 0;
  for (const keys of chunks([...new Set(valid.map((r) => r.key))], BATCH)) {
    const rows = await db
      .select({
        key: schema.uploads.key,
        ownerId: schema.uploads.ownerId,
        communityId: schema.uploads.communityId,
        posterKey: schema.uploads.posterKey,
      })
      .from(schema.uploads)
      .where(
        and(inArray(schema.uploads.key, keys), inArray(schema.uploads.purpose, CONTENT_PURPOSES)),
      );
    const theirs = rows.filter((r) => r.ownerId && allowed.has(`${r.key}|${r.ownerId}`));
    const inUse = await stillInUse(theirs);
    removed += await removeUploads(theirs.filter((r) => !inUse.has(r.key)));
  }
  return removed;
}

/**
 * Which of these uploads still appear in live content by the person who uploaded them: a chat
 * message, a forum post (or its edit history), a wiki page's history, or a community page.
 */
async function stillInUse(
  rows: { key: string; ownerId: string | null; communityId: string | null }[],
): Promise<Set<string>> {
  const used = new Set<string>();
  const byOwner = new Map<string, typeof rows>();
  for (const r of rows) byOwner.set(r.ownerId!, [...(byOwner.get(r.ownerId!) ?? []), r]);
  for (const [ownerId, group] of byOwner) {
    const keys = textArray(group.map((r) => r.key));
    const communities = [...new Set(group.flatMap((r) => (r.communityId ? [r.communityId] : [])))];
    const found = await db.execute<{ key: string }>(sql`
      select a->>'key' as key
      from messages m
      join communities c on c.id = m.community_id
      cross join lateral jsonb_array_elements(m.attachments) a
      where m.author_id = ${ownerId} and m.deleted_at is null and c.deleted_at is null
        and jsonb_array_length(m.attachments) > 0 and a->>'key' = any(${keys})
      union
      select s.src
      from posts p
      join threads t on t.id = p.thread_id
      join communities c on c.id = p.community_id
      cross join lateral (
        select jsonb_path_query(p.body, ${IMAGE_SRC}::jsonpath) #>> '{}' as src
        union
        select jsonb_path_query(r.body, ${IMAGE_SRC}::jsonpath) #>> '{}'
        from post_revisions r where r.post_id = p.id
      ) s
      where p.author_id = ${ownerId} and p.deleted_at is null and t.deleted_at is null
        and c.deleted_at is null and s.src = any(${keys})
      union
      select s.src
      from wiki_revisions r
      join wiki_pages w on w.id = r.page_id
      join communities c on c.id = w.community_id
      cross join lateral (select jsonb_path_query(r.body, ${IMAGE_SRC}::jsonpath) #>> '{}' as src) s
      where r.author_id = ${ownerId} and w.deleted_at is null and c.deleted_at is null
        and s.src = any(${keys})
      ${
        communities.length
          ? sql`union
      select m[1]
      from page_blocks b
      join communities c on c.id = b.community_id
      cross join lateral regexp_matches(b.config::text, ${KEY_PATTERN}, 'g') m
      where b.community_id = any(${uuidArray(communities)}) and c.deleted_at is null
        and m[1] = any(${keys})`
          : sql``
      }
    `);
    for (const r of found) used.add(r.key);
  }
  return used;
}

/** Delete files (with their still frames and smaller copies) from storage, then forget them. */
async function removeUploads(rows: { key: string; posterKey: string | null }[]): Promise<number> {
  if (!rows.length) return 0;
  const files = rows.flatMap((r) =>
    [r.key, r.posterKey, variantKey(r.key, 'sm'), variantKey(r.key, 'md')].filter(
      (k): k is string => Boolean(k),
    ),
  );
  for (const batch of chunks(files, 16)) {
    await Promise.all(batch.map((key) => storage().delete(key)));
  }
  await db.delete(schema.uploads).where(
    inArray(
      schema.uploads.key,
      rows.map((r) => r.key),
    ),
  );
  log.info({ removed: rows.length }, 'removed media');
  return rows.length;
}

/**
 * A deleted community's files: its own images (icon, banner, gallery, emoji, role icons...),
 * and everything members attached or embedded there, or uploaded there and never posted.
 */
async function purgeCommunity(id: string): Promise<number> {
  const community = await db.query.communities.findFirst({
    columns: { deletedAt: true },
    where: eq(schema.communities.id, id),
  });
  if (!community?.deletedAt) return 0;
  const own = await db
    .select({ key: schema.uploads.key, posterKey: schema.uploads.posterKey })
    .from(schema.uploads)
    .where(
      and(eq(schema.uploads.communityId, id), inArray(schema.uploads.purpose, COMMUNITY_PURPOSES)),
    );
  let removed = 0;
  for (const batch of chunks(own, BATCH)) removed += await removeUploads(batch);
  const uploaded = await db
    .select({ key: schema.uploads.key, authorId: schema.uploads.ownerId })
    .from(schema.uploads)
    .where(
      and(eq(schema.uploads.communityId, id), inArray(schema.uploads.purpose, CONTENT_PURPOSES)),
    );
  const refs = [
    ...uploaded,
    ...(await messageRefs(sql`m.community_id = ${id}`)),
    ...(await postRefs(sql`p.community_id = ${id}`)),
    ...(await wikiRefs(sql`w.community_id = ${id}`)),
  ];
  removed += await purgeRefs(refs);
  return removed;
}
