'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
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
  const router = useRouter();
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
                        className="size-4 accent-[var(--c-primary)]"
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
