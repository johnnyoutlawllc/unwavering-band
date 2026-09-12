'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { enrichCoordsWithLocality } from '@/lib/geo-enrich';
import { getPosition } from '@/lib/geo';
import { listPlaces, matchPlace } from '@/lib/history';
import {
  getNativeTrackingStatus,
  isNativeApp,
} from '@/lib/native-bridge';
import type { PlaceRow } from '@/lib/supabase';
import {
  listMyTimeline,
  recordLiveVisit,
  type TimelineRecord,
  type TimelineSource,
} from '@/lib/timeline';
import { useVault } from '@/lib/vault';

type Filter = 'all' | TimelineSource;

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function dayHeading(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

function relativeWhen(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function kindLabel(row: TimelineRecord): string {
  if (row.kind === 'live_ping') return 'Live tracking';
  if (row.kind === 'trip') {
    return row.activityType ? `Trip · ${row.activityType}` : 'Trip';
  }
  return row.semanticType || 'Place visit';
}

function sourceLabel(source: TimelineSource): string {
  return source === 'live' ? 'Live' : 'Imported';
}

export default function TimelinePage() {
  const { keys } = useVault();
  const { profile } = useAuth();
  const [records, setRecords] = useState<TimelineRecord[]>([]);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [liveCount, setLiveCount] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [latestLiveAt, setLatestLiveAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nativeNote, setNativeNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const sharing = profile?.location_sharing ?? false;

  const reload = useCallback(async () => {
    if (!keys) return;
    try {
      const [{ records: rows, counts }, pl] = await Promise.all([
        listMyTimeline(keys),
        listPlaces(keys),
      ]);
      setPlaces(pl);
      setLiveCount(counts.live);
      setImportedCount(counts.imported);
      setLatestLiveAt(counts.latestLiveAt);
      const withCoords = rows.filter((r) => r.lat != null && r.lng != null) as Array<
        TimelineRecord & { lat: number; lng: number }
      >;
      const without = rows.filter((r) => r.lat == null || r.lng == null);
      const enriched = await enrichCoordsWithLocality(withCoords);
      const merged = [...enriched, ...without].sort((a, b) =>
        b.occurredAt.localeCompare(a.occurredAt),
      );
      setRecords(merged);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your timeline.');
    } finally {
      setLoading(false);
    }
  }, [keys]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30000);
    const poll = window.setInterval(() => void reload(), 20000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, [reload]);

  useEffect(() => {
    if (!isNativeApp()) {
      setNativeNote(null);
      return;
    }
    getNativeTrackingStatus()
      .then((status) => {
        if (!status) return;
        if (status.permission === 'denied') {
          setNativeNote('Location permission is denied for this app.');
        } else if (status.permission === 'whenInUse') {
          setNativeNote(
            'Tracking is When In Use. Set Location to Always in system Settings to keep saving in the background.',
          );
        } else if (status.tracking) {
          setNativeNote('Background tracking is on. New pings appear here as they save.');
        } else {
          setNativeNote(
            'Native tracking is idle. Turn on Share where you are in Settings.',
          );
        }
      })
      .catch(() => setNativeNote(null));
  }, [sharing]);

  async function saveHere() {
    setSaving(true);
    setError(null);
    try {
      const pos = await getPosition();
      await recordLiveVisit({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save this location.');
    } finally {
      setSaving(false);
    }
  }

  const filtered = useMemo(
    () =>
      filter === 'all' ? records : records.filter((row) => row.source === filter),
    [filter, records],
  );

  const groups = useMemo(() => {
    const map = new Map<string, TimelineRecord[]>();
    for (const row of filtered) {
      const day = dayOf(row.occurredAt);
      const list = map.get(day) ?? [];
      list.push(row);
      map.set(day, list);
    }
    return [...map.entries()];
  }, [filtered]);

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>My Timeline</h1>
        <p>
          Every record saved to your account: live tracking pings from this
          phone, and visits imported from Google Timeline.
        </p>
      </header>

      <div className="timeline-status">
        <div>
          <span className="field-label">Live sharing</span>
          <strong>{sharing ? 'On' : 'Off'}</strong>
        </div>
        <div>
          <span className="field-label">Last live ping</span>
          <strong>
            {latestLiveAt ? relativeWhen(latestLiveAt, now) : 'None yet'}
          </strong>
        </div>
        <div className="timeline-status-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={saveHere}
            disabled={saving}
          >
            {saving ? 'Saving' : 'Save where I am now'}
          </button>
          <Link href="/app/settings" className="btn">
            Settings
          </Link>
        </div>
      </div>
      {nativeNote ? <p className="field-help">{nativeNote}</p> : null}
      {!sharing ? (
        <p className="field-help">
          Live pings only save while Share where you are is on.{' '}
          <Link href="/app/settings">Turn it on in Settings</Link>, then return
          here.
        </p>
      ) : null}

      <div className="stat-row">
        <div className="stat">
          <strong>{liveCount.toLocaleString()}</strong>
          <span>live pings</span>
        </div>
        <div className="stat">
          <strong>{importedCount.toLocaleString()}</strong>
          <span>imported records</span>
        </div>
        <div className="stat">
          <strong>{filtered.length.toLocaleString()}</strong>
          <span>showing</span>
        </div>
      </div>

      <div className="history-mode-toggle timeline-filters" role="group" aria-label="Record source">
        <button
          type="button"
          className={filter === 'all' ? 'is-active' : undefined}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          type="button"
          className={filter === 'live' ? 'is-active' : undefined}
          onClick={() => setFilter('live')}
        >
          Live tracking
        </button>
        <button
          type="button"
          className={filter === 'imported' ? 'is-active' : undefined}
          onClick={() => setFilter('imported')}
        >
          Imported
        </button>
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="field-help">Loading your records…</p> : null}

      {!loading && filtered.length === 0 ? (
        <p className="field-help">
          {filter === 'imported'
            ? 'No imported Timeline records yet. Upload a Google Timeline export in Settings.'
            : filter === 'live'
              ? 'No live tracking pings yet. Turn on sharing, grant Always location, then tap Save where I am now.'
              : 'Nothing saved yet. Turn on sharing to start live pings, or import a Google Timeline export in Settings.'}
        </p>
      ) : null}

      {groups.map(([day, rows]) => (
        <section key={day} className="timeline-day">
          <h2>{dayHeading(rows[0].occurredAt)}</h2>
          <ul className="visit-list">
            {rows.map((row) => {
              const place =
                row.lat != null && row.lng != null
                  ? matchPlace(places, row.lat, row.lng)
                  : null;
              return (
                <li key={row.id}>
                  <div>
                    <strong>
                      {place?.name ?? kindLabel(row)}
                    </strong>
                    <span className="muted">
                      {formatWhen(row.occurredAt)}
                      {` · ${relativeWhen(row.occurredAt, now)}`}
                      {row.city || row.state
                        ? ` · ${[row.city, row.state].filter(Boolean).join(', ')}`
                        : ''}
                      {row.lat != null && row.lng != null
                        ? ` · ${row.lat.toFixed(5)}, ${row.lng.toFixed(5)}`
                        : ' · location sealed'}
                      {row.accuracyM != null && Number.isFinite(row.accuracyM)
                        ? ` · ±${Math.round(row.accuracyM)}m`
                        : ''}
                    </span>
                  </div>
                  <span
                    className={
                      row.source === 'live'
                        ? 'timeline-badge live'
                        : 'timeline-badge'
                    }
                  >
                    {sourceLabel(row.source)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
