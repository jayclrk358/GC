import { removePushSubscription, savePushSubscription } from '@gamecentral/core';
import { publicJson } from '@/lib/api';

/** Turn on push notifications for this browser. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as unknown;
  const ua = req.headers.get('user-agent') ?? '';
  return publicJson(async (userId) => {
    await savePushSubscription(userId, body, ua);
    return { ok: true };
  });
}

/** Turn them off again. */
export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  return publicJson(async (userId) => {
    await removePushSubscription(userId, body?.endpoint);
    return { ok: true };
  });
}
