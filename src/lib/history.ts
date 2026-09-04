import { sealCoords } from './crypto';
import type { VaultKeys } from './crypto';
import { supabase, type PlaceRow, type VisitSegment } from './supabase';
import { haversineKm } from './geo';
import { openCoords } from './crypto';

export type DecryptedVisit = VisitSegment & {
  lat: number | null;
  lng: number | null;
};

/** One map-ready coordinate from Timeline (visit center or trip endpoint). */
export type HistoryMapPoint = {
  id: string;
  source: 'visit' | 'trip_start' | 'trip_end' | 'peer_day';
  occurredAt: string;
  endTime: string | null;
  lat: number;
  lng: number;
  semanticType: string | null;
  activityType: string | null;
  placeId: string | null;
  distanceMeters: number | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  /** null / omitted = you */
  personId?: string | null;
  personName?: string | null;
  color?: string | null;
};

export const OWN_HISTORY_COLOR = '#ffb347';

export const PEER_HISTORY_PALETTE = [
  '#6ee7ff',
  '#a78bfa',
  '#7dffb0',
  '#ff6b8b',
  '#60a5fa',
  '#f472b6',
];

export function colorForPeer(
  bandColor: string | null | undefined,
  index: number,
): string {
  if (bandColor && /^#[0-9a-fA-F]{6}$/.test(bandColor)) return bandColor;
  return PEER_HISTORY_PALETTE[index % PEER_HISTORY_PALETTE.length];
}

export async function listRecentVisits(
  keys: VaultKeys,
  limit = 200,
): Promise<DecryptedVisit[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('location_segments')
    .select(
      'id, start_time, end_time, lat, lng, lat_cipher, lng_cipher, semantic_type, place_id',
    )
    .eq('user_id', user.id)
    .eq('kind', 'visit')
    .order('start_time', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const out: DecryptedVisit[] = [];
  for (const row of data ?? []) {
    const coords = await openCoords(
      keys.dek,
      row.lat_cipher,
      row.lng_cipher,
      row.lat,
      row.lng,
    );
    if (!coords) continue;
    out.push({
      id: row.id,
      start_time: row.start_time,
      end_time: row.end_time,
      lat: coords.lat,
      lng: coords.lng,
      semantic_type: row.semantic_type,
      place_id: row.place_id,
    });
  }
  return out;
}

export async function listHistoryMapPoints(
  keys: VaultKeys,
  limit = 4000,
): Promise<HistoryMapPoint[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('location_segments')
    .select(
      `id, kind, start_time, end_time, semantic_type, activity_type, place_id,
       distance_meters, lat, lng, lat_cipher, lng_cipher,
       start_lat, start_lng, start_lat_cipher, start_lng_cipher,
       end_lat, end_lng, end_lat_cipher, end_lng_cipher`,
    )
    .eq('user_id', user.id)
    .in('kind', ['visit', 'activity'])
    .order('start_time', { ascending: true })
    .limit(limit);
  if (error) throw error;

  const out: HistoryMapPoint[] = [];
  for (const row of data ?? []) {
    if (row.kind === 'visit') {
      const coords = await openCoords(
        keys.dek,
        row.lat_cipher,
        row.lng_cipher,
        row.lat,
        row.lng,
      );
      if (!coords) continue;
      out.push({
        id: `${row.id}:visit`,
        source: 'visit',
        occurredAt: row.start_time,
        endTime: row.end_time,
        lat: coords.lat,
        lng: coords.lng,
        semanticType: row.semantic_type,
        activityType: null,
        placeId: row.place_id,
        distanceMeters: null,
      });
      continue;
    }

    const start = await openCoords(
      keys.dek,
      row.start_lat_cipher,
      row.start_lng_cipher,
      row.start_lat,
      row.start_lng,
    );
    if (start) {
      out.push({
        id: `${row.id}:start`,
        source: 'trip_start',
        occurredAt: row.start_time,
        endTime: row.end_time,
        lat: start.lat,
        lng: start.lng,
        semanticType: row.semantic_type,
        activityType: row.activity_type,
        placeId: row.place_id,
        distanceMeters: row.distance_meters,
      });
    }
    const end = await openCoords(
      keys.dek,
      row.end_lat_cipher,
      row.end_lng_cipher,
      row.end_lat,
      row.end_lng,
    );
    if (end) {
      out.push({
        id: `${row.id}:end`,
        source: 'trip_end',
        occurredAt: row.end_time ?? row.start_time,
        endTime: row.end_time,
        lat: end.lat,
        lng: end.lng,
        semanticType: row.semantic_type,
        activityType: row.activity_type,
        placeId: row.place_id,
        distanceMeters: row.distance_meters,
      });
    }
  }
  return out;
}

export async function historySummary(): Promise<{
  visitCount: number;
  earliest: string | null;
  latest: string | null;
  importCount: number;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const [visits, imports] = await Promise.all([
    supabase
      .from('location_segments')
      .select('start_time', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('kind', 'visit')
      .order('start_time', { ascending: true })
      .limit(1),
    supabase
      .from('location_imports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'complete'),
  ]);

  const { data: last } = await supabase
    .from('location_segments')
    .select('end_time')
    .eq('user_id', user.id)
    .eq('kind', 'visit')
    .order('end_time', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    visitCount: visits.count ?? 0,
    earliest: visits.data?.[0]?.start_time ?? null,
    latest: last?.end_time ?? null,
    importCount: imports.count ?? 0,
  };
}

export async function listPlaces(keys: VaultKeys): Promise<PlaceRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('places')
    .select('*')
    .eq('user_id', user.id)
    .order('name');
  if (error) throw error;

  const out: PlaceRow[] = [];
  for (const row of data ?? []) {
    const coords = await openCoords(
      keys.dek,
      row.lat_cipher,
      row.lng_cipher,
      row.lat,
      row.lng,
    );
    if (!coords) continue;
    out.push({ ...row, lat: coords.lat, lng: coords.lng } as PlaceRow);
  }
  return out;
}

export async function createPlace(
  keys: VaultKeys,
  input: { name: string; lat: number; lng: number; radius_m?: number },
): Promise<PlaceRow> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const c = await sealCoords(keys.dek, input.lat, input.lng);
  const { data, error } = await supabase
    .from('places')
    .insert({
      user_id: user.id,
      name: input.name.trim(),
      lat: null,
      lng: null,
      lat_cipher: c.lat_cipher,
      lng_cipher: c.lng_cipher,
      radius_m: input.radius_m ?? 200,
    })
    .select()
    .single();
  if (error) throw error;
  return { ...(data as PlaceRow), lat: input.lat, lng: input.lng };
}

export async function updatePlaceName(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name is required.');
  const { error } = await supabase
    .from('places')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deletePlace(id: string): Promise<void> {
  const { error } = await supabase.from('places').delete().eq('id', id);
  if (error) throw error;
}

export function matchPlace(
  places: PlaceRow[],
  lat: number,
  lng: number,
): PlaceRow | null {
  let best: PlaceRow | null = null;
  let bestKm = Infinity;
  for (const p of places) {
    const km = haversineKm(p.lat, p.lng, lat, lng);
    if (km * 1000 <= p.radius_m && km < bestKm) {
      best = p;
      bestKm = km;
    }
  }
  return best;
}

export async function deleteMyAccount(): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('delete_my_data');
  if (error) throw error;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) {
      await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } catch {
    // Data is already gone; auth row may remain until support cleans it.
  }
  if (user) {
    const { clearVaultKeys } = await import('./vault-store');
    await clearVaultKeys(user.id);
  }
  await supabase.auth.signOut();
}
