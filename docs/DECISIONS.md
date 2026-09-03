# Decisions

Choices that look wrong but are deliberate.

## Naming: `visits` vs location history

`unwavering.visits` already means "a signed-in page load with optional GPS".
Google Timeline "visit" records go into `location_segments` with
`kind = 'visit'`. Do not rename either table to match the other.

## Store normalized rows, not the raw file

The export is already a JSON array of segments. We parse in the browser and
insert typed rows. We do not store the original blob in Supabase Storage for
v1. Reasons: simpler privacy surface (one place to delete), no B2/CORS work,
and the timeline feature only needs coordinates and times.

Re-upload creates a new import. Replacing prior history is an explicit future
action (delete old imports), not automatic overwrite.

## Path points are a separate table

A single `timelinePath` segment can hold 100+ points. Flattening them into
`location_path_points` keeps queries for "where were you on Tuesday at 3pm"
simple without scanning jsonb arrays.

## Client-side batch insert for v1

`authenticator` has an 8s statement timeout. Imports batch ~200–500 rows per
request from the signed-in client under RLS. A service-role API route is the
escape hatch if large Takeouts time out; do not add it until a real upload
fails.

## Private forever

History tables are `auth.uid() = user_id` only. Presence on the bandscape stays
public-by-design; imported Timeline data does not. Never expose history through
the Realtime channel.

## Sample file stays outside the repo

Brad Wheeler's export is real private data under `Internal Files\`. The repo
only carries a three-record synthetic sample. Do not copy the full file into
`public/` or `docs/`.
