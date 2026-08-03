# unwavering.band

A landing page for an idea taken from Kurt Vonnegut's *Breakfast of Champions*:
that the real part of a person is a narrow, unwavering band of light. Everyone
who signs in becomes one band. Location sharing is opt in and gives the band a
place to stand.

Right now this is a holding page with real auth behind it. There is no map yet.

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

`unwavering.users` is the only table.

- The row is created by an `after insert` trigger on `auth.users`, so signing in
  is enough. `src/lib/auth.tsx` inserts a row itself as a fallback for accounts
  that predate the trigger.
- RLS is on and every policy is `auth.uid() = id`. A signed in person can read
  and write exactly one row: their own. Anon has nothing.
- Turning location sharing off nulls the coordinates as well as the flag.
  Withdrawn consent takes the data with it. Keep it that way.

## Local

```bash
cp .env.example .env.local   # fill in the anon key
npm install
npm run dev
```

## Deploying

Push to `main`. The Vercel project is linked to the GitHub repo directly, so it
deploys itself. No manual API trigger, unlike `outlawapps-online`.
