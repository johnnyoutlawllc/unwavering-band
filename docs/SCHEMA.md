# Schema

All tables live in `unwavering`.

Migrations:

- `supabase/002_location_history.sql` — imports / segments / path points
- `supabase/003_relationships_and_places.sql` — places, relationships, RPCs

## `users`

Profile + live location opt-in. Created by trigger on `auth.users`.

## `visits`

One row per signed-in page load (not Google Timeline).

## `location_imports` / `location_segments` / `location_path_points`

Private Google Timeline history. See earlier docs. RLS: `auth.uid() = user_id`.

## `places`

User-named locations (`name`, `lat`, `lng`, `radius_m`). Matched to visits and
to relationship hover labels when privacy allows.

## `relationships`

| Column | Notes |
|---|---|
| requester_id / addressee_id | The two people |
| status | `pending` \| `accepted` \| `declined` \| `ended` |
| requester_shares | What requester lets addressee see |
| addressee_shares | What addressee lets requester see |

Share tiers: `distance` (miles only), `city` (coarse coords + place name if
any), `exact` (full coords + place name).

Unique pair index on `least/greatest` for active rows.

## RPCs (security definer)

| Function | Purpose |
|---|---|
| `find_user_for_invite(email)` | id + display_name for invite |
| `list_my_relationships()` | Peer names without opening `users` to all |
| `relationship_peer(id)` | Single peer view |
| `relationship_distance_series(id, from?, to?)` | Daily miles + privacy-filtered peer coords |

## `relationship_daily_shares`

Encrypted daily position payloads under the relationship key. Authors write;
both parties in an accepted relationship may read ciphertext.

## `relationship_distance_days`

Per-relationship **reporting** table: one row per overlapping visit day with
`occurred_at`, `distance_km`, both display names, place labels (when privacy
allows), and coarse/exact coords (when privacy allows). Written by the client
after decrypting shares so the People chart can load without rebuilding from
scratch every visit. RLS: either party on an accepted relationship.
