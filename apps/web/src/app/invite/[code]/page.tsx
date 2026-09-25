import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getInvitePreview, getMemberContext } from '@magnox/core';
import { getUser } from '@/lib/auth';
import { mediaUrl } from '@/lib/media';
import { formatCount } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';
import { AcceptInvite } from '@/components/community/accept-invite';

export const metadata = { title: 'Invitation' };

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const t = await getTranslations('invites');
  const [invite, user] = await Promise.all([getInvitePreview(code), getUser()]);

  if (!invite || !invite.valid) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-20">
        <Alert tone="danger" title={t('invalidTitle')}>
          {t('invalidBody')}
        </Alert>
      </div>
    );
  }

  if (user) {
    try {
      const ctx = await getMemberContext({ id: invite.communityId }, user.id);
      if (ctx.isMember) redirect(`/c/${invite.slug}`);
    } catch {
      // Private community and not a member yet: show the invite.
    }
  }

  const icon = mediaUrl(invite.theme.iconKey);
  return (
    <div className="flex flex-1 items-start justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-ui-lg border border-border bg-surface p-8 text-center shadow-sm">
        <div className="flex flex-col items-center gap-3">
          {icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={icon} alt="" className="size-20 rounded-ui-lg object-cover" />
          ) : (
            <span
              aria-hidden
              className="grid size-20 place-items-center rounded-ui-lg text-3xl font-extrabold"
              style={{ background: invite.theme.light.primary, color: invite.theme.light.onPrimary }}
            >
              {invite.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <p className="text-sm text-muted">
            {invite.inviterName ? t('invitedBy', { name: invite.inviterName }) : t('invitedTo')}
          </p>
          <h1 className="text-2xl font-extrabold">{invite.name}</h1>
          {invite.tagline && <p className="text-muted">{invite.tagline}</p>}
          <p className="text-sm text-muted">{t('memberCount', { count: invite.memberCount, formatted: formatCount(invite.memberCount) })}</p>
        </div>
        <div className="mt-6">
          {user ? (
            <AcceptInvite code={code} />
          ) : (
            <div className="flex flex-col gap-2">
              <Button asChild size="lg">
                <Link href={`/sign-up?next=${encodeURIComponent(`/invite/${code}`)}`}>{t('signUpToJoin')}</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href={`/sign-in?next=${encodeURIComponent(`/invite/${code}`)}`}>{t('signInToJoin')}</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
