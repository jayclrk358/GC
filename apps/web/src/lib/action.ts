import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { ZodError } from 'zod';
import { isAppError, logger } from '@gamecentral/core';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      fields?: Record<string, string>;
      code?: string;
      retryAfter?: number;
    };

function zodFields(e: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Every server action is a public endpoint. Wrap the body so validation, permission and rate
 * limit errors become safe, structured results and anything unexpected is logged, not leaked.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    unstable_rethrow(e);
    if (isAppError(e)) {
      return {
        ok: false,
        error: e.message,
        fields: e.fields,
        code: e.code,
        retryAfter: e.retryAfter,
      };
    }
    if (e instanceof ZodError) {
      return {
        ok: false,
        error: 'Please check the highlighted fields.',
        fields: zodFields(e),
        code: 'validation',
      };
    }
    logger('action').error({ err: e }, 'unhandled action error');
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}
