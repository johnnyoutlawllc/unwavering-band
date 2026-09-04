'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { DistanceChart } from '@/components/DistanceChart';
import { listPlaces } from '@/lib/history';
import { listRelationships, PRIVACY_LABELS } from '@/lib/relationships';
import {
  buildEncryptedDistanceSeries,
  claimPendingKeyPackages,
  publishMyShares,
} from '@/lib/shares';
import type { DistancePoint, RelationshipRow } from '@/lib/supabase';
import { useVault } from '@/lib/vault';

export default function RelationshipPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { keys } = useVault();
  const [rel, setRel] = useState<RelationshipRow | null>(null);
  const [points, setPoints] = useState<DistancePoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('Loading…');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!keys) return;
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
        setStatus('Publishing your encrypted daily shares…');
        const places = await listPlaces(keys);
        await publishMyShares({
          keys,
          relationshipId: id,
          myShares: found.my_shares,
          places,
        });
        setStatus('Building distance series…');
        const series = await buildEncryptedDistanceSeries({
          keys,
          relationshipId: id,
          peerId: found.peer_id,
          theirShares: found.their_shares,
        });
        if (!cancelled) {
          setPoints(series);
          setError(null);
          setStatus('');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load chart.');
          setStatus('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, keys]);

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
          </p>
        ) : (
          <p>Loading the distance between two bands.</p>
        )}
      </header>

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
    </div>
  );
}
