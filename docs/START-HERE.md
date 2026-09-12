# unwavering.band: start here

Read this first, then `OPEN-ISSUES.md`. `DECISIONS.md` records choices that
look wrong but are deliberate. `GOOGLE-LOCATION-FORMAT.md` describes the upload
file shape. `SCHEMA.md` is the data model. If this folder and the root
`CLAUDE.md` disagree, **this folder wins**.

Last updated 11 September 2026.

## What it is

A site for the Vonnegut idea: a person is a vertical unwavering band of light.
Visitors read the story on `/`. Signed-in people import timeline history, name
places, form relationships with per-person privacy, and watch distance over
time. The live bandscape (`/app/now`) remains as the "Now" view.

## Where things are

| Piece | Value |
|---|---|
| Live | https://unwavering.band |
| Repo | `johnnyoutlawllc/unwavering-band` (personal, **auto-deploys** on push to main) |
| Local | `C:\AI Projects\Projects\unwavering-band` |
| Vercel | `unwavering-band` (`prj_Q9toVKNRccSV8TVYJaqy8lju1QDQ`) |
| Database | Outlaw Apps Supabase (`ntyvtpimesfoesuykuyi`), **`unwavering`** schema |
| Stack | Next.js 16 + TypeScript, plain CSS (no Tailwind); Capacitor iOS/Android shells |
| Design | Black field, vertical bands of light, film grain. Not Design System v7. |
| Native | See `NATIVE.md` — bundle `com.johnnyoutlaw.unwaveringband` |

## Surfaces

| Path | Purpose |
|---|---|
| `/` | Story landing (Now / Later / Over time) |
| `/signin` | Google + email/password |
| `/app/history` | Personal heatmap + named places |
| `/app/people` | Invite, accept, privacy tiers |
| `/app/people/[id]` | Distance-over-time chart |
| `/app/now` | Live bandscape presence |
| `/app/settings` | Profile, live sharing, Timeline upload |

## Accounts with history

| Email | Notes |
|---|---|
| `johnnyoutlawllc@gmail.com` | Google sign-in, Timeline imported |
| `bigsky30media@gmail.com` | Google sign-in, Timeline imported |
| `band-test-a@unwavering.local` | Email test, password `UnwaveringBand1!`, seeded visits |
| `band-test-b@unwavering.local` | Email test, password `UnwaveringBand1!`, seeded visits |

## What works today

- Story site + app shell
- Google and email/password auth
- **Client-side encryption** (vault passphrase); admins see ciphertext
- Location history upload (encrypted when vault unlocked)
- History browser + place naming
- Relationships with privacy tiers + encrypted distance chart
- Live presence on `/app/now` (Realtime + `live_bands()` for backgrounded peers)
- Capacitor iOS/Android shells with Always background location plugin
- Privacy Policy, Terms, Support, account deletion

## Legal / store URLs

- `/privacy` · `/terms` · `/support`
- See `docs/APP-STORE.md` and `docs/NATIVE.md` for store + family install paths

## What is not built yet

- Sign in with Apple (needed before public iOS App Store if Google remains)
- Public App Store / Play listing submitted (TestFlight + APK/AAB first)
- Reverse-geocode city labels
- Server-side import job for multi-MB files
- Portable decrypted export UI

## How to continue

1. Read `DECISIONS.md` and `SCHEMA.md`
2. Sign in as Johnny or Gracie (Google) to exercise real Timeline overlap
3. Or use the `band-test-*` email pair for invite + chart smoke tests
4. Do not commit real location files
5. For phone installs see `NATIVE.md` and `FAMILY-INSTALL.md`
