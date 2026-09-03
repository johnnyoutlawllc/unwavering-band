# Schema: location history

All tables live in `unwavering`. Migration: `supabase/002_location_history.sql`.

## `location_imports`

One row per uploaded file.

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid fk → users | RLS owner |
| filename | text | Client-reported name |
| byte_size | int | |
| source_format | text | `google_timeline_json_v1` |
| status | text | `pending` \| `complete` \| `failed` |
| error | text | On failure |
| segment_count | int | |
| visit_count | int | |
| activity_count | int | |
| path_point_count | int | |
| started_at / completed_at | timestamptz | |

## `location_segments`

One row per Google segment (`visit`, `activity`, or `timeline_path` shell).

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | uuid | |
| import_id | uuid fk → location_imports on delete cascade | |
| kind | text | `visit` \| `activity` \| `timeline_path` |
| start_time / end_time | timestamptz | |
| place_id / semantic_type | text | visit |
| lat / lng | float8 | visit place, or null |
| visit_probability | float4 | |
| activity_type | text | activity |
| distance_meters | float8 | |
| start_lat / start_lng / end_lat / end_lng | float8 | activity |
| activity_probability | float4 | |

## `location_path_points`

Flattened breadcrumbs from `timelinePath` arrays.

| Column | Type | Notes |
|---|---|---|
| id | bigserial | |
| user_id | uuid | |
| import_id | uuid | cascade |
| segment_id | uuid | parent timeline_path segment |
| recorded_at | timestamptz | start + offset |
| offset_minutes | int | |
| lat / lng | float8 | |

## RLS

Every policy is `auth.uid() = user_id`. Anon has no grants. Grants to
`authenticated` only.
