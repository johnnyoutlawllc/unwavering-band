import { cellKey, roundCell, type GeocodeLabel } from './geocode';
import { supabase } from './supabase';

export type EnrichedCoords = {
  lat: number;
  lng: number;
  city: string | null;
  state: string | null;
  country: string | null;
};

/**
 * Resolve city/state for decrypted points via the shared geo_cells cache.
 * Only rounded cell centers leave the device.
 */
export async function enrichCoordsWithLocality<
  T extends { lat: number; lng: number },
>(
  points: T[],
  opts?: { rounds?: number },
): Promise<(T & { city: string | null; state: string | null; country: string | null })[]> {
  if (points.length === 0) return [];

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return points.map((p) => ({
      ...p,
      city: null,
      state: null,
      country: null,
    }));
  }

  const unique = new Map<string, { latitude: number; longitude: number }>();
  for (const p of points) {
    const cell = roundCell(p.lat, p.lng);
    unique.set(cellKey(cell), cell);
  }

  const labels = new Map<string, GeocodeLabel>();
  const rounds = opts?.rounds ?? 4;
  let pendingCells = [...unique.values()];

  for (let i = 0; i < rounds && pendingCells.length > 0; i++) {
    const res = await fetch('/api/geocode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ cells: pendingCells }),
    });
    if (!res.ok) break;
    const body = (await res.json()) as {
      labels?: Record<string, GeocodeLabel>;
      pending?: number;
    };
    for (const [key, label] of Object.entries(body.labels ?? {})) {
      labels.set(key, label);
    }
    pendingCells = pendingCells.filter((c) => !labels.has(cellKey(c)));
    if (!body.pending || body.pending <= 0) break;
  }

  return points.map((p) => {
    const key = cellKey(roundCell(p.lat, p.lng));
    const label = labels.get(key);
    return {
      ...p,
      city: label?.city ?? null,
      state: label?.state ?? null,
      country: label?.country ?? null,
    };
  });
}
