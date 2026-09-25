import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

let loaded = false;

/** Load the monorepo root `.env` once. Existing environment variables always win. */
export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      const file = join(dir, '.env');
      if (existsSync(file)) process.loadEnvFile(file);
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
}
