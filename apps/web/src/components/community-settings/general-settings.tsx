'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { LANGUAGES, REGIONS } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import {
  changeSlugAction,
  updateBasicsAction,
  updateSettingsAction,
} from '@/app/actions/communities';

interface Initial {
  name: string;
  slug: string;
  tagline: string;
  gameId: string;
  playUrl: string;
  tags: string;
  region: string;
  language: string;
  visibility: 'public' | 'unlisted' | 'private';
  joinMode: 'open' | 'apply' | 'invite';
  nsfw: boolean;
  showMemberCount: boolean;
  requireAltText: boolean;
  welcomeMessage: string;
}

export function GeneralSettings({
  communityId,
  isOwner,
  games,
  initial,
}: {
  communityId: string;
  isOwner: boolean;
  games: { id: string; name: string }[];
  initial: Initial;
}) {
  const t = useTranslations('csettings');
  const tc = useTranslations('community');
  const tcr = useTranslations('create');
  const router = useRouter();
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState<string | null>(null);
  const [slug, setSlug] = React.useState(initial.slug);
  const set = <K extends keyof Initial>(k: K, val: Initial[K]) => setV((s) => ({ ...s, [k]: val }));

  async function saveBasics(e: React.FormEvent) {
    e.preventDefault();
    setPending('basics');
    setError(null);
    const r = await updateBasicsAction(communityId, {
      name: v.name,
      tagline: v.tagline,
      gameId: v.gameId || null,
      playUrl: v.playUrl,
      tags: v.tags
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 8),
      region: v.region,
      language: v.language,
      visibility: v.visibility,
      joinMode: v.joinMode,
      nsfw: v.nsfw,
    });
    const r2 = r.ok
      ? await updateSettingsAction(communityId, {
          showMemberCount: v.showMemberCount,
          requireAltText: v.requireAltText,
          welcomeMessage: v.welcomeMessage,
        })
      : r;
    setPending(null);
    if (r2.ok) {
      setFields({});
      toast.success(t('saved'));
      router.refresh();
    } else {
      setError(r2.error);
      setFields(r2.fields ?? {});
    }
  }

  async function saveSlug(e: React.FormEvent) {
    e.preventDefault();
    setPending('slug');
    const r = await changeSlugAction(communityId, { slug });
    setPending(null);
    if (r.ok) {
      toast.success(t('general.slugChanged'));
      router.push(`/c/${r.data.slug}/settings`);
    } else toast.error(r.error);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={saveBasics} className="flex flex-col gap-6" noValidate>
        <FormError message={error} />
        <SettingsSection id="basics" title={t('general.basics')}>
          <Field label={tcr('name')} error={fields.name} required>
            {(p) => (
              <Input
                {...p}
                value={v.name}
                maxLength={60}
                onChange={(e) => set('name', e.target.value)}
              />
            )}
          </Field>
          <Field label={tcr('tagline')} error={fields.tagline}>
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
            <Field label={tcr('game')}>
              {(p) => (
                <Select {...p} value={v.gameId} onValueChange={(value) => set('gameId', value)}>
                  <option value="">{tcr('noGame')}</option>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label={t('playUrl')}
              description={t('playUrlHint')}
              error={fields.playUrl}
              className="sm:col-span-2"
            >
              {(p) => (
                <Input
                  {...p}
                  type="url"
                  inputMode="url"
                  value={v.playUrl}
                  maxLength={300}
                  placeholder="https://www.roblox.com/games/…"
                  onChange={(e) => set('playUrl', e.target.value)}
                />
              )}
            </Field>
            <Field label={tcr('tags')} description={tcr('tagsHint')} error={fields.tags}>
              {(p) => <Input {...p} value={v.tags} onChange={(e) => set('tags', e.target.value)} />}
            </Field>
            <Field label={tcr('region')}>
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
            <Field label={tcr('language')}>
              {(p) => (
                <Select {...p} value={v.language} onValueChange={(value) => set('language', value)}>
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>
                      {tc(`languages.${l}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </SettingsSection>

        <SettingsSection id="access" title={t('general.access')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tcr('visibility')} description={tcr(`visibilityHelp.${v.visibility}`)}>
              {(p) => (
                <Select
                  {...p}
                  value={v.visibility}
                  onValueChange={(value) => set('visibility', value as Initial['visibility'])}
                >
                  {(['public', 'unlisted', 'private'] as const).map((k) => (
                    <option key={k} value={k}>
                      {tc(`visibility.${k}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={tcr('joinMode')}>
              {(p) => (
                <Select
                  {...p}
                  value={v.joinMode}
                  onValueChange={(value) => set('joinMode', value as Initial['joinMode'])}
                >
                  <option value="open">{tcr('joinModes.open.name')}</option>
                  <option value="invite">{tcr('joinModes.invite.name')}</option>
                </Select>
              )}
            </Field>
          </div>
          <SwitchField
            label={t('general.nsfw')}
            description={t('general.nsfwDesc')}
            checked={v.nsfw}
            onCheckedChange={(c) => set('nsfw', c)}
          />
        </SettingsSection>

        <SettingsSection id="display" title={t('general.display')}>
          <SwitchField
            label={t('general.showMemberCount')}
            checked={v.showMemberCount}
            onCheckedChange={(c) => set('showMemberCount', c)}
          />
          <SwitchField
            label={t('general.requireAltText')}
            description={t('general.requireAltTextDesc')}
            checked={v.requireAltText}
            onCheckedChange={(c) => set('requireAltText', c)}
          />
          <Field label={t('general.welcomeMessage')} description={t('general.welcomeMessageDesc')}>
            {(p) => (
              <Textarea
                {...p}
                value={v.welcomeMessage}
                maxLength={500}
                onChange={(e) => set('welcomeMessage', e.target.value)}
              />
            )}
          </Field>
        </SettingsSection>

        <div>
          <Button type="submit" loading={pending === 'basics'}>
            {t('save')}
          </Button>
        </div>
      </form>

      {isOwner && (
        <SettingsSection
          id="address"
          title={t('general.address')}
          description={t('general.addressDesc')}
        >
          <form onSubmit={saveSlug} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label={tcr('slug')} className="flex-1">
              {(p) => (
                <Input
                  {...p}
                  value={slug}
                  maxLength={32}
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                />
              )}
            </Field>
            <Button
              type="submit"
              variant="secondary"
              loading={pending === 'slug'}
              disabled={slug === initial.slug}
            >
              {t('general.changeAddress')}
            </Button>
          </form>
        </SettingsSection>
      )}
    </div>
  );
}
