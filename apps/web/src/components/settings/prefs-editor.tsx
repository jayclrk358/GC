'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { DEFAULT_PREFS, FONT_SCALES, type Prefs } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/input';
import { Kbd } from '@/components/ui/misc';
import { RadioCards } from '@/components/ui/radio-cards';
import { SwitchField } from '@/components/ui/switch';
import { usePrefs } from '@/components/shell/prefs-provider';
import { eventToCombo, formatCombo, isSingleKey, SHORTCUTS } from '@/lib/shortcuts';
import { SettingsSection } from './section';

export function PrefsEditor() {
  const t = useTranslations('prefs');
  const ts = useTranslations('shortcuts');
  const { prefs: saved, save } = usePrefs();
  const [prefs, setPrefs] = React.useState<Prefs>(saved);
  const [status, setStatus] = React.useState('');
  const [capturing, setCapturing] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  const update = React.useCallback(
    (patch: Partial<Prefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        clearTimeout(timer.current);
        setStatus('');
        timer.current = setTimeout(async () => {
          const ok = await save(next);
          setStatus(ok ? t('saved') : 'Could not save preferences.');
        }, 350);
        return next;
      });
    },
    [save, t],
  );

  React.useEffect(() => {
    if (!capturing) return;
    const id = capturing;
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(null);
        return;
      }
      const keymap = { ...prefs.keymap };
      if (e.key === 'Backspace') {
        delete keymap[id];
      } else {
        const combo = eventToCombo(e);
        if (!combo) return;
        keymap[id] = combo;
      }
      setCapturing(null);
      update({ keymap });
    }
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [capturing, prefs.keymap, update]);

  const opt = <K extends keyof Prefs>(key: K, values: readonly string[], group: string) =>
    values.map((v) => ({ value: v, label: t(`${group}.${v}`) })) as {
      value: Prefs[K] & string;
      label: string;
    }[];

  return (
    <div className="flex flex-col gap-6">
      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <SettingsSection id="appearance" title={t('sections.appearance')}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold">{t('colorScheme')}</legend>
          <RadioCards
            label={t('colorScheme')}
            value={prefs.colorScheme}
            onValueChange={(v) => update({ colorScheme: v })}
            options={opt('colorScheme', ['system', 'light', 'dark'], 'colorSchemeOptions')}
          />
        </fieldset>
        <SwitchField
          label={t('contrast')}
          description={t('contrastDesc')}
          checked={prefs.contrast === 'high'}
          onCheckedChange={(v) => update({ contrast: v ? 'high' : 'normal' })}
        />
        <SwitchField
          label={t('focusRing')}
          description={t('focusRingDesc')}
          checked={prefs.focusRing === 'bold'}
          onCheckedChange={(v) => update({ focusRing: v ? 'bold' : 'default' })}
        />
        <Field label={t('density')}>
          {(p) => (
            <Select
              {...p}
              value={prefs.density}
              onChange={(e) => update({ density: e.target.value as Prefs['density'] })}
            >
              {(['compact', 'comfortable', 'spacious'] as const).map((d) => (
                <option key={d} value={d}>
                  {t(`densityOptions.${d}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <SwitchField
          label={t('simplified')}
          description={t('simplifiedDesc')}
          checked={prefs.simplifiedLayout}
          onCheckedChange={(v) => update({ simplifiedLayout: v })}
        />
      </SettingsSection>

      <SettingsSection id="text" title={t('sections.text')}>
        <Field label={t('fontScale')} description={`${prefs.fontScale}%`}>
          {(p) => (
            <input
              {...p}
              type="range"
              min={0}
              max={FONT_SCALES.length - 1}
              step={1}
              value={Math.max(
                0,
                FONT_SCALES.indexOf(prefs.fontScale as (typeof FONT_SCALES)[number]),
              )}
              aria-valuetext={`${prefs.fontScale}%`}
              onChange={(e) => update({ fontScale: FONT_SCALES[Number(e.target.value)] ?? 100 })}
              className="w-full accent-[var(--c-primary)]"
            />
          )}
        </Field>
        <Field label={t('font')}>
          {(p) => (
            <Select
              {...p}
              value={prefs.font}
              onChange={(e) => update({ font: e.target.value as Prefs['font'] })}
            >
              {(['default', 'atkinson', 'opendyslexic', 'system'] as const).map((f) => (
                <option key={f} value={f}>
                  {t(`fontOptions.${f}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('letterSpacing')}>
            {(p) => (
              <Select
                {...p}
                value={prefs.letterSpacing}
                onChange={(e) =>
                  update({ letterSpacing: e.target.value as Prefs['letterSpacing'] })
                }
              >
                {(['normal', 'wide', 'wider'] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`spacingOptions.${v}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('lineHeight')}>
            {(p) => (
              <Select
                {...p}
                value={prefs.lineHeight}
                onChange={(e) => update({ lineHeight: e.target.value as Prefs['lineHeight'] })}
              >
                {(['normal', 'relaxed', 'loose'] as const).map((v) => (
                  <option key={v} value={v}>
                    {t(`lineHeightOptions.${v}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <SwitchField
          label={t('underlineLinks')}
          description={t('underlineLinksDesc')}
          checked={prefs.underlineLinks}
          onCheckedChange={(v) => update({ underlineLinks: v })}
        />
        <Field label={t('timeFormat')}>
          {(p) => (
            <Select
              {...p}
              value={prefs.timeFormat}
              onChange={(e) => update({ timeFormat: e.target.value as Prefs['timeFormat'] })}
            >
              {(['auto', '12h', '24h'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`timeFormatOptions.${v}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div aria-hidden className="rounded-ui border border-border bg-surface-2 p-4">
          <p className="text-sm font-semibold text-muted">{t('preview')}</p>
          <p className="mt-1">
            {t('previewText')}{' '}
            <span className={prefs.underlineLinks ? 'text-primary underline' : 'text-primary'}>
              {t('previewLink')}
            </span>
          </p>
        </div>
      </SettingsSection>

      <SettingsSection id="motion" title={t('sections.motion')}>
        <Field label={t('motion')}>
          {(p) => (
            <Select
              {...p}
              value={prefs.motion}
              onChange={(e) => update({ motion: e.target.value as Prefs['motion'] })}
            >
              {(['system', 'reduce', 'full'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`motionOptions.${v}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <SwitchField
          label={t('autoplay')}
          description={t('autoplayDesc')}
          checked={prefs.autoplayMedia}
          onCheckedChange={(v) => update({ autoplayMedia: v })}
        />
        <SwitchField
          label={t('animatedImages')}
          description={t('animatedImagesDesc')}
          checked={prefs.animatedImages}
          onCheckedChange={(v) => update({ animatedImages: v })}
        />
      </SettingsSection>

      <SettingsSection id="communities" title={t('sections.communities')}>
        <SwitchField
          label={t('communityThemes')}
          description={t('communityThemesDesc')}
          checked={prefs.communityThemes}
          onCheckedChange={(v) => update({ communityThemes: v })}
        />
        <SwitchField
          label={t('cbRoles')}
          description={t('cbRolesDesc')}
          checked={prefs.colorblindRoleColors}
          onCheckedChange={(v) => update({ colorblindRoleColors: v })}
        />
      </SettingsSection>

      <SettingsSection id="sr" title={t('sections.screenReader')}>
        <Field label={t('chatAnnouncements')} description={t('chatAnnouncementsDesc')}>
          {(p) => (
            <Select
              {...p}
              value={prefs.chatAnnouncements}
              onChange={(e) =>
                update({ chatAnnouncements: e.target.value as Prefs['chatAnnouncements'] })
              }
            >
              {(['all', 'mentions', 'off'] as const).map((v) => (
                <option key={v} value={v}>
                  {t(`chatAnnouncementsOptions.${v}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <SwitchField
          label={t('altText')}
          description={t('altTextDesc')}
          checked={prefs.requireAltTextReminder}
          onCheckedChange={(v) => update({ requireAltTextReminder: v })}
        />
      </SettingsSection>

      <SettingsSection id="interaction" title={t('sections.interaction')}>
        <SwitchField
          label={t('shortcuts')}
          description={t('shortcutsDesc')}
          checked={prefs.shortcuts}
          onCheckedChange={(v) => update({ shortcuts: v })}
        />
        <SwitchField
          label={t('singleKey')}
          description={t('singleKeyDesc')}
          checked={prefs.singleKeyShortcuts}
          disabled={!prefs.shortcuts}
          onCheckedChange={(v) => update({ singleKeyShortcuts: v })}
        />
        <div>
          <h3 className="font-semibold">{t('keymap')}</h3>
          <p className="text-sm text-muted">{t('keymapDesc')}</p>
          <ul className="mt-3 divide-y divide-border rounded-ui border border-border">
            {SHORTCUTS.map((s) => {
              const keys = prefs.keymap[s.id] ?? s.keys;
              const isCapturing = capturing === s.id;
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span>{ts(s.labelKey)}</span>
                  <span className="flex items-center gap-2">
                    {formatCombo(keys).map((step, i) => (
                      <Kbd key={i}>{step}</Kbd>
                    ))}
                    {isSingleKey(keys) && !prefs.singleKeyShortcuts && (
                      <span className="text-xs text-muted">(off)</span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!prefs.shortcuts}
                      aria-pressed={isCapturing}
                      onClick={() => setCapturing(isCapturing ? null : s.id)}
                    >
                      {isCapturing ? 'Press keys…' : 'Change'}
                      <span className="sr-only"> shortcut for {ts(s.labelKey)}</span>
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </SettingsSection>

      <div>
        <Button variant="outline" onClick={() => update(DEFAULT_PREFS)}>
          {t('resetAll')}
        </Button>
      </div>
    </div>
  );
}
