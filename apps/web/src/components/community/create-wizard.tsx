'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Check, Clapperboard, Server, Shield, Sparkles } from 'lucide-react';
import {
  COMMUNITY_TEMPLATES,
  LANGUAGES,
  REGIONS,
  slugify,
  type CommunityTemplate,
} from '@gamecentral/shared';
import { PRESET_KEYS, THEME_PRESETS, type PresetKey } from '@gamecentral/shared/theme-values';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { RadioCards } from '@/components/ui/radio-cards';
import { FormError } from '@/components/auth/form-error';
import { createCommunityAction } from '@/app/actions/communities';
import { playSound } from '@/lib/sounds';
import { cn } from '@/lib/utils';

const STEPS = ['basics', 'template', 'look', 'access'] as const;
type Step = (typeof STEPS)[number];

const TEMPLATE_ICONS: Record<CommunityTemplate, React.ReactNode> = {
  server: <Server className="size-5 text-primary" aria-hidden />,
  clan: <Shield className="size-5 text-primary" aria-hidden />,
  fanhub: <Sparkles className="size-5 text-primary" aria-hidden />,
  creator: <Clapperboard className="size-5 text-primary" aria-hidden />,
};

function Swatches({ preset }: { preset: PresetKey }) {
  const p = THEME_PRESETS[preset];
  return (
    <span aria-hidden className="flex w-full overflow-hidden rounded-ui-sm border border-border">
      {[p.light.bg, p.light.primary, p.light.accent, p.dark.bg, p.dark.primary, p.dark.accent].map(
        (c, i) => (
          <span key={i} className="h-8 flex-1" style={{ background: c }} />
        ),
      )}
    </span>
  );
}

export function CreateWizard({ games }: { games: { id: string; name: string }[] }) {
  const t = useTranslations('create');
  const tc = useTranslations('community');
  const router = useRouter();
  const [step, setStep] = React.useState<Step>('basics');
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [slugStatus, setSlugStatus] = React.useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [v, setV] = React.useState({
    name: '',
    slug: '',
    tagline: '',
    gameId: '',
    tags: '',
    template: 'fanhub' as CommunityTemplate,
    preset: 'gamecentral' as PresetKey,
    visibility: 'public' as 'public' | 'unlisted' | 'private',
    joinMode: 'open' as 'open' | 'apply' | 'invite',
    region: 'global',
    language: 'en',
  });
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) =>
    setV((s) => ({ ...s, [k]: val }));

  const index = STEPS.indexOf(step);
  const firstRender = React.useRef(true);
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  React.useEffect(() => {
    if (!v.slug) return;
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setSlugStatus('checking');
      try {
        const r = await fetch(`/api/slug-available?slug=${encodeURIComponent(v.slug)}`, {
          signal: ctrl.signal,
        });
        const d = (await r.json()) as { valid: boolean; available: boolean };
        setSlugStatus(!d.valid ? 'invalid' : d.available ? 'available' : 'taken');
      } catch {
        /* aborted */
      }
    }, 300);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [v.slug]);

  function validateBasics(): boolean {
    const errs: Record<string, string> = {};
    if (v.name.trim().length < 3) errs.name = t('errors.name');
    if (slugStatus === 'invalid' || !v.slug) errs.slug = t('errors.slug');
    if (slugStatus === 'taken') errs.slug = t('slugTaken');
    setFields(errs);
    if (Object.keys(errs).length) {
      setError(t('errors.fix'));
      return false;
    }
    setError(null);
    return true;
  }

  function next() {
    if (step === 'basics' && !validateBasics()) return;
    setStep(STEPS[Math.min(STEPS.length - 1, index + 1)]!);
  }

  async function create() {
    setPending(true);
    setError(null);
    const tags = v.tags
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 8);
    const r = await createCommunityAction({ ...v, gameId: v.gameId || null, tags });
    if (r.ok) {
      playSound('celebrate');
      router.push(`/c/${r.data.slug}?created=1`);
      return;
    }
    setPending(false);
    setError(r.error);
    setFields(r.fields ?? {});
    if (r.fields && (r.fields.name || r.fields.slug || r.fields.tags)) setStep('basics');
  }

  const slugMessage =
    slugStatus === 'checking'
      ? t('slugChecking')
      : slugStatus === 'available'
        ? t('slugAvailable')
        : slugStatus === 'taken'
          ? t('slugTaken')
          : slugStatus === 'invalid'
            ? t('errors.slug')
            : '';

  return (
    <div className="mt-8 flex flex-col gap-6">
      <nav aria-label={t('progress')}>
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={s === step ? 'step' : undefined}>
              <span
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold',
                  s === step
                    ? 'border-primary bg-primary text-on-primary'
                    : i < index
                      ? 'border-primary text-primary'
                      : 'border-border text-muted',
                )}
              >
                {i < index ? (
                  <Check className="size-4" aria-hidden />
                ) : (
                  <span aria-hidden>{i + 1}</span>
                )}
                {t(`steps.${s}`)}
                {i < index && <span className="sr-only">({t('completed')})</span>}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <form
        className="flex flex-col gap-6 rounded-ui-lg border border-border bg-surface p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (step === 'access') void create();
          else next();
        }}
        noValidate
      >
        <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">
          {t(`headings.${step}`)}
        </h2>
        <FormError message={error} />

        {step === 'basics' && (
          <div className="flex flex-col gap-4">
            <Field label={t('name')} description={t('nameHint')} error={fields.name} required>
              {(p) => (
                <Input
                  {...p}
                  value={v.name}
                  maxLength={60}
                  autoFocus
                  onChange={(e) => {
                    const name = e.target.value;
                    setV((s) => ({ ...s, name, slug: slugEdited ? s.slug : slugify(name) }));
                  }}
                />
              )}
            </Field>
            <Field label={t('slug')} description={t('slugHint')} error={fields.slug} required>
              {(p) => (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center">
                    <span className="rounded-s-ui border border-e-0 border-muted/70 bg-surface-2 px-3 py-2 text-muted">
                      /c/
                    </span>
                    <Input
                      {...p}
                      value={v.slug}
                      maxLength={32}
                      autoCapitalize="none"
                      spellCheck={false}
                      className="rounded-s-none"
                      onChange={(e) => {
                        setSlugEdited(true);
                        set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      }}
                    />
                  </div>
                  <p
                    aria-live="polite"
                    className={cn(
                      'text-sm',
                      slugStatus === 'available'
                        ? 'text-success'
                        : slugStatus === 'taken' || slugStatus === 'invalid'
                          ? 'text-danger'
                          : 'text-muted',
                    )}
                  >
                    {slugMessage}
                  </p>
                </div>
              )}
            </Field>
            <Field label={t('tagline')} description={t('taglineHint')} error={fields.tagline}>
              {(p) => (
                <Input
                  {...p}
                  value={v.tagline}
                  maxLength={140}
                  onChange={(e) => set('tagline', e.target.value)}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('game')} error={fields.gameId}>
                {(p) => (
                  <Select {...p} value={v.gameId} onValueChange={(value) => set('gameId', value)}>
                    <option value="">{t('noGame')}</option>
                    {games.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('tags')} description={t('tagsHint')} error={fields.tags}>
                {(p) => (
                  <Input
                    {...p}
                    value={v.tags}
                    onChange={(e) => set('tags', e.target.value)}
                    placeholder="pvp, survival, eu"
                  />
                )}
              </Field>
            </div>
          </div>
        )}

        {step === 'template' && (
          <RadioCards
            label={t('headings.template')}
            value={v.template}
            onValueChange={(val) => set('template', val)}
            columns={2}
            options={COMMUNITY_TEMPLATES.map((key) => ({
              value: key,
              label: (
                <span className="flex items-center gap-2">
                  {TEMPLATE_ICONS[key]} {t(`templates.${key}.name`)}
                </span>
              ),
              description: t(`templates.${key}.description`),
            }))}
          />
        )}

        {step === 'look' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t('lookHint')}</p>
            <RadioCards
              label={t('headings.look')}
              value={v.preset}
              onValueChange={(val) => set('preset', val)}
              columns={4}
              options={PRESET_KEYS.map((key) => ({
                value: key,
                label: t(`presets.${key}`),
                preview: <Swatches preset={key} />,
              }))}
            />
          </div>
        )}

        {step === 'access' && (
          <div className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">{t('visibility')}</legend>
              <RadioCards
                label={t('visibility')}
                value={v.visibility}
                onValueChange={(val) => set('visibility', val)}
                options={(['public', 'unlisted', 'private'] as const).map((key) => ({
                  value: key,
                  label: tc(`visibility.${key}`),
                  description: t(`visibilityHelp.${key}`),
                }))}
              />
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-semibold">{t('joinMode')}</legend>
              <RadioCards
                label={t('joinMode')}
                value={v.joinMode}
                onValueChange={(val) => set('joinMode', val)}
                columns={3}
                options={(['open', 'apply', 'invite'] as const).map((key) => ({
                  value: key,
                  label: t(`joinModes.${key}.name`),
                  description: t(`joinModes.${key}.description`),
                }))}
              />
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('region')}>
                {(p) => (
                  <Select {...p} value={v.region} onValueChange={(value) => set('region', value)}>
                    {REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {tc(`regions.${r}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('language')}>
                {(p) => (
                  <Select
                    {...p}
                    value={v.language}
                    onValueChange={(value) => set('language', value)}
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l}>
                        {tc(`languages.${l}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          {index > 0 ? (
            <Button type="button" variant="ghost" onClick={() => setStep(STEPS[index - 1]!)}>
              {t('back')}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="lg" loading={pending}>
            {step === 'access' ? t('create') : t('next')}
          </Button>
        </div>
      </form>
    </div>
  );
}
