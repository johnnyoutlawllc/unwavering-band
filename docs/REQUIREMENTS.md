# Requirements: Google Timeline upload

Status as of 3 September 2026: ingest path is built; visualization is not.

## User story

After Google sign-in, a person can upload their Google Timeline
`location-history.json` and have every visit, activity, and path point stored
under their account for later timeline / distance features.

## Acceptance

- [x] Tables exist in `unwavering` with RLS owner-only
- [x] Parser handles visit / activity / timelinePath
- [x] Settings exposes upload when signed in
- [x] Import summary listed after upload
- [ ] End-to-end smoke test with Brad sample while signed in
- [ ] UI to delete an import
- [ ] Any visualization of the imported data

## Non-goals (this pass)

- Map or chart of history
- Sharing history with other users
- Storing the raw JSON blob
- Old `Records.json` Takeout format (E7 lat/lng arrays)
