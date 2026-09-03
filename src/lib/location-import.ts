import { supabase } from './supabase';
import type { ParsedSegment, ParseResult } from './location-history';

const SEGMENT_CHUNK = 100;
const POINT_CHUNK = 400;

export type ImportProgress = {
  phase: 'starting' | 'segments' | 'points' | 'finishing' | 'done' | 'failed';
  message: string;
  segmentsDone: number;
  segmentsTotal: number;
  pointsDone: number;
  pointsTotal: number;
};

type SegmentRow = {
  id: string;
  user_id: string;
  import_id: string;
  kind: string;
  start_time: string;
  end_time: string;
  place_id: string | null;
  semantic_type: string | null;
  lat: number | null;
  lng: number | null;
  visit_probability: number | null;
  activity_type: string | null;
  distance_meters: number | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  activity_probability: number | null;
};

function newId(): string {
  return crypto.randomUUID();
}

function segmentRow(
  userId: string,
  importId: string,
  seg: ParsedSegment,
): SegmentRow {
  return {
    id: newId(),
    user_id: userId,
    import_id: importId,
    kind: seg.kind,
    start_time: seg.startTime,
    end_time: seg.endTime,
    place_id: seg.placeId,
    semantic_type: seg.semanticType,
    lat: seg.lat,
    lng: seg.lng,
    visit_probability: seg.visitProbability,
    activity_type: seg.activityType,
    distance_meters: seg.distanceMeters,
    start_lat: seg.startLat,
    start_lng: seg.startLng,
    end_lat: seg.endLat,
    end_lng: seg.endLng,
    activity_probability: seg.activityProbability,
  };
}

async function insertChunks(
  table: 'location_segments' | 'location_path_points',
  rows: Record<string, unknown>[],
  size: number,
  onChunk: (done: number) => void,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw new Error(error.message);
    onChunk(Math.min(i + chunk.length, rows.length));
  }
}

export async function uploadLocationHistory(opts: {
  userId: string;
  filename: string;
  byteSize: number;
  parsed: ParseResult;
  onProgress?: (p: ImportProgress) => void;
}): Promise<{ importId: string }> {
  const { userId, filename, byteSize, parsed, onProgress } = opts;
  const report = (p: ImportProgress) => onProgress?.(p);

  report({
    phase: 'starting',
    message: 'Starting import…',
    segmentsDone: 0,
    segmentsTotal: parsed.segments.length,
    pointsDone: 0,
    pointsTotal: parsed.pathPointCount,
  });

  const { data: imp, error: impErr } = await supabase
    .from('location_imports')
    .insert({
      user_id: userId,
      filename,
      byte_size: byteSize,
      source_format: 'google_timeline_json_v1',
      status: 'pending',
      segment_count: parsed.segments.length,
      visit_count: parsed.visitCount,
      activity_count: parsed.activityCount,
      path_point_count: parsed.pathPointCount,
    })
    .select('id')
    .single();

  if (impErr || !imp) {
    throw new Error(impErr?.message ?? 'Could not create import row.');
  }

  const importId = imp.id as string;

  try {
    const segmentRows = parsed.segments.map((s) => segmentRow(userId, importId, s));
    const pointRows: Array<{
      user_id: string;
      import_id: string;
      segment_id: string;
      recorded_at: string;
      offset_minutes: number;
      lat: number;
      lng: number;
    }> = [];

    for (let i = 0; i < parsed.segments.length; i++) {
      const seg = parsed.segments[i];
      const row = segmentRows[i];
      for (const pt of seg.pathPoints) {
        pointRows.push({
          user_id: userId,
          import_id: importId,
          segment_id: row.id,
          recorded_at: pt.recordedAt,
          offset_minutes: pt.offsetMinutes,
          lat: pt.lat,
          lng: pt.lng,
        });
      }
    }

    report({
      phase: 'segments',
      message: 'Saving places and trips…',
      segmentsDone: 0,
      segmentsTotal: segmentRows.length,
      pointsDone: 0,
      pointsTotal: pointRows.length,
    });

    await insertChunks(
      'location_segments',
      segmentRows as unknown as Record<string, unknown>[],
      SEGMENT_CHUNK,
      (done) => {
      report({
        phase: 'segments',
        message: `Saving places and trips… ${done} / ${segmentRows.length}`,
        segmentsDone: done,
        segmentsTotal: segmentRows.length,
        pointsDone: 0,
        pointsTotal: pointRows.length,
      });
    });

    if (pointRows.length > 0) {
      report({
        phase: 'points',
        message: 'Saving path points…',
        segmentsDone: segmentRows.length,
        segmentsTotal: segmentRows.length,
        pointsDone: 0,
        pointsTotal: pointRows.length,
      });

      await insertChunks(
        'location_path_points',
        pointRows as unknown as Record<string, unknown>[],
        POINT_CHUNK,
        (done) => {
        report({
          phase: 'points',
          message: `Saving path points… ${done} / ${pointRows.length}`,
          segmentsDone: segmentRows.length,
          segmentsTotal: segmentRows.length,
          pointsDone: done,
          pointsTotal: pointRows.length,
        });
      });
    }

    report({
      phase: 'finishing',
      message: 'Finishing…',
      segmentsDone: segmentRows.length,
      segmentsTotal: segmentRows.length,
      pointsDone: pointRows.length,
      pointsTotal: pointRows.length,
    });

    const { error: doneErr } = await supabase
      .from('location_imports')
      .update({ status: 'complete', completed_at: new Date().toISOString() })
      .eq('id', importId);

    if (doneErr) throw new Error(doneErr.message);

    report({
      phase: 'done',
      message: 'Import complete.',
      segmentsDone: segmentRows.length,
      segmentsTotal: segmentRows.length,
      pointsDone: pointRows.length,
      pointsTotal: pointRows.length,
    });

    return { importId };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Import failed.';
    await supabase
      .from('location_imports')
      .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
      .eq('id', importId);
    report({
      phase: 'failed',
      message,
      segmentsDone: 0,
      segmentsTotal: parsed.segments.length,
      pointsDone: 0,
      pointsTotal: parsed.pathPointCount,
    });
    throw e;
  }
}

export type LocationImportSummary = {
  id: string;
  filename: string;
  status: string;
  segment_count: number;
  visit_count: number;
  activity_count: number;
  path_point_count: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
};

export async function listLocationImports(
  userId: string,
): Promise<LocationImportSummary[]> {
  const { data, error } = await supabase
    .from('location_imports')
    .select(
      'id, filename, status, segment_count, visit_count, activity_count, path_point_count, started_at, completed_at, error',
    )
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as LocationImportSummary[];
}
