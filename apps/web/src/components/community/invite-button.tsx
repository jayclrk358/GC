'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { createInviteAction } from '@/app/actions/invites';

export function InviteButton({ communityId }: { communityId: string }) {
  const t = useTranslations('invites');
  const [open, setOpen] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [expires, setExpires] = React.useState('168');
  const [maxUses, setMaxUses] = React.useState('0');

  async function generate() {
    setPending(true);
    setError(null);
    const r = await createInviteAction(communityId, {
      expiresInHours: Number(expires),
      maxUses: Number(maxUses),
    });
    setPending(false);
    if (r.ok) setLink(`${window.location.origin}/invite/${r.data.code}`);
    else setError(r.error);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setLink(null);
          setCopied(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus aria-hidden /> {t('invite')}
        </Button>
      </DialogTrigger>
      <DialogContent title={t('title')} description={t('description')}>
        {error && (
          <Alert tone="danger" live>
            {error}
          </Alert>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('expiresAfter')}>
            {(p) => (
              <Select {...p} value={expires} onValueChange={(v) => setExpires(v)}>
                <option value="1">{t('hours', { count: 1 })}</option>
                <option value="24">{t('days', { count: 1 })}</option>
                <option value="168">{t('days', { count: 7 })}</option>
                <option value="720">{t('days', { count: 30 })}</option>
                <option value="0">{t('never')}</option>
              </Select>
            )}
          </Field>
          <Field label={t('maxUses')}>
            {(p) => (
              <Select {...p} value={maxUses} onValueChange={(v) => setMaxUses(v)}>
                <option value="0">{t('unlimited')}</option>
                <option value="1">1</option>
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="100">100</option>
              </Select>
            )}
          </Field>
        </div>
        {link ? (
          <div className="flex flex-col gap-2">
            <Field label={t('link')}>
              {(p) => (
                <Input {...p} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
              )}
            </Field>
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                }}
              >
                {copied ? t('copied') : t('copy')}
              </Button>
              <Button variant="ghost" onClick={generate} loading={pending}>
                {t('newLink')}
              </Button>
            </div>
            <p role="status" className="sr-only">
              {copied ? t('copied') : ''}
            </p>
          </div>
        ) : (
          <Button onClick={generate} loading={pending}>
            {t('generate')}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
