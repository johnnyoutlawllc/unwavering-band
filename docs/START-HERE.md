# unwavering.band: start here

Read this first, then `OPEN-ISSUES.md`. `DECISIONS.md` records choices that
look wrong but are deliberate. `GOOGLE-LOCATION-FORMAT.md` describes the upload
file shape. `SCHEMA.md` is the data model for history imports. If this folder
and the root `CLAUDE.md` disagree, **this folder wins**.

Last updated 3 September 2026.

## What it is

A live bandscape at https://unwavering.band. Visitors see every band present on
the site, spaced by real geographic distance. Sharing a live location puts your
band on the wall. The next act is a personal timeline built from Google Timeline
exports, so distance between people over time has a data source.

## Where things are

| Piece | Value |
|---|---|
| Live | https://unwavering.band |
| Repo | `johnnyoutlawllc/unwavering-band` (personal, **auto-deploys** on push to main) |
| Local | `C:\AI Projects\Projects\unwavering-band` |
| Vercel | `unwavering-band` (`prj_Q9toVKNRccSV8TVYJaqy8lju1QDQ`) |
| Database | Outlaw Apps Supabase (`ntyvtpimesfoesuykuyi`), **`unwavering`** schema |
| Stack | Next.js 16 + TypeScript, plain CSS (no Tailwind) |
| Design | Black field, vertical bands of light, film grain. Not Design System v7. |

Sample Google Timeline export (private, do not commit):

`C:\AI Projects\Internal Files\Google Data\Brad Wheeler\location-history.json`

A redacted three-record sample lives at `docs/samples/location-history.sample.json`.

## What works today

- Google sign-in, profile row via trigger + upsert fallback
- Live presence on Realtime channel `bands`
- Settings: display name, band colour, live location sharing on/off
- **Location history upload** (signed in only): parse Google Timeline JSON,
  write `location_imports` + `location_segments` + `location_path_points`
- Visit log on signed-in page load (`unwavering.visits`) — separate from
  Google history segments

## What is not built yet

- Timeline visualization of imported history
- Groups of bands / distance-over-time chart
- Delete-my-history UI (tables support cascade delete by import)
- Server-side import job for multi-MB files (current path is browser parse +
  batched client inserts)

## How to continue

1. Read `DECISIONS.md` and `GOOGLE-LOCATION-FORMAT.md`
2. Apply any pending SQL under `supabase/` if the DB is behind the repo
3. Upload path: Settings → "Your Timeline" → choose `location-history.json`
4. Do not commit real location files. Keep samples synthetic.
