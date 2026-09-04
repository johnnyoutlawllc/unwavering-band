/**
 * Privacy-preserving reverse geocode helpers (Outlaw Data pattern).
 * Only ~1.1 km cell centers are sent to the provider or stored in geo_cells.
 */

export type GeoCell = {
  latitude: number;
  longitude: number;
};

export type GeocodeLabel = {
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
  provider: string;
};

export function roundCell(lat: number, lng: number, digits = 2): GeoCell {
  const f = 10 ** digits;
  return {
    latitude: Math.round(lat * f) / f,
    longitude: Math.round(lng * f) / f,
  };
}

export function cellKey(cell: GeoCell, digits = 2): string {
  return `${digits}:${cell.latitude.toFixed(digits)},${cell.longitude.toFixed(digits)}`;
}

type NominatimAddress = {
  city?: unknown;
  town?: unknown;
  village?: unknown;
  municipality?: unknown;
  hamlet?: unknown;
  county?: unknown;
  state?: unknown;
  country?: unknown;
  country_code?: unknown;
};

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseNominatimLocation(
  payload: unknown,
  provider: string,
): GeocodeLabel {
  const address =
    payload && typeof payload === 'object'
      ? (payload as { address?: NominatimAddress }).address
      : undefined;
  if (!address) throw new Error('Geocoding response did not include an address.');
  return {
    provider,
    city:
      text(address.city) ??
      text(address.town) ??
      text(address.village) ??
      text(address.municipality) ??
      text(address.hamlet) ??
      text(address.county),
    state: text(address.state),
    country: text(address.country),
    countryCode: text(address.country_code)?.toLowerCase() ?? null,
  };
}

export type PlaceSuggestion = {
  name: string;
  detail: string | null;
  source: 'reverse' | 'nearby';
  distanceM: number | null;
};

type NominatimPlace = {
  name?: unknown;
  display_name?: unknown;
  class?: unknown;
  type?: unknown;
  distance?: unknown;
  address?: Record<string, unknown>;
};

function locationIqBase(baseUrl?: string): string {
  return (baseUrl ?? 'https://us1.locationiq.com/v1').replace(/\/+$/, '');
}

function pushUnique(out: PlaceSuggestion[], next: PlaceSuggestion) {
  const key = next.name.trim().toLowerCase();
  if (!key) return;
  if (out.some((row) => row.name.trim().toLowerCase() === key)) return;
  out.push(next);
}

function namedFromAddress(address: Record<string, unknown> | undefined): string[] {
  if (!address) return [];
  const keys = [
    'amenity',
    'shop',
    'tourism',
    'leisure',
    'building',
    'office',
    'historic',
    'man_made',
    'natural',
    'railway',
    'aeroway',
    'highway',
  ] as const;
  const names: string[] = [];
  for (const key of keys) {
    const value = text(address[key]);
    if (value) names.push(value);
  }
  return names;
}

function streetLabel(address: Record<string, unknown> | undefined): string | null {
  if (!address) return null;
  const road = text(address.road);
  if (!road) return null;
  const number = text(address.house_number);
  return number ? `${number} ${road}` : road;
}

function detailFromAddress(address: Record<string, unknown> | undefined): string | null {
  if (!address) return null;
  const parts = [
    text(address.suburb) ?? text(address.neighbourhood) ?? text(address.quarter),
    text(address.city) ??
      text(address.town) ??
      text(address.village) ??
      text(address.municipality),
    text(address.state),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function suggestionsFromReverse(payload: unknown): PlaceSuggestion[] {
  const row = (payload && typeof payload === 'object' ? payload : null) as NominatimPlace | null;
  if (!row) return [];
  const address =
    row.address && typeof row.address === 'object'
      ? (row.address as Record<string, unknown>)
      : undefined;
  const out: PlaceSuggestion[] = [];
  const named = text(row.name);
  if (named) {
    pushUnique(out, {
      name: named,
      detail: detailFromAddress(address),
      source: 'reverse',
      distanceM: null,
    });
  }
  for (const value of namedFromAddress(address)) {
    pushUnique(out, {
      name: value,
      detail: detailFromAddress(address),
      source: 'reverse',
      distanceM: null,
    });
  }
  const street = streetLabel(address);
  if (street) {
    pushUnique(out, {
      name: street,
      detail: detailFromAddress(address),
      source: 'reverse',
      distanceM: null,
    });
  }
  return out;
}

function suggestionsFromNearby(payload: unknown): PlaceSuggestion[] {
  const rows = Array.isArray(payload) ? payload : [];
  const out: PlaceSuggestion[] = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const row = item as NominatimPlace;
    const address =
      row.address && typeof row.address === 'object'
        ? (row.address as Record<string, unknown>)
        : undefined;
    const named =
      text(row.name) ??
      namedFromAddress(address)[0] ??
      text(row.display_name)?.split(',')[0]?.trim() ??
      null;
    if (!named) continue;
    const distanceRaw = Number(row.distance);
    pushUnique(out, {
      name: named,
      detail: detailFromAddress(address),
      source: 'nearby',
      distanceM: Number.isFinite(distanceRaw) ? distanceRaw : null,
    });
  }
  return out;
}

export async function reverseGeocodeCell(
  cell: GeoCell,
  opts: { apiKey: string; baseUrl?: string; fetcher?: typeof fetch },
): Promise<GeocodeLabel> {
  const url = new URL(`${locationIqBase(opts.baseUrl)}/reverse`);
  url.searchParams.set('lat', String(cell.latitude));
  url.searchParams.set('lon', String(cell.longitude));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('zoom', '10');
  url.searchParams.set('accept-language', 'en');
  url.searchParams.set('key', opts.apiKey);
  url.searchParams.set('normalizeaddress', '1');
  url.searchParams.set('statecode', '1');

  const fetcher = opts.fetcher ?? fetch;
  const response = await fetcher(url, {
    headers: { 'User-Agent': 'unwavering.band/1.0 (support@dataday.studio)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Geocoding provider returned HTTP ${response.status}.`);
  }
  return parseNominatimLocation(await response.json(), 'locationiq');
}

/**
 * Exact-coordinate place name suggestions for the user's "Name this place" flow.
 * Not written to geo_cells (those stay at ~1.1 km cell precision).
 */
export async function suggestPlaceNames(
  lat: number,
  lng: number,
  opts: { apiKey: string; baseUrl?: string; fetcher?: typeof fetch },
): Promise<PlaceSuggestion[]> {
  const base = locationIqBase(opts.baseUrl);
  const fetcher = opts.fetcher ?? fetch;
  const headers = { 'User-Agent': 'unwavering.band/1.0 (support@dataday.studio)' };

  const reverseUrl = new URL(`${base}/reverse`);
  reverseUrl.searchParams.set('lat', String(lat));
  reverseUrl.searchParams.set('lon', String(lng));
  reverseUrl.searchParams.set('format', 'json');
  reverseUrl.searchParams.set('addressdetails', '1');
  reverseUrl.searchParams.set('zoom', '18');
  reverseUrl.searchParams.set('accept-language', 'en');
  reverseUrl.searchParams.set('key', opts.apiKey);
  reverseUrl.searchParams.set('normalizeaddress', '1');
  reverseUrl.searchParams.set('namedetails', '1');

  const nearbyUrl = new URL(`${base}/nearby`);
  nearbyUrl.searchParams.set('lat', String(lat));
  nearbyUrl.searchParams.set('lon', String(lng));
  nearbyUrl.searchParams.set('tag', 'all');
  nearbyUrl.searchParams.set('radius', '120');
  nearbyUrl.searchParams.set('limit', '12');
  nearbyUrl.searchParams.set('format', 'json');
  nearbyUrl.searchParams.set('key', opts.apiKey);

  const [reverseRes, nearbyRes] = await Promise.all([
    fetcher(reverseUrl, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    }),
    fetcher(nearbyUrl, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    }),
  ]);

  const out: PlaceSuggestion[] = [];
  if (reverseRes.ok) {
    for (const row of suggestionsFromReverse(await reverseRes.json())) {
      pushUnique(out, row);
    }
  }
  if (nearbyRes.ok) {
    for (const row of suggestionsFromNearby(await nearbyRes.json())) {
      pushUnique(out, row);
    }
  }
  if (!reverseRes.ok && !nearbyRes.ok) {
    throw new Error(
      `Place lookup failed (reverse ${reverseRes.status}, nearby ${nearbyRes.status}).`,
    );
  }
  return out.slice(0, 8);
}
