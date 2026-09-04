import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { suggestPlaceNames } from '@/lib/geocode';

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!jwt) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const apiKey =
    process.env.LOCATIONIQ_API_KEY?.trim() ||
    process.env.LOCATION_IQ_KEY?.trim();
  if (!url || !anon) {
    return NextResponse.json({ error: 'Misconfigured' }, { status: 500 });
  }
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Place suggestions are not configured.', suggestions: [] },
      { status: 503 },
    );
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    db: { schema: 'unwavering' },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { lat?: unknown; lng?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: 'Out of range' }, { status: 400 });
  }

  try {
    const suggestions = await suggestPlaceNames(lat, lng, { apiKey });
    return NextResponse.json({ suggestions });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Place lookup failed';
    return NextResponse.json({ error: message, suggestions: [] }, { status: 502 });
  }
}
