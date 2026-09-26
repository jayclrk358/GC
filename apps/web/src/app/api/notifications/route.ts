import { listNotifications, unreadCount } from '@magnox/core';
import { getUser } from '@/lib/auth';

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get('count') === '1') {
    return Response.json(
      { unread: await unreadCount(user.id) },
      { headers: { 'cache-control': 'no-store' } },
    );
  }
  const before = url.searchParams.get('before') ?? undefined;
  const [list, unread] = await Promise.all([
    listNotifications(user.id, {
      before: before && /^[0-9a-f-]{36}$/.test(before) ? before : undefined,
      unreadOnly: url.searchParams.get('unread') === '1',
      limit: before ? 30 : 15,
    }),
    unreadCount(user.id),
  ]);
  return Response.json({ ...list, unread }, { headers: { 'cache-control': 'no-store' } });
}
