'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { HistoryHeatmap, type MapBounds } from '@/components/HistoryHeatmap';
import { enrichCoordsWithLocality } from '@/lib/geo-enrich';
import {
  OWN_HISTORY_COLOR,
  colorForPeer,
  createPlace,
  deletePlace,
  historySummary,
  listHistoryMapPoints,
  listPlaces,
  matchPlace,
  updatePlaceName,
  type HistoryMapPoint,
} from '@/lib/history';
import { listRelationships, PRIVACY_LABELS } from '@/lib/relationships';
import {
  claimPendingKeyPackages,
  loadPeerHistoryMapPoints,
} from '@/lib/shares';
import type { PlaceRow, RelationshipRow } from '@/lib/supabase';
import { useVault } from '@/lib/vault';

const OVERLAY_KEY = 'ub_history_overlay_people';
const COLORS_KEY = 'ub_history_person_colors';
const MAP_MODE_KEY = 'ub_history_map_mode';

type MapMode = 'shared' | 'split';

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function sourceLabel(source: HistoryMapPoint['source']): string {
  if (source === 'visit') return 'Place visit';
  if (source === 'trip_start') return 'Trip start';
  if (source === 'peer_day') return 'Shared day';
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

function personKey(point: HistoryMapPoint): string {
  return point.personId ?? 'me';
}

function boundsFor(points: HistoryMapPoint[]): MapBounds | null {
  if (!points.length) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  let south = Math.min(...lats);
  let north = Math.max(...lats);
  let west = Math.min(...lngs);
  let east = Math.max(...lngs);
  const latPad = Math.max((north - south) * 0.08, 0.002);
  const lonPad = Math.max((east - west) * 0.08, 0.002);
  return {
    south: south - latPad,
    north: north + latPad,
    west: west - lonPad,
    east: east + lonPad,
  };
}

type PersonSlice = {
  id: string;
  name: string;
  color: string;
  days: number;
};

type RankRow = {
  label: string;
  days: number;
  byPerson: PersonSlice[];
};

function daysByLabel(
  points: HistoryMapPoint[],
  pick: (p: HistoryMapPoint) => string,
): RankRow[] {
  const grouped = new Map<
    string,
    Map<string, { name: string; color: string; days: Set<string> }>
  >();
  for (const point of points) {
    const label = pick(point);
    const pid = personKey(point);
    const people = grouped.get(label) ?? new Map();
    const cur = people.get(pid) ?? {
      name: point.personName ?? 'You',
      color: point.color || OWN_HISTORY_COLOR,
      days: new Set<string>(),
    };
    cur.days.add(dayOf(point.occurredAt));
    people.set(pid, cur);
    grouped.set(label, people);
  }
  return [...grouped.entries()]
    .map(([label, people]) => {
      const byPerson = [...people.entries()]
        .map(([id, row]) => ({
          id,
          name: row.name,
          color: row.color,
          days: row.days.size,
        }))
        .sort((a, b) => b.days - a.days);
      const allDays = new Set<string>();
      for (const point of points) {
        if (pick(point) === label) allDays.add(dayOf(point.occurredAt));
      }
      return { label, days: allDays.size, byPerson };
    })
    .sort((a, b) => b.days - a.days || a.label.localeCompare(b.label))
    .slice(0, 12);
}

type NamingTarget =
  | { kind: 'point'; point: HistoryMapPoint }
  | { kind: 'place'; place: PlaceRow };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function HistoryPage() {
  const { keys } = useVault();
  const [ownPoints, setOwnPoints] = useState<HistoryMapPoint[]>([]);
  const [peerPoints, setPeerPoints] = useState<HistoryMapPoint[]>([]);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [people, setPeople] = useState<RelationshipRow[]>([]);
  const [overlayIds, setOverlayIds] = useState<string[]>([]);
  const [personColors, setPersonColors] = useState<Record<string, string>>({});
  const [mapMode, setMapMode] = useState<MapMode>('shared');
  const [peerNotes, setPeerNotes] = useState<string[]>([]);
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

  function colorOf(personId: string, fallback: string): string {
    const custom = personColors[personId];
    if (custom && /^#[0-9a-fA-F]{6}$/.test(custom)) return custom;
    return fallback;
  }

  const points = useMemo(() => {
    const own = ownPoints.map((p) => ({
      ...p,
      color: colorOf('me', OWN_HISTORY_COLOR),
    }));
    const peers = peerPoints.map((p) => ({
      ...p,
      color: colorOf(p.personId ?? 'peer', p.color || OWN_HISTORY_COLOR),
    }));
    return [...own, ...peers];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownPoints, peerPoints, personColors]);

  const legend = useMemo(() => {
    const rows = [{ id: 'me', name: 'You', color: colorOf('me', OWN_HISTORY_COLOR) }];
    for (const [index, rel] of people.entries()) {
      if (!overlayIds.includes(rel.id)) continue;
      rows.push({
        id: rel.peer_id,
        name: rel.peer_name,
        color: colorOf(rel.peer_id, colorForPeer(rel.peer_band_color, index)),
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayIds, people, personColors]);

  async function reloadOwn() {
    if (!keys) return;
    setLoading(true);
    setGeoStatus('');
    try {
      const [p, pl, s, rels] = await Promise.all([
        listHistoryMapPoints(keys),
        listPlaces(keys),
        historySummary(),
        listRelationships(),
      ]);
      const accepted = rels.filter((r) => r.status === 'accepted');
      setPeople(accepted);
      const tagged = p.map((row) => ({
        ...row,
        personId: null,
        personName: 'You',
        color: OWN_HISTORY_COLOR,
      }));
      setOwnPoints(tagged);
      setPlaces(pl);
      setSummary(s);
      if (p.length) {
        setFrom((prev) => prev || dayOf(p[0].occurredAt));
        setTo((prev) => prev || dayOf(p[p.length - 1].occurredAt));
      }
      setError(null);

      setGeoStatus('Looking up city and state labels…');
      const enriched = await enrichCoordsWithLocality(tagged);
      setOwnPoints(
        enriched.map((row) => ({
          ...row,
          personId: null,
          personName: 'You',
          color: OWN_HISTORY_COLOR,
        })),
      );
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
    const overlays = readJson<string[]>(OVERLAY_KEY, []);
    setOverlayIds(Array.isArray(overlays) ? overlays.filter((x) => typeof x === 'string') : []);
    const colors = readJson<Record<string, string>>(COLORS_KEY, {});
    setPersonColors(colors && typeof colors === 'object' ? colors : {});
    const mode = readJson<MapMode>(MAP_MODE_KEY, 'shared');
    setMapMode(mode === 'split' ? 'split' : 'shared');
  }, []);

  useEffect(() => {
    reloadOwn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  useEffect(() => {
    let cancelled = false;
    async function loadPeers() {
      if (!keys || overlayIds.length === 0) {
        setPeerPoints([]);
        setPeerNotes([]);
        return;
      }
      try {
        await claimPendingKeyPackages(keys);
        const notes: string[] = [];
        const collected: HistoryMapPoint[] = [];
        for (const [index, rel] of people.entries()) {
          if (!overlayIds.includes(rel.id)) continue;
          const fallback = colorForPeer(rel.peer_band_color, index);
          const color = colorOf(rel.peer_id, fallback);
          const result = await loadPeerHistoryMapPoints({
            keys,
            relationshipId: rel.id,
            peerId: rel.peer_id,
            peerName: rel.peer_name,
            theirShares: rel.their_shares,
            color,
          });
          if (result.blockedReason) notes.push(result.blockedReason);
          collected.push(...result.points);
        }
        if (cancelled) return;
        if (collected.length) {
          const enriched = await enrichCoordsWithLocality(collected);
          if (cancelled) return;
          setPeerPoints(
            enriched.map((row, i) => ({
              ...row,
              personId: collected[i]?.personId,
              personName: collected[i]?.personName,
              color: collected[i]?.color,
              source: 'peer_day' as const,
            })),
          );
        } else {
          setPeerPoints([]);
        }
        setPeerNotes(notes);
      } catch (e) {
        if (!cancelled) {
          setPeerNotes([
            e instanceof Error ? e.message : 'Could not load connected people.',
          ]);
          setPeerPoints([]);
        }
      }
    }
    void loadPeers();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, overlayIds, people]);

  function toggleOverlay(id: string) {
    setOverlayIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(OVERLAY_KEY, JSON.stringify(next));
      return next;
    });
  }

  function setPersonColor(personId: string, color: string) {
    setPersonColors((prev) => {
      const next = { ...prev, [personId]: color };
      localStorage.setItem(COLORS_KEY, JSON.stringify(next));
      return next;
    });
  }

  function setMapModePersist(mode: MapMode) {
    setMapMode(mode);
    localStorage.setItem(MAP_MODE_KEY, JSON.stringify(mode));
  }

  const sorted = useMemo(
    () => [...points].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    [points],
  );
  const firstDay = sorted[0] ? dayOf(sorted[0].occurredAt) : '';
  const lastDay = sorted.length ? dayOf(sorted[sorted.length - 1].occurredAt) : '';

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

  const bounds = useMemo(() => boundsFor(filtered), [filtered]);

  const mapSeries = useMemo(() => {
    return legend
      .map((row) => {
        const pts = filtered.filter((p) => personKey(p) === row.id);
        return { ...row, points: pts, bounds: boundsFor(pts) };
      })
      .filter((row) => row.points.length > 0);
  }, [filtered, legend]);

  const uniqueDays = useMemo(
    () => new Set(filtered.map((p) => dayOf(p.occurredAt))).size,
    [filtered],
  );
  const visitCount = filtered.filter(
    (p) => p.source === 'visit' || p.source === 'peer_day',
  ).length;
  const tripCount = filtered.filter(
    (p) => p.source === 'trip_start' || p.source === 'trip_end',
  ).length;

  const selectedPlace =
    selected != null && !selected.personId
      ? matchPlace(places, selected.lat, selected.lng)
      : null;

  const cityRows = useMemo(
    () =>
      daysByLabel(
        dateFiltered.filter((p) => {
          if (dayFocus && dayOf(p.occurredAt) !== dayFocus) return false;
          if (state && labelOr(p.state, 'State unavailable') !== state) return false;
          return true;
        }),
        (p) => labelOr(p.city, 'City unavailable'),
      ),
    [dateFiltered, dayFocus, state],
  );
  const stateRows = useMemo(
    () =>
      daysByLabel(
        dateFiltered.filter((p) => {
          if (dayFocus && dayOf(p.occurredAt) !== dayFocus) return false;
          if (city && labelOr(p.city, 'City unavailable') !== city) return false;
          return true;
        }),
        (p) => labelOr(p.state, 'State unavailable'),
      ),
    [city, dateFiltered, dayFocus],
  );
  const cityMax = Math.max(
    1,
    ...cityRows.flatMap((r) => r.byPerson.map((s) => s.days)),
  );
  const stateMax = Math.max(
    1,
    ...stateRows.flatMap((r) => r.byPerson.map((s) => s.days)),
  );

  const dayBars = useMemo(() => {
    const grouped = new Map<
      string,
      Map<string, { name: string; color: string; count: number }>
    >();
    for (const point of filtered) {
      const day = dayOf(point.occurredAt);
      const pid = personKey(point);
      const peopleMap = grouped.get(day) ?? new Map();
      const cur = peopleMap.get(pid) ?? {
        name: point.personName ?? 'You',
        color: point.color || OWN_HISTORY_COLOR,
        count: 0,
      };
      cur.count += 1;
      peopleMap.set(pid, cur);
      grouped.set(day, peopleMap);
    }
    return [...grouped.entries()]
      .map(([label, peopleMap]) => {
        const slices = [...peopleMap.entries()].map(([id, row]) => ({
          id,
          name: row.name,
          color: row.color,
          count: row.count,
        }));
        const count = slices.reduce((n, s) => n + s.count, 0);
        return { label, count, slices };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [filtered]);
  const dayMax = Math.max(
    1,
    ...dayBars.flatMap((r) => r.slices.map((s) => s.count)),
  );

  const listPoints = useMemo(() => {
    const visits = filtered.filter(
      (p) => p.source === 'visit' || p.source === 'peer_day',
    );
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
        if (naming.point.personId) {
          throw new Error('You can only name your own places.');
        }
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
      await reloadOwn();
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

  function selectAndFocus(point: HistoryMapPoint) {
    setSelected(point);
  }

  function openNamePoint(point: HistoryMapPoint) {
    if (point.personId) return;
    setSelected(point);
    const existing = matchPlace(places, point.lat, point.lng);
    if (existing) {
      setNaming({ kind: 'place', place: existing });
      setPlaceName(existing.name);
    } else {
      setNaming({ kind: 'point', point });
      setPlaceName(point.semanticType ?? point.city ?? '');
    }
  }

  function pickCity(label: string) {
    setCity((v) => (v === label ? null : label));
    setDayFocus(null);
    setSelected(null);
  }

  function pickState(label: string) {
    setState((v) => (v === label ? null : label));
    setDayFocus(null);
    setSelected(null);
  }

  function RankBars({
    rows,
    max,
    active,
    onPick,
  }: {
    rows: RankRow[];
    max: number;
    active: string | null;
    onPick: (label: string) => void;
  }) {
    if (rows.length === 0) {
      return <p className="field-help">No labels yet.</p>;
    }
    return (
      <div className="history-rank-groups">
        {rows.map((row) => (
          <div
            key={row.label}
            className={
              active === row.label
                ? 'history-rank-group active'
                : 'history-rank-group'
            }
          >
            <button
              type="button"
              className="history-rank-group-head"
              onClick={() => onPick(row.label)}
            >
              <span>{row.label}</span>
              <strong>{row.days}</strong>
            </button>
            <div className="history-side-bars">
              {row.byPerson.map((slice) => (
                <div key={slice.id} className="history-side-bar-row">
                  <span className="history-side-bar-name">{slice.name}</span>
                  <div className="history-day-bar-track">
                    <div
                      className="history-day-bar-fill"
                      style={{
                        width: `${Math.max(4, (slice.days / max) * 100)}%`,
                        background: slice.color,
                      }}
                    />
                  </div>
                  <strong>{slice.days}</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function PointCard() {
    if (!selected) return null;
    return (
      <div className="history-point-card">
        <strong>
          {selected.personName && selected.personId
            ? selected.personName
            : selectedPlace?.name ??
              selected.semanticType ??
              sourceLabel(selected.source)}
        </strong>
        <div>{new Date(selected.occurredAt).toLocaleString()}</div>
        {(selected.city || selected.state) && (
          <div className="muted">
            {[selected.city, selected.state].filter(Boolean).join(', ')}
          </div>
        )}
        {selected.semanticType && selected.personId ? (
          <div className="muted">{selected.semanticType}</div>
        ) : null}
        <div className="muted">
          {sourceLabel(selected.source)}
          {selected.activityType ? ` · ${selected.activityType}` : ''}
        </div>
        <div className="muted">
          {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
        </div>
        {!selected.personId ? (
          <button
            type="button"
            className="btn btn-primary history-point-action"
            onClick={() => openNamePoint(selected)}
          >
            {selectedPlace ? 'Rename place' : 'Name this place'}
          </button>
        ) : (
          <div className="muted">Shared by {selected.personName}</div>
        )}
      </div>
    );
  }

  return (
    <div className="panel history-panel">
      <header className="panel-head">
        <h1>Your history</h1>
        <p>
          Visits and trips from your imported timeline, decrypted only on this
          device. Add connected people, pick their colors, and view a shared map
          or one map each.
        </p>
      </header>

      <section className="history-people-card">
        <h2>People on this map</h2>
        <p className="field-help">
          Only people who share city or exact location can appear. Distance-only
          connections stay off the map.
        </p>

        <div className="history-map-mode">
          <span className="field-label">Map layout</span>
          <div className="history-mode-toggle">
            <button
              type="button"
              className={mapMode === 'shared' ? 'is-active' : undefined}
              onClick={() => setMapModePersist('shared')}
            >
              Shared map
            </button>
            <button
              type="button"
              className={mapMode === 'split' ? 'is-active' : undefined}
              onClick={() => setMapModePersist('split')}
            >
              Split maps
            </button>
          </div>
        </div>

        <ul className="history-people-toggles">
          <li>
            <label>
              <span className="history-you-label">You</span>
              <input
                type="color"
                className="history-color-input"
                value={colorOf('me', OWN_HISTORY_COLOR)}
                onChange={(e) => setPersonColor('me', e.target.value)}
                title="Your map color"
              />
            </label>
          </li>
          {people.length === 0 ? (
            <li className="field-help">
              No accepted connections yet. Invite someone from People.
            </li>
          ) : (
            people.map((rel, index) => {
              const fallback = colorForPeer(rel.peer_band_color, index);
              const color = colorOf(rel.peer_id, fallback);
              const on = overlayIds.includes(rel.id);
              const canMap = rel.their_shares !== 'distance';
              return (
                <li key={rel.id}>
                  <label className={canMap ? undefined : 'is-disabled'}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!canMap}
                      onChange={() => toggleOverlay(rel.id)}
                    />
                    <span>
                      <strong>{rel.peer_name}</strong>
                      <em>{PRIVACY_LABELS[rel.their_shares]}</em>
                    </span>
                    <input
                      type="color"
                      className="history-color-input"
                      value={color}
                      disabled={!canMap}
                      onChange={(e) => setPersonColor(rel.peer_id, e.target.value)}
                      title={`${rel.peer_name} map color`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </label>
                </li>
              );
            })
          )}
        </ul>
        {peerNotes.length > 0 ? (
          <ul className="history-peer-notes">
            {peerNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
      </section>

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

      <div className="history-map-layout">
        <div className="history-map-main">
          {mapMode === 'shared' ? (
            <section className="history-map-card">
              <div className="history-map-card-head">
                <h2>Location history heatmap</h2>
                <p>
                  Shared view. Click a location beside the map, or a city or
                  state below, to zoom and filter.
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
                      focusPoint={selected}
                      onSelect={selectAndFocus}
                    />
                    <PointCard />
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
          ) : (
            <div className="history-split-maps">
              {mapSeries.length === 0 ? (
                <div className="history-map-empty">
                  No locations match the selected filters.
                </div>
              ) : (
                mapSeries.map((series) =>
                  series.bounds ? (
                    <section key={series.id} className="history-map-card">
                      <div className="history-map-card-head">
                        <h2>
                          <i
                            className="history-loc-swatch"
                            style={{ background: series.color }}
                          />{' '}
                          {series.name}
                        </h2>
                        <p>
                          {series.points.length.toLocaleString()} points in the
                          current filters.
                        </p>
                      </div>
                      <div className="history-map-frame history-map-frame-split">
                        <HistoryHeatmap
                          points={series.points}
                          places={series.id === 'me' ? places : []}
                          bounds={series.bounds}
                          selectedId={selected?.id ?? null}
                          focusPoint={
                            selected && personKey(selected) === series.id
                              ? selected
                              : null
                          }
                          onSelect={selectAndFocus}
                        />
                        {selected && personKey(selected) === series.id ? (
                          <PointCard />
                        ) : null}
                      </div>
                    </section>
                  ) : null,
                )
              )}
            </div>
          )}
        </div>

        <aside className="history-locations-side">
          <h2>Locations in view</h2>
          <p className="field-help">
            {listPoints.length.toLocaleString()} location
            {listPoints.length === 1 ? '' : 's'} matching the current filters.
            Click one to zoom and mark it on the map.
          </p>
          {listPoints.length === 0 ? (
            <p className="field-help">No locations in this filter.</p>
          ) : (
            <ul className="visit-list history-locations-list">
              {listPoints.map((point) => {
                const place = !point.personId
                  ? matchPlace(places, point.lat, point.lng)
                  : null;
                return (
                  <li
                    key={point.id}
                    className={
                      selected?.id === point.id ? 'is-selected' : undefined
                    }
                  >
                    <button
                      type="button"
                      className="history-loc-main"
                      onClick={() => selectAndFocus(point)}
                    >
                      <strong>
                        <i
                          className="history-loc-swatch"
                          style={{
                            background: point.color || OWN_HISTORY_COLOR,
                          }}
                        />
                        {point.personName && point.personId
                          ? `${point.personName}`
                          : place?.name ??
                            point.semanticType ??
                            sourceLabel(point.source)}
                      </strong>
                      <span className="muted">
                        {new Date(point.occurredAt).toLocaleString()}
                        {point.city || point.state
                          ? ` · ${[point.city, point.state].filter(Boolean).join(', ')}`
                          : ''}
                        {point.semanticType && point.personId
                          ? ` · ${point.semanticType}`
                          : ''}
                        {` · ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`}
                      </span>
                    </button>
                    {!point.personId ? (
                      <button
                        type="button"
                        className="btn-quiet"
                        onClick={() => openNamePoint(point)}
                      >
                        {place ? 'Rename' : 'Name'}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      <div className="history-rank-grid">
        <section className="history-rank-card">
          <h2>Total days in city</h2>
          <p className="field-help">
            One bar per person. Select a city to zoom and filter the map and
            charts.
          </p>
          <RankBars
            rows={cityRows}
            max={cityMax}
            active={city}
            onPick={pickCity}
          />
        </section>
        <section className="history-rank-card">
          <h2>Total days in state</h2>
          <p className="field-help">
            One bar per person. Select a state to zoom and filter the map and
            charts.
          </p>
          <RankBars
            rows={stateRows}
            max={stateMax}
            active={state}
            onPick={pickState}
          />
        </section>
      </div>

      {dayBars.length > 0 ? (
        <section className="subpanel">
          <h2>Activity by day</h2>
          <p className="field-help">
            One bar per person. Select a day to focus the map.
          </p>
          <div className="history-rank-groups">
            {dayBars.slice(-40).map((row) => (
              <div
                key={row.label}
                className={
                  dayFocus === row.label
                    ? 'history-rank-group active'
                    : 'history-rank-group'
                }
              >
                <button
                  type="button"
                  className="history-rank-group-head"
                  onClick={() => {
                    setDayFocus((v) => (v === row.label ? null : row.label));
                    setSelected(null);
                  }}
                >
                  <span>{row.label}</span>
                  <strong>{row.count}</strong>
                </button>
                <div className="history-side-bars">
                  {row.slices.map((slice) => (
                    <div key={slice.id} className="history-side-bar-row">
                      <span className="history-side-bar-name">{slice.name}</span>
                      <div className="history-day-bar-track">
                        <div
                          className="history-day-bar-fill"
                          style={{
                            width: `${Math.max(4, (slice.count / dayMax) * 100)}%`,
                            background: slice.color,
                          }}
                        />
                      </div>
                      <strong>{slice.count}</strong>
                    </div>
                  ))}
                </div>
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
                      await reloadOwn();
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
