export function FlairBadge({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-semibold">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ background: color ?? 'var(--c-text-muted)' }}
      />
      {name}
    </span>
  );
}
