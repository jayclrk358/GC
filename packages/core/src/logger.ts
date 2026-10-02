import pino from 'pino';
import { env } from './env';

let root: pino.Logger | undefined;

type ErrorHook = (err: unknown, context: Record<string, unknown>) => void;
let errorHook: ErrorHook | null = null;

/** Also send errors that get logged somewhere else (error reporting, see telemetry.ts). */
export function onErrorLogged(hook: ErrorHook | null): void {
  errorHook = hook;
}

const ERROR_LEVEL = 50;

export function logger(name?: string): pino.Logger {
  root ??= pino({
    level: env().LOG_LEVEL,
    base: undefined,
    redact: ['password', '*.password', 'token', '*.token', 'secret', '*.secret'],
    hooks: {
      logMethod(args, method, level) {
        if (level >= ERROR_LEVEL && errorHook) {
          const [first, msg] = args as unknown[];
          const fields =
            first && typeof first === 'object' ? (first as Record<string, unknown>) : {};
          const err =
            first instanceof Error
              ? first
              : fields.err instanceof Error
                ? fields.err
                : new Error(String(typeof first === 'string' ? first : (msg ?? 'error logged')));
          try {
            errorHook(err, {
              message: typeof msg === 'string' ? msg : undefined,
              mod: this.bindings().mod,
            });
          } catch {
            // Reporting must never break logging.
          }
        }
        return method.apply(this, args);
      },
    },
  });
  return name ? root.child({ mod: name }) : root;
}
