import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  Accessibility,
  CalendarDays,
  LayoutTemplate,
  MessagesSquare,
  Palette,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUser } from '@/lib/auth';

const FEATURES = [
  {
    icon: Palette,
    title: 'Make it yours',
    body: 'Themes, fonts, banners and a drag-and-drop page builder. Every theme is contrast-checked.',
  },
  {
    icon: Server,
    title: 'Live server status',
    body: 'Link Minecraft, Rust, CS2, FiveM and more. Player counts update in real time.',
  },
  {
    icon: MessagesSquare,
    title: 'Forum + chat',
    body: 'Searchable discussions that last, and real-time chat channels when you need them.',
  },
  {
    icon: CalendarDays,
    title: 'Events & wiki',
    body: 'Schedule game nights across time zones and build a knowledge base together.',
  },
  {
    icon: LayoutTemplate,
    title: 'Roles & permissions',
    body: 'Fine-grained roles, channel overrides, invites, applications and moderation tools.',
  },
  {
    icon: Accessibility,
    title: 'Accessible by default',
    body: 'High contrast, dyslexia-friendly fonts, reduced motion, screen reader support and full keyboard control.',
  },
];

export default async function HomePage() {
  const t = await getTranslations('home');
  const user = await getUser();
  return (
    <div className="flex flex-col">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-4 py-16 sm:py-24">
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
            {t('heroTitle')}
          </h1>
          <p className="max-w-2xl text-lg text-muted">{t('heroBody')}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={user ? '/new' : '/sign-up?next=/new'}>{t('getStarted')}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/explore">{t('explore')}</Link>
            </Button>
          </div>
        </div>
      </section>
      <section aria-labelledby="features-h" className="mx-auto w-full max-w-6xl px-4 py-16">
        <h2 id="features-h" className="text-2xl font-bold">
          {t('features')}
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-ui-lg border border-border bg-surface p-5">
              <f.icon className="size-6 text-primary" aria-hidden />
              <h3 className="mt-3 font-bold">{f.title}</h3>
              <p className="mt-1 text-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
