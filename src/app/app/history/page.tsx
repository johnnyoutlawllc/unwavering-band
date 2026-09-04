'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createPlace,
  deletePlace,
  historySummary,
  listPlaces,
  listRecentVisits,
  matchPlace,
} from '@/lib/history';
import type { PlaceRow, VisitSegment } from '@/lib/supabase';
import { useVault } from '@/lib/vault';

export default function HistoryPage() {
  const { keys } = useVault();
  const [visits, setVisits] = useState<VisitSegment[]>([]);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [summary, setSummary] = useState<{
    visitCount: number;
    earliest: string | null;
    latest: string | null;
    importCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState<VisitSegment | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [busy, setBusy] = useState(false);

  async function reload() {
    if (!keys) return;
    try {
      const [v, p, s] = await Promise.all([
        listRecentVisits(keys, 150),
        listPlaces(keys),
        historySummary(),
      ]);
      setVisits(v);
      setPlaces(p);
      setSummary(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load history.');
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  const rows = useMemo(
    () =>
      visits.map((v) => ({
        visit: v,
        place:
          v.lat != null && v.lng != null ? matchPlace(places, v.lat, v.lng) : null,
      })),
    [visits, places],
  );

  async function onNamePlace(e: FormEvent) {
    e.preventDefault();
    if (!keys || !naming?.lat || naming.lng == null || !placeName.trim()) return;
    setBusy(true);
    try {
      await createPlace(keys, {
        name: placeName,
        lat: naming.lat,
        lng: naming.lng,
      });
      setNaming(null);
      setPlaceName('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save place.');
    }
    setBusy(false);
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>Your history</h1>
        <p>
          Visits from your imported timeline, decrypted only on this device.
          Name the places that matter.
        </p>
      </header>

      {summary ? (
        <div className="stat-row">
          <div className="stat">
            <strong>{summary.visitCount.toLocaleString()}</strong>
            <span>visits</span>
          </div>
          <div className="stat">
            <strong>{summary.importCount}</strong>
            <span>imports</span>
          </div>
          <div className="stat">
            <strong>{places.length}</strong>
            <span>named places</span>
          </div>
        </div>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

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

      <section className="subpanel">
        <h2>Recent visits</h2>
        {rows.length === 0 ? (
          <p className="field-help">
            No visits yet. Open Settings and upload a Google Timeline export
            (`location-history.json`).
          </p>
        ) : (
          <ul className="visit-list">
            {rows.map(({ visit, place }) => (
              <li key={visit.id}>
                <div>
                  <strong>
                    {place?.name ??
                      visit.semantic_type ??
                      (visit.lat != null
                        ? `${visit.lat.toFixed(3)}, ${visit.lng!.toFixed(3)}`
                        : 'Unknown')}
                  </strong>
                  <span className="muted">
                    {new Date(visit.start_time).toLocaleString()}
                    {visit.end_time
                      ? ` → ${new Date(visit.end_time).toLocaleTimeString()}`
                      : ''}
                  </span>
                </div>
                {visit.lat != null && visit.lng != null && !place ? (
                  <button
                    type="button"
                    className="btn-quiet"
                    onClick={() => {
                      setNaming(visit);
                      setPlaceName(visit.semantic_type ?? '');
                    }}
                  >
                    Name this place
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {naming ? (
        <div className="overlay" onClick={() => setNaming(null)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onNamePlace}
          >
            <h2 className="modal-title">Name this place</h2>
            <p className="field-help">
              Saved encrypted against {naming.lat?.toFixed(5)},{' '}
              {naming.lng?.toFixed(5)}.
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
