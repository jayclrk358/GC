/** The layout of the terms and privacy pages: readable text at a comfortable width. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-sm text-muted">
          Last updated <time dateTime={updated}>{updated}</time>
        </p>
      </header>
      <div className="prose-mx flex flex-col gap-6 leading-relaxed [&_a]:text-primary [&_a]:underline [&_li]:ms-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
    </article>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
