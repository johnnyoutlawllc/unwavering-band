-- Per-relationship distance reporting rows.
-- Written by clients after decrypting relationship_daily_shares.
-- Lets the People chart load without re-deriving every overlapping day.

create table if not exists unwavering.relationship_distance_days (
  relationship_id uuid not null
    references unwavering.relationships (id) on delete cascade,
  day date not null,
  -- Noon UTC on that day for easy datetime display / export.
  occurred_at timestamptz not null,
  distance_km double precision not null check (distance_km >= 0),
  requester_id uuid not null references unwavering.users (id) on delete cascade,
  addressee_id uuid not null references unwavering.users (id) on delete cascade,
  requester_name text not null,
  addressee_name text not null,
  requester_place text,
  addressee_place text,
  requester_tier text not null
    check (requester_tier in ('distance', 'city', 'exact')),
  addressee_tier text not null
    check (addressee_tier in ('distance', 'city', 'exact')),
  requester_lat double precision,
  requester_lng double precision,
  addressee_lat double precision,
  addressee_lng double precision,
  computed_at timestamptz not null default now(),
  primary key (relationship_id, day)
);

create index if not exists relationship_distance_days_rel_day_idx
  on unwavering.relationship_distance_days (relationship_id, day);

alter table unwavering.relationship_distance_days enable row level security;

drop policy if exists relationship_distance_days_select
  on unwavering.relationship_distance_days;
create policy relationship_distance_days_select
  on unwavering.relationship_distance_days
  for select to authenticated
  using (
    exists (
      select 1 from unwavering.relationships r
      where r.id = relationship_id
        and r.status = 'accepted'
        and (r.requester_id = auth.uid() or r.addressee_id = auth.uid())
    )
  );

drop policy if exists relationship_distance_days_write
  on unwavering.relationship_distance_days;
create policy relationship_distance_days_write
  on unwavering.relationship_distance_days
  for all to authenticated
  using (
    exists (
      select 1 from unwavering.relationships r
      where r.id = relationship_id
        and r.status = 'accepted'
        and (r.requester_id = auth.uid() or r.addressee_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from unwavering.relationships r
      where r.id = relationship_id
        and r.status = 'accepted'
        and (r.requester_id = auth.uid() or r.addressee_id = auth.uid())
    )
  );

grant select, insert, update, delete
  on unwavering.relationship_distance_days to authenticated;

-- Account wipe must clear report rows authored via relationships cascade,
-- but also remove rows if a user is deleted without relationship cleanup.
create or replace function unwavering.delete_my_data()
returns void
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

  delete from unwavering.relationship_distance_days
    where requester_id = me or addressee_id = me;
  delete from unwavering.relationship_daily_shares where author_id = me;
  delete from unwavering.relationship_key_packages
    where recipient_id = me or sender_id = me;
  delete from unwavering.relationship_key_wraps where user_id = me;
  delete from unwavering.relationships
    where requester_id = me or addressee_id = me;
  delete from unwavering.places where user_id = me;
  delete from unwavering.location_path_points where user_id = me;
  delete from unwavering.location_segments where user_id = me;
  delete from unwavering.location_imports where user_id = me;
  delete from unwavering.visits where user_id = me;
  delete from unwavering.users where id = me;
end;
$$;
