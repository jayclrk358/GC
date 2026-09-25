import pino from 'pino';
import { env } from './env';

let root: pino.Logger | undefined;

export function logger(name?: string): pino.Logger {
  root ??= pino({
    level: env().LOG_LEVEL,
    base: undefined,
    redact: ['password', '*.password', 'token', '*.token', 'secret', '*.secret'],
  });
  return name ? root.child({ mod: name }) : root;
}
