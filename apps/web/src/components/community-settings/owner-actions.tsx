'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { setArchivedAction, transferOwnershipAction } from '@/app/actions/communities';

/** Hand the community to another member. */
export function TransferOwnership({ communityId, slug }: { communityId: string; slug: string }) {
  const t = useTranslations('csettings.danger');
  const router = useRouter();
  const [username, setUsername] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});
  const [pending, setPending] = React.useState(false);
  return (
    <SettingsSection id="transfer" title={t('transferTitle')} description={t('transferDesc')}>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          const r = await transferOwnershipAction(communityId, { username, confirm });
          setPending(false);
          if (r.ok) {
            toast.success(t('transferred', { name: username.replace(/^@/, '') }));
            router.push(`/c/${slug}`);
            router.refresh();
          } else {
            setError(r.error);
            setFields(r.fields ?? {});
          }
        }}
      >
        <FormError message={error} />
        <Field label={t('newOwner')} description={t('newOwnerHint')} error={fields.username}>
          {(p) => (
            <Input
              {...p}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        <Field label={t('transferConfirm', { slug })} error={fields.confirm}>
          {(p) => (
            <Input
              {...p}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
        <div>
          <Button
            type="submit"
            variant="danger"
            disabled={!username.trim() || confirm !== slug}
            loading={pending}
          >
            {t('transferButton')}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

/** Archive the community (read-only, out of Explore), or bring it back. */
export function ArchiveCommunity({
  communityId,
  archived,
}: {
  communityId: string;
  archived: boolean;
}) {
  const t = useTranslations('csettings.danger');
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  return (
    <SettingsSection
      id="archive"
      title={archived ? t('unarchiveTitle') : t('archiveTitle')}
      description={archived ? t('unarchiveDesc') : t('archiveDesc')}
    >
      <div>
        <Button
          variant={archived ? 'primary' : 'outline'}
          loading={pending}
          onClick={async () => {
            if (!archived && !window.confirm(t('archiveConfirm'))) return;
            setPending(true);
            const r = await setArchivedAction(communityId, !archived);
            setPending(false);
            if (r.ok) {
              toast.success(archived ? t('unarchived') : t('archived'));
              router.refresh();
            } else toast.error(r.error);
          }}
        >
          {archived ? t('unarchiveButton') : t('archiveButton')}
        </Button>
      </div>
    </SettingsSection>
  );
}
