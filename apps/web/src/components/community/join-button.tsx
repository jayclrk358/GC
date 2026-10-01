'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Check, ChevronDown, LogOut, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { joinAction, leaveAction } from '@/app/actions/communities';

export function JoinButton({
  communityId,
  slug,
  signedIn,
  isMember,
  isOwner,
  joinMode,
  visibility,
  size = 'md',
  label,
  archived = false,
}: {
  communityId: string;
  slug: string;
  signedIn: boolean;
  isMember: boolean;
  isOwner: boolean;
  joinMode: string;
  visibility: string;
  size?: 'md' | 'lg';
  label?: string;
  /** Archived communities don't take new members. */
  archived?: boolean;
}) {
  const t = useTranslations('community');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, setPending] = React.useState(false);

  if (archived && !isMember) {
    return (
      <p className="rounded-ui border border-border px-3 py-2 text-sm text-muted">
        {t('archivedNoJoin')}
      </p>
    );
  }

  if (!signedIn) {
    return (
      <Button asChild size={size}>
        <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>{label || t('join')}</Link>
      </Button>
    );
  }

  if (isMember) {
    if (isOwner) return null;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size={size}>
            <Check aria-hidden /> {t('joined')} <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/c/${slug}/welcome`}>
              <Sparkles aria-hidden /> {t('welcomeAndRoles')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            destructive
            onSelect={async () => {
              const r = await leaveAction(communityId);
              if (r.ok) {
                toast.success(t('left'));
                router.refresh();
              } else toast.error(r.error);
            }}
          >
            <LogOut aria-hidden /> {t('leave')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  if (joinMode === 'invite' || visibility === 'private') {
    return (
      <p className="rounded-ui border border-border px-3 py-2 text-sm text-muted">
        {t('inviteOnly')}
      </p>
    );
  }
  if (joinMode === 'apply') {
    return (
      <Button asChild size={size}>
        <Link href={`/c/${slug}/apply`}>{t('applyToJoin')}</Link>
      </Button>
    );
  }

  return (
    <Button
      size={size}
      loading={pending}
      onClick={async () => {
        setPending(true);
        const r = await joinAction(communityId);
        setPending(false);
        if (r.ok) {
          toast.success(t('welcome'));
          // Communities with welcome steps (rules, roles to pick) start there.
          if (r.data.welcome) router.push(`/c/${slug}/welcome`);
          router.refresh();
        } else toast.error(r.error);
      }}
    >
      {label || t('join')}
    </Button>
  );
}
