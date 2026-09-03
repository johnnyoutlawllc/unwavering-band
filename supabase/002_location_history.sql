-- Location history imports from Google Timeline JSON exports.
-- Private to the owning user. Cascades on import delete.

create table if not exists unwavering.location_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references unwavering.users (id) on delete cascade,
  filename text not null,
  byte_size integer not null check (byte_size >= 0),
  source_format text not null default 'google_timeline_json_v1',
  status text not null default 'pending'
    check (status in ('pending', 'complete', 'failed')),
  error text,
  segment_count integer not null default 0,
  visit_count integer not null default 0,
  activity_count integer not null default 0,
  path_point_count integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists location_imports_user_id_idx
  on unwavering.location_imports (user_id, started_at desc);

create table if not exists unwavering.location_segments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references unwavering.users (id) on delete cascade,
  import_id uuid not null references unwavering.location_imports (id) on delete cascade,
  kind text not null check (kind in ('visit', 'activity', 'timeline_path')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  place_id text,
  semantic_type text,
  lat double precision,
  lng double precision,
  visit_probability real,
  activity_type text,
  distance_meters double precision,
  start_lat double precision,
  start_lng double precision,
  end_lat double precision,
  end_lng double precision,
  activity_probability real
);

create index if not exists location_segments_user_time_idx
  on unwavering.location_segments (user_id, start_time);
create index if not exists location_segments_import_idx
  on unwavering.location_segments (import_id);

create table if not exists unwavering.location_path_points (
  id bigserial primary key,
  user_id uuid not null references unwavering.users (id) on delete cascade,
  import_id uuid not null references unwavering.location_imports (id) on delete cascade,
  segment_id uuid not null references unwavering.location_segments (id) on delete cascade,
  recorded_at timestamptz not null,
  offset_minutes integer not null default 0,
  lat double precision not null,
  lng double precision not null
);

create index if not exists location_path_points_user_time_idx
  on unwavering.location_path_points (user_id, recorded_at);
create index if not exists location_path_points_import_idx
  on unwavering.location_path_points (import_id);

alter table unwavering.location_imports enable row level security;
alter table unwavering.location_segments enable row level security;
alter table unwavering.location_path_points enable row level security;

drop policy if exists location_imports_own on unwavering.location_imports;
create policy location_imports_own on unwavering.location_imports
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists location_segments_own on unwavering.location_segments;
create policy location_segments_own on unwavering.location_segments
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists location_path_points_own on unwavering.location_path_points;
create policy location_path_points_own on unwavering.location_path_points
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant usage on schema unwavering to authenticated;
grant select, insert, update, delete on unwavering.location_imports to authenticated;
grant select, insert, update, delete on unwavering.location_segments to authenticated;
grant select, insert, update, delete on unwavering.location_path_points to authenticated;
grant usage, select on sequence unwavering.location_path_points_id_seq to authenticated;
