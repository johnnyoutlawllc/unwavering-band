# App Store / Play readiness

What is in the product now, and what still needs operator setup before a
public store submission. Native shell + background tracking details live in
[`NATIVE.md`](./NATIVE.md).

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

## Shipped in the native shells

| Requirement | Where |
|---|---|
| Capacitor iOS + Android | `ios/`, `android/`, bundle `com.johnnyoutlaw.unwaveringband` |
| Always / background location | `@unwavering/background-location` plugin |
| Info.plist usage strings | `ios/App/App/Info.plist` |
| Android location + FGS permissions | `android/app/src/main/AndroidManifest.xml` + plugin manifest |
| Opt-in / opt-out | Settings → Share where you are |
| Privacy Policy background section | `/privacy` |

## Before public iOS App Store

1. **Sign in with Apple** — required if the native app offers Google (or other)
   third-party login. Enable the Apple provider in Supabase Auth and add the
   button beside Google on `/signin`.
2. **App Privacy nutrition labels** — Location (precise), precise location used
   for app functionality; declare encryption; no tracking for ads.
3. **Set `SUPABASE_SERVICE_ROLE_KEY`** on Vercel so `/api/account/delete` removes
   the `auth.users` row after app data wipe.
4. **Porkbun** — forward `support@unwavering.band` (and ideally
   `privacy@unwavering.band`) to the operator inbox.
5. **Screenshots + review notes** — explain encryption passphrase, that
   location is opt-in Always background, and how to use the test accounts.
6. Create the App Store Connect record for `com.johnnyoutlaw.unwaveringband`
   (team `2J69KHU242`).

## Before public Play Store

1. Create the Play Console app for `com.johnnyoutlaw.unwaveringband`.
2. Complete the Data safety form (precise location, app functionality, optional).
3. Upload a signed AAB (`bundleRelease`) with a release keystore kept outside git.
4. Family can use **internal testing** or sideloaded APK before production.

## Encryption model (admin-proof)

- Passphrase → PBKDF2 → wraps AES DEK + ECDH private key
- Timeline / history coordinates stored as AES-GCM ciphertext
- Native background **live** coordinates are plaintext on `users.last_lat` /
  `last_lng` so peers can render the Now canvas; Timeline vault is separate
- Relationship charts use an ECDH-delivered relationship key; shares are
  ciphertext; decryption happens only in the unlocked browser

## Not yet

- Sign in with Apple wired
- Public App Store / Play listing submitted
- Portable decrypted export download
