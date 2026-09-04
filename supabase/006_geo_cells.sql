-- Shared, de-identified reverse-geocode cache (Outlaw Data pattern).
-- Stores only ~1.1 km cell centers + locality labels. No user, date, or
-- trajectory identifiers. Exact coordinates stay client-side / encrypted.

create table if not exists unwavering.geo_cells (
  precision_digits smallint not null default 2
    check (precision_digits between 1 and 4),
  latitude_cell numeric(7, 4) not null
    check (latitude_cell between -90 and 90),
  longitude_cell numeric(8, 4) not null
    check (longitude_cell between -180 and 180),
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'failed')),
  provider text,
  city text,
  state text,
  country text,
  country_code text,
  attempts integer not null default 0 check (attempts >= 0),
  resolved_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (precision_digits, latitude_cell, longitude_cell)
);

create index if not exists geo_cells_status_idx
  on unwavering.geo_cells (status, updated_at);

alter table unwavering.geo_cells enable row level security;

-- Resolved labels are non-sensitive locality names for rounded cells.
drop policy if exists geo_cells_select_resolved on unwavering.geo_cells;
create policy geo_cells_select_resolved on unwavering.geo_cells
  for select to authenticated
  using (status = 'resolved');

-- Writes go through the service-role API route only.
revoke insert, update, delete on unwavering.geo_cells from authenticated;
grant select on unwavering.geo_cells to authenticated;
grant select, insert, update, delete on unwavering.geo_cells to service_role;

create or replace function unwavering.lookup_geo_cells(p_cells jsonb)
returns table (
  latitude_cell numeric,
  longitude_cell numeric,
  status text,
  city text,
  state text,
  country text,
  country_code text,
  provider text
)
language sql
stable
security definer
set search_path = unwavering, public
as $$
  select c.latitude_cell, c.longitude_cell, c.status, c.city, c.state,
         c.country, c.country_code, c.provider
    from unwavering.geo_cells c
    join lateral jsonb_to_recordset(coalesce(p_cells, '[]'::jsonb))
      as x(latitude double precision, longitude double precision)
      on c.precision_digits = 2
     and c.latitude_cell = round(x.latitude::numeric, 2)
     and c.longitude_cell = round(x.longitude::numeric, 2);
$$;

revoke all on function unwavering.lookup_geo_cells(jsonb) from public;
grant execute on function unwavering.lookup_geo_cells(jsonb) to authenticated, service_role;
