import Link from 'next/link';
import { contactEmail } from '@gamecentral/core';
import { PRIVACY_UPDATED } from '@gamecentral/shared';
import { LegalPage, Section } from '@/components/legal/legal-page';
import { CookieSettingsButton } from '@/components/shell/cookie-banner';

export const metadata = { title: 'Privacy Policy' };

export default function PrivacyPolicyPage() {
  const email = contactEmail();
  return (
    <LegalPage title="Privacy Policy" updated={PRIVACY_UPDATED}>
      <p>
        This explains what Game Central keeps about you, why, and what you can do about it. The
        short version: we keep what’s needed to run your account and the communities you’re in, we
        don’t sell it, and you can download or delete it any time.
      </p>
      <Section title="What we keep">
        <ul>
          <li>
            <strong>Your account:</strong> name, username, email, password (scrambled, never
            readable), and accounts you sign in with (Discord, Google, Twitch, Steam).
          </li>
          <li>
            <strong>Your profile and settings:</strong> what you add to your profile, your
            accessibility and notification settings, and that you agreed to the terms.
          </li>
          <li>
            <strong>What you do here:</strong> communities you join, messages, posts, wiki edits,
            reactions, votes, event replies, applications, reports and files you upload.
          </li>
          <li>
            <strong>Technical details:</strong> your IP address and browser, to keep you signed in,
            stop abuse and keep things secure. Server logs are kept briefly.
          </li>
          <li>
            <strong>Payments:</strong> handled by Stripe. We see which plan was bought and when, not
            your card details.
          </li>
        </ul>
      </Section>
      <Section title="Why">
        <p>
          To run Game Central for you (your account, communities, notifications and emails you’ve
          asked for), to keep it safe (spotting spam, abuse and attacks, and acting on reports), and
          to fix and improve it. We don’t use your data for advertising and we don’t sell it.
        </p>
      </Section>
      <Section title="Who sees it">
        <ul>
          <li>
            What you post is seen by the people it’s posted to: a community’s members, or everyone
            for public communities.
          </li>
          <li>Community moderators see reports and applications sent to their community.</li>
          <li>
            Services that help us run Game Central handle data for us: hosting, file storage, email
            delivery and payments (Stripe). They can only use it to provide that service.
          </li>
          <li>We share data with authorities only when the law requires it.</li>
        </ul>
      </Section>
      <Section title="Cookies" id="cookies">
        <p>
          Game Central uses a handful of its own cookies and no advertising or tracking cookies. The
          first time you visit we ask whether you allow the optional one; you can change your mind
          any time.
        </p>
        <p>
          <strong>Always on</strong>, because the site needs them or you asked for them:
        </p>
        <ul>
          <li>
            <strong>Signing in:</strong> keeps you signed in (Better Auth session cookies).
          </li>
          <li>
            <strong>Bot checks:</strong> Cloudflare Turnstile, on sign-up and a few other forms, to
            stop automated abuse.
          </li>
          <li>
            <strong>Your settings:</strong> appearance and accessibility settings you change,
            whether the sidebar is collapsed, and that you confirmed your age for adult communities.
          </li>
          <li>
            <strong>Your cookie choice</strong> (<code>mx-cookies</code>), kept for six months.
          </li>
        </ul>
        <p>
          <strong>Optional:</strong> your time zone (<code>mx-tz</code>), so event times show on
          your own clock. Without it they’re shown in the event’s own time zone, or UTC.
        </p>
        <p>
          Videos from YouTube or Twitch on community pages only load when you press play; those
          sites may then set their own cookies.
        </p>
        <p>
          <CookieSettingsButton className="font-semibold text-primary underline underline-offset-2" />
        </p>
      </Section>
      <Section title="How long we keep it">
        <p>
          While you have an account. When you delete it, your personal data is removed straight
          away; what you posted in communities stays under “Deleted user” unless you choose to
          remove it too. Deleted communities are removed after 30 days. Backups roll over within a
          few weeks.
        </p>
      </Section>
      <Section title="Your choices and rights">
        <ul>
          <li>
            <strong>See and download</strong> your data, or <strong>delete</strong> your account, in{' '}
            <Link href="/settings/account">Account settings</Link>.
          </li>
          <li>
            <strong>Correct</strong> your details in <Link href="/settings/profile">Profile</Link>{' '}
            and Account settings.
          </li>
          <li>
            Choose what’s public and what emails you get in{' '}
            <Link href="/settings/privacy">Privacy</Link> and{' '}
            <Link href="/settings/notifications">Notifications</Link>.
          </li>
          <li>
            Depending on where you live you may have more rights, such as to object or to complain
            to a regulator.
          </li>
        </ul>
      </Section>
      <Section title="Children">
        <p>
          Game Central isn’t for children under 13. If we learn an account belongs to someone
          younger, we delete it.
        </p>
      </Section>
      <Section title="Changes">
        <p>We’ll update the date above when this changes, and tell you about important changes.</p>
      </Section>
      {email && (
        <Section title="Contact">
          <p>
            Privacy questions or requests: <a href={`mailto:${email}`}>{email}</a>.
          </p>
        </Section>
      )}
    </LegalPage>
  );
}
