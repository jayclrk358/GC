export function SettingsSection({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}) {
  const headingId = id ? `${id}-h` : undefined;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-ui-lg border border-border bg-surface p-5 sm:p-6"
    >
      <h2 id={headingId} className="text-lg font-bold">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}
