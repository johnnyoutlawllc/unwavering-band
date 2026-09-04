import Link from 'next/link';
import { Field } from '@/components/Field';
import { LegalShell } from '@/components/LegalShell';

export const metadata = {
  title: 'Terms of Use · unwavering.band',
  description: 'Terms for using unwavering.band.',
};

export default function TermsPage() {
  return (
    <>
      <Field />
      <LegalShell title="Terms of Use" updated="September 4, 2026">
        <p>
          By using unwavering.band you agree to these terms. If you do not
          agree, do not use the service.
        </p>

        <h2>The service</h2>
        <p>
          unwavering.band lets you represent people as bands of light, import
          private location history, encrypt it on your device, form
          relationships, and view distance over time under privacy tiers you
          control.
        </p>

        <h2>Eligibility</h2>
        <p>
          You must be at least 13 years old. If you are under 18, you may use
          the service only with a parent or guardian’s permission. Location
          sharing between people is intended for adults and families who
          understand the risks.
        </p>

        <h2>Accounts</h2>
        <p>
          You are responsible for your sign-in credentials and your encryption
          passphrase. We cannot reset an encryption passphrase or decrypt your
          history if it is lost. You may delete your account from Settings.
        </p>

        <h2>Acceptable use</h2>
        <ul>
          <li>Do not stalk, harass, or coerce anyone with the service.</li>
          <li>Do not invite someone without a basis to connect with them.</li>
          <li>Do not attempt to break encryption, scrape others’ data, or abuse the API.</li>
          <li>Do not use the service for unlawful surveillance.</li>
        </ul>

        <h2>Your content and location</h2>
        <p>
          You retain rights to your data. You grant us a limited license to
          store and process encrypted payloads and account metadata as needed to
          run the product. See the <Link href="/privacy">Privacy Policy</Link>.
        </p>

        <h2>Disclaimers</h2>
        <p>
          The service is provided “as is”. Location data can be wrong, delayed,
          or incomplete. Do not rely on it for emergencies, safety-critical
          decisions, or legal proof of presence.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the fullest extent allowed by law, Johnny Outlaw LLC is not liable
          for indirect, incidental, or consequential damages, or for loss of
          encrypted data when a passphrase is forgotten.
        </p>

        <h2>Termination</h2>
        <p>
          We may suspend or end access if you violate these terms or abuse
          others. You may stop using the service and delete your account at any
          time.
        </p>

        <h2>Changes</h2>
        <p>
          We may update these terms. The updated date will change. Continued use
          means you accept the new terms.
        </p>

        <h2>Contact</h2>
        <p>
          <Link href="/support">Support</Link> ·{' '}
          <a href="mailto:support@unwavering.band">support@unwavering.band</a>
        </p>
      </LegalShell>
    </>
  );
}
