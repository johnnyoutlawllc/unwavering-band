# unwavering.band

A site for an idea from Kurt Vonnegut's *Breakfast of Champions*: the real part
of a person is a narrow, unwavering band of light. Sign in, import your
history, form relationships, and watch distance over time under per-person
privacy.

**Session handoff:** read `docs/START-HERE.md` first.

## Stack

| Piece | What |
|---|---|
| Framework | Next.js 16, TypeScript, App Router |
| Styling | Plain CSS in `src/app/globals.css`. No Tailwind. |
| Auth | Supabase Auth: Google + email/password |
| Database | Outlaw Apps Supabase (`ntyvtpimesfoesuykuyi`), `unwavering` schema |
| Hosting | Vercel, auto deploys from `main` |

## Local

```bash
cp .env.example .env.local   # fill in the anon key (or pull from Vercel)
npm install
npm run dev
```

## Deploying

Push to `main`. The Vercel project deploys itself.
