import 'server-only';
import { ZodError } from 'zod';
import { getMemberContext, isAppError, logger, type MemberContext } from '@gamecentral/core';
import { getUser } from './auth';

const log = logger('api');

/**
 * Run a read-only JSON endpoint in a community's context. App errors become their HTTP status
 * with a safe message; anything else is logged and returned as a generic 500. Successful
 * responses aren't cached unless `cacheControl` says otherwise.
 */
export async function communityJson<T>(
  communityId: string,
  fn: (ctx: MemberContext) => Promise<T>,
  { cacheControl = 'no-store' }: { cacheControl?: string } = {},
): Promise<Response> {
  try {
    const user = await getUser();
    const ctx = await getMemberContext({ id: communityId }, user?.id ?? null);
    return Response.json(await fn(ctx), { headers: { 'cache-control': cacheControl } });
  } catch (e) {
    if (isAppError(e)) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError) return Response.json({ error: 'Invalid request' }, { status: 400 });
    log.error({ err: e }, 'api error');
    return Response.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

/** Same error handling as communityJson, for endpoints outside a community. */
export async function publicJson<T>(fn: (userId: string | null) => Promise<T>): Promise<Response> {
  try {
    const user = await getUser();
    return Response.json(await fn(user?.id ?? null), { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    if (isAppError(e)) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof ZodError) return Response.json({ error: 'Invalid request' }, { status: 400 });
    log.error({ err: e }, 'api error');
    return Response.json({ error: 'Something went wrong' }, { status: 500 });
  }
}
