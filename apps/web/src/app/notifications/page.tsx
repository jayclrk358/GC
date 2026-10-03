import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Settings } from 'lucide-react';
import { listNotifications } from '@gamecentral/core';
import { requireUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/misc';
import { NotificationList } from '@/components/notifications/notification-list';
import { HistoryBack } from '@/components/ui/history-back';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const user = await requireUser('/notifications');
  const t = await getTranslations('notifications');
  const unreadOnly = (await searchParams).filter === 'unread';
  const { items, hasMore } = await listNotifications(user.id, { unreadOnly, limit: 30 });
  const tabs = [
    { href: '/notifications', label: t('all'), current: !unreadOnly },
    { href: '/notifications?filter=unread', label: t('unread'), current: unreadOnly },
  ];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <HistoryBack fallback="/" />
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/notifications">
              <Settings aria-hidden /> {t('settings')}
            </Link>
          </Button>
        }
      />
      <nav aria-label={t('filter')}>
        <ul className="flex gap-1 rounded-ui bg-surface-2 p-1">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={tab.current ? 'page' : undefined}
                className="block rounded-ui-sm px-3 py-1.5 text-sm font-semibold text-muted aria-[current=page]:bg-surface aria-[current=page]:text-fg aria-[current=page]:shadow-sm"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <NotificationList
        initial={items.map((i) => ({
          ...i,
          createdAt: i.createdAt.toISOString(),
          readAt: i.readAt?.toISOString() ?? null,
        }))}
        initialHasMore={hasMore}
        unreadOnly={unreadOnly}
      />
    </div>
  );
}
