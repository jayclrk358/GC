'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  ArrowDown,
  ArrowUp,
  FolderPlus,
  Hash,
  Megaphone,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState } from '@/components/ui/misc';
import {
  createChannelAction,
  deleteChannelAction,
  reorderChannelsAction,
  updateChannelAction,
} from '@/app/actions/channels';
import { ChannelForm, type ChannelData, type ChannelFormValues } from './channel-form';
import { ChannelPermissions } from './channel-permissions';

type Dialogs =
  | { kind: 'channel'; channel?: ChannelData; parentId?: string | null }
  | { kind: 'category'; channel?: ChannelData }
  | { kind: 'perms'; channel: ChannelData }
  | { kind: 'delete'; channel: ChannelData }
  | null;

/** Group channels under their categories, each list in position order. */
function arrange(channels: ChannelData[]) {
  const byPos = [...channels].sort((a, b) => a.position - b.position);
  const categories = byPos.filter((c) => c.type === 'category');
  const catIds = new Set(categories.map((c) => c.id));
  const loose = byPos.filter(
    (c) => c.type !== 'category' && (!c.parentId || !catIds.has(c.parentId)),
  );
  return {
    loose,
    categories: categories.map((cat) => ({
      cat,
      channels: byPos.filter((c) => c.type !== 'category' && c.parentId === cat.id),
    })),
  };
}

function flatten(groups: ReturnType<typeof arrange>): string[] {
  return [
    ...groups.loose.map((c) => c.id),
    ...groups.categories.flatMap((g) => [g.cat.id, ...g.channels.map((c) => c.id)]),
  ];
}

export function ChannelManager({
  communityId,
  slug,
  channels: initial,
  roles,
  canEditPerms,
}: {
  communityId: string;
  slug: string;
  channels: ChannelData[];
  roles: { id: string; name: string; isDefault: boolean }[];
  canEditPerms: boolean;
}) {
  const t = useTranslations('channels');
  const router = useRouter();
  const [channels, setChannels] = React.useState(initial);
  const [lastInitial, setLastInitial] = React.useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setChannels(initial);
  }
  const [dialog, setDialog] = React.useState<Dialogs>(null);
  const [status, setStatus] = React.useState('');
  const groups = arrange(channels);
  const categories = groups.categories.map((g) => ({ id: g.cat.id, name: g.cat.name }));

  async function move(list: ChannelData[], index: number, dir: -1 | 1, label: string) {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const a = list[index]!;
    const b = list[target]!;
    // Swap positions of the two neighbours, then renumber everything in display order.
    const swapped = channels.map((c) =>
      c.id === a.id
        ? { ...c, position: b.position }
        : c.id === b.id
          ? { ...c, position: a.position }
          : c,
    );
    const ids = flatten(arrange(swapped));
    const next = swapped.map((c) => ({ ...c, position: ids.indexOf(c.id) + 1 }));
    const prev = channels;
    setChannels(next);
    const r = await reorderChannelsAction(communityId, ids);
    if (!r.ok) {
      setChannels(prev);
      toast.error(r.error);
    } else setStatus(t('moved', { name: label }));
  }

  async function saveChannel(v: ChannelFormValues, existing?: ChannelData) {
    const r = existing
      ? await updateChannelAction(communityId, existing.id, v)
      : await createChannelAction(communityId, v);
    if (!r.ok) return { error: r.error, fields: r.fields };
    toast.success(
      existing ? t('savedToast', { name: v.name }) : t('createdToast', { name: v.name }),
    );
    setDialog(null);
    router.refresh();
  }

  const row = (c: ChannelData, list: ChannelData[], i: number) => {
    const Icon = c.type === 'announcement' ? Megaphone : Hash;
    return (
      <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
        <Icon className="size-4 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {c.name}
            {c.type === 'announcement' && <Badge>{t('types.announcement')}</Badge>}
            {c.settings.qa && <Badge tone="success">{t('qaBadge')}</Badge>}
            {c.settings.voting && <Badge tone="primary">{t('votingBadge')}</Badge>}
          </p>
          {c.topic && <p className="truncate text-sm text-muted">{c.topic}</p>}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('moveUp', { name: c.name })}
            disabled={i === 0}
            onClick={() => void move(list, i, -1, c.name)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('moveDown', { name: c.name })}
            disabled={i === list.length - 1}
            onClick={() => void move(list, i, 1, c.name)}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('editNamed', { name: c.name })}
            onClick={() => setDialog({ kind: 'channel', channel: c })}
          >
            <Pencil aria-hidden />
          </Button>
          {canEditPerms && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={t('permsNamed', { name: c.name })}
              onClick={() => setDialog({ kind: 'perms', channel: c })}
            >
              <ShieldCheck aria-hidden />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('deleteNamed', { name: c.name })}
            onClick={() => setDialog({ kind: 'delete', channel: c })}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">
        {status}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDialog({ kind: 'channel' })}>
          <Plus aria-hidden /> {t('newChannel')}
        </Button>
        <Button variant="outline" onClick={() => setDialog({ kind: 'category' })}>
          <FolderPlus aria-hidden /> {t('newCategory')}
        </Button>
        <Button asChild variant="ghost">
          <a href={`/c/${slug}/forum`}>{t('viewForum')}</a>
        </Button>
      </div>

      {channels.length === 0 && <EmptyState title={t('empty')} description={t('emptyHint')} />}

      {groups.loose.length > 0 && (
        <section
          aria-labelledby="cat-none"
          className="rounded-ui-lg border border-border bg-surface"
        >
          <h2
            id="cat-none"
            className="border-b border-border px-3 py-2 text-sm font-bold tracking-wide text-muted uppercase"
          >
            {t('uncategorised')}
          </h2>
          <ul className="divide-y divide-border">
            {groups.loose.map((c, i) => row(c, groups.loose, i))}
          </ul>
        </section>
      )}

      {groups.categories.map((g, gi) => {
        const cats = groups.categories.map((x) => x.cat);
        return (
          <section
            key={g.cat.id}
            aria-labelledby={`cat-${g.cat.id}`}
            className="rounded-ui-lg border border-border bg-surface"
          >
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
              <h2
                id={`cat-${g.cat.id}`}
                className="flex-1 text-sm font-bold tracking-wide text-muted uppercase"
              >
                {g.cat.name}
              </h2>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('moveUp', { name: g.cat.name })}
                disabled={gi === 0}
                onClick={() => void move(cats, gi, -1, g.cat.name)}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('moveDown', { name: g.cat.name })}
                disabled={gi === cats.length - 1}
                onClick={() => void move(cats, gi, 1, g.cat.name)}
              >
                <ArrowDown aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('renameNamed', { name: g.cat.name })}
                onClick={() => setDialog({ kind: 'category', channel: g.cat })}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('deleteNamed', { name: g.cat.name })}
                onClick={() => setDialog({ kind: 'delete', channel: g.cat })}
              >
                <Trash2 aria-hidden />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDialog({ kind: 'channel', parentId: g.cat.id })}
              >
                <Plus aria-hidden /> {t('addHere')}
                <span className="sr-only"> {g.cat.name}</span>
              </Button>
            </div>
            {g.channels.length ? (
              <ul className="divide-y divide-border">
                {g.channels.map((c, i) => row(c, g.channels, i))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-sm text-muted">{t('emptyCategory')}</p>
            )}
          </section>
        );
      })}

      <Dialog open={dialog?.kind === 'channel'} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog?.kind === 'channel' && (
          <DialogContent
            title={dialog.channel ? t('editTitle', { name: dialog.channel.name }) : t('newChannel')}
          >
            <ChannelForm
              isNew={!dialog.channel}
              initial={
                dialog.channel ??
                (dialog.parentId
                  ? ({ parentId: dialog.parentId, settings: {} } as ChannelData)
                  : undefined)
              }
              categories={categories}
              onCancel={() => setDialog(null)}
              onSubmit={(v) => saveChannel(v, dialog.channel)}
            />
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={dialog?.kind === 'category'} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog?.kind === 'category' && (
          <DialogContent size="sm" title={dialog.channel ? t('renameCategory') : t('newCategory')}>
            <CategoryForm
              initial={dialog.channel?.name ?? ''}
              onCancel={() => setDialog(null)}
              onSubmit={async (name) => {
                const r = dialog.channel
                  ? await updateChannelAction(communityId, dialog.channel.id, { name })
                  : await createChannelAction(communityId, { type: 'category', name });
                if (!r.ok) return r.error;
                setDialog(null);
                router.refresh();
              }}
            />
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={dialog?.kind === 'perms'} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog?.kind === 'perms' && (
          <DialogContent
            title={t('permsTitle', { name: dialog.channel.name })}
            description={t('permsExplain')}
            size="lg"
          >
            <ChannelPermissions
              communityId={communityId}
              channelId={dialog.channel.id}
              roles={roles}
              onDone={() => setDialog(null)}
            />
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={dialog?.kind === 'delete'} onOpenChange={(o) => !o && setDialog(null)}>
        {dialog?.kind === 'delete' && (
          <DialogContent
            size="sm"
            title={t('deleteTitle', { name: dialog.channel.name })}
            description={
              dialog.channel.type === 'category'
                ? t('deleteCategoryExplain')
                : t('deleteChannelExplain')
            }
          >
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDialog(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const r = await deleteChannelAction(communityId, dialog.channel.id);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  toast.success(t('deletedToast', { name: dialog.channel.name }));
                  setDialog(null);
                  router.refresh();
                }}
              >
                {t('delete')}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function CategoryForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (name: string) => Promise<string | void>;
  onCancel: () => void;
}) {
  const t = useTranslations('channels');
  const [name, setName] = React.useState(initial);
  const [error, setError] = React.useState<string | undefined>();
  const [pending, setPending] = React.useState(false);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const err = await onSubmit(name);
        setPending(false);
        setError(err || undefined);
      }}
    >
      <Field label={t('categoryName')} error={error} required>
        {(p) => (
          <Input
            {...p}
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        )}
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" loading={pending}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
