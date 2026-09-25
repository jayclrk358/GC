'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Wand2 } from 'lucide-react';
import {
  autoFixTheme,
  checkTheme,
  COLOR_KEYS,
  colorSetToDeclarations,
  contrastRatio,
  FONT_KEYS,
  FONT_STACKS,
  isHex,
  PRESET_KEYS,
  RADIUS_VALUES,
  roundRatio,
  THEME_PRESETS,
  themeFromPreset,
  type ColorKey,
  type ContrastIssue,
  type PresetKey,
  type Theme,
} from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/misc';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImageUpload } from '@/components/upload/image-upload';
import { SettingsSection } from '@/components/settings/section';
import { updateThemeAction } from '@/app/actions/communities';
import { cn } from '@/lib/utils';

type Scheme = 'light' | 'dark';

function previewCss(theme: Theme): string {
  const shared = `--mx-radius:${RADIUS_VALUES[theme.radius]};--mx-font-body:${FONT_STACKS[theme.fontBody]};--mx-font-heading:${FONT_STACKS[theme.fontHeading]}`;
  return `@layer mx-community{[data-theme-preview][data-preview-scheme="light"]{color-scheme:light;${shared};${colorSetToDeclarations(theme.light)}}[data-theme-preview][data-preview-scheme="dark"]{color-scheme:dark;${shared};${colorSetToDeclarations(theme.dark)}}}`;
}

function ColorField({
  colorKey,
  value,
  onChange,
  scheme,
}: {
  colorKey: ColorKey;
  value: string;
  onChange: (v: string) => void;
  scheme: Scheme;
}) {
  const t = useTranslations('theme');
  const [text, setText] = React.useState(value);
  const [lastValue, setLastValue] = React.useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value);
  }
  const id = `${scheme}-${colorKey}`;
  return (
    <div className="flex items-center gap-3 py-2">
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-12 shrink-0 cursor-pointer rounded-ui border border-border bg-surface"
        aria-describedby={`${id}-desc`}
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-semibold">
          {t(`colors.${colorKey}.label`)}
        </label>
        <p id={`${id}-desc`} className="text-xs text-muted">
          {t(`colors.${colorKey}.description`)}
        </p>
      </div>
      <label htmlFor={`${id}-hex`} className="sr-only">
        {t('hexFor', { name: t(`colors.${colorKey}.label`) })}
      </label>
      <Input
        id={`${id}-hex`}
        value={text}
        spellCheck={false}
        maxLength={7}
        className="w-24 font-mono text-sm"
        aria-invalid={!isHex(text) || undefined}
        onChange={(e) => {
          const next = e.target.value.trim();
          setText(next);
          if (isHex(next)) onChange(next.toLowerCase());
        }}
        onBlur={() => setText(value)}
      />
    </div>
  );
}

function IssueRow({ issue, onApply }: { issue: ContrastIssue; onApply: () => void }) {
  const t = useTranslations('theme');
  return (
    <li className="flex flex-wrap items-center gap-3 py-2">
      <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{t(`schemes.${issue.scheme}`)}:</span>{' '}
        {t('issue', {
          fg: t(`colors.${issue.fg}.label`),
          bg: t(`colors.${issue.bg}.label`),
          ratio: issue.ratio.toFixed(2),
          min: issue.min,
        })}
      </p>
      {issue.suggestion && (
        <Button size="sm" variant="outline" onClick={onApply}>
          <span aria-hidden className="size-4 rounded-sm border border-border" style={{ background: issue.suggestion }} />
          {t('useColor', { hex: issue.suggestion })}
        </Button>
      )}
    </li>
  );
}

function Preview({ theme, scheme, name }: { theme: Theme; scheme: Scheme; name: string }) {
  const t = useTranslations('theme');
  const set = theme[scheme];
  return (
    <div
      data-theme-preview
      data-preview-scheme={scheme}
      className="flex flex-col gap-3 rounded-ui-lg border border-border bg-bg p-4 font-sans text-fg"
      aria-label={t('previewLabel', { scheme: t(`schemes.${scheme}`) })}
      role="img"
    >
      <div className="h-14 rounded-ui" style={{ background: `linear-gradient(135deg, ${set.primary}, ${set.accent})` }} />
      <p className="font-heading text-xl font-extrabold">{name}</p>
      <p className="text-sm text-muted">{t('previewTagline')}</p>
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex h-9 items-center rounded-ui bg-primary px-3 text-sm font-semibold text-on-primary">{t('previewPrimary')}</span>
        <span className="inline-flex h-9 items-center rounded-ui border border-border bg-surface-2 px-3 text-sm font-semibold">{t('previewSecondary')}</span>
      </div>
      <div className="rounded-ui border border-border bg-surface p-3">
        <p className="font-semibold">{t('previewCardTitle')}</p>
        <p className="text-sm text-muted">
          {t('previewCardBody')} <span className="text-primary underline">{t('previewLink')}</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="text-success">● {t('previewOnline')}</span>
          <span className="text-warning">▲ {t('previewWarning')}</span>
          <span className="text-danger">■ {t('previewError')}</span>
        </div>
      </div>
      <span className="h-8 rounded-ui border border-muted/70 bg-surface-2 px-2 text-sm leading-8 text-muted">{t('previewInput')}</span>
    </div>
  );
}

export function ThemeEditor({ communityId, communityName, initial }: { communityId: string; communityName: string; initial: Theme }) {
  const t = useTranslations('theme');
  const router = useRouter();
  const [theme, setTheme] = React.useState<Theme>(initial);
  const [scheme, setScheme] = React.useState<Scheme>('light');
  const [pending, setPending] = React.useState(false);
  const issues = React.useMemo(() => checkTheme(theme), [theme]);
  const dirty = JSON.stringify(theme) !== JSON.stringify(initial);
  const css = React.useMemo(() => previewCss(theme), [theme]);

  const setColor = (s: Scheme, key: ColorKey, value: string) =>
    setTheme((th) => ({ ...th, [s]: { ...th[s], [key]: value } }));

  function applyPreset(key: PresetKey) {
    const p = themeFromPreset(key);
    setTheme((th) => ({
      ...th,
      preset: key,
      light: p.light,
      dark: p.dark,
      radius: p.radius,
      fontBody: p.fontBody,
      fontHeading: p.fontHeading,
      defaultScheme: p.defaultScheme,
    }));
  }

  async function save() {
    setPending(true);
    const r = await updateThemeAction(communityId, theme);
    setPending(false);
    if (r.ok) {
      toast.success(t('saved'));
      router.refresh();
    } else toast.error(r.error);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="flex min-w-0 flex-col gap-6">
        <SettingsSection id="presets" title={t('presets')} description={t('presetsDesc')}>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRESET_KEYS.map((key) => {
              const p = THEME_PRESETS[key];
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => applyPreset(key)}
                    aria-pressed={theme.preset === key}
                    className="flex w-full flex-col gap-2 rounded-ui border-2 border-border p-2 text-start text-sm font-semibold hover:border-muted aria-pressed:border-primary"
                  >
                    <span aria-hidden className="flex overflow-hidden rounded-sm">
                      {[p.light.bg, p.light.primary, p.light.accent, p.dark.bg, p.dark.primary].map((c, i) => (
                        <span key={i} className="h-6 flex-1" style={{ background: c }} />
                      ))}
                    </span>
                    {t(`presetNames.${key}`)}
                  </button>
                </li>
              );
            })}
          </ul>
        </SettingsSection>

        <SettingsSection id="colors" title={t('colorsTitle')} description={t('colorsDesc')}>
          <Tabs value={scheme} onValueChange={(v) => setScheme(v as Scheme)}>
            <TabsList aria-label={t('schemeTabs')}>
              <TabsTrigger value="light">{t('schemes.light')}</TabsTrigger>
              <TabsTrigger value="dark">{t('schemes.dark')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="divide-y divide-border" role="group" aria-label={t('colorsFor', { scheme: t(`schemes.${scheme}`) })}>
            {COLOR_KEYS.map((key) => (
              <ColorField key={`${scheme}-${key}`} colorKey={key} scheme={scheme} value={theme[scheme][key]} onChange={(v) => setColor(scheme, key, v)} />
            ))}
          </div>
        </SettingsSection>

        <SettingsSection id="type" title={t('typeTitle')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('fontBody')}>
              {(p) => (
                <Select {...p} value={theme.fontBody} onChange={(e) => setTheme({ ...theme, fontBody: e.target.value as Theme['fontBody'] })}>
                  {FONT_KEYS.map((f) => (
                    <option key={f} value={f}>
                      {t(`fonts.${f}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('fontHeading')}>
              {(p) => (
                <Select {...p} value={theme.fontHeading} onChange={(e) => setTheme({ ...theme, fontHeading: e.target.value as Theme['fontHeading'] })}>
                  {FONT_KEYS.map((f) => (
                    <option key={f} value={f}>
                      {t(`fonts.${f}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('radius')}>
              {(p) => (
                <Select {...p} value={theme.radius} onChange={(e) => setTheme({ ...theme, radius: e.target.value as Theme['radius'] })}>
                  {(Object.keys(RADIUS_VALUES) as Theme['radius'][]).map((r) => (
                    <option key={r} value={r}>
                      {t(`radii.${r}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('defaultScheme')} description={t('defaultSchemeDesc')}>
              {(p) => (
                <Select {...p} value={theme.defaultScheme} onChange={(e) => setTheme({ ...theme, defaultScheme: e.target.value as Theme['defaultScheme'] })}>
                  <option value="auto">{t('schemeAuto')}</option>
                  <option value="light">{t('schemes.light')}</option>
                  <option value="dark">{t('schemes.dark')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('headerStyle')}>
              {(p) => (
                <Select {...p} value={theme.headerStyle} onChange={(e) => setTheme({ ...theme, headerStyle: e.target.value as Theme['headerStyle'] })}>
                  <option value="banner">{t('headerBanner')}</option>
                  <option value="compact">{t('headerCompact')}</option>
                </Select>
              )}
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection id="images" title={t('imagesTitle')} description={t('imagesDesc')}>
          <ImageUpload
            label={t('icon')}
            purpose="icon"
            communityId={communityId}
            value={theme.iconKey}
            onChange={(k) => setTheme({ ...theme, iconKey: k ?? undefined })}
          />
          <ImageUpload
            label={t('banner')}
            purpose="banner"
            communityId={communityId}
            shape="banner"
            value={theme.bannerKey}
            onChange={(k) => setTheme({ ...theme, bannerKey: k ?? undefined })}
          />
          {theme.bannerKey && (
            <Field label={t('bannerFocus')} description={`${theme.bannerFocalY}%`}>
              {(p) => (
                <input
                  {...p}
                  type="range"
                  min={0}
                  max={100}
                  value={theme.bannerFocalY}
                  aria-valuetext={`${theme.bannerFocalY}%`}
                  onChange={(e) => setTheme({ ...theme, bannerFocalY: Number(e.target.value) })}
                  className="accent-[var(--c-primary)]"
                />
              )}
            </Field>
          )}
          <ImageUpload
            label={t('background')}
            purpose="background"
            communityId={communityId}
            shape="banner"
            value={theme.backgroundKey}
            onChange={(k) => setTheme({ ...theme, backgroundKey: k ?? undefined })}
          />
          {theme.backgroundKey && (
            <Field label={t('backgroundDim')} description={t('backgroundDimDesc', { value: theme.backgroundDim })}>
              {(p) => (
                <input
                  {...p}
                  type="range"
                  min={0}
                  max={95}
                  value={theme.backgroundDim}
                  aria-valuetext={`${theme.backgroundDim}%`}
                  onChange={(e) => setTheme({ ...theme, backgroundDim: Number(e.target.value) })}
                  className="accent-[var(--c-primary)]"
                />
              )}
            </Field>
          )}
        </SettingsSection>
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-20 xl:self-start" aria-label={t('sidebar')}>
        <Preview theme={theme} scheme={scheme} name={communityName} />
        <section
          aria-labelledby="contrast-h"
          className={cn('rounded-ui-lg border bg-surface p-4', issues.length ? 'border-warning' : 'border-success')}
        >
          <h2 id="contrast-h" className="flex items-center gap-2 font-bold">
            {issues.length ? (
              <AlertTriangle className="size-5 text-warning" aria-hidden />
            ) : (
              <CheckCircle2 className="size-5 text-success" aria-hidden />
            )}
            {t('contrastTitle')}
          </h2>
          <p role="status" aria-live="polite" className="mt-1 text-sm text-muted">
            {issues.length ? t('issuesCount', { count: issues.length }) : t('allPass')}
          </p>
          {issues.length > 0 && (
            <>
              <ul className="mt-2 divide-y divide-border">
                {issues.map((issue) => (
                  <IssueRow
                    key={`${issue.scheme}-${issue.rule}`}
                    issue={issue}
                    onApply={() => issue.suggestion && setColor(issue.scheme, issue.fg, issue.suggestion)}
                  />
                ))}
              </ul>
              <Button className="mt-3 w-full" variant="secondary" onClick={() => setTheme((th) => autoFixTheme(th))}>
                <Wand2 aria-hidden /> {t('fixAll')}
              </Button>
            </>
          )}
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">{t('ratios')}</summary>
            <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
              {(['text', 'textMuted', 'primary', 'onPrimary'] as const).map((fg) => {
                const bg = fg === 'onPrimary' ? 'primary' : 'bg';
                const ratio = roundRatio(contrastRatio(theme[scheme][fg], theme[scheme][bg]));
                return (
                  <React.Fragment key={fg}>
                    <dt>{t('ratioLabel', { fg: t(`colors.${fg}.label`), bg: t(`colors.${bg}.label`) })}</dt>
                    <dd className="text-end font-mono tabular-nums">{ratio.toFixed(2)}:1</dd>
                  </React.Fragment>
                );
              })}
            </dl>
          </details>
        </section>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} loading={pending} disabled={issues.length > 0 || !dirty} aria-describedby="save-hint">
            {t('save')}
          </Button>
          <Button variant="ghost" onClick={() => setTheme(initial)} disabled={!dirty}>
            {t('reset')}
          </Button>
          {dirty && <Badge tone="warning">{t('unsaved')}</Badge>}
        </div>
        <p id="save-hint" className="text-xs text-muted">
          {issues.length ? t('saveBlocked') : t('saveHint')}
        </p>
      </aside>
    </div>
  );
}
