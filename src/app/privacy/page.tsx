import Link from 'next/link';
import { Field } from '@/components/Field';
import { LegalShell } from '@/components/LegalShell';

export const metadata = {
  title: 'Privacy Policy · unwavering.band',
  description: 'How unwavering.band collects, encrypts, and shares location data.',
};

export default function PrivacyPage() {
  return (
    <>
      <Field />
      <LegalShell title="Privacy Policy" updated="September 11, 2026">
        <p>
          This policy explains how unwavering.band (“we”, “us”) handles your
          information. The product is built so that precise location history is
          encrypted on your device before storage. We design the system so that
          operators with database access cannot read your coordinates in the
          clear.
        </p>

        <h2>Who we are</h2>
        <p>
          unwavering.band is operated by Johnny Outlaw LLC / DataDay Studio.
          Contact: <a href="mailto:support@unwavering.band">support@unwavering.band</a>{' '}
          (forwards to the operator). Support page:{' '}
          <Link href="/support">unwavering.band/support</Link>.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account.</strong> Email address, display name, optional
            avatar URL, and sign-in provider (Google and/or email).
          </li>
          <li>
            <strong>Encryption metadata.</strong> A salt, wrapped data-encryption
            key, and public key material. These do not reveal your passphrase or
            plaintext locations.
          </li>
          <li>
            <strong>Location history.</strong> Coordinates and times from
            imports (for example Google Timeline) and optional live readings you
            choose to share. Coordinates are stored as ciphertext when
            encryption is enabled.
          </li>
          <li>
            <strong>Named places.</strong> Labels you attach to locations
            (coordinates encrypted; names stored so you can find them).
          </li>
          <li>
            <strong>Relationships.</strong> Who you invited or accepted, your
            privacy tier per person, and encrypted daily share payloads used to
            compute distance over time.
          </li>
          <li>
            <strong>Usage.</strong> Standard hosting logs (IP, user agent) from
            Vercel may be processed for security and reliability.
          </li>
        </ul>

        <h2>How encryption works</h2>
        <p>
          You choose an encryption passphrase (separate from your sign-in
          password). Your device derives keys from that passphrase and encrypts
          coordinates with AES-GCM before they are written to our database. We
          do not receive your passphrase. If you forget it, we cannot recover
          your history.
        </p>

        <h2>How we use information</h2>
        <ul>
          <li>To show your own timeline after you unlock encryption.</li>
          <li>
            To show live presence on the “Now” canvas when you opt in to share
            location.
          </li>
          <li>
            To compute distance-over-time charts with people you explicitly
            connect with, under the privacy tier you set for each person.
          </li>
          <li>To operate, secure, and improve the service.</li>
        </ul>

        <h2>Privacy tiers with other people</h2>
        <p>For each relationship you control what they can see of you:</p>
        <ul>
          <li>
            <strong>Distance only.</strong> The official app shows miles apart.
            Technical note: distance still requires position shares on an
            encrypted channel between the two of you; a modified client could
            recover more detail. Choose a stricter tier only with people you
            trust.
          </li>
          <li>
            <strong>City / state (coarse).</strong> Miles plus a coarse place.
          </li>
          <li>
            <strong>Exact.</strong> Miles plus finer location and any named
            place match you allow.
          </li>
        </ul>

        <h2>Sharing</h2>
        <p>
          We do not sell your personal information. We use processors that host
          the app and database (currently Vercel and Supabase). They process
          data under contract to provide the service. Encrypted location payloads
          remain ciphertext at rest in the database.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          We keep your account and encrypted history until you delete them. You
          can delete your account and all unwavering.band data from Settings.
          Turning off live sharing clears live coordinates. Withdrawing consent
          for live sharing does not automatically delete imported history; use
          account deletion or contact support for a full wipe.
        </p>

        <h2>Children</h2>
        <p>
          The service is not directed to children under 13, and we do not
          knowingly collect personal information from children under 13. If you
          believe a child has created an account, contact us and we will delete
          it. For App Store age ratings we treat the product as 17+ because it
          involves ongoing location sharing between people.
        </p>

        <h2>Your choices</h2>
        <ul>
          <li>Do not enable encryption or import history if you prefer not to.</li>
          <li>Opt in or out of live location sharing at any time.</li>
          <li>Set privacy per relationship.</li>
          <li>Delete your account from Settings.</li>
          <li>Export: you may download your Google Timeline from Google; we do not yet offer a portable export of decrypted history from this app.</li>
        </ul>

        <h2>Background location (native apps)</h2>
        <p>
          The iOS and Android apps can keep sharing your location while the app
          is in the background, similar to Find My. This is opt-in: turn on
          “Share where you are” in Settings and grant Always location
          permission when the system asks. Turning sharing off stops background
          tracking and clears your live coordinates.
        </p>
        <p>
          While background sharing is on, the app periodically writes your
          recent position into your account (visits and live last-known
          coordinates) so people you share the Now canvas with can still see
          your band. Google Timeline history you upload remains covered by the
          vault encryption model above. You can revoke Always permission in
          system Settings at any time.
        </p>

        <h2>Changes</h2>
        <p>
          We may update this policy. The “Updated” date at the top will change.
          Continued use after an update means you accept the revised policy.
        </p>

        <h2>Contact</h2>
        <p>
          Privacy questions: <a href="mailto:support@unwavering.band">support@unwavering.band</a>{' '}
          or <Link href="/support">/support</Link>.
        </p>
      </LegalShell>
    </>
  );
}
