'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export function MemberSearch({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations('community');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <form
      role="search"
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
        const next = new URLSearchParams(params);
        if (q) next.set('q', q);
        else next.delete('q');
        next.delete('page');
        router.push(`${pathname}?${next}`);
      }}
    >
      <label htmlFor="member-q" className="sr-only">
        {t('searchMembers')}
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          id="member-q"
          name="q"
          type="search"
          defaultValue={defaultValue}
          placeholder={t('searchMembers')}
          className="ps-9"
        />
      </div>
    </form>
  );
}
