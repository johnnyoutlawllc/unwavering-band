/*
 * Google Timeline export parser (array of visit / activity / timelinePath).
 * See docs/GOOGLE-LOCATION-FORMAT.md.
 */

export type SegmentKind = 'visit' | 'activity' | 'timeline_path';

export type ParsedPathPoint = {
  offsetMinutes: number;
  lat: number;
  lng: number;
  recordedAt: string;
};

export type ParsedSegment = {
  kind: SegmentKind;
  startTime: string;
  endTime: string;
  placeId: string | null;
  semanticType: string | null;
  lat: number | null;
  lng: number | null;
  visitProbability: number | null;
  activityType: string | null;
  distanceMeters: number | null;
  startLat: number | null;
  startLng: number | null;
  endLat: number | null;
  endLng: number | null;
  activityProbability: number | null;
  pathPoints: ParsedPathPoint[];
};

export type ParseResult = {
  segments: ParsedSegment[];
  visitCount: number;
  activityCount: number;
  pathPointCount: number;
};

const GEO = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/i;

export function parseGeo(value: unknown): { lat: number; lng: number } | null {
  if (typeof value !== 'string') return null;
  const m = GEO.exec(value.trim());
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString();
}

function addMinutesIso(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

export function parseLocationHistoryJson(raw: unknown): ParseResult {
  if (!Array.isArray(raw)) {
    throw new Error('Expected a JSON array (Google Timeline export).');
  }

  const segments: ParsedSegment[] = [];
  let visitCount = 0;
  let activityCount = 0;
  let pathPointCount = 0;

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const startTime = asIso(rec.startTime);
    const endTime = asIso(rec.endTime);
    if (!startTime || !endTime) continue;

    if (rec.visit && typeof rec.visit === 'object') {
      const visit = rec.visit as Record<string, unknown>;
      const top =
        visit.topCandidate && typeof visit.topCandidate === 'object'
          ? (visit.topCandidate as Record<string, unknown>)
          : {};
      const place = parseGeo(top.placeLocation);
      segments.push({
        kind: 'visit',
        startTime,
        endTime,
        placeId: typeof top.placeID === 'string' ? top.placeID : null,
        semanticType: typeof top.semanticType === 'string' ? top.semanticType : null,
        lat: place?.lat ?? null,
        lng: place?.lng ?? null,
        visitProbability: asNumber(visit.probability),
        activityType: null,
        distanceMeters: null,
        startLat: null,
        startLng: null,
        endLat: null,
        endLng: null,
        activityProbability: null,
        pathPoints: [],
      });
      visitCount += 1;
      continue;
    }

    if (rec.activity && typeof rec.activity === 'object') {
      const activity = rec.activity as Record<string, unknown>;
      const top =
        activity.topCandidate && typeof activity.topCandidate === 'object'
          ? (activity.topCandidate as Record<string, unknown>)
          : {};
      const start = parseGeo(activity.start);
      const end = parseGeo(activity.end);
      segments.push({
        kind: 'activity',
        startTime,
        endTime,
        placeId: null,
        semanticType: null,
        lat: null,
        lng: null,
        visitProbability: null,
        activityType: typeof top.type === 'string' ? top.type : null,
        distanceMeters: asNumber(activity.distanceMeters),
        startLat: start?.lat ?? null,
        startLng: start?.lng ?? null,
        endLat: end?.lat ?? null,
        endLng: end?.lng ?? null,
        activityProbability: asNumber(activity.probability),
        pathPoints: [],
      });
      activityCount += 1;
      continue;
    }

    if (Array.isArray(rec.timelinePath)) {
      const pathPoints: ParsedPathPoint[] = [];
      for (const pt of rec.timelinePath) {
        if (!pt || typeof pt !== 'object') continue;
        const p = pt as Record<string, unknown>;
        const geo = parseGeo(p.point);
        if (!geo) continue;
        const offsetMinutes = Math.max(0, Math.round(asNumber(p.durationMinutesOffsetFromStartTime) ?? 0));
        pathPoints.push({
          offsetMinutes,
          lat: geo.lat,
          lng: geo.lng,
          recordedAt: addMinutesIso(startTime, offsetMinutes),
        });
      }
      segments.push({
        kind: 'timeline_path',
        startTime,
        endTime,
        placeId: null,
        semanticType: null,
        lat: null,
        lng: null,
        visitProbability: null,
        activityType: null,
        distanceMeters: null,
        startLat: null,
        startLng: null,
        endLat: null,
        endLng: null,
        activityProbability: null,
        pathPoints,
      });
      pathPointCount += pathPoints.length;
    }
  }

  if (segments.length === 0) {
    throw new Error('No recognizable visit, activity, or path segments found.');
  }

  return { segments, visitCount, activityCount, pathPointCount };
}

export async function parseLocationHistoryFile(file: File): Promise<ParseResult> {
  const text = await file.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  return parseLocationHistoryJson(json);
}
