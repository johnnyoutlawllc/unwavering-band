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
import {
  supabase,
  type DistancePoint,
  type DistanceReportRow,
  type PrivacyTier,
} from './supabase';

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

function visiblePlace(tier: PrivacyTier, place: string | null | undefined): string | null {
  if (tier === 'distance') return null;
  return place ?? null;
}

function visibleCoords(
  tier: PrivacyTier,
  lat: number,
  lng: number,
): { lat: number | null; lng: number | null } {
  if (tier === 'distance') return { lat: null, lng: null };
  return { lat, lng };
}

/** Publish only days that are missing or whose privacy tier changed. */
export async function publishMyShares(opts: {
  keys: VaultKeys;
  relationshipId: string;
  myShares: PrivacyTier;
  places: Array<{ name: string; lat: number; lng: number; radius_m: number }>;
  force?: boolean;
}): Promise<number> {
  const relKey = await loadRelKey(opts.keys, opts.relationshipId);
  if (!relKey) throw new Error('Relationship key not ready yet.');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data: existing, error: exErr } = await supabase
    .from('relationship_daily_shares')
    .select('day, tier')
    .eq('relationship_id', opts.relationshipId)
    .eq('author_id', user.id);
  if (exErr) throw exErr;
  const have = new Map((existing ?? []).map((r) => [r.day as string, r.tier as string]));

  const { data: segs, error } = await supabase
    .from('location_segments')
    .select('start_time, lat, lng, lat_cipher, lng_cipher, semantic_type')
    .eq('user_id', user.id)
    .eq('kind', 'visit')
    .order('start_time', { ascending: true });
  if (error) throw error;

  const neededDays = new Set<string>();
  for (const row of segs ?? []) {
    const day = (row.start_time as string).slice(0, 10);
    const prior = have.get(day);
    if (opts.force || prior !== opts.myShares) neededDays.add(day);
  }
  if (neededDays.size === 0) return 0;

  const byDay = new Map<string, { lat: number; lng: number; n: number; place: string | null }>();

  for (const row of segs ?? []) {
    const day = (row.start_time as string).slice(0, 10);
    if (!neededDays.has(day)) continue;
    let lat = row.lat as number | null;
    let lng = row.lng as number | null;
    if (row.lat_cipher && row.lng_cipher) {
      const { decryptNumber } = await import('./crypto');
      lat = await decryptNumber(opts.keys.dek, row.lat_cipher);
      lng = await decryptNumber(opts.keys.dek, row.lng_cipher);
    }
    if (lat == null || lng == null) continue;
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

export async function loadDistanceReport(
  relationshipId: string,
): Promise<DistanceReportRow[]> {
  const { data, error } = await supabase
    .from('relationship_distance_days')
    .select('*')
    .eq('relationship_id', relationshipId)
    .order('day', { ascending: true });
  if (error) throw error;
  return (data ?? []) as DistanceReportRow[];
}

/**
 * Peer daily positions for the History map. Only city/exact tiers return
 * coordinates (distance-only stays off the map).
 */
export async function loadPeerHistoryMapPoints(opts: {
  keys: VaultKeys;
  relationshipId: string;
  peerId: string;
  peerName: string;
  theirShares: PrivacyTier;
  color: string;
}): Promise<{ points: import('./history').HistoryMapPoint[]; blockedReason: string | null }> {
  if (opts.theirShares === 'distance') {
    return {
      points: [],
      blockedReason: `${opts.peerName} shares distance only, so their locations stay hidden.`,
    };
  }

  const relKey = await loadRelKey(opts.keys, opts.relationshipId);
  if (!relKey) {
    return {
      points: [],
      blockedReason: `Relationship key not ready for ${opts.peerName}. Open People and accept/unlock first.`,
    };
  }

  const { data, error } = await supabase
    .from('relationship_daily_shares')
    .select('day, payload_cipher, tier')
    .eq('relationship_id', opts.relationshipId)
    .eq('author_id', opts.peerId)
    .order('day', { ascending: true });
  if (error) throw error;

  const points: import('./history').HistoryMapPoint[] = [];
  for (const row of data ?? []) {
    const tier = row.tier as PrivacyTier;
    if (tier === 'distance') continue;
    const payload = await decryptJson<CoordPayload>(relKey, row.payload_cipher);
    const coords = visibleCoords(tier, payload.lat, payload.lng);
    if (coords.lat == null || coords.lng == null) continue;
    points.push({
      id: `peer:${opts.relationshipId}:${row.day}`,
      source: 'peer_day',
      occurredAt: `${row.day}T12:00:00.000Z`,
      endTime: null,
      lat: coords.lat,
      lng: coords.lng,
      semanticType: visiblePlace(tier, payload.place),
      activityType: null,
      placeId: null,
      distanceMeters: null,
      personId: opts.peerId,
      personName: opts.peerName,
      color: opts.color,
    });
  }

  return {
    points,
    blockedReason:
      points.length === 0
        ? `${opts.peerName} has not published shared days yet. Ask them to open People once while unlocked.`
        : null,
  };
}

export function reportRowsToPoints(
  rows: DistanceReportRow[],
  myUserId: string,
): DistancePoint[] {
  return rows.map((row) => {
    const iAmRequester = row.requester_id === myUserId;
    const theirTier = iAmRequester ? row.addressee_tier : row.requester_tier;
    return {
      day: row.day,
      distance_km: row.distance_km,
      their_lat: iAmRequester ? row.addressee_lat : row.requester_lat,
      their_lng: iAmRequester ? row.addressee_lng : row.requester_lng,
      their_place: iAmRequester ? row.addressee_place : row.requester_place,
      their_tier: theirTier,
      my_place: iAmRequester ? row.requester_place : row.addressee_place,
    };
  });
}

async function buildEncryptedDistanceSeries(opts: {
  keys: VaultKeys;
  relationshipId: string;
  peerId: string;
}): Promise<
  Array<{
    day: string;
    distance_km: number;
    me: CoordPayload & { tier: PrivacyTier };
    them: CoordPayload & { tier: PrivacyTier };
  }>
> {
  const relKey = await loadRelKey(opts.keys, opts.relationshipId);
  if (!relKey) {
    throw new Error(
      'Relationship key not ready. Accept the invite after both unlock encryption.',
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('relationship_daily_shares')
    .select('author_id, day, payload_cipher, tier')
    .eq('relationship_id', opts.relationshipId);
  if (error) throw error;

  const mine = new Map<string, { payload: CoordPayload; tier: PrivacyTier }>();
  const theirs = new Map<string, { payload: CoordPayload; tier: PrivacyTier }>();

  for (const row of data ?? []) {
    const payload = await decryptJson<CoordPayload>(relKey, row.payload_cipher);
    const packed = { payload, tier: row.tier as PrivacyTier };
    if (row.author_id === user.id) mine.set(row.day, packed);
    else theirs.set(row.day, packed);
  }

  const out: Array<{
    day: string;
    distance_km: number;
    me: CoordPayload & { tier: PrivacyTier };
    them: CoordPayload & { tier: PrivacyTier };
  }> = [];

  for (const [day, me] of mine) {
    const other = theirs.get(day);
    if (!other) continue;
    out.push({
      day,
      distance_km: haversineKm(
        me.payload.lat,
        me.payload.lng,
        other.payload.lat,
        other.payload.lng,
      ),
      me: { ...me.payload, tier: me.tier },
      them: { ...other.payload, tier: other.tier },
    });
  }
  out.sort((a, b) => a.day.localeCompare(b.day));
  return out;
}

/**
 * Load stored report if complete; otherwise publish new shares, recompute
 * overlapping days, and persist the reporting table.
 */
export async function ensureDistanceReport(opts: {
  keys: VaultKeys;
  relationshipId: string;
  peerId: string;
  peerName: string;
  myName: string;
  iAmRequester: boolean;
  myShares: PrivacyTier;
  places: Array<{ name: string; lat: number; lng: number; radius_m: number }>;
  force?: boolean;
}): Promise<{ points: DistancePoint[]; fromCache: boolean; published: number }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const published = await publishMyShares({
    keys: opts.keys,
    relationshipId: opts.relationshipId,
    myShares: opts.myShares,
    places: opts.places,
    force: opts.force,
  });

  let cached = await loadDistanceReport(opts.relationshipId);

  if (!opts.force && cached.length > 0 && published === 0) {
    const { data: latestShare } = await supabase
      .from('relationship_daily_shares')
      .select('updated_at')
      .eq('relationship_id', opts.relationshipId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const newestReport = cached.reduce(
      (max, row) => (row.computed_at > max ? row.computed_at : max),
      cached[0].computed_at,
    );
    if (
      latestShare?.updated_at &&
      newestReport >= latestShare.updated_at
    ) {
      return {
        points: reportRowsToPoints(cached, user.id),
        fromCache: true,
        published,
      };
    }
  }

  const { count: peerShareCount, error: cErr } = await supabase
    .from('relationship_daily_shares')
    .select('day', { count: 'exact', head: true })
    .eq('relationship_id', opts.relationshipId)
    .eq('author_id', opts.peerId);
  if (cErr) throw cErr;

  if ((peerShareCount ?? 0) === 0) {
    return { points: reportRowsToPoints(cached, user.id), fromCache: true, published };
  }

  const series = await buildEncryptedDistanceSeries({
    keys: opts.keys,
    relationshipId: opts.relationshipId,
    peerId: opts.peerId,
  });

  const requesterId = opts.iAmRequester ? user.id : opts.peerId;
  const addresseeId = opts.iAmRequester ? opts.peerId : user.id;
  const requesterName = opts.iAmRequester ? opts.myName : opts.peerName;
  const addresseeName = opts.iAmRequester ? opts.peerName : opts.myName;

  const rows = series.map((pt) => {
    const meIsRequester = opts.iAmRequester;
    const requesterPayload = meIsRequester ? pt.me : pt.them;
    const addresseePayload = meIsRequester ? pt.them : pt.me;
    const reqCoords = visibleCoords(
      requesterPayload.tier,
      requesterPayload.lat,
      requesterPayload.lng,
    );
    const addCoords = visibleCoords(
      addresseePayload.tier,
      addresseePayload.lat,
      addresseePayload.lng,
    );
    return {
      relationship_id: opts.relationshipId,
      day: pt.day,
      occurred_at: `${pt.day}T12:00:00.000Z`,
      distance_km: pt.distance_km,
      requester_id: requesterId,
      addressee_id: addresseeId,
      requester_name: requesterName,
      addressee_name: addresseeName,
      requester_place: visiblePlace(requesterPayload.tier, requesterPayload.place),
      addressee_place: visiblePlace(addresseePayload.tier, addresseePayload.place),
      requester_tier: requesterPayload.tier,
      addressee_tier: addresseePayload.tier,
      requester_lat: reqCoords.lat,
      requester_lng: reqCoords.lng,
      addressee_lat: addCoords.lat,
      addressee_lng: addCoords.lng,
      computed_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error: upErr } = await supabase
      .from('relationship_distance_days')
      .upsert(rows, { onConflict: 'relationship_id,day' });
    if (upErr) throw upErr;
  }

  cached = await loadDistanceReport(opts.relationshipId);
  return {
    points: reportRowsToPoints(cached, user.id),
    fromCache: false,
    published,
  };
}

export { sealCoords, buildEncryptedDistanceSeries };
