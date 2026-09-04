import { sealCoords } from './crypto';
import type { VaultKeys } from './crypto';
import { supabase, type PlaceRow, type VisitSegment } from './supabase';
import { haversineKm } from './geo';
import { openCoords } from './crypto';

export type DecryptedVisit = VisitSegment & {
  lat: number | null;
  lng: number | null;
};

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
  await supabase.auth.signOut();
}
