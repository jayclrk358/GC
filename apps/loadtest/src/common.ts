import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.data');
export const PASSWORD = 'load-test-password-1';

export interface SetupData {
  password: string;
  users: { id: string; name: string; username: string; email: string }[];
  communities: {
    id: string;
    slug: string;
    ownerId: string;
    channels: { id: string; name: string }[];
    members: string[];
  }[];
}

/** `--name value` from the command line, or the fallback. */
export function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1]! : fallback;
}

/** A seeded random number generator (mulberry32), so runs are repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run `work` over `items`, at most `size` at a time. */
export async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await work(item);
    }
  });
  await Promise.all(runners);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The value below which `p` (0–1) of `sorted` falls. */
export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

/** Latencies and outcomes for one kind of request, over a window of time. */
export class Series {
  times: number[] = [];
  ok = 0;
  failed = 0;
  /** Failures by reason (status code, error message), so they can be told apart. */
  reasons = new Map<string, number>();

  record(ms: number, ok: boolean, reason?: string) {
    this.times.push(ms);
    if (ok) this.ok++;
    else {
      this.failed++;
      const key = reason ?? 'error';
      this.reasons.set(key, (this.reasons.get(key) ?? 0) + 1);
    }
  }

  summary() {
    const sorted = [...this.times].sort((a, b) => a - b);
    return {
      count: sorted.length,
      failed: this.failed,
      p50: Math.round(percentile(sorted, 0.5)),
      p95: Math.round(percentile(sorted, 0.95)),
      p99: Math.round(percentile(sorted, 0.99)),
      max: Math.round(sorted.at(-1) ?? 0),
      reasons: Object.fromEntries(this.reasons),
    };
  }
}
