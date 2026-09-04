# App Store / Play readiness

What is in the product now, and what still needs operator setup before a
native store submission.

## Shipped in the web app

| Requirement | Where |
|---|---|
| Privacy Policy URL | https://unwavering.band/privacy |
| Terms of Use | https://unwavering.band/terms |
| Support URL | https://unwavering.band/support |
| Account deletion | Settings → Delete account |
| Sign-in consent link to Privacy + Terms | `/signin` |
| Location purpose explained | Privacy Policy + Settings copy |
| Encryption at rest (client-side) | Vault passphrase; admins see ciphertext |
| Age / children statement | Privacy Policy (not for under 13; 17+ framing) |

## Before iOS App Store Connect

1. **Sign in with Apple** — required if the native app offers Google (or other)
   third-party login. Enable the Apple provider in Supabase Auth and add the
   button beside Google on `/signin`.
2. **Info.plist usage strings** (native wrapper):
   - `NSLocationWhenInUseUsageDescription`
   - `NSLocationAlwaysAndWhenInUseUsageDescription` (only when background tracking ships)
3. **App Privacy nutrition labels** — Location (precise), precise location used
   for app functionality; declare encryption; no tracking for ads.
4. **Set `SUPABASE_SERVICE_ROLE_KEY`** on Vercel so `/api/account/delete` removes
   the `auth.users` row after app data wipe.
5. **Porkbun** — forward `support@unwavering.band` (and ideally
   `privacy@unwavering.band`) to the operator inbox.
6. **Screenshots + review notes** — explain encryption passphrase, that
   location is opt-in, and how to use the test accounts.

## Encryption model (admin-proof)

- Passphrase → PBKDF2 → wraps AES DEK + ECDH private key
- Coordinates stored as AES-GCM ciphertext; plaintext cleared on migrate
- Relationship charts use an ECDH-delivered relationship key; shares are
  ciphertext; decryption happens only in the unlocked browser

## Not yet

- Native iOS/Android binary (Capacitor / Expo / etc.)
- Background persistent tracking
- Sign in with Apple wired
- Portable decrypted export download
