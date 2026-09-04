import Link from 'next/link';
import { Field } from '@/components/Field';
import { LegalShell } from '@/components/LegalShell';

export const metadata = {
  title: 'Support · unwavering.band',
  description: 'Help and contact for unwavering.band.',
};

export default function SupportPage() {
  return (
    <>
      <Field />
      <LegalShell title="Support" updated="September 4, 2026">
        <p>
          Need help with unwavering.band? Start here.
        </p>

        <h2>Contact</h2>
        <p>
          Email{' '}
          <a href="mailto:support@unwavering.band">support@unwavering.band</a>.
          We aim to reply within two business days.
        </p>

        <h2>Common questions</h2>
        <ul>
          <li>
            <strong>Forgot encryption passphrase?</strong> We cannot recover it.
            You may delete the account and start over, but prior ciphertext
            stays unreadable.
          </li>
          <li>
            <strong>How do I delete my account?</strong> Sign in → Settings →
            Delete account. That removes your unwavering.band data.
          </li>
          <li>
            <strong>How do I import history?</strong> Settings → Your Timeline →
            upload Google’s `location-history.json`.
          </li>
          <li>
            <strong>Someone invited the wrong person?</strong> Decline or end
            the relationship under People.
          </li>
        </ul>

        <h2>Legal</h2>
        <p>
          <Link href="/privacy">Privacy Policy</Link> ·{' '}
          <Link href="/terms">Terms of Use</Link>
        </p>

        <h2>App Store notes</h2>
        <p>
          When a native iOS app ships, this URL is the support link used in App
          Store Connect. Location permission copy will explain that location is
          used to place your band, log history you opt into, and compute
          distance with people you choose.
        </p>
      </LegalShell>
    </>
  );
}
