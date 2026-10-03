import Link from '@/components/ui/link';
import { contactEmail } from '@gamecentral/core';
import { LegalPage, Section } from '@/components/legal/legal-page';
import { TERMS_UPDATED } from '@gamecentral/shared';

export const metadata = { title: 'Terms of Service' };

export default function TermsPage() {
  const email = contactEmail();
  return (
    <LegalPage title="Terms of Service" updated={TERMS_UPDATED}>
      <p>
        These terms are the agreement between you and the people who run Game Central (“we”, “us”).
        By creating an account or using Game Central you agree to them, and to our{' '}
        <Link href="/legal/privacy">Privacy Policy</Link>.
      </p>
      <Section title="Who can use Game Central">
        <ul>
          <li>You must be at least 13 years old, or older where the law where you live says so.</li>
          <li>Communities marked 18+ are only for adults. Don’t open them if you’re under 18.</li>
          <li>You can’t use Game Central if we’ve banned you, or if the law forbids it.</li>
        </ul>
      </Section>
      <Section title="Your account">
        <ul>
          <li>
            Keep your sign-in details safe. You’re responsible for what happens on your account.
          </li>
          <li>Use a name that doesn’t pretend to be someone else.</li>
          <li>
            You can download your data or delete your account any time in{' '}
            <Link href="/settings/account">Account settings</Link>.
          </li>
        </ul>
      </Section>
      <Section title="What you post">
        <p>
          You own what you post. So that we can run Game Central, you give us permission to store,
          copy, show and send it to the people it’s meant for (for example, the members of a
          community), and to make the small changes that needs (like resizing images). That
          permission ends when you delete it, except for copies kept for a short time in backups or
          where the law needs us to keep them.
        </p>
      </Section>
      <Section title="The rules">
        <p>Don’t use Game Central to:</p>
        <ul>
          <li>break the law, or help someone else break it;</li>
          <li>harass, threaten, bully or dox anyone, or attack people for who they are;</li>
          <li>
            post sexual content involving minors, or any sexual content outside communities marked
            18+;
          </li>
          <li>post violent extremist content, or encourage self-harm;</li>
          <li>
            spam, scam, phish, or sell accounts, items or services you don’t have the right to sell;
          </li>
          <li>
            share malware, cheats that harm other players, or anything that attacks computers or
            servers;
          </li>
          <li>post other people’s private information, or content you don’t have the rights to;</li>
          <li>get around a ban, a timeout or Game Central’s limits.</li>
        </ul>
      </Section>
      <Section title="Communities">
        <p>
          Communities are run by their owners and the moderators they choose, who set their own
          rules on top of these. We can step in when a community or its team breaks these terms:
          removing content, suspending the community or banning people.
        </p>
      </Section>
      <Section title="Game servers">
        <p>
          When you add a game server we check its public status (whether it’s online, the player
          count) regularly. Only add servers you run or have permission to list.
        </p>
      </Section>
      <Section title="Paid plans">
        <ul>
          <li>Paid plans are paid through Stripe and renew automatically until cancelled.</li>
          <li>
            You can cancel any time in a community’s Plan &amp; billing page; the plan stays until
            the end of the period you’ve paid for.
          </li>
          <li>Refunds are given where the law requires it.</li>
          <li>We may change prices, and will tell you before a change affects you.</li>
        </ul>
      </Section>
      <Section title="Ending things">
        <p>
          You can stop using Game Central and delete your account whenever you like. We can suspend
          or end your access if you break these terms or put others at risk, and will tell you why
          unless the law or safety stops us.
        </p>
      </Section>
      <Section title="No guarantees">
        <p>
          We work hard to keep Game Central running and safe, but it’s provided as it is: we can’t
          promise it will always be available or free of mistakes. As far as the law allows, we
          aren’t liable for indirect losses, or for what other people post. Nothing here limits
          rights you have by law as a consumer.
        </p>
      </Section>
      <Section title="Changes">
        <p>
          If we change these terms we’ll update the date above, and ask you to agree again when the
          change matters.
        </p>
      </Section>
      {email && (
        <Section title="Contact">
          <p>
            Questions about these terms: <a href={`mailto:${email}`}>{email}</a>.
          </p>
        </Section>
      )}
    </LegalPage>
  );
}
