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

export async function reverseGeocodeCell(
  cell: GeoCell,
  opts: { apiKey: string; baseUrl?: string; fetcher?: typeof fetch },
): Promise<GeocodeLabel> {
  const baseUrl = (opts.baseUrl ?? 'https://us1.locationiq.com/v1').replace(
    /\/+$/,
    '',
  );
  const url = new URL(`${baseUrl}/reverse`);
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
