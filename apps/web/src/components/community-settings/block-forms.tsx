'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { LINK_KINDS, type Block, type BlockConfig, type BlockType } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { RichTextEditor } from '@/components/rich-text/editor';
import { ImageUpload } from '@/components/upload/image-upload';

export interface BlockFormContext {
  communityId: string;
  roles: { id: string; name: string }[];
  servers: { id: string; name: string }[];
  requireAlt: boolean;
  fields: Record<string, string>;
}

/** Generic list editor with add, remove and keyboard-friendly move buttons. */
function ListEditor<T>({
  items,
  onChange,
  make,
  max,
  itemLabel,
  renderItem,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  make: () => T;
  max: number;
  itemLabel: (i: number) => string;
  renderItem: (item: T, update: (patch: Partial<T>) => void, index: number) => React.ReactNode;
}) {
  const t = useTranslations('blocks');
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-3">
        {items.map((item, i) => (
          <li key={i} className="rounded-ui border border-border p-3">
            <fieldset className="flex flex-col gap-3">
              <legend className="flex w-full items-center justify-between gap-2 text-sm font-semibold">
                <span>{itemLabel(i)}</span>
              </legend>
              {renderItem(item, (patch) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x))), i)}
              <div className="flex gap-1">
                <Button type="button" size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('moveItemUp', { item: itemLabel(i) })}>
                  <ArrowUp aria-hidden />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label={t('moveItemDown', { item: itemLabel(i) })}>
                  <ArrowDown aria-hidden />
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden /> {t('remove')}
                  <span className="sr-only"> {itemLabel(i)}</span>
                </Button>
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      {items.length < max && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, make()])}>
            <Plus aria-hidden /> {t('addItem')}
          </Button>
        </div>
      )}
    </div>
  );
}

function Heading({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const t = useTranslations('blocks');
  return (
    <Field label={t('heading')} error={error}>
      {(p) => <Input {...p} value={value} maxLength={80} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

export function BlockForm({
  block,
  config,
  setConfig,
  ctx,
}: {
  block: Block;
  config: Record<string, unknown>;
  setConfig: (c: Record<string, unknown>) => void;
  ctx: BlockFormContext;
}) {
  const t = useTranslations('blocks');
  const f = ctx.fields;
  const set = (patch: Record<string, unknown>) => setConfig({ ...config, ...patch });
  const type: BlockType = block.type;

  switch (type) {
    case 'hero': {
      const c = config as BlockConfig<'hero'>;
      return (
        <div className="flex flex-col gap-4">
          <Field label={t('hero.heading')} error={f.heading} required>
            {(p) => <Input {...p} value={c.heading} maxLength={120} onChange={(e) => set({ heading: e.target.value })} />}
          </Field>
          <Field label={t('hero.subheading')} error={f.subheading}>
            {(p) => <Textarea {...p} value={c.subheading} maxLength={300} onChange={(e) => set({ subheading: e.target.value })} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('hero.ctaLabel')} description={t('hero.ctaLabelHint')}>
              {(p) => <Input {...p} value={c.ctaLabel} maxLength={40} onChange={(e) => set({ ctaLabel: e.target.value })} />}
            </Field>
            <Field label={t('hero.ctaTarget')}>
              {(p) => (
                <Select {...p} value={c.ctaTarget} onChange={(e) => set({ ctaTarget: e.target.value })}>
                  {(['join', 'servers', 'forum', 'chat', 'events', 'url'] as const).map((k) => (
                    <option key={k} value={k}>
                      {t(`hero.targets.${k}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {c.ctaTarget === 'url' && (
              <Field label={t('hero.ctaUrl')} error={f.ctaUrl}>
                {(p) => <Input {...p} type="url" value={c.ctaUrl ?? ''} placeholder="https://" onChange={(e) => set({ ctaUrl: e.target.value || undefined })} />}
              </Field>
            )}
            <Field label={t('hero.align')}>
              {(p) => (
                <Select {...p} value={c.align} onChange={(e) => set({ align: e.target.value })}>
                  <option value="start">{t('hero.alignStart')}</option>
                  <option value="center">{t('hero.alignCenter')}</option>
                </Select>
              )}
            </Field>
          </div>
        </div>
      );
    }
    case 'about':
    case 'richText': {
      const c = config as BlockConfig<'about'>;
      return (
        <div className="flex flex-col gap-4">
          <Heading value={c.heading} onChange={(v) => set({ heading: v })} error={f.heading} />
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold" id={`content-${block.id}`}>
              {t('content')}
            </span>
            <RichTextEditor
              label={t('content')}
              value={c.doc}
              onChange={(doc) => set({ doc })}
              communityId={ctx.communityId}
              requireAlt={ctx.requireAlt}
            />
            {f.doc && <p className="text-sm text-danger">{f.doc}</p>}
          </div>
        </div>
      );
    }
    case 'rules': {
      const c = config as BlockConfig<'rules'>;
      return (
        <div className="flex flex-col gap-4">
          <Heading value={c.heading} onChange={(v) => set({ heading: v })} />
          <ListEditor
            items={c.rules}
            onChange={(rules) => set({ rules })}
            make={() => ({ title: '', description: '' })}
            max={50}
            itemLabel={(i) => t('rules.item', { n: i + 1 })}
            renderItem={(r, update, i) => (
              <>
                <Field label={t('rules.title')} error={f[`rules.${i}.title`]}>
                  {(p) => <Input {...p} value={r.title} maxLength={120} onChange={(e) => update({ title: e.target.value })} />}
                </Field>
                <Field label={t('rules.description')}>
                  {(p) => <Textarea {...p} value={r.description} maxLength={1000} onChange={(e) => update({ description: e.target.value })} />}
                </Field>
              </>
            )}
          />
        </div>
      );
    }
    case 'links': {
      const c = config as BlockConfig<'links'>;
      return (
        <div className="flex flex-col gap-4">
          <Heading value={c.heading} onChange={(v) => set({ heading: v })} />
          <ListEditor
            items={c.links}
            onChange={(links) => set({ links })}
            make={() => ({ label: '', url: '', kind: 'website' as const })}
            max={24}
            itemLabel={(i) => t('links.item', { n: i + 1 })}
            renderItem={(l, update, i) => (
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr_10rem]">
                <Field label={t('links.label')} error={f[`links.${i}.label`]}>
                  {(p) => <Input {...p} value={l.label} maxLength={60} onChange={(e) => update({ label: e.target.value })} />}
                </Field>
                <Field label={t('links.url')} error={f[`links.${i}.url`]}>
                  {(p) => <Input {...p} type="url" value={l.url} placeholder="https://" onChange={(e) => update({ url: e.target.value })} />}
                </Field>
                <Field label={t('links.kind')}>
                  {(p) => (
                    <Select {...p} value={l.kind} onChange={(e) => update({ kind: e.target.value as (typeof LINK_KINDS)[number] })}>
                      {LINK_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`links.kinds.${k}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            )}
          />
        </div>
      );
    }
    case 'faq': {
      const c = config as BlockConfig<'faq'>;
      return (
        <div className="flex flex-col gap-4">
          <Heading value={c.heading} onChange={(v) => set({ heading: v })} />
          <ListEditor
            items={c.items}
            onChange={(items) => set({ items })}
            make={() => ({ q: '', a: '' })}
            max={40}
            itemLabel={(i) => t('faq.item', { n: i + 1 })}
            renderItem={(item, update, i) => (
              <>
                <Field label={t('faq.question')} error={f[`items.${i}.q`]}>
                  {(p) => <Input {...p} value={item.q} maxLength={200} onChange={(e) => update({ q: e.target.value })} />}
                </Field>
                <Field label={t('faq.answer')} error={f[`items.${i}.a`]}>
                  {(p) => <Textarea {...p} value={item.a} maxLength={2000} onChange={(e) => update({ a: e.target.value })} />}
                </Field>
              </>
            )}
          />
        </div>
      );
    }
    case 'gallery': {
      const c = config as BlockConfig<'gallery'>;
      return (
        <div className="flex flex-col gap-4">
          <Heading value={c.heading} onChange={(v) => set({ heading: v })} />
          <Field label={t('gallery.layout')}>
            {(p) => (
              <Select {...p} value={c.layout} onChange={(e) => set({ layout: e.target.value })}>
                <option value="grid">{t('gallery.grid')}</option>
                <option value="masonry">{t('gallery.masonry')}</option>
              </Select>
            )}
          </Field>
          <ListEditor
            items={c.images as { key: string; alt: string; caption: string }[]}
            onChange={(images) => set({ images })}
            make={() => ({ key: '', alt: '', caption: '' })}
            max={24}
            itemLabel={(i) => t('gallery.item', { n: i + 1 })}
            renderItem={(img, update, i) => (
              <>
                <ImageUpload
                  label={t('gallery.image')}
                  purpose="gallery"
                  communityId={ctx.communityId}
                  value={img.key || null}
                  onChange={(k) => update({ key: k ?? '' })}
                  shape="banner"
                />
                <Field label={t('gallery.alt')} description={t('gallery.altHint')} error={f[`images.${i}.alt`] ?? f[`images.${i}.key`]} required>
                  {(p) => <Textarea {...p} value={img.alt} maxLength={500} onChange={(e) => update({ alt: e.target.value })} />}
                </Field>
                <Field label={t('gallery.caption')}>
                  {(p) => <Input {...p} value={img.caption} maxLength={200} onChange={(e) => update({ caption: e.target.value })} />}
                </Field>
              </>
            )}
          />
        </div>
      );
    }
    case 'staff': {
      const c = config as BlockConfig<'staff'>;
      return (
        <div className="flex flex-col gap-4">
          <Heading value={c.heading} onChange={(v) => set({ heading: v })} />
          <fieldset>
            <legend className="text-sm font-semibold">{t('staff.roles')}</legend>
            <p className="text-sm text-muted">{t('staff.rolesHint')}</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {ctx.roles.map((r) => (
                <li key={r.id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--c-primary)]"
                      checked={c.roleIds.includes(r.id)}
                      onChange={(e) => set({ roleIds: e.target.checked ? [...c.roleIds, r.id] : c.roleIds.filter((x) => x !== r.id) })}
                    />
                    {r.name}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        </div>
      );
    }
    case 'discordInvite': {
      const c = config as BlockConfig<'discordInvite'>;
      return (
        <div className="flex flex-col gap-4">
          <Heading value={c.heading} onChange={(v) => set({ heading: v })} />
          <Field label={t('discord.code')} description={t('discord.codeHint')} error={f.code} required>
            {(p) => <Input {...p} value={c.code} maxLength={32} onChange={(e) => set({ code: e.target.value.replace(/^https?:\/\/(www\.)?(discord\.gg|discord\.com\/invite)\//, '') })} />}
          </Field>
          <Field label={t('discord.description')}>
            {(p) => <Input {...p} value={c.description} maxLength={200} onChange={(e) => set({ description: e.target.value })} />}
          </Field>
        </div>
      );
    }
    case 'embed': {
      const c = config as BlockConfig<'embed'>;
      return (
        <div className="flex flex-col gap-4">
          <Heading value={c.heading} onChange={(v) => set({ heading: v })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('embed.provider')}>
              {(p) => (
                <Select {...p} value={c.provider} onChange={(e) => set({ provider: e.target.value })}>
                  <option value="youtube">YouTube</option>
                  <option value="twitch">Twitch</option>
                </Select>
              )}
            </Field>
            <Field label={c.provider === 'youtube' ? t('embed.videoId') : t('embed.channel')} error={f.ref} required>
              {(p) => <Input {...p} value={c.ref} maxLength={64} onChange={(e) => set({ ref: e.target.value.trim() })} />}
            </Field>
          </div>
          <Field label={t('embed.title')} description={t('embed.titleHint')} error={f.title} required>
            {(p) => <Input {...p} value={c.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />}
          </Field>
        </div>
      );
    }
    case 'serverStatus': {
      const c = config as BlockConfig<'serverStatus'>;
      return (
        <div className="flex flex-col gap-4">
          <Heading value={c.heading} onChange={(v) => set({ heading: v })} />
          <fieldset>
            <legend className="text-sm font-semibold">{t('serverStatus.servers')}</legend>
            <p className="text-sm text-muted">{t('serverStatus.serversHint')}</p>
            {ctx.servers.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t('serverStatus.none')}</p>
            ) : (
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {ctx.servers.map((s) => (
                  <li key={s.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-[var(--c-primary)]"
                        checked={c.serverIds.includes(s.id)}
                        onChange={(e) => set({ serverIds: e.target.checked ? [...c.serverIds, s.id] : c.serverIds.filter((x) => x !== s.id) })}
                      />
                      {s.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
          <SwitchField label={t('serverStatus.showPlayers')} checked={c.showPlayers} onCheckedChange={(v) => set({ showPlayers: v })} />
          <Field label={t('serverStatus.layout')}>
            {(p) => (
              <Select {...p} value={c.layout} onChange={(e) => set({ layout: e.target.value })}>
                <option value="cards">{t('serverStatus.cards')}</option>
                <option value="list">{t('serverStatus.list')}</option>
              </Select>
            )}
          </Field>
        </div>
      );
    }
    case 'featuredThreads':
    case 'upcomingEvents': {
      const c = config as BlockConfig<'upcomingEvents'>;
      return (
        <div className="flex flex-col gap-4">
          <Heading value={c.heading} onChange={(v) => set({ heading: v })} />
          <Field label={t('count')}>
            {(p) => <Input {...p} type="number" min={1} max={10} value={c.count} onChange={(e) => set({ count: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })} />}
          </Field>
        </div>
      );
    }
    case 'stats': {
      const c = config as BlockConfig<'stats'>;
      return (
        <div className="flex flex-col gap-2">
          <Heading value={c.heading} onChange={(v) => set({ heading: v })} />
          <SwitchField label={t('stats.members')} checked={c.showMembers} onCheckedChange={(v) => set({ showMembers: v })} />
          <SwitchField label={t('stats.online')} checked={c.showOnline} onCheckedChange={(v) => set({ showOnline: v })} />
          <SwitchField label={t('stats.servers')} checked={c.showServers} onCheckedChange={(v) => set({ showServers: v })} />
        </div>
      );
    }
    default:
      return null;
  }
}

export function blockTitle(block: Block, fallback: string): string {
  const c = block.config as { heading?: string };
  return c.heading?.trim() || fallback;
}
