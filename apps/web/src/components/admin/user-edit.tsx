'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { FormError } from '@/components/auth/form-error';
import { SettingsSection } from '@/components/settings/section';
import { updateUserAction } from '@/app/actions/admin';

/** Fix up someone's account: their names, what's on their profile, their email check. */
export function UserEdit({
  userId,
  name: initialName,
  username: initialUsername,
  emailVerified,
}: {
  userId: string;
  name: string;
  username: string | null;
  emailVerified: boolean;
}) {
  const t = useTranslations('admin.edit');
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [username, setUsername] = React.useState(initialUsername ?? '');
  const [clearProfileText, setClearProfileText] = React.useState(false);
  const [removeAvatar, setRemoveAvatar] = React.useState(false);
  const [removeBanner, setRemoveBanner] = React.useState(false);
  const [verifyEmail, setVerifyEmail] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fields, setFields] = React.useState<Record<string, string>>({});

  return (
    <SettingsSection id="edit" title={t('title')} description={t('description')}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          const r = await updateUserAction(userId, {
            name,
            ...(username ? { username } : {}),
            clearProfileText,
            removeAvatar,
            removeBanner,
            verifyEmail,
          });
          setPending(false);
          if (r.ok) {
            toast.success(t('saved'));
            setClearProfileText(false);
            setRemoveAvatar(false);
            setRemoveBanner(false);
            setVerifyEmail(false);
            router.refresh();
          } else {
            setError(r.error);
            setFields(r.fields ?? {});
          }
        }}
      >
        <FormError message={error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('name')} error={fields.name}>
            {(p) => (
              <Input {...p} value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
            )}
          </Field>
          <Field label={t('username')} error={fields.username}>
            {(p) => (
              <Input
                {...p}
                value={username}
                maxLength={24}
                autoCapitalize="none"
                onChange={(e) => setUsername(e.target.value)}
              />
            )}
          </Field>
        </div>
        <SwitchField
          label={t('clearProfileText')}
          description={t('clearProfileTextDesc')}
          checked={clearProfileText}
          onCheckedChange={setClearProfileText}
        />
        <SwitchField
          label={t('removeAvatar')}
          checked={removeAvatar}
          onCheckedChange={setRemoveAvatar}
        />
        <SwitchField
          label={t('removeBanner')}
          checked={removeBanner}
          onCheckedChange={setRemoveBanner}
        />
        {!emailVerified && (
          <SwitchField
            label={t('verifyEmail')}
            description={t('verifyEmailDesc')}
            checked={verifyEmail}
            onCheckedChange={setVerifyEmail}
          />
        )}
        <div>
          <Button type="submit" loading={pending}>
            {t('save')}
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}
