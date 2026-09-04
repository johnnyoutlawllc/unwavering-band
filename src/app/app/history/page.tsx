'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { HistoryHeatmap } from '@/components/HistoryHeatmap';
import {
  createPlace,
  deletePlace,
  historySummary,
  listHistoryMapPoints,
  listPlaces,
  matchPlace,
  type HistoryMapPoint,
} from '@/lib/history';
import type { PlaceRow } from '@/lib/supabase';
import { useVault } from '@/lib/vault';

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function sourceLabel(source: HistoryMapPoint['source']): string {
  if (source === 'visit') return 'Place visit';
  if (source === 'trip_start') return 'Trip start';
  return 'Trip end';
}

function dateRangeNote(first: string | null, last: string | null): string {
  if (!first || !last) return 'No dated records';
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
  return `${fmt.format(new Date(first))} to ${fmt.format(new Date(last))}`;
}

export default function HistoryPage() {
  const { keys } = useVault();
  const [points, setPoints] = useState<HistoryMapPoint[]>([]);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [summary, setSummary] = useState<{
    visitCount: number;
    earliest: string | null;
    latest: string | null;
    importCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<HistoryMapPoint | null>(null);
  const [naming, setNaming] = useState(false);
  const [placeName, setPlaceName] = useState('');
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  async function reload() {
    if (!keys) return;
    setLoading(true);
    try {
      const [p, pl, s] = await Promise.all([
        listHistoryMapPoints(keys),
        listPlaces(keys),
        historySummary(),
      ]);
      setPoints(p);
      setPlaces(pl);
      setSummary(s);
      if (p.length) {
        setFrom((prev) => prev || dayOf(p[0].occurredAt));
        setTo((prev) => prev || dayOf(p[p.length - 1].occurredAt));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  const firstDay = points[0] ? dayOf(points[0].occurredAt) : '';
  const lastDay = points.length ? dayOf(points[points.length - 1].occurredAt) : '';

  const filtered = useMemo(
    () =>
      points.filter((point) => {
        const day = dayOf(point.occurredAt);
        return (!from || day >= from) && (!to || day <= to);
      }),
    [from, points, to],
  );

  const bounds = useMemo(() => {
    if (!filtered.length) return null;
    const lats = filtered.map((p) => p.lat);
    const lngs = filtered.map((p) => p.lng);
    let south = Math.min(...lats);
    let north = Math.max(...lats);
    let west = Math.min(...lngs);
    let east = Math.max(...lngs);
    const latPad = Math.max((north - south) * 0.08, 0.002);
    const lonPad = Math.max((east - west) * 0.08, 0.002);
    south -= latPad;
    north += latPad;
    west -= lonPad;
    east += lonPad;
    return { south, north, west, east };
  }, [filtered]);

  const uniqueDays = useMemo(
    () => new Set(filtered.map((p) => dayOf(p.occurredAt))).size,
    [filtered],
  );
  const visitCount = filtered.filter((p) => p.source === 'visit').length;
  const tripCount = filtered.filter((p) => p.source !== 'visit').length;

  const selectedPlace =
    selected && selected.source === 'visit'
      ? matchPlace(places, selected.lat, selected.lng)
      : null;

  const dayBars = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const point of filtered) {
      const day = dayOf(point.occurredAt);
      grouped.set(day, (grouped.get(day) ?? 0) + 1);
    }
    return [...grouped.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filtered]);
  const dayMax = Math.max(1, ...dayBars.map((r) => r.count));

  async function onNamePlace(e: FormEvent) {
    e.preventDefault();
    if (!keys || !selected || !placeName.trim()) return;
    setBusy(true);
    try {
      await createPlace(keys, {
        name: placeName,
        lat: selected.lat,
        lng: selected.lng,
      });
      setNaming(false);
      setPlaceName('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save place.');
    }
    setBusy(false);
  }

  function resetFilters() {
    setFrom(firstDay);
    setTo(lastDay);
    setSelected(null);
  }

  return (
    <div className="panel history-panel">
      <header className="panel-head">
        <h1>Your history</h1>
        <p>
          Visits and trips from your imported timeline, decrypted only on this
          device. Zoom in to inspect a point, then name the places that matter.
        </p>
      </header>

      <div className="history-filters">
        <label className="fieldset compact-field">
          <span className="field-label">From</span>
          <input
            className="input"
            type="date"
            value={from}
            min={firstDay || undefined}
            max={to || lastDay || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              setSelected(null);
            }}
          />
        </label>
        <label className="fieldset compact-field">
          <span className="field-label">To</span>
          <input
            className="input"
            type="date"
            value={to}
            min={from || firstDay || undefined}
            max={lastDay || undefined}
            onChange={(e) => {
              setTo(e.target.value);
              setSelected(null);
            }}
          />
        </label>
        <button type="button" className="btn" onClick={resetFilters}>
          Reset
        </button>
      </div>
      <p className="field-help history-privacy-note">
        Coordinates stay on this device after decryption. The basemap provider
        only receives the visible map tile requests, not your stored history.
      </p>

      <div className="stat-row">
        <div className="stat">
          <strong>{filtered.length.toLocaleString()}</strong>
          <span>mapped points</span>
        </div>
        <div className="stat">
          <strong>{visitCount.toLocaleString()}</strong>
          <span>place visits</span>
        </div>
        <div className="stat">
          <strong>{tripCount.toLocaleString()}</strong>
          <span>trip endpoints</span>
        </div>
        <div className="stat">
          <strong>{uniqueDays.toLocaleString()}</strong>
          <span>
            days
            {filtered.length
              ? ` · ${dateRangeNote(filtered[0].occurredAt, filtered.at(-1)?.occurredAt ?? null)}`
              : ''}
          </span>
        </div>
        {summary ? (
          <div className="stat">
            <strong>{places.length}</strong>
            <span>
              named places · {summary.importCount} import
              {summary.importCount === 1 ? '' : 's'}
            </span>
          </div>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p className="field-help">Decrypting history…</p> : null}

      <section className="history-map-card">
        <div className="history-map-card-head">
          <h2>Location history heatmap</h2>
          <p>
            Brighter areas represent more activity. Zoom to neighborhood level
            to reveal individual, clickable records.
          </p>
        </div>
        <div className="history-map-frame">
          {bounds ? (
            <>
              <HistoryHeatmap
                points={filtered}
                places={places}
                bounds={bounds}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
              />
              {selected ? (
                <div className="history-point-card">
                  <strong>
                    {selectedPlace?.name ??
                      selected.semanticType ??
                      sourceLabel(selected.source)}
                  </strong>
                  <div>{new Date(selected.occurredAt).toLocaleString()}</div>
                  {selected.endTime && selected.source === 'visit' ? (
                    <div className="muted">
                      Until {new Date(selected.endTime).toLocaleString()}
                    </div>
                  ) : null}
                  <div className="muted">
                    {sourceLabel(selected.source)}
                    {selected.activityType ? ` · ${selected.activityType}` : ''}
                  </div>
                  <div className="muted">
                    {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
                    {selected.distanceMeters != null
                      ? ` · ${Math.round(selected.distanceMeters)} m trip`
                      : ''}
                  </div>
                  {selected.placeId ? (
                    <div className="muted">Google place {selected.placeId}</div>
                  ) : null}
                  {!selectedPlace ? (
                    <button
                      type="button"
                      className="btn btn-primary history-point-action"
                      onClick={() => {
                        setNaming(true);
                        setPlaceName(selected.semanticType ?? '');
                      }}
                    >
                      Name this place
                    </button>
                  ) : (
                    <div className="muted">Labeled {selectedPlace.name}</div>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <div className="history-map-empty">
              {points.length === 0
                ? 'No map-ready Timeline coordinates yet. Open Settings and upload a Google Timeline export.'
                : 'No locations match the selected filters.'}
            </div>
          )}
        </div>
      </section>

      {dayBars.length > 0 ? (
        <section className="subpanel">
          <h2>Activity by day</h2>
          <p className="field-help">Location records for the current date range.</p>
          <div className="history-day-bars">
            {dayBars.slice(-40).map((row) => (
              <div key={row.label} className="history-day-bar-row">
                <span className="history-day-bar-label">{row.label}</span>
                <div className="history-day-bar-track">
                  <div
                    className="history-day-bar-fill"
                    style={{ width: `${Math.max(4, (row.count / dayMax) * 100)}%` }}
                  />
                </div>
                <strong>{row.count}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {places.length > 0 ? (
        <section className="subpanel">
          <h2>Named places</h2>
          <ul className="place-list">
            {places.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <span className="muted">
                    {p.lat.toFixed(4)}, {p.lng.toFixed(4)} · {Math.round(p.radius_m)}m
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-quiet"
                  onClick={async () => {
                    await deletePlace(p.id);
                    await reload();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {naming && selected ? (
        <div className="overlay" onClick={() => setNaming(false)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onNamePlace}
          >
            <h2 className="modal-title">Name this place</h2>
            <p className="field-help">
              Saved encrypted against {selected.lat.toFixed(5)},{' '}
              {selected.lng.toFixed(5)}.
            </p>
            <label className="fieldset">
              <span className="field-label">Name</span>
              <input
                className="input"
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                placeholder="Home, work, the lake"
                required
                autoFocus
              />
            </label>
            <div className="row">
              <button type="button" className="btn" onClick={() => setNaming(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
