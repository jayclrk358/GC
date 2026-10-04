'use client';

import * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CopyButton } from '@/components/ui/copy-button';

export interface CodeSample {
  /** curl, js or python: which tab to show is remembered across the page. */
  lang: string;
  label: string;
  code: string;
}

const LANG_KEY = 'gc-docs-lang';
const listeners = new Set<() => void>();

function useLang(fallback: string): [string, (lang: string) => void] {
  const lang = React.useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => {
      try {
        return localStorage.getItem(LANG_KEY) ?? fallback;
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );
  const set = (next: string) => {
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Private window: just this once.
    }
    for (const l of listeners) l();
  };
  return [lang, set];
}

/** The same request in several languages; picking one switches every sample on the page. */
export function CodeTabs({ samples, label }: { samples: CodeSample[]; label: string }) {
  const [lang, setLang] = useLang(samples[0]!.lang);
  const value = samples.some((s) => s.lang === lang) ? lang : samples[0]!.lang;
  return (
    <Tabs
      value={value}
      onValueChange={setLang}
      className="overflow-hidden rounded-ui border border-border bg-surface-2"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <TabsList aria-label={label} className="bg-transparent p-0">
          {samples.map((s) => (
            <TabsTrigger key={s.lang} value={s.lang} className="px-2.5 py-1 text-xs">
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <CopyButton text={samples.find((s) => s.lang === value)!.code} label="Copy code" />
      </div>
      {samples.map((s) => (
        <TabsContent key={s.lang} value={s.lang} tabIndex={-1}>
          <pre
            tabIndex={0}
            aria-label={`${label}: ${s.label}`}
            className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-relaxed"
          >
            <code>{s.code}</code>
          </pre>
        </TabsContent>
      ))}
    </Tabs>
  );
}
