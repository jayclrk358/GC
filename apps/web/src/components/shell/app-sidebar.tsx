'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Accessibility,
  Compass,
  House,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Server,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { imgSources } from '@/lib/media';
import { SIDEBAR_COOKIE } from '@/lib/sidebar';
import { cn } from '@/lib/utils';
import { Logo, Wordmark } from './logo';

export interface SidebarCommunity {
  slug: string;
  name: string;
  /** Upload key of the community's icon. */
  iconKey: string | null;
  color: string;
  onColor: string;
}

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * One row in the sidebar. The pill on the leading edge grows on hover and stays tall for the
 * current page. When the sidebar is collapsed the label is still the link's name, shown as a
 * tooltip for sighted users.
 */
function Item({
  href,
  label,
  collapsed,
  exact,
  onNavigate,
  children,
}: {
  href: string;
  label: string;
  collapsed: boolean;
  exact?: boolean;
  onNavigate?: () => void;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isActive(pathname, href, exact);
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'group/item mx-press relative flex h-10 items-center gap-3 rounded-ui px-3 text-sm font-medium text-muted',
        'hover:bg-surface-2 hover:text-fg aria-[current=page]:bg-surface-2 aria-[current=page]:text-fg',
        // The pill.
        'before:absolute before:start-0 before:top-1/2 before:h-0 before:w-1 before:-translate-y-1/2 before:rounded-e-full before:bg-primary before:transition-[height] before:duration-300 before:ease-[var(--mx-ease)] hover:before:h-4 aria-[current=page]:before:h-6',
        collapsed && 'justify-center px-0',
      )}
    >
      {children}
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
  return <li>{collapsed ? <Tooltip content={label}>{link}</Tooltip> : link}</li>;
}

function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon
      aria-hidden
      className="size-5 shrink-0 transition-transform duration-300 ease-[var(--mx-ease)] group-hover/item:scale-110"
    />
  );
}

function CommunityTile({ c }: { c: SidebarCommunity }) {
  const icon = imgSources(c.iconKey, 'sm');
  return (
    <span
      aria-hidden
      className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[50%] text-sm font-bold transition-[border-radius] duration-300 ease-[var(--mx-ease)] group-hover/item:rounded-[30%] group-aria-[current=page]/item:rounded-[30%]"
      style={icon ? undefined : { background: c.color, color: c.onColor }}
    >
      {icon ? (
        // Lazy, so the hidden desktop sidebar on phones doesn't load them.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...icon}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        c.name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

export function SidebarContent({
  communities,
  signedIn,
  collapsed,
  onToggle,
  onNavigate,
}: {
  communities: SidebarCommunity[];
  signedIn: boolean;
  collapsed: boolean;
  /** Shown only where the sidebar can collapse (desktop). */
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const t = useTranslations('shell');
  const headingId = React.useId();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('flex h-14 shrink-0 items-center gap-2 px-3', collapsed && 'px-0')}>
        <Link
          href="/"
          onClick={onNavigate}
          aria-label={collapsed ? 'Magnox Resources' : undefined}
          className={cn(
            'mx-press flex min-w-0 items-center rounded-ui px-1 py-1',
            collapsed && 'mx-auto',
          )}
        >
          {collapsed ? <Logo size={32} /> : <Wordmark className="h-5" />}
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
        <nav aria-label={t('mainNav')}>
          <ul className="flex flex-col gap-1">
            <Item href="/" exact label={t('home')} collapsed={collapsed} onNavigate={onNavigate}>
              <NavIcon icon={House} />
            </Item>
            <Item
              href="/explore"
              label={t('explore')}
              collapsed={collapsed}
              onNavigate={onNavigate}
            >
              <NavIcon icon={Compass} />
            </Item>
            <Item
              href="/servers"
              label={t('servers')}
              collapsed={collapsed}
              onNavigate={onNavigate}
            >
              <NavIcon icon={Server} />
            </Item>
            <Item href="/store" label={t('store')} collapsed={collapsed} onNavigate={onNavigate}>
              <NavIcon icon={ShoppingBag} />
            </Item>
          </ul>
        </nav>

        {signedIn ? (
          <section aria-labelledby={headingId} className="flex flex-col gap-1">
            <h2
              id={headingId}
              className={cn(
                'px-3 pb-1 text-xs font-semibold tracking-wide text-muted uppercase',
                collapsed && 'sr-only',
              )}
            >
              {t('yourCommunities')}
            </h2>
            {collapsed && <div aria-hidden className="mx-2 mb-1 h-px bg-border" />}
            <ul className="flex flex-col gap-1">
              {communities.map((c) => (
                <Item
                  key={c.slug}
                  href={`/c/${c.slug}`}
                  label={c.name}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                >
                  <CommunityTile c={c} />
                </Item>
              ))}
              <Item
                href="/new"
                label={t('createCommunity')}
                collapsed={collapsed}
                onNavigate={onNavigate}
              >
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-[50%] border border-dashed border-muted/60 transition-[border-radius,border-color] duration-300 ease-[var(--mx-ease)] group-hover/item:rounded-[30%] group-hover/item:border-primary"
                >
                  <Plus className="size-4" />
                </span>
              </Item>
            </ul>
            {communities.length === 0 && !collapsed && (
              <p className="px-3 pt-1 text-xs text-muted">{t('noCommunitiesYet')}</p>
            )}
          </section>
        ) : (
          !collapsed && (
            <div className="rounded-ui-lg border border-border bg-surface-2/60 p-4">
              <p className="text-sm font-semibold">{t('joinTitle')}</p>
              <p className="mt-1 text-xs text-muted">{t('joinBody')}</p>
              <Link
                href="/sign-up"
                onClick={onNavigate}
                className="mx-press mt-3 inline-flex h-8 items-center rounded-ui bg-primary px-3 text-sm font-semibold text-on-primary hover:bg-primary/88"
              >
                {t('signUp')}
              </Link>
            </div>
          )
        )}
      </div>

      <div className="shrink-0 border-t border-border px-3 py-3">
        <ul className="flex flex-col gap-1">
          <Item
            href="/settings/accessibility"
            label={t('accessibility')}
            collapsed={collapsed}
            onNavigate={onNavigate}
          >
            <NavIcon icon={Accessibility} />
          </Item>
          {onToggle && (
            <li>
              {/* One button in one place for both states, so focus stays put when it toggles. */}
              <Tooltip content={collapsed ? t('expandSidebar') : t('collapseSidebar')}>
                <button
                  type="button"
                  onClick={onToggle}
                  aria-expanded={!collapsed}
                  aria-controls="app-sidebar"
                  className={cn(
                    'mx-press flex h-10 w-full items-center gap-3 rounded-ui px-3 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  {collapsed ? (
                    <PanelLeftOpen className="size-5 shrink-0" aria-hidden />
                  ) : (
                    <PanelLeftClose className="size-5 shrink-0" aria-hidden />
                  )}
                  <span className={collapsed ? 'sr-only' : 'truncate'}>
                    {collapsed ? t('expandSidebar') : t('collapseSidebar')}
                  </span>
                </button>
              </Tooltip>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

/** The desktop sidebar. Collapses to an icon rail; the choice is remembered in a cookie. */
export function AppSidebar({
  communities,
  signedIn,
  initialCollapsed,
}: {
  communities: SidebarCommunity[];
  signedIn: boolean;
  initialCollapsed: boolean;
}) {
  const t = useTranslations('shell');
  const [collapsed, setCollapsed] = React.useState(initialCollapsed);
  return (
    <aside
      id="app-sidebar"
      aria-label={t('sidebar')}
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col self-start border-e border-border bg-surface transition-[width] duration-300 ease-[var(--mx-ease)] lg:flex',
        collapsed ? 'w-[4.5rem]' : 'w-60',
      )}
    >
      <SidebarContent
        communities={communities}
        signedIn={signedIn}
        collapsed={collapsed}
        onToggle={() => {
          const next = !collapsed;
          setCollapsed(next);
          document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
        }}
      />
    </aside>
  );
}
