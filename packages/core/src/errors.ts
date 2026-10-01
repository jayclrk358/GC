export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'validation'
  /** Not an error as such: it was received, and waits for a moderator (automod). */
  | 'held';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  validation: 422,
  held: 202,
};

/** Errors that are safe to show to users. Anything else is logged and shown generically. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;
  readonly retryAfter?: number;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { fields?: Record<string, string>; retryAfter?: number } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = opts.fields;
    this.retryAfter = opts.retryAfter;
  }

  get status(): number {
    return STATUS[this.code];
  }
}

export const notFound = (what = 'That') => new AppError('not_found', `${what} could not be found.`);
export const forbidden = (message = "You don't have permission to do that.") =>
  new AppError('forbidden', message);
export const unauthorized = () => new AppError('unauthorized', 'Please sign in to continue.');
export const conflict = (message: string) => new AppError('conflict', message);
export const badRequest = (message: string) => new AppError('bad_request', message);

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
