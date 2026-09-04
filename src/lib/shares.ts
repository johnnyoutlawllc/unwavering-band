import {
  encryptJson,
  newRelationshipKey,
  openKeyPackage,
  packageKeyForPeer,
  sealCoords,
  unwrapKeyWithDek,
  wrapKeyWithDek,
  type VaultKeys,
  type CoordPayload,
  decryptJson,
} from './crypto';
import { haversineKm } from './geo';
import { supabase, type DistancePoint, type PrivacyTier } from './supabase';

export async function deliverRelationshipKey(
  keys: VaultKeys,
  relationshipId: string,
  peerId: string,
): Promise<void> {
  const { data: peerRows, error: peerErr } = await supabase.rpc('peer_crypto_pubkey', {
    p_user_id: peerId,
  });
  if (peerErr) throw peerErr;
  const peer = Array.isArray(peerRows) ? peerRows[0] : peerRows;
  if (!peer?.crypto_pubkey) {
    throw new Error('They have not enabled encryption yet. Ask them to unlock first.');
  }

  const { raw, key: _key } = await newRelationshipKey();
  const wrappedForMe = await wrapKeyWithDek(keys.dek, raw);
  const packageCipher = await packageKeyForPeer(peer.crypto_pubkey, raw);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { error: wErr } = await supabase.from('relationship_key_wraps').upsert({
    relationship_id: relationshipId,
    user_id: user.id,
    wrapped_key: wrappedForMe,
  });
  if (wErr) throw wErr;

  const { error: pErr } = await supabase.from('relationship_key_packages').insert({
    relationship_id: relationshipId,
    recipient_id: peerId,
    sender_id: user.id,
    package_cipher: packageCipher,
  });
  if (pErr) throw pErr;
}

export async function claimPendingKeyPackages(keys: VaultKeys): Promise<number> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data, error } = await supabase
    .from('relationship_key_packages')
    .select('id, relationship_id, package_cipher')
    .eq('recipient_id', user.id)
    .is('consumed_at', null);
  if (error) throw error;

  let n = 0;
  for (const row of data ?? []) {
    const relKey = await openKeyPackage(keys.privateKey, row.package_cipher);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', relKey));
    const wrapped = await wrapKeyWithDek(keys.dek, raw);
    const { error: wErr } = await supabase.from('relationship_key_wraps').upsert({
      relationship_id: row.relationship_id,
      user_id: user.id,
      wrapped_key: wrapped,
    });
    if (wErr) throw wErr;
    await supabase
      .from('relationship_key_packages')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', row.id);
    n += 1;
  }
  return n;
}

async function loadRelKey(keys: VaultKeys, relationshipId: string): Promise<CryptoKey | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('relationship_key_wraps')
    .select('wrapped_key')
    .eq('relationship_id', relationshipId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data) return null;
  return unwrapKeyWithDek(keys.dek, data.wrapped_key);
}

function tierCoords(
  tier: PrivacyTier,
  lat: number,
  lng: number,
  place: string | null,
): CoordPayload {
  if (tier === 'exact') return { lat, lng, place };
  if (tier === 'city') {
    return {
      lat: Math.round(lat * 100) / 100,
      lng: Math.round(lng * 100) / 100,
      place,
    };
  }
  // distance: still seal full coords under the relationship key so distance
  // can be computed; the UI only shows miles. Privacy policy discloses this.
  return { lat, lng, place: null };
}

export async function publishMyShares(opts: {
  keys: VaultKeys;
  relationshipId: string;
  myShares: PrivacyTier;
  places: Array<{ name: string; lat: number; lng: number; radius_m: number }>;
}): Promise<number> {
  const relKey = await loadRelKey(opts.keys, opts.relationshipId);
  if (!relKey) throw new Error('Relationship key not ready yet.');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data: segs, error } = await supabase
    .from('location_segments')
    .select('start_time, lat, lng, lat_cipher, lng_cipher, semantic_type')
    .eq('user_id', user.id)
    .eq('kind', 'visit')
    .order('start_time', { ascending: true });
  if (error) throw error;

  const byDay = new Map<string, { lat: number; lng: number; n: number; place: string | null }>();

  for (const row of segs ?? []) {
    let lat = row.lat as number | null;
    let lng = row.lng as number | null;
    if (row.lat_cipher && row.lng_cipher) {
      const { decryptNumber } = await import('./crypto');
      lat = await decryptNumber(opts.keys.dek, row.lat_cipher);
      lng = await decryptNumber(opts.keys.dek, row.lng_cipher);
    }
    if (lat == null || lng == null) continue;
    const day = row.start_time.slice(0, 10);
    const place =
      opts.places.find((p) => {
        const km = haversineKm(p.lat, p.lng, lat!, lng!);
        return km * 1000 <= p.radius_m;
      })?.name ??
      row.semantic_type ??
      null;
    const cur = byDay.get(day);
    if (!cur) byDay.set(day, { lat, lng, n: 1, place });
    else {
      cur.lat = (cur.lat * cur.n + lat) / (cur.n + 1);
      cur.lng = (cur.lng * cur.n + lng) / (cur.n + 1);
      cur.n += 1;
      if (!cur.place && place) cur.place = place;
    }
  }

  let written = 0;
  for (const [day, pos] of byDay) {
    const payload = tierCoords(opts.myShares, pos.lat, pos.lng, pos.place);
    const payload_cipher = await encryptJson(relKey, payload);
    const { error: upErr } = await supabase.from('relationship_daily_shares').upsert({
      relationship_id: opts.relationshipId,
      author_id: user.id,
      day,
      payload_cipher,
      tier: opts.myShares,
      updated_at: new Date().toISOString(),
    });
    if (upErr) throw upErr;
    written += 1;
  }
  return written;
}

export async function buildEncryptedDistanceSeries(opts: {
  keys: VaultKeys;
  relationshipId: string;
  peerId: string;
  theirShares: PrivacyTier;
}): Promise<DistancePoint[]> {
  const relKey = await loadRelKey(opts.keys, opts.relationshipId);
  if (!relKey) throw new Error('Relationship key not ready. Accept the invite after both unlock encryption.');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('relationship_daily_shares')
    .select('author_id, day, payload_cipher, tier')
    .eq('relationship_id', opts.relationshipId);
  if (error) throw error;

  const mine = new Map<string, CoordPayload>();
  const theirs = new Map<string, { payload: CoordPayload; tier: PrivacyTier }>();

  for (const row of data ?? []) {
    const payload = await decryptJson<CoordPayload>(relKey, row.payload_cipher);
    if (row.author_id === user.id) mine.set(row.day, payload);
    else theirs.set(row.day, { payload, tier: row.tier as PrivacyTier });
  }

  const points: DistancePoint[] = [];
  for (const [day, me] of mine) {
    const other = theirs.get(day);
    if (!other) continue;
    const distance_km = haversineKm(me.lat, me.lng, other.payload.lat, other.payload.lng);
    const tier = other.tier;
    points.push({
      day,
      distance_km,
      their_lat: tier === 'distance' ? null : other.payload.lat,
      their_lng: tier === 'distance' ? null : other.payload.lng,
      their_place: tier === 'distance' ? null : other.payload.place ?? null,
      their_tier: tier,
    });
  }
  points.sort((a, b) => a.day.localeCompare(b.day));
  return points;
}

export { sealCoords };
