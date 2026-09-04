-- Client-side encryption at rest + relationship share channel.
-- Plaintext lat/lng columns remain nullable for migration; new writes
-- store ciphertext and clear plaintext once re-encrypted.

alter table unwavering.users
  add column if not exists crypto_salt text,
  add column if not exists wrapped_dek text,
  add column if not exists crypto_pubkey text,
  add column if not exists wrapped_privkey text,
  add column if not exists encryption_enabled_at timestamptz;

alter table unwavering.location_segments
  add column if not exists lat_cipher text,
  add column if not exists lng_cipher text,
  add column if not exists start_lat_cipher text,
  add column if not exists start_lng_cipher text,
  add column if not exists end_lat_cipher text,
  add column if not exists end_lng_cipher text;

alter table unwavering.location_path_points
  add column if not exists lat_cipher text,
  add column if not exists lng_cipher text;

alter table unwavering.places
  add column if not exists lat_cipher text,
  add column if not exists lng_cipher text;

alter table unwavering.users
  add column if not exists last_lat_cipher text,
  add column if not exists last_lng_cipher text;

alter table unwavering.visits
  add column if not exists lat_cipher text,
  add column if not exists lng_cipher text;

-- Per-user wrap of the shared relationship AES key (wrapped with that user's DEK).
create table if not exists unwavering.relationship_key_wraps (
  relationship_id uuid not null references unwavering.relationships (id) on delete cascade,
  user_id uuid not null references unwavering.users (id) on delete cascade,
  wrapped_key text not null,
  created_at timestamptz not null default now(),
  primary key (relationship_id, user_id)
);

alter table unwavering.relationship_key_wraps enable row level security;

drop policy if exists relationship_key_wraps_own on unwavering.relationship_key_wraps;
create policy relationship_key_wraps_own on unwavering.relationship_key_wraps
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Also allow reading the peer wrap row only to check existence? Not needed.
-- Peer delivers wrap-for-you via insert as themselves... 
-- At accept, each user inserts THEIR OWN wrap. For the other party's wrap of
-- the same raw key: the acceptor generates the key, wraps for self, and
-- encrypts a copy to the requester's pubkey into pending_key_packages.

create table if not exists unwavering.relationship_key_packages (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references unwavering.relationships (id) on delete cascade,
  recipient_id uuid not null references unwavering.users (id) on delete cascade,
  sender_id uuid not null references unwavering.users (id) on delete cascade,
  -- ECDH-encrypted package: ephemeral pubkey + ciphertext of the rel AES key
  package_cipher text not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index if not exists relationship_key_packages_recipient_idx
  on unwavering.relationship_key_packages (recipient_id, consumed_at);

alter table unwavering.relationship_key_packages enable row level security;

drop policy if exists relationship_key_packages_recipient on unwavering.relationship_key_packages;
create policy relationship_key_packages_recipient on unwavering.relationship_key_packages
  for select to authenticated
  using (auth.uid() = recipient_id);

drop policy if exists relationship_key_packages_sender_insert on unwavering.relationship_key_packages;
create policy relationship_key_packages_sender_insert on unwavering.relationship_key_packages
  for insert to authenticated
  with check (auth.uid() = sender_id);

drop policy if exists relationship_key_packages_recipient_update on unwavering.relationship_key_packages;
create policy relationship_key_packages_recipient_update on unwavering.relationship_key_packages
  for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

-- Daily position shares: ciphertext under the relationship key.
-- Authors only publish what their privacy tier allows (enforced client-side).
create table if not exists unwavering.relationship_daily_shares (
  relationship_id uuid not null references unwavering.relationships (id) on delete cascade,
  author_id uuid not null references unwavering.users (id) on delete cascade,
  day date not null,
  payload_cipher text not null,
  tier text not null check (tier in ('distance', 'city', 'exact')),
  updated_at timestamptz not null default now(),
  primary key (relationship_id, author_id, day)
);

alter table unwavering.relationship_daily_shares enable row level security;

-- Either party in an accepted relationship may read shares; only author writes.
drop policy if exists relationship_daily_shares_select on unwavering.relationship_daily_shares;
create policy relationship_daily_shares_select on unwavering.relationship_daily_shares
  for select to authenticated
  using (
    exists (
      select 1 from unwavering.relationships r
      where r.id = relationship_id
        and r.status = 'accepted'
        and (r.requester_id = auth.uid() or r.addressee_id = auth.uid())
    )
  );

drop policy if exists relationship_daily_shares_insert on unwavering.relationship_daily_shares;
create policy relationship_daily_shares_insert on unwavering.relationship_daily_shares
  for insert to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from unwavering.relationships r
      where r.id = relationship_id
        and r.status = 'accepted'
        and (r.requester_id = auth.uid() or r.addressee_id = auth.uid())
    )
  );

drop policy if exists relationship_daily_shares_update on unwavering.relationship_daily_shares;
create policy relationship_daily_shares_update on unwavering.relationship_daily_shares
  for update to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists relationship_daily_shares_delete on unwavering.relationship_daily_shares;
create policy relationship_daily_shares_delete on unwavering.relationship_daily_shares
  for delete to authenticated
  using (auth.uid() = author_id);

grant select, insert, update, delete on unwavering.relationship_key_wraps to authenticated;
grant select, insert, update on unwavering.relationship_key_packages to authenticated;
grant select, insert, update, delete on unwavering.relationship_daily_shares to authenticated;

-- Wipe all unwavering data for the calling user (account deletion step 1).
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

  delete from unwavering.relationship_daily_shares where author_id = me;
  delete from unwavering.relationship_key_packages where recipient_id = me or sender_id = me;
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

revoke all on function unwavering.delete_my_data() from public;
grant execute on function unwavering.delete_my_data() to authenticated;

-- Peer public key for ECDH packaging (only id + pubkey).
create or replace function unwavering.peer_crypto_pubkey(p_user_id uuid)
returns table (id uuid, crypto_pubkey text)
language plpgsql
security definer
set search_path = unwavering, public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  -- Only if there is a relationship between the two.
  if not exists (
    select 1 from unwavering.relationships r
    where status in ('pending', 'accepted')
      and (
        (requester_id = auth.uid() and addressee_id = p_user_id)
        or (addressee_id = auth.uid() and requester_id = p_user_id)
      )
  ) then
    raise exception 'not related';
  end if;

  return query
    select u.id, u.crypto_pubkey
    from unwavering.users u
    where u.id = p_user_id;
end;
$$;

revoke all on function unwavering.peer_crypto_pubkey(uuid) from public;
grant execute on function unwavering.peer_crypto_pubkey(uuid) to authenticated;
