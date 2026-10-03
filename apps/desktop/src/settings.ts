import fs from 'node:fs';
import path from 'node:path';
import { app, screen, type Rectangle } from 'electron';

/** What the app remembers between runs (in %APPDATA%\Game Central\settings.json). */
export interface Settings {
  /** A server other than the one the app was built for. */
  serverUrl?: string;
  bounds?: Rectangle;
  maximized?: boolean;
}

const file = () => path.join(app.getPath('userData'), 'settings.json');

export function readSettings(): Settings {
  try {
    const data = JSON.parse(fs.readFileSync(file(), 'utf8')) as unknown;
    return data && typeof data === 'object' ? (data as Settings) : {};
  } catch {
    return {}; // First run, or a damaged file: start fresh.
  }
}

export function writeSettings(change: Partial<Settings>): void {
  const next = { ...readSettings(), ...change };
  const tmp = `${file()}.tmp`;
  try {
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
    fs.renameSync(tmp, file());
  } catch (err) {
    console.error('Could not save settings:', err);
  }
}

/** The saved window position, if it's still on a screen (a monitor may have been unplugged). */
export function savedBounds(): Rectangle | undefined {
  const b = readSettings().bounds;
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return undefined;
  const area = screen.getDisplayMatching(b).workArea;
  const visible =
    b.x < area.x + area.width - 100 &&
    b.x + b.width > area.x + 100 &&
    b.y >= area.y - 10 &&
    b.y < area.y + area.height - 100;
  return visible ? b : undefined;
}
