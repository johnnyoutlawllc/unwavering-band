'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { HistoryHeatmap } from '@/components/HistoryHeatmap';
import { enrichCoordsWithLocality } from '@/lib/geo-enrich';
import {
  createPlace,
  deletePlace,
  historySummary,
  listHistoryMapPoints,
  listPlaces,
  matchPlace,
  updatePlaceName,
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

function labelOr(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

type RankRow = { label: string; days: number };

function daysByLabel(
  points: HistoryMapPoint[],
  pick: (p: HistoryMapPoint) => string,
): RankRow[] {
  const grouped = new Map<string, Set<string>>();
  for (const point of points) {
    const label = pick(point);
    const days = grouped.get(label) ?? new Set<string>();
    days.add(dayOf(point.occurredAt));
    grouped.set(label, days);
  }
  return [...grouped.entries()]
    .map(([label, days]) => ({ label, days: days.size }))
    .sort((a, b) => b.days - a.days || a.label.localeCompare(b.label))
    .slice(0, 12);
}

type NamingTarget =
  | { kind: 'point'; point: HistoryMapPoint }
  | { kind: 'place'; place: PlaceRow };

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
  const [geoStatus, setGeoStatus] = useState('');
  const [selected, setSelected] = useState<HistoryMapPoint | null>(null);
  const [naming, setNaming] = useState<NamingTarget | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [dayFocus, setDayFocus] = useState<string | null>(null);

  async function reload() {
    if (!keys) return;
    setLoading(true);
    setGeoStatus('');
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

      setGeoStatus('Looking up city and state labels…');
      const enriched = await enrichCoordsWithLocality(p);
      setPoints(enriched);
      setGeoStatus(
        enriched.some((row) => row.city || row.state)
          ? ''
          : 'City labels unavailable yet (cache still filling).',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history.');
      setGeoStatus('');
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

  const dateFiltered = useMemo(
    () =>
      points.filter((point) => {
        const day = dayOf(point.occurredAt);
        return (!from || day >= from) && (!to || day <= to);
      }),
    [from, points, to],
  );

  const filtered = useMemo(
    () =>
      dateFiltered.filter((point) => {
        if (dayFocus && dayOf(point.occurredAt) !== dayFocus) return false;
        if (city && labelOr(point.city, 'City unavailable') !== city) return false;
        if (state && labelOr(point.state, 'State unavailable') !== state) return false;
        return true;
      }),
    [city, dateFiltered, dayFocus, state],
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
    selected != null ? matchPlace(places, selected.lat, selected.lng) : null;

  const cityRows = useMemo(
    () =>
      daysByLabel(
        dateFiltered.filter(
          (p) => !state || labelOr(p.state, 'State unavailable') === state,
        ),
        (p) => labelOr(p.city, 'City unavailable'),
      ),
    [dateFiltered, state],
  );
  const stateRows = useMemo(
    () =>
      daysByLabel(
        dateFiltered.filter(
          (p) => !city || labelOr(p.city, 'City unavailable') === city,
        ),
        (p) => labelOr(p.state, 'State unavailable'),
      ),
    [city, dateFiltered],
  );
  const cityMax = Math.max(1, ...cityRows.map((r) => r.days));
  const stateMax = Math.max(1, ...stateRows.map((r) => r.days));

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

  const listPoints = useMemo(() => {
    const visits = filtered.filter((p) => p.source === 'visit');
    return (visits.length ? visits : filtered).slice(0, 120);
  }, [filtered]);

  async function onSaveName(e: FormEvent) {
    e.preventDefault();
    if (!keys || !naming || !placeName.trim()) return;
    setBusy(true);
    try {
      if (naming.kind === 'place') {
        await updatePlaceName(naming.place.id, placeName);
      } else {
        const existing = matchPlace(places, naming.point.lat, naming.point.lng);
        if (existing) await updatePlaceName(existing.id, placeName);
        else {
          await createPlace(keys, {
            name: placeName,
            lat: naming.point.lat,
            lng: naming.point.lng,
          });
        }
      }
      setNaming(null);
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
    setCity(null);
    setState(null);
    setDayFocus(null);
    setSelected(null);
  }

  function openNamePoint(point: HistoryMapPoint) {
    const existing = matchPlace(places, point.lat, point.lng);
    if (existing) {
      setNaming({ kind: 'place', place: existing });
      setPlaceName(existing.name);
    } else {
      setNaming({ kind: 'point', point });
      setPlaceName(point.semanticType ?? point.city ?? '');
    }
  }

  return (
    <div className="panel history-panel">
      <header className="panel-head">
        <h1>Your history</h1>
        <p>
          Visits and trips from your imported timeline, decrypted only on this
          device. Filter by city or day, inspect a point on the map, and name
          the places that matter.
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
        {(city || state || dayFocus) && (
          <div className="history-filter-chips">
            {dayFocus ? (
              <button
                type="button"
                className="history-filter-chip"
                onClick={() => setDayFocus(null)}
              >
                Day: {dayFocus} ×
              </button>
            ) : null}
            {city ? (
              <button
                type="button"
                className="history-filter-chip"
                onClick={() => setCity(null)}
              >
                City: {city} ×
              </button>
            ) : null}
            {state ? (
              <button
                type="button"
                className="history-filter-chip"
                onClick={() => setState(null)}
              >
                State: {state} ×
              </button>
            ) : null}
          </div>
        )}
      </div>
      <p className="field-help history-privacy-note">
        Exact coordinates stay on this device. City and state labels use a shared
        cache of rounded cells (~1 km);{' '}
        <a href="https://locationiq.com" target="_blank" rel="noreferrer">
          LocationIQ
        </a>{' '}
        never sees your full history.
        {geoStatus ? ` ${geoStatus}` : ''}
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
            to reveal individual, clickable records. Select a city, state, or day
            below to filter.
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
                  {(selected.city || selected.state) && (
                    <div className="muted">
                      {[selected.city, selected.state].filter(Boolean).join(', ')}
                    </div>
                  )}
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
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary history-point-action"
                    onClick={() => openNamePoint(selected)}
                  >
                    {selectedPlace ? 'Rename place' : 'Name this place'}
                  </button>
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

      <div className="history-rank-grid">
        <section className="history-rank-card">
          <h2>Total days in city</h2>
          <p className="field-help">Select a bar to filter the map and list.</p>
          <div className="history-day-bars">
            {cityRows.length === 0 ? (
              <p className="field-help">No city labels yet.</p>
            ) : (
              cityRows.map((row) => (
                <button
                  key={row.label}
                  type="button"
                  className={
                    city === row.label
                      ? 'history-day-bar-row active'
                      : 'history-day-bar-row'
                  }
                  onClick={() => {
                    setCity((v) => (v === row.label ? null : row.label));
                    setSelected(null);
                  }}
                >
                  <span className="history-day-bar-label">{row.label}</span>
                  <div className="history-day-bar-track">
                    <div
                      className="history-day-bar-fill"
                      style={{
                        width: `${Math.max(4, (row.days / cityMax) * 100)}%`,
                      }}
                    />
                  </div>
                  <strong>{row.days}</strong>
                </button>
              ))
            )}
          </div>
        </section>
        <section className="history-rank-card">
          <h2>Total days in state</h2>
          <p className="field-help">Select a bar to filter the map and list.</p>
          <div className="history-day-bars">
            {stateRows.length === 0 ? (
              <p className="field-help">No state labels yet.</p>
            ) : (
              stateRows.map((row) => (
                <button
                  key={row.label}
                  type="button"
                  className={
                    state === row.label
                      ? 'history-day-bar-row active'
                      : 'history-day-bar-row'
                  }
                  onClick={() => {
                    setState((v) => (v === row.label ? null : row.label));
                    setSelected(null);
                  }}
                >
                  <span className="history-day-bar-label">{row.label}</span>
                  <div className="history-day-bar-track">
                    <div
                      className="history-day-bar-fill"
                      style={{
                        width: `${Math.max(4, (row.days / stateMax) * 100)}%`,
                      }}
                    />
                  </div>
                  <strong>{row.days}</strong>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {dayBars.length > 0 ? (
        <section className="subpanel">
          <h2>Activity by day</h2>
          <p className="field-help">
            Select a day to focus the map and show those locations below.
          </p>
          <div className="history-day-bars">
            {dayBars.slice(-40).map((row) => (
              <button
                key={row.label}
                type="button"
                className={
                  dayFocus === row.label
                    ? 'history-day-bar-row active'
                    : 'history-day-bar-row'
                }
                onClick={() => {
                  setDayFocus((v) => (v === row.label ? null : row.label));
                  setSelected(null);
                }}
              >
                <span className="history-day-bar-label">{row.label}</span>
                <div className="history-day-bar-track">
                  <div
                    className="history-day-bar-fill"
                    style={{ width: `${Math.max(4, (row.count / dayMax) * 100)}%` }}
                  />
                </div>
                <strong>{row.count}</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="subpanel">
        <h2>Locations in view</h2>
        <p className="field-help">
          {listPoints.length.toLocaleString()} location
          {listPoints.length === 1 ? '' : 's'} matching the current filters.
          Select one to highlight it on the map, then rename it.
        </p>
        {listPoints.length === 0 ? (
          <p className="field-help">No locations in this filter.</p>
        ) : (
          <ul className="visit-list">
            {listPoints.map((point) => {
              const place = matchPlace(places, point.lat, point.lng);
              return (
                <li
                  key={point.id}
                  className={selected?.id === point.id ? 'is-selected' : undefined}
                >
                  <button
                    type="button"
                    className="history-loc-main"
                    onClick={() => setSelected(point)}
                  >
                    <strong>
                      {place?.name ??
                        point.semanticType ??
                        sourceLabel(point.source)}
                    </strong>
                    <span className="muted">
                      {new Date(point.occurredAt).toLocaleString()}
                      {point.city || point.state
                        ? ` · ${[point.city, point.state].filter(Boolean).join(', ')}`
                        : ''}
                      {` · ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() => openNamePoint(point)}
                  >
                    {place ? 'Rename' : 'Name'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
                <div className="people-actions">
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() => {
                      setNaming({ kind: 'place', place: p });
                      setPlaceName(p.name);
                    }}
                  >
                    Rename
                  </button>
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
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {naming ? (
        <div className="overlay" onClick={() => setNaming(null)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSaveName}
          >
            <h2 className="modal-title">
              {naming.kind === 'place' ? 'Rename place' : 'Name this place'}
            </h2>
            <p className="field-help">
              {naming.kind === 'place'
                ? `Saved encrypted against ${naming.place.lat.toFixed(5)}, ${naming.place.lng.toFixed(5)}.`
                : `Saved encrypted against ${naming.point.lat.toFixed(5)}, ${naming.point.lng.toFixed(5)}.`}
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
              <button type="button" className="btn" onClick={() => setNaming(null)}>
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
