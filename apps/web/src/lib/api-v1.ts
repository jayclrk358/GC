import 'server-only';
import { ZodError } from 'zod';
import { authenticateApiToken, isAppError, logger, type ApiCaller } from '@magnox/core';

const log = logger('api-v1');

const HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

function errorResponse(status: number, code: string, message: string, extra: HeadersInit = {}) {
  return Response.json({ error: { code, message } }, { status, headers: { ...HEADERS, ...extra } });
}

/**
 * Run a public API (v1) call. The caller is the owner of the bearer token (cookies are ignored),
 * with exactly their access; `write` calls need a token allowed to post.
 */
export async function apiV1<T>(
  req: Request,
  fn: (caller: ApiCaller) => Promise<T>,
  opts: { write?: boolean; status?: number } = {},
): Promise<Response> {
  try {
    const caller = await authenticateApiToken(req.headers.get('authorization'));
    if (opts.write && !caller.scopes.includes('write')) {
      return errorResponse(403, 'forbidden', 'This token can only read. Make one that can post.');
    }
    return Response.json(
      { data: await fn(caller) },
      { status: opts.status ?? 200, headers: HEADERS },
    );
  } catch (e) {
    if (isAppError(e)) {
      return errorResponse(
        e.status,
        e.code,
        e.message,
        e.retryAfter ? { 'retry-after': String(e.retryAfter) } : {},
      );
    }
    if (e instanceof ZodError) {
      return errorResponse(422, 'validation', e.issues[0]?.message ?? 'Invalid request');
    }
    log.error({ err: e }, 'api v1 error');
    return errorResponse(500, 'internal', 'Something went wrong');
  }
}

/** Query string as a plain object. */
export function queryOf(req: Request): Record<string, string> {
  return Object.fromEntries(new URL(req.url).searchParams);
}

/** A JSON body, or an empty object. */
export async function jsonBody(req: Request): Promise<unknown> {
  return req.json().catch(() => ({}));
}
