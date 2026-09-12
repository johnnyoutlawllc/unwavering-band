-- Live last-known positions for the Now canvas when peers are backgrounded.
-- Same visibility model as Realtime presence: any signed-in client may see
-- opted-in live coordinates (not Timeline history).

create or replace function unwavering.live_bands()
returns table (
  id uuid,
  display_name text,
  band_color text,
  last_lat double precision,
  last_lng double precision,
  last_location_at timestamptz
)
language sql
security definer
set search_path = unwavering, public
stable
as $$
  select
    u.id,
    u.display_name,
    u.band_color,
    u.last_lat,
    u.last_lng,
    u.last_location_at
  from unwavering.users u
  where u.location_sharing = true
    and u.last_lat is not null
    and u.last_lng is not null
    and u.last_location_at is not null
    and u.last_location_at > now() - interval '24 hours'
    and (auth.uid() is null or u.id <> auth.uid());
$$;

revoke all on function unwavering.live_bands() from public;
grant execute on function unwavering.live_bands() to authenticated;
