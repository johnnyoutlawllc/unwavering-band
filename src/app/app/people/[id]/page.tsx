'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DistanceChart } from '@/components/DistanceChart';
import { useAuth } from '@/lib/auth';
import { listPlaces } from '@/lib/history';
import { listRelationships, PRIVACY_LABELS } from '@/lib/relationships';
import {
  claimPendingKeyPackages,
  ensureDistanceReport,
  loadDistanceReport,
  reportRowsToPoints,
} from '@/lib/shares';
import type { DistancePoint, DistanceReportRow, RelationshipRow } from '@/lib/supabase';
import { useVault } from '@/lib/vault';
import { distanceLabel } from '@/lib/geo';

export default function RelationshipPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { keys } = useVault();
  const { user, displayName } = useAuth();
  const [rel, setRel] = useState<RelationshipRow | null>(null);
  const [points, setPoints] = useState<DistancePoint[]>([]);
  const [report, setReport] = useState<DistanceReportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading…');
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (force = false) => {
      if (!keys || !user) return;
      setBusy(true);
      try {
        setStatus('Claiming relationship keys…');
        await claimPendingKeyPackages(keys);
        const rows = await listRelationships();
        const found = rows.find((r) => r.id === id) ?? null;
        if (!found) throw new Error('Relationship not found.');
        if (found.status !== 'accepted') {
          throw new Error('This relationship is not accepted yet.');
        }
        setRel(found);

        if (!force) {
          const cached = await loadDistanceReport(id);
          if (cached.length > 0) {
            setReport(cached);
            setPoints(reportRowsToPoints(cached, user.id));
            setStatus('Checking for new days…');
          } else {
            setStatus('Publishing new encrypted days…');
          }
        } else {
          setStatus('Refreshing distance report…');
        }

        const places = await listPlaces(keys);
        const result = await ensureDistanceReport({
          keys,
          relationshipId: id,
          peerId: found.peer_id,
          peerName: found.peer_name,
          myName: displayName ?? 'You',
          iAmRequester: found.i_am_requester,
          myShares: found.my_shares,
          places,
          force,
        });
        const fresh = await loadDistanceReport(id);
        setReport(fresh);
        setPoints(result.points);
        setError(null);
        setStatus(
          result.fromCache
            ? ''
            : result.published > 0
              ? `Updated ${result.published} shared day${result.published === 1 ? '' : 's'}.`
              : '',
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load chart.');
        setStatus('');
      } finally {
        setBusy(false);
      }
    },
    [displayName, id, keys, user],
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  return (
    <div className="panel">
      <header className="panel-head">
        <p className="eyebrow">
          <Link href="/app/people">People</Link>
        </p>
        <h1>{rel ? `You and ${rel.peer_name}` : 'Distance over time'}</h1>
        {rel ? (
          <p>
            You share {PRIVACY_LABELS[rel.my_shares].toLowerCase()}. They share{' '}
            {PRIVACY_LABELS[rel.their_shares].toLowerCase()}. Coordinates stay
            encrypted; this device decrypts only what you are allowed to see.
            Overlapping days are stored in a per-relationship report so the chart
            does not rebuild from scratch every visit.
          </p>
        ) : (
          <p>Loading the distance between two bands.</p>
        )}
      </header>

      <div className="row" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className="btn"
          disabled={busy || !keys}
          onClick={() => void load(true)}
        >
          Refresh report
        </button>
      </div>

      {status ? <p className="field-help">{status}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {rel && !error ? (
        <DistanceChart points={points} peerName={rel.peer_name} />
      ) : null}

      {rel && points.length > 0 ? (
        <p className="field-help">
          {points.length.toLocaleString()} overlapping visit days · closest{' '}
          {Math.min(...points.map((p) => p.distance_km * 0.621371)).toFixed(1)} mi ·
          farthest{' '}
          {Math.max(...points.map((p) => p.distance_km * 0.621371)).toFixed(0)} mi
        </p>
      ) : null}

      {report.length > 0 ? (
        <section className="subpanel">
          <h2>Distance report</h2>
          <p className="field-help">
            Stored per relationship: date, distance, names, and place labels when
            privacy allows.
          </p>
          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Distance</th>
                  <th>You</th>
                  <th>{rel?.peer_name ?? 'Them'}</th>
                </tr>
              </thead>
              <tbody>
                {[...report].reverse().map((row) => {
                  const iAmRequester = user?.id === row.requester_id;
                  const myPlace = iAmRequester
                    ? row.requester_place
                    : row.addressee_place;
                  const theirPlace = iAmRequester
                    ? row.addressee_place
                    : row.requester_place;
                  const theirName = iAmRequester
                    ? row.addressee_name
                    : row.requester_name;
                  return (
                    <tr key={row.day}>
                      <td>{row.day}</td>
                      <td>{distanceLabel(row.distance_km)}</td>
                      <td>{myPlace ?? '—'}</td>
                      <td>
                        {theirName}
                        {theirPlace ? ` · ${theirPlace}` : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
