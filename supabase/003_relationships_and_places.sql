-- Relationships, named places, and privacy-aware distance series.
-- Applied via MCP as migration relationships_and_places.

create table if not exists unwavering.places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references unwavering.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  lat double precision not null,
  lng double precision not null,
  radius_m double precision not null default 200
    check (radius_m >= 25 and radius_m <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists places_user_id_idx
  on unwavering.places (user_id);

create table if not exists unwavering.relationships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references unwavering.users (id) on delete cascade,
  addressee_id uuid not null references unwavering.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'ended')),
  -- What the requester lets the addressee see of the requester.
  requester_shares text not null default 'distance'
    check (requester_shares in ('distance', 'city', 'exact')),
  -- What the addressee lets the requester see of the addressee.
  addressee_shares text not null default 'distance'
    check (addressee_shares in ('distance', 'city', 'exact')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint relationships_distinct_people check (requester_id <> addressee_id),
  constraint relationships_ordered_pair unique (requester_id, addressee_id)
);

create index if not exists relationships_requester_idx
  on unwavering.relationships (requester_id, status);
create index if not exists relationships_addressee_idx
  on unwavering.relationships (addressee_id, status);

create unique index if not exists relationships_pair_unique_idx
  on unwavering.relationships (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  )
  where status in ('pending', 'accepted');

alter table unwavering.places enable row level security;
alter table unwavering.relationships enable row level security;

drop policy if exists places_own on unwavering.places;
create policy places_own on unwavering.places
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists relationships_party_select on unwavering.relationships;
create policy relationships_party_select on unwavering.relationships
  for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists relationships_requester_insert on unwavering.relationships;
create policy relationships_requester_insert on unwavering.relationships
  for insert to authenticated
  with check (auth.uid() = requester_id and status = 'pending');

drop policy if exists relationships_party_update on unwavering.relationships;
create policy relationships_party_update on unwavering.relationships
  for update to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

drop policy if exists relationships_party_delete on unwavering.relationships;
create policy relationships_party_delete on unwavering.relationships
  for delete to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

grant select, insert, update, delete on unwavering.places to authenticated;
grant select, insert, update, delete on unwavering.relationships to authenticated;

-- Public profile fields for someone you already have a relationship with.
create or replace function unwavering.relationship_peer(p_rel_id uuid)
returns table (
  relationship_id uuid,
  peer_id uuid,
  peer_name text,
  peer_band_color text,
  status text,
  my_shares text,
  their_shares text,
  i_am_requester boolean
)
language plpgsql
security definer
set search_path = unwavering, public
as $$
declare
  me uuid := auth.uid();
  r unwavering.relationships%rowtype;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select * into r from unwavering.relationships where id = p_rel_id;
  if not found then
    return;
  end if;
  if me <> r.requester_id and me <> r.addressee_id then
    raise exception 'not a party to this relationship';
  end if;

  if me = r.requester_id then
    return query
      select
        r.id,
        r.addressee_id,
        coalesce(u.display_name, split_part(coalesce(u.email, 'someone'), '@', 1)),
        u.band_color,
        r.status,
        r.requester_shares,
        r.addressee_shares,
        true
      from unwavering.users u
      where u.id = r.addressee_id;
  else
    return query
      select
        r.id,
        r.requester_id,
        coalesce(u.display_name, split_part(coalesce(u.email, 'someone'), '@', 1)),
        u.band_color,
        r.status,
        r.addressee_shares,
        r.requester_shares,
        false
      from unwavering.users u
      where u.id = r.requester_id;
  end if;
end;
$$;

revoke all on function unwavering.relationship_peer(uuid) from public;
grant execute on function unwavering.relationship_peer(uuid) to authenticated;

-- Look up a person by email to invite them. Returns only id + display name.
create or replace function unwavering.find_user_for_invite(p_email text)
returns table (id uuid, display_name text)
language plpgsql
security definer
set search_path = unwavering, public
as $$
declare
  normalized text := lower(trim(p_email));
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if normalized is null or normalized = '' or position('@' in normalized) = 0 then
    return;
  end if;

  return query
    select u.id,
           coalesce(u.display_name, split_part(u.email, '@', 1))
    from unwavering.users u
    where lower(u.email) = normalized
      and u.id <> auth.uid()
    limit 1;
end;
$$;

revoke all on function unwavering.find_user_for_invite(text) from public;
grant execute on function unwavering.find_user_for_invite(text) to authenticated;

-- One position per day from visit segments (mean of that day's visits).
create or replace function unwavering.daily_visit_positions(
  p_user_id uuid,
  p_from date,
  p_to date
)
returns table (day date, lat double precision, lng double precision)
language sql
stable
security definer
set search_path = unwavering, public
as $$
  select
    (s.start_time at time zone 'UTC')::date as day,
    avg(s.lat) as lat,
    avg(s.lng) as lng
  from unwavering.location_segments s
  where s.user_id = p_user_id
    and s.kind = 'visit'
    and s.lat is not null
    and s.lng is not null
    and (s.start_time at time zone 'UTC')::date >= p_from
    and (s.start_time at time zone 'UTC')::date <= p_to
  group by 1
  order by 1;
$$;

revoke all on function unwavering.daily_visit_positions(uuid, date, date) from public;
-- Only called from relationship_distance_series; not granted to clients.

create or replace function unwavering.haversine_km(
  a_lat double precision,
  a_lng double precision,
  b_lat double precision,
  b_lng double precision
)
returns double precision
language sql
immutable
as $$
  select 6371 * 2 * asin(sqrt(
    power(sin(radians(b_lat - a_lat) / 2), 2) +
    cos(radians(a_lat)) * cos(radians(b_lat)) *
    power(sin(radians(b_lng - a_lng) / 2), 2)
  ));
$$;

create or replace function unwavering.nearest_place_name(
  p_user_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns text
language sql
stable
security definer
set search_path = unwavering, public
as $$
  select p.name
  from unwavering.places p
  where p.user_id = p_user_id
    and unwavering.haversine_km(p.lat, p.lng, p_lat, p_lng) * 1000 <= p.radius_m
  order by unwavering.haversine_km(p.lat, p.lng, p_lat, p_lng) asc
  limit 1
$$;

-- Privacy-aware distance series for an accepted relationship.
-- Returns only what the other person has granted the caller.
create or replace function unwavering.relationship_distance_series(
  p_rel_id uuid,
  p_from date default null,
  p_to date default null
)
returns table (
  day date,
  distance_km double precision,
  their_lat double precision,
  their_lng double precision,
  their_place text,
  their_tier text
)
language plpgsql
security definer
set search_path = unwavering, public
as $$
declare
  me uuid := auth.uid();
  r unwavering.relationships%rowtype;
  peer uuid;
  tier text;
  d_from date;
  d_to date;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  select * into r from unwavering.relationships where id = p_rel_id;
  if not found then
    raise exception 'relationship not found';
  end if;
  if me <> r.requester_id and me <> r.addressee_id then
    raise exception 'not a party to this relationship';
  end if;
  if r.status <> 'accepted' then
    raise exception 'relationship is not accepted';
  end if;

  if me = r.requester_id then
    peer := r.addressee_id;
    tier := r.addressee_shares;
  else
    peer := r.requester_id;
    tier := r.requester_shares;
  end if;

  d_from := coalesce(
    p_from,
    (select min((s.start_time at time zone 'UTC')::date)
       from unwavering.location_segments s
      where s.user_id in (me, peer) and s.kind = 'visit' and s.lat is not null)
  );
  d_to := coalesce(
    p_to,
    (select max((s.start_time at time zone 'UTC')::date)
       from unwavering.location_segments s
      where s.user_id in (me, peer) and s.kind = 'visit' and s.lat is not null)
  );

  if d_from is null or d_to is null then
    return;
  end if;

  return query
  with mine as (
    select * from unwavering.daily_visit_positions(me, d_from, d_to)
  ),
  theirs as (
    select * from unwavering.daily_visit_positions(peer, d_from, d_to)
  )
  select
    m.day,
    unwavering.haversine_km(m.lat, m.lng, t.lat, t.lng) as distance_km,
    case
      when tier = 'exact' then t.lat
      when tier = 'city' then round(t.lat::numeric, 2)::double precision
      else null
    end as their_lat,
    case
      when tier = 'exact' then t.lng
      when tier = 'city' then round(t.lng::numeric, 2)::double precision
      else null
    end as their_lng,
    case
      when tier in ('city', 'exact') then unwavering.nearest_place_name(peer, t.lat, t.lng)
      else null
    end as their_place,
    tier as their_tier
  from mine m
  inner join theirs t on t.day = m.day
  order by m.day;
end;
$$;

revoke all on function unwavering.relationship_distance_series(uuid, date, date) from public;
grant execute on function unwavering.relationship_distance_series(uuid, date, date) to authenticated;

-- List relationships with peer names (security definer so we can read peer display_name).
create or replace function unwavering.list_my_relationships()
returns table (
  id uuid,
  status text,
  peer_id uuid,
  peer_name text,
  peer_email text,
  peer_band_color text,
  my_shares text,
  their_shares text,
  i_am_requester boolean,
  created_at timestamptz,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = unwavering, public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'not authenticated';
  end if;

  return query
  select
    r.id,
    r.status,
    case when r.requester_id = me then r.addressee_id else r.requester_id end,
    coalesce(
      u.display_name,
      split_part(coalesce(u.email, 'someone'), '@', 1)
    ),
    u.email,
    u.band_color,
    case when r.requester_id = me then r.requester_shares else r.addressee_shares end,
    case when r.requester_id = me then r.addressee_shares else r.requester_shares end,
    (r.requester_id = me),
    r.created_at,
    r.accepted_at
  from unwavering.relationships r
  join unwavering.users u
    on u.id = case when r.requester_id = me then r.addressee_id else r.requester_id end
  where r.requester_id = me or r.addressee_id = me
  order by
    case r.status
      when 'pending' then 0
      when 'accepted' then 1
      else 2
    end,
    r.created_at desc;
end;
$$;

revoke all on function unwavering.list_my_relationships() from public;
grant execute on function unwavering.list_my_relationships() to authenticated;
