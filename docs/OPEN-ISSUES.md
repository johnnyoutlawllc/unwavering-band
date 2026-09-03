# Open issues

## Must do before calling history "done"

1. **Smoke-test upload** while signed in with the Brad sample (local only).
   Expect ~1.1k segments and ~9.3k path points for that file.
   Migration `002_location_history` is already applied on Outlaw Apps.
2. **Delete import control** — schema cascades; UI does not offer delete yet.

## Product gaps

- No visualization of imported history yet (the whole point of ingesting it).
- Live location sharing and Timeline upload are independent. Opting out of live
  sharing does not delete imported history (deliberate until we ask Johnny).
- Very large Takeouts (multi-year, tens of MB) may need a server import path.

## Do not regress

- Copy carries no em dashes.
- Withdrawn live location consent still nulls coordinates on `users`.
- Choice of Google as sole auth provider.
