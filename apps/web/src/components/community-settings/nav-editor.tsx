'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { NavConfig } from '@gamecentral/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/misc';
import { Switch } from '@/components/ui/switch';
import { updateNavAction } from '@/app/actions/communities';

export function NavEditor({
  communityId,
  initial,
  available,
}: {
  communityId: string;
  initial: NavConfig;
  available: string[];
}) {
  const t = useTranslations('csettings');
  const tc = useTranslations('community');
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const [announce, setAnnounce] = React.useState('');

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setItems(next);
    setAnnounce(
      t('navigation.moved', {
        tab: tc(`tabs.${next[j]!.tab}`),
        position: j + 1,
        total: next.length,
      }),
    );
  }

  async function save() {
    setPending(true);
    const r = await updateNavAction(communityId, items);
    setPending(false);
    if (r.ok) {
      toast.success(t('saved'));
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="status" aria-live="polite" className="sr-only">
        {announce}
      </p>
      <ol className="flex flex-col divide-y divide-border rounded-ui-lg border border-border bg-surface">
        {items.map((item, i) => {
          const name = tc(`tabs.${item.tab}`);
          const soon = !available.includes(item.tab);
          return (
            <li key={item.tab} className="flex flex-wrap items-center gap-3 p-3">
              <div className="flex flex-col">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={t('navigation.moveUp', { tab: name })}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={i === items.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t('navigation.moveDown', { tab: name })}
                >
                  <ArrowDown aria-hidden />
                </Button>
              </div>
              <span className="w-24 font-semibold">{name}</span>
              {soon && <Badge>{t('navigation.soon')}</Badge>}
              <label className="sr-only" htmlFor={`nav-label-${item.tab}`}>
                {t('navigation.customLabel', { tab: name })}
              </label>
              <Input
                id={`nav-label-${item.tab}`}
                className="max-w-56 flex-1"
                placeholder={name}
                maxLength={24}
                value={item.label}
                onChange={(e) =>
                  setItems(items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <label className="ms-auto flex items-center gap-2 text-sm">
                <Switch
                  checked={item.visible}
                  disabled={item.tab === 'home'}
                  onCheckedChange={(c) =>
                    setItems(items.map((x, j) => (j === i ? { ...x, visible: c } : x)))
                  }
                  aria-label={t('navigation.show', { tab: name })}
                />
                <span aria-hidden>{t('navigation.visible')}</span>
              </label>
            </li>
          );
        })}
      </ol>
      <div>
        <Button onClick={save} loading={pending}>
          {t('save')}
        </Button>
      </div>
    </div>
  );
}
