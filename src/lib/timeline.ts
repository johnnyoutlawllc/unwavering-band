import { openCoords, type VaultKeys } from './crypto';
import { supabase } from './supabase';

export type TimelineSource = 'live' | 'imported';

export type TimelineKind = 'live_ping' | 'place_visit' | 'trip';

export type TimelineRecord = {
  id: string;
  source: TimelineSource;
  kind: TimelineKind;
  occurredAt: string;
  endTime: string | null;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  semanticType: string | null;
  activityType: string | null;
  city?: string | null;
  state?: string | null;
};

export type TimelineCounts = {
  live: number;
  imported: number;
  latestLiveAt: string | null;
};

/** One live tracking ping (native background or in-app save). */
export async function recordLiveVisit(input: {
  lat: number;
  lng: number;
  accuracy_m: number;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { error } = await supabase.from('visits').insert({
    user_id: user.id,
    lat: input.lat,
    lng: input.lng,
    accuracy_m: input.accuracy_m,
    visited_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function listLiveVisits(
  keys: VaultKeys | null,
  limit = 400,
): Promise<TimelineRecord[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('visits')
    .select('id, lat, lng, lat_cipher, lng_cipher, accuracy_m, visited_at')
    .eq('user_id', user.id)
    .order('visited_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const out: TimelineRecord[] = [];
  for (const row of data ?? []) {
    const coords = keys
      ? await openCoords(
          keys.dek,
          row.lat_cipher,
          row.lng_cipher,
          row.lat,
          row.lng,
        )
      : row.lat != null && row.lng != null
        ? { lat: row.lat as number, lng: row.lng as number }
        : null;
    out.push({
      id: `live:${row.id}`,
      source: 'live',
      kind: 'live_ping',
      occurredAt: row.visited_at,
      endTime: null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      accuracyM: row.accuracy_m,
      semanticType: null,
      activityType: null,
    });
  }
  return out;
}

export async function listImportedTimeline(
  keys: VaultKeys,
  limit = 400,
): Promise<TimelineRecord[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('location_segments')
    .select(
      `id, kind, start_time, end_time, semantic_type, activity_type,
       lat, lng, lat_cipher, lng_cipher,
       start_lat, start_lng, start_lat_cipher, start_lng_cipher`,
    )
    .eq('user_id', user.id)
    .in('kind', ['visit', 'activity'])
    .order('start_time', { ascending: false })
    .limit(limit);
  if (error) throw error;

  const out: TimelineRecord[] = [];
  for (const row of data ?? []) {
    if (row.kind === 'visit') {
      const coords = await openCoords(
        keys.dek,
        row.lat_cipher,
        row.lng_cipher,
        row.lat,
        row.lng,
      );
      out.push({
        id: `imported:${row.id}`,
        source: 'imported',
        kind: 'place_visit',
        occurredAt: row.start_time,
        endTime: row.end_time,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        accuracyM: null,
        semanticType: row.semantic_type,
        activityType: null,
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
    out.push({
      id: `imported:${row.id}`,
      source: 'imported',
      kind: 'trip',
      occurredAt: row.start_time,
      endTime: row.end_time,
      lat: start?.lat ?? null,
      lng: start?.lng ?? null,
      accuracyM: null,
      semanticType: row.semantic_type,
      activityType: row.activity_type,
    });
  }
  return out;
}

export async function listMyTimeline(
  keys: VaultKeys | null,
): Promise<{ records: TimelineRecord[]; counts: TimelineCounts }> {
  const live = await listLiveVisits(keys, 500);
  const imported = keys ? await listImportedTimeline(keys, 500) : [];
  const records = [...live, ...imported].sort((a, b) =>
    b.occurredAt.localeCompare(a.occurredAt),
  );
  return {
    records,
    counts: {
      live: live.length,
      imported: imported.length,
      latestLiveAt: live[0]?.occurredAt ?? null,
    },
  };
}
