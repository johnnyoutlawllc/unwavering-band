# unwavering.band

A landing page for an idea taken from Kurt Vonnegut's *Breakfast of Champions*:
that the real part of a person is a narrow, unwavering band of light. Everyone
who signs in becomes one band. Location sharing is opt in and gives the band a
place to stand. Signed-in users can also upload a Google Timeline export into
private history tables (fuel for the distance-over-time chart still to come).

**Session handoff:** read `docs/START-HERE.md` first.

## Stack

| Piece | What |
|---|---|
| Framework | Next.js 16, TypeScript, App Router |
| Styling | Plain CSS in `src/app/globals.css`. No Tailwind. |
| Auth | Supabase Auth, Google only |
| Database | Outlaw Apps Supabase (`ntyvtpimesfoesuykuyi`), `unwavering` schema |
| Hosting | Vercel, auto deploys from `main` |

## The database

Everything lives in the `unwavering` schema, never `public`. The schema is
exposed to PostgREST through `authenticator`'s `pgrst.db_schemas` role setting,
so the client only has to pass `db: { schema: 'unwavering' }`.

Tables:

- `users` — profile + live location. Created by trigger on `auth.users`, with
  an upsert fallback in `src/lib/auth.tsx`.
- `visits` — one row per signed-in page visit (not Google Timeline).
- `location_imports` / `location_segments` / `location_path_points` — private
  Google Timeline history. See `docs/SCHEMA.md`.

RLS is on. History tables are `auth.uid() = user_id` only. Anon has nothing.
Turning live location sharing off nulls the coordinates as well as the flag.

## Local

```bash
cp .env.example .env.local   # fill in the anon key (or pull from Vercel)
npm install
npm run dev
```

Settings → Your Timeline accepts `location-history.json` from Google Timeline.
Do not commit real exports. A synthetic sample is in
`docs/samples/location-history.sample.json`.

## Deploying

Push to `main`. The Vercel project is linked to the GitHub repo directly, so it
deploys itself. No manual API trigger, unlike `outlawapps-online`.
