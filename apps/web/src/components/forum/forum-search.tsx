'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function ForumSearch({ slug, defaultValue = '' }: { slug: string; defaultValue?: string }) {
  const t = useTranslations('forum');
  const router = useRouter();
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
        router.push(`/c/${slug}/forum/search?q=${encodeURIComponent(q)}`);
      }}
    >
      <label htmlFor="forum-q" className="sr-only">
        {t('searchLabel')}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          id="forum-q"
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder={t('searchLabel')}
          className="w-64 ps-9"
        />
      </div>
    </form>
  );
}
