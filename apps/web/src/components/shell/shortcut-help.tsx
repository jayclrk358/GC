'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/misc';
import { formatCombo, isSingleKey, SHORTCUTS } from '@/lib/shortcuts';
import { usePrefs } from './prefs-provider';
import { useShortcutCombos } from './shortcuts-provider';

export function ShortcutHelp({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useTranslations('shortcuts');
  const combos = useShortcutCombos();
  const { prefs } = usePrefs();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('title')} description={t('description')}>
        {!prefs.shortcuts ? (
          <p className="text-muted">{t('disabled')}</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">{t('title')}</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Keys</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((s) => {
                const keys = combos[s.id] ?? s.keys;
                const off = isSingleKey(keys) && !prefs.singleKeyShortcuts;
                return (
                  <tr key={s.id} className="border-b border-border last:border-0">
                    <th scope="row" className="py-2 text-start font-normal">
                      {t(s.labelKey)}
                    </th>
                    <td className="py-2 text-end">
                      {off ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          {formatCombo(keys).map((step, i) => (
                            <span key={i} className="inline-flex items-center gap-1">
                              {i > 0 && <span className="text-muted">then</span>}
                              <Kbd>{step}</Kbd>
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
