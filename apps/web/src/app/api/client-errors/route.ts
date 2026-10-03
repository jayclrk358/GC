import { z } from 'zod';
import { logger, rateLimit, reportError } from '@gamecentral/core';
import { clientIp } from '@/lib/request';

const log = logger('client');

const reportSchema = z.object({
  message: z.string().max(500),
  stack: z.string().max(4000).optional(),
  digest: z.string().max(100).optional(),
  /** The route's path, without the query string. */
  path: z.string().max(300).optional(),
});

/** Errors that broke a page in someone's browser (sent by the error screens). */
export async function POST(req: Request) {
  const ip = (await clientIp()) ?? 'unknown';
  if (!(await rateLimit(`client-errors:${ip}`, 10, 60)).ok)
    return new Response(null, { status: 429 });
  const parsed = reportSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  const r = parsed.data;
  // Errors with a digest happened on the server and were reported there already.
  if (!r.digest) {
    const err = Object.assign(new Error(r.message), { name: 'ClientError', stack: r.stack });
    log.warn({ path: r.path, message: r.message }, 'page error in the browser');
    reportError(err, { path: r.path, side: 'browser' });
  }
  return new Response(null, { status: 204 });
}
