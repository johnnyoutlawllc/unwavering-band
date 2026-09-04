import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  cellKey,
  reverseGeocodeCell,
  roundCell,
  type GeocodeLabel,
} from '@/lib/geocode';

type CellIn = { latitude: number; longitude: number };

const MAX_CELLS = 80;
const MAX_FETCH = 25;
const MIN_INTERVAL_MS = 1100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!jwt) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey =
    process.env.LOCATIONIQ_API_KEY?.trim() ||
    process.env.LOCATION_IQ_KEY?.trim();
  if (!url || !anon) {
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    db: { schema: 'unwavering' },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { cells?: CellIn[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = Array.isArray(body.cells) ? body.cells : [];
  const unique = new Map<string, { latitude: number; longitude: number }>();
  for (const item of raw.slice(0, MAX_CELLS)) {
    const lat = Number(item?.latitude);
    const lng = Number(item?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    const cell = roundCell(lat, lng);
    unique.set(cellKey(cell), cell);
  }
  const cells = [...unique.values()];
  if (cells.length === 0) {
    return NextResponse.json({ labels: {}, fetched: 0, pending: 0 });
  }

  const db = service
    ? createClient(url, service, {
        auth: { autoRefreshToken: false, persistSession: false },
        db: { schema: 'unwavering' },
      })
    : userClient;

  const { data: existing, error: readErr } = await db.rpc('lookup_geo_cells', {
    p_cells: cells,
  });
  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }

  const labels: Record<string, GeocodeLabel> = {};
  const missing: { latitude: number; longitude: number }[] = [];

  const byKey = new Map<string, (typeof existing)[number]>();
  for (const row of existing ?? []) {
    const cell = {
      latitude: Number(row.latitude_cell),
      longitude: Number(row.longitude_cell),
    };
    byKey.set(cellKey(cell), row);
  }

  for (const cell of cells) {
    const key = cellKey(cell);
    const row = byKey.get(key);
    if (row?.status === 'resolved') {
      labels[key] = {
        city: row.city,
        state: row.state,
        country: row.country,
        countryCode: row.country_code,
        provider: row.provider ?? 'cache',
      };
    } else {
      missing.push(cell);
    }
  }

  let fetched = 0;
  if (apiKey && service && missing.length > 0) {
    for (const cell of missing.slice(0, MAX_FETCH)) {
      const key = cellKey(cell);
      try {
        const label = await reverseGeocodeCell(cell, { apiKey });
        const { error: upErr } = await db.from('geo_cells').upsert(
          {
            precision_digits: 2,
            latitude_cell: cell.latitude,
            longitude_cell: cell.longitude,
            status: 'resolved',
            provider: label.provider,
            city: label.city,
            state: label.state,
            country: label.country,
            country_code: label.countryCode,
            attempts: 1,
            resolved_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'precision_digits,latitude_cell,longitude_cell' },
        );
        if (upErr) throw upErr;
        labels[key] = label;
        fetched += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'geocode failed';
        await db.from('geo_cells').upsert(
          {
            precision_digits: 2,
            latitude_cell: cell.latitude,
            longitude_cell: cell.longitude,
            status: 'failed',
            attempts: 1,
            last_error: message.slice(0, 500),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'precision_digits,latitude_cell,longitude_cell' },
        );
      }
      if (fetched < Math.min(missing.length, MAX_FETCH)) {
        await sleep(MIN_INTERVAL_MS);
      }
    }
  }

  const pending = missing.length - fetched;
  return NextResponse.json({
    labels,
    fetched,
    pending: Math.max(0, pending),
    provider: apiKey ? 'locationiq' : null,
  });
}
