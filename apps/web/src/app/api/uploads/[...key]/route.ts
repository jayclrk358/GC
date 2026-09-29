import { discardUpload, isAppError } from '@magnox/core';
import { getUser } from '@/lib/auth';

/** Throw away one of your uploads that was never used (e.g. taken off a message before sending). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: 'Please sign in.' }, { status: 401 });
  try {
    await discardUpload(user.id, (await params).key.join('/'));
  } catch (e) {
    if (isAppError(e)) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
  return new Response(null, { status: 204 });
}
