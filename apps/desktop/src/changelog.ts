// The site's latest updates (its /api/changelog), as the loading screen and the "What's new"
// window show them. The app can be pointed at any server, so what comes back is checked and
// trimmed before it's kept or shown; the pages put it on screen as plain text.

export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  items: string[];
}

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/** Up to 10 well-formed entries, or null if it isn't a changelog at all. */
export function parseChangelog(data: unknown): ChangelogEntry[] | null {
  const list = (data as { entries?: unknown } | null)?.entries;
  if (!Array.isArray(list)) return null;
  const entries: ChangelogEntry[] = [];
  for (const raw of list.slice(0, 10)) {
    const e = raw as Record<string, unknown> | null;
    const id = text(e?.id, 100);
    const date = text(e?.date, 10);
    const title = text(e?.title, 200);
    const items = Array.isArray(e?.items)
      ? e.items.map((item) => text(item, 600)).filter((item): item is string => item !== null)
      : [];
    if (id && date && /^\d{4}-\d{2}-\d{2}$/.test(date) && title) {
      entries.push({ id, date, title, items: items.slice(0, 12) });
    }
  }
  return entries;
}
