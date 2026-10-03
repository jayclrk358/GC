import { and, eq, ilike, or } from 'drizzle-orm';
import { db, schema } from '@gamecentral/db';
import { getMemberContext, isAppError } from '@gamecentral/core';
import { has, Permission } from '@gamecentral/shared';
import { getUser } from '@/lib/auth';

/** Suggestions for @mentions: members, mentionable roles and @everyone when allowed. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ items: [] }, { status: 401 });
  const { id } = await params;
  let ctx;
  try {
    ctx = await getMemberContext({ id }, user.id);
  } catch (e) {
    if (isAppError(e)) return Response.json({ items: [] }, { status: e.status });
    throw e;
  }
  if (!ctx.isMember) return Response.json({ items: [] });
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 30);
  const pat = `${q.replace(/[%_\\]/g, '\\$&')}%`;
  const canEveryone = has(ctx.base, Permission.MENTION_EVERYONE);
  const [people, roles] = await Promise.all([
    db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        username: schema.users.username,
        image: schema.users.image,
        nickname: schema.members.nickname,
      })
      .from(schema.members)
      .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
      .where(
        and(
          eq(schema.members.communityId, id),
          q
            ? or(
                ilike(schema.users.username, pat),
                ilike(schema.users.name, pat),
                ilike(schema.members.nickname, pat),
              )
            : undefined,
        ),
      )
      .limit(8),
    db
      .select({
        id: schema.roles.id,
        name: schema.roles.name,
        color: schema.roles.color,
        mentionable: schema.roles.mentionable,
        isDefault: schema.roles.isDefault,
      })
      .from(schema.roles)
      .where(and(eq(schema.roles.communityId, id), q ? ilike(schema.roles.name, pat) : undefined))
      .limit(8),
  ]);
  const items = [
    ...people
      .filter((p) => p.username)
      .map((p) => ({
        kind: 'user' as const,
        id: p.id,
        label: p.username!,
        detail: p.nickname || p.name,
        image: p.image,
      })),
    ...roles
      .filter((r) => !r.isDefault && (r.mentionable || canEveryone))
      .map((r) => ({
        kind: 'role' as const,
        id: r.id,
        label: r.name,
        detail: 'Role',
        color: r.color,
      })),
    ...(canEveryone && 'everyone'.startsWith(q.toLowerCase())
      ? [
          {
            kind: 'everyone' as const,
            id: 'everyone',
            label: 'everyone',
            detail: 'Notify every member',
          },
        ]
      : []),
  ].slice(0, 10);
  return Response.json({ items }, { headers: { 'cache-control': 'private, max-age=5' } });
}
