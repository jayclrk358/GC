'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { LocateFixed, Plus, Trash2 } from 'lucide-react';
import {
  ACCOUNT_KINDS,
  LANGUAGES,
  MAX_PLAYSTYLES,
  MAX_PROFILE_LANGUAGES,
  PLATFORMS,
  PLAYSTYLES,
} from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { ImageUpload } from '@/components/upload/image-upload';
import { FormError } from '@/components/auth/form-error';
import { authClient } from '@/lib/auth-client';
import { updateProfileAction } from '@/app/actions/profile';
import { SettingsSection } from './section';

interface ProfileState {
  bio: string;
  pronouns: string;
  location: string;
  accentColor: string | null;
  links: { label: string; url: string }[];
  favoriteGames: string[];
  avatarKey: string | null;
  bannerKey: string | null;
  status: string;
  timezone: string;
  languages: string[];
  platforms: string[];
  playstyles: string[];
  lookingForGroup: boolean;
  nowPlaying: string | null;
  accounts: Record<string, string>;
}

/** A wrapping set of checkbox "chips", e.g. platforms or languages. */
function ChipChecks({
  legend,
  description,
  options,
  value,
  onChange,
  max,
  error,
}: {
  legend: string;
  description?: string;
  options: { value: string; label: string; lang?: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  error?: string;
}) {
  const id = React.useId();
  const full = max !== undefined && value.length >= max;
  return (
    <fieldset aria-describedby={description ? `${id}-d` : undefined}>
      <legend className="text-sm font-semibold">{legend}</legend>
      {description && (
        <p id={`${id}-d`} className="mt-1 text-sm text-muted">
          {description}
        </p>
      )}
      <ul className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const checked = value.includes(o.value);
          return (
            <li key={o.value}>
              <label className="mx-press flex cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/8 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!checked && full}
                  onChange={(e) =>
                    onChange(
                      e.target.checked ? [...value, o.value] : value.filter((x) => x !== o.value),
                    )
                  }
                />
                <span lang={o.lang}>{o.label}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {error && <p className="mt-1 text-sm font-semibold text-danger">{error}</p>}
    </fieldset>
  );
}

function zoneLabel(tz: string, now: Date): string {
  const offset =
    new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
  const [, ...rest] = tz.split('/');
  return `${(rest.length ? rest.join(' / ') : tz).replace(/_/g, ' ')} (${offset})`;
}

/**
 * Time zones grouped by region, labelled with their current UTC offset. Browsers and the server
 * can name a zone differently (Asia/Saigon vs Asia/Ho_Chi_Minh), so the saved one is always listed.
 */
function useTimeZones(saved: string) {
  return React.useMemo(() => {
    const zones =
      typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['UTC'];
    const groups = new Map<string, { value: string; label: string }[]>();
    const now = new Date();
    const all = saved && !zones.includes(saved) ? [...zones, saved].sort() : zones;
    for (const tz of all) {
      const [region, ...rest] = tz.split('/');
      const key = rest.length ? region! : 'Other';
      const list = groups.get(key) ?? [];
      list.push({ value: tz, label: zoneLabel(tz, now) });
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [saved]);
}

export function ProfileForm({
  initial,
  games,
  username,
}: {
  initial: ProfileState;
  games: { id: string; name: string }[];
  username: string;
}) {
  const t = useTranslations('profile');
  const tc = useTranslations('community');
  const router = useRouter();
  const zones = useTimeZones(initial.timezone);
  const [state, setState] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const [handle, setHandle] = React.useState(username);
  const [handleError, setHandleError] = React.useState<string | null>(null);

  const set = <K extends keyof ProfileState>(k: K, v: ProfileState[K]) =>
    setState((s) => ({ ...s, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const r = await updateProfileAction(state);
    setPending(false);
    if (r.ok) {
      setFields({});
      toast.success(t('saved'));
      router.refresh();
    } else {
      setError(r.error);
      setFields(r.fields ?? {});
    }
  }

  async function saveHandle(e: React.FormEvent) {
    e.preventDefault();
    const r = await authClient.updateUser({ username: handle.trim() });
    if (r.error) setHandleError(r.error.message ?? 'Could not change username');
    else {
      setHandleError(null);
      toast.success(t('usernameSaved'));
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection id="handle" title={t('username')} description={t('usernameDesc')}>
        <form onSubmit={saveHandle} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label={t('username')} error={handleError} className="flex-1" hideLabel>
            {(p) => (
              <Input
                {...p}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                autoCapitalize="none"
                spellCheck={false}
                maxLength={24}
              />
            )}
          </Field>
          <Button type="submit" variant="secondary">
            {t('saveUsername')}
          </Button>
        </form>
        {username && (
          <p className="text-sm text-muted">
            {t('publicProfile')}{' '}
            <Link href={`/u/${username}`} className="font-semibold text-primary underline">
              /u/{username}
            </Link>
          </p>
        )}
      </SettingsSection>

      <form onSubmit={save} className="flex flex-col gap-6" noValidate>
        <FormError message={error} />
        <SettingsSection id="images" title={t('images')}>
          <ImageUpload
            label={t('avatar')}
            purpose="avatar"
            value={state.avatarKey}
            onChange={(k) => set('avatarKey', k)}
            shape="round"
          />
          <ImageUpload
            label={t('banner')}
            purpose="banner"
            value={state.bannerKey}
            onChange={(k) => set('bannerKey', k)}
            shape="banner"
          />
        </SettingsSection>

        <SettingsSection id="status" title={t('statusSection')}>
          <Field label={t('status')} description={t('statusDesc')} error={fields.status}>
            {(p) => (
              <Input
                {...p}
                value={state.status}
                maxLength={80}
                placeholder={t('statusPlaceholder')}
                onChange={(e) => set('status', e.target.value)}
              />
            )}
          </Field>
          <Field label={t('nowPlaying')} error={fields.nowPlaying}>
            {(p) => (
              <Select
                {...p}
                value={state.nowPlaying ?? ''}
                onValueChange={(value) => set('nowPlaying', value || null)}
              >
                <option value="">{t('nothingPlaying')}</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <SwitchField
            label={t('lfg')}
            description={t('lfgDesc')}
            checked={state.lookingForGroup}
            onCheckedChange={(v) => set('lookingForGroup', v)}
          />
        </SettingsSection>

        <SettingsSection id="about" title={t('about')}>
          <Field label={t('bio')} description={t('bioDesc')} error={fields.bio}>
            {(p) => (
              <Textarea
                {...p}
                value={state.bio}
                maxLength={500}
                onChange={(e) => set('bio', e.target.value)}
              />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('pronouns')} error={fields.pronouns}>
              {(p) => (
                <Input
                  {...p}
                  value={state.pronouns}
                  maxLength={40}
                  onChange={(e) => set('pronouns', e.target.value)}
                />
              )}
            </Field>
            <Field label={t('location')} error={fields.location}>
              {(p) => (
                <Input
                  {...p}
                  value={state.location}
                  maxLength={60}
                  onChange={(e) => set('location', e.target.value)}
                />
              )}
            </Field>
          </div>
          <Field label={t('timezone')} description={t('timezoneDesc')} error={fields.timezone}>
            {(p) => (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  {...p}
                  value={state.timezone}
                  onValueChange={(value) => set('timezone', value)}
                  className="flex-1"
                >
                  <option value="">{t('timezoneNone')}</option>
                  {zones.map(([region, list]) => (
                    <optgroup key={region} label={region}>
                      {list.map((z) => (
                        <option key={z.value} value={z.value}>
                          {z.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    set('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone ?? '')
                  }
                >
                  <LocateFixed aria-hidden /> {t('detectTimezone')}
                </Button>
              </div>
            )}
          </Field>
          <ChipChecks
            legend={t('languages')}
            description={t('languagesDesc', { max: MAX_PROFILE_LANGUAGES })}
            options={LANGUAGES.filter((l) => l !== 'other').map((l) => ({
              value: l,
              label: tc(`languages.${l}`),
              lang: l,
            }))}
            value={state.languages}
            onChange={(v) => set('languages', v)}
            max={MAX_PROFILE_LANGUAGES}
            error={fields.languages}
          />
          <Field label={t('accent')} description={t('accentDesc')}>
            {(p) => (
              <div className="flex items-center gap-3">
                <input
                  {...p}
                  type="color"
                  value={state.accentColor ?? '#4338ca'}
                  onChange={(e) => set('accentColor', e.target.value)}
                  className="h-10 w-16 cursor-pointer rounded-ui border border-border bg-surface"
                />
                {state.accentColor && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => set('accentColor', null)}
                  >
                    {t('clear')}
                  </Button>
                )}
              </div>
            )}
          </Field>
        </SettingsSection>

        <SettingsSection id="links" title={t('links')} description={t('linksDesc')}>
          <ul className="flex flex-col gap-3">
            {state.links.map((l, i) => (
              <li key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                <Field label={t('linkLabel', { n: i + 1 })} error={fields[`links.${i}.label`]}>
                  {(p) => (
                    <Input
                      {...p}
                      value={l.label}
                      maxLength={40}
                      onChange={(e) =>
                        set(
                          'links',
                          state.links.map((x, j) =>
                            j === i ? { ...x, label: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  )}
                </Field>
                <Field label={t('linkUrl', { n: i + 1 })} error={fields[`links.${i}.url`]}>
                  {(p) => (
                    <Input
                      {...p}
                      type="url"
                      value={l.url}
                      placeholder="https://"
                      onChange={(e) =>
                        set(
                          'links',
                          state.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                        )
                      }
                    />
                  )}
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('removeLink', { n: i + 1 })}
                  onClick={() =>
                    set(
                      'links',
                      state.links.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {state.links.length < 8 && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => set('links', [...state.links, { label: '', url: '' }])}
              >
                <Plus aria-hidden /> {t('addLink')}
              </Button>
            </div>
          )}
        </SettingsSection>

        <SettingsSection id="play" title={t('howYouPlay')}>
          <ChipChecks
            legend={t('platforms')}
            options={PLATFORMS.map((v) => ({ value: v, label: t(`platformOptions.${v}`) }))}
            value={state.platforms}
            onChange={(v) => set('platforms', v)}
            error={fields.platforms}
          />
          <ChipChecks
            legend={t('playstyles')}
            description={t('playstylesDesc', { max: MAX_PLAYSTYLES })}
            options={PLAYSTYLES.map((v) => ({ value: v, label: t(`playstyleOptions.${v}`) }))}
            value={state.playstyles}
            onChange={(v) => set('playstyles', v)}
            max={MAX_PLAYSTYLES}
            error={fields.playstyles}
          />
        </SettingsSection>

        <SettingsSection id="accounts" title={t('accounts')} description={t('accountsDesc')}>
          <div className="grid gap-4 sm:grid-cols-2">
            {ACCOUNT_KINDS.map((k) => (
              <Field key={k.key} label={k.label} error={fields[`accounts.${k.key}`]}>
                {(p) => (
                  <Input
                    {...p}
                    value={state.accounts[k.key] ?? ''}
                    maxLength={64}
                    placeholder={k.example}
                    autoCapitalize="none"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) =>
                      set('accounts', { ...state.accounts, [k.key]: e.target.value })
                    }
                  />
                )}
              </Field>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection id="games" title={t('favoriteGames')} description={t('favoriteGamesDesc')}>
          <fieldset>
            <legend className="sr-only">{t('favoriteGames')}</legend>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {games.map((g) => {
                const checked = state.favoriteGames.includes(g.id);
                return (
                  <li key={g.id}>
                    <label className="flex items-center gap-2 rounded-ui border border-border px-3 py-2 text-sm has-[:checked]:border-primary">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!checked && state.favoriteGames.length >= 10}
                        onChange={(e) =>
                          set(
                            'favoriteGames',
                            e.target.checked
                              ? [...state.favoriteGames, g.id]
                              : state.favoriteGames.filter((x) => x !== g.id),
                          )
                        }
                      />
                      {g.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </SettingsSection>

        <div>
          <Button type="submit" size="lg" loading={pending}>
            {t('save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
