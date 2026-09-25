'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Pencil, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import type { ServerView } from '@magnox/core';
import { REGIONS, type ServerProtocol } from '@magnox/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Alert, Badge, EmptyState } from '@/components/ui/misc';
import { SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { StatusDot, useLiveStatus } from '@/components/servers/server-status';
import { addServerAction, refreshServerAction, removeServerAction, updateServerAction } from '@/app/actions/servers';

interface ProtocolOption {
  key: ServerProtocol;
  label: string;
  defaultPort: number;
}

interface FormState {
  name: string;
  protocol: ServerProtocol;
  host: string;
  port: string;
  description: string;
  tags: string;
  region: string;
  listed: boolean;
}

function ServerForm({
  initial,
  protocols,
  onSubmit,
  submitLabel,
}: {
  initial: FormState;
  protocols: ProtocolOption[];
  onSubmit: (v: FormState) => Promise<{ error?: string; fields?: Record<string, string> } | void>;
  submitLabel: string;
}) {
  const t = useTranslations('serverSettings');
  const tc = useTranslations('community');
  const [v, setV] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  const set = <K extends keyof FormState>(k: K, val: FormState[K]) => setV((s) => ({ ...s, [k]: val }));

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        const r = await onSubmit(v);
        setPending(false);
        if (r?.error) {
          setError(r.error);
          setFields(r.fields ?? {});
        }
      }}
    >
      <FormError message={error} />
      <Field label={t('name')} error={fields.name} required>
        {(p) => <Input {...p} value={v.name} maxLength={80} onChange={(e) => set('name', e.target.value)} />}
      </Field>
      <Field label={t('game')} error={fields.protocol}>
        {(p) => (
          <Select
            {...p}
            value={v.protocol}
            onChange={(e) => {
              const proto = protocols.find((x) => x.key === e.target.value)!;
              const prevDefault = protocols.find((x) => x.key === v.protocol)?.defaultPort;
              setV((s) => ({ ...s, protocol: proto.key, port: !s.port || Number(s.port) === prevDefault ? String(proto.defaultPort) : s.port }));
            }}
          >
            {protocols.map((pr) => (
              <option key={pr.key} value={pr.key}>
                {pr.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label={t('host')} description={t('hostHint')} error={fields.host} required>
          {(p) => <Input {...p} value={v.host} autoCapitalize="none" spellCheck={false} placeholder="play.example.com" onChange={(e) => set('host', e.target.value)} />}
        </Field>
        <Field label={t('port')} description={t('portHint')} error={fields.port} required>
          {(p) => <Input {...p} value={v.port} inputMode="numeric" onChange={(e) => set('port', e.target.value.replace(/\D/g, '').slice(0, 5))} />}
        </Field>
      </div>
      <Field label={t('descriptionLabel')} error={fields.description}>
        {(p) => <Textarea {...p} value={v.description} maxLength={500} onChange={(e) => set('description', e.target.value)} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('tags')} description={t('tagsHint')} error={fields.tags}>
          {(p) => <Input {...p} value={v.tags} onChange={(e) => set('tags', e.target.value)} placeholder="survival, pvp" />}
        </Field>
        <Field label={t('region')}>
          {(p) => (
            <Select {...p} value={v.region} onChange={(e) => set('region', e.target.value)}>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {tc(`regions.${r}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <SwitchField label={t('listed')} description={t('listedDesc')} checked={v.listed} onCheckedChange={(c) => set('listed', c)} />
      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function toInput(v: FormState) {
  return {
    name: v.name,
    protocol: v.protocol,
    host: v.host.trim(),
    port: Number(v.port),
    description: v.description,
    tags: v.tags.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 8),
    region: v.region,
    listed: v.listed,
  };
}

function ServerRow({
  server,
  communityId,
  onEdit,
  onRemove,
}: {
  server: ServerView;
  communityId: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const t = useTranslations('serverSettings');
  const ts = useTranslations('servers');
  const status = useLiveStatus(server.endpointId, server.status);
  const [refreshing, setRefreshing] = React.useState(false);
  return (
    <li className="flex flex-col gap-3 rounded-ui-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-bold">
            {server.name}
            {server.verified ? (
              <Badge tone="success">
                <ShieldCheck className="size-3.5" aria-hidden /> {t('verified')}
              </Badge>
            ) : (
              <Badge tone="warning">
                <ShieldAlert className="size-3.5" aria-hidden /> {t('unverified')}
              </Badge>
            )}
            {!server.listed && <Badge>{t('unlisted')}</Badge>}
          </h3>
          <p className="text-sm text-muted">
            {server.protocolLabel} · <span className="font-mono">{server.address}</span>
          </p>
        </div>
        <p className="flex items-center gap-2 text-sm font-semibold" aria-live="polite">
          <StatusDot online={status.online} className={status.checkedAt ? undefined : 'opacity-40'} />
          {!status.checkedAt ? ts('checking') : status.online ? `${ts('online')} · ${status.players ?? '?'}/${status.maxPlayers ?? '?'}` : ts('offline')}
        </p>
      </div>
      {!server.verified && server.verifyToken && (
        <Alert tone="info" title={t('verifyTitle')}>
          <p>{t('verifyBody')}</p>
          <p className="mt-2">
            <code className="rounded bg-surface-2 px-2 py-1 font-mono text-sm select-all">{server.verifyToken}</code>
          </p>
          <p className="mt-2 text-xs text-muted">{t('verifyAfter')}</p>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          loading={refreshing}
          onClick={async () => {
            setRefreshing(true);
            const r = await refreshServerAction(communityId, server.id);
            setRefreshing(false);
            if (!r.ok) toast.error(r.error);
            else toast.success(r.data.queued ? t('refreshQueued') : t('refreshCached'));
          }}
        >
          <RefreshCw aria-hidden /> {server.verified ? t('refresh') : t('checkNow')}
          <span className="sr-only"> {server.name}</span>
        </Button>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil aria-hidden /> {t('edit')}
          <span className="sr-only"> {server.name}</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <Trash2 aria-hidden /> {t('remove')}
          <span className="sr-only"> {server.name}</span>
        </Button>
      </div>
    </li>
  );
}

export function ServerManager({
  communityId,
  servers,
  protocols,
}: {
  communityId: string;
  servers: ServerView[];
  protocols: ProtocolOption[];
}) {
  const t = useTranslations('serverSettings');
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<ServerView | null>(null);
  const [removing, setRemoving] = React.useState<ServerView | null>(null);

  const blank: FormState = {
    name: '',
    protocol: protocols[0]!.key,
    host: '',
    port: String(protocols[0]!.defaultPort),
    description: '',
    tags: '',
    region: 'global',
    listed: true,
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden /> {t('add')}
        </Button>
      </div>
      {servers.length === 0 ? (
        <EmptyState title={t('empty')} description={t('emptyDesc')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {servers.map((s) => (
            <ServerRow key={s.id} server={s} communityId={communityId} onEdit={() => setEditing(s)} onRemove={() => setRemoving(s)} />
          ))}
        </ul>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title={t('addTitle')} description={t('addDesc')} size="lg">
          <ServerForm
            initial={blank}
            protocols={protocols}
            submitLabel={t('add')}
            onSubmit={async (v) => {
              const r = await addServerAction(communityId, toInput(v));
              if (!r.ok) return { error: r.error, fields: r.fields };
              setAdding(false);
              toast.success(t('added'));
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={t('editTitle', { name: editing.name })} size="lg">
            <ServerForm
              initial={{
                name: editing.name,
                protocol: editing.protocol,
                host: editing.host,
                port: String(editing.port),
                description: editing.description,
                tags: editing.tags.join(', '),
                region: editing.region,
                listed: editing.listed,
              }}
              protocols={protocols}
              submitLabel={t('save')}
              onSubmit={async (v) => {
                const r = await updateServerAction(communityId, editing.id, toInput(v));
                if (!r.ok) return { error: r.error, fields: r.fields };
                setEditing(null);
                toast.success(t('saved'));
                router.refresh();
              }}
            />
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)}>
        {removing && (
          <DialogContent size="sm" title={t('removeTitle')} description={t('removeConfirm', { name: removing.name })}>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  const r = await removeServerAction(communityId, removing.id);
                  setRemoving(null);
                  if (r.ok) router.refresh();
                  else toast.error(r.error);
                }}
              >
                {t('remove')}
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
