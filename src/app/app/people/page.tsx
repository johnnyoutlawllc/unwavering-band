'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  acceptRelationship,
  declineRelationship,
  endRelationship,
  getRelationshipRequesterId,
  inviteByEmail,
  listRelationships,
  PRIVACY_HELP,
  PRIVACY_LABELS,
  updateMyShares,
} from '@/lib/relationships';
import {
  claimPendingKeyPackages,
  deliverRelationshipKey,
  publishMyShares,
} from '@/lib/shares';
import { listPlaces } from '@/lib/history';
import type { PrivacyTier, RelationshipRow } from '@/lib/supabase';
import { useVault } from '@/lib/vault';

export default function PeoplePage() {
  const { keys } = useVault();
  const [rows, setRows] = useState<RelationshipRow[]>([]);
  const [email, setEmail] = useState('');
  const [myShares, setMyShares] = useState<PrivacyTier>('distance');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acceptFor, setAcceptFor] = useState<RelationshipRow | null>(null);
  const [acceptShares, setAcceptShares] = useState<PrivacyTier>('distance');

  async function reload() {
    try {
      if (keys) await claimPendingKeyPackages(keys);
      setRows(await listRelationships());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load people.');
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  async function onInvite(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await inviteByEmail(email, myShares);
      setEmail('');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invite failed.');
    }
    setBusy(false);
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>People</h1>
        <p>
          Invite someone who already has an account. Both of you must unlock
          encryption before a distance chart can open.
        </p>
      </header>

      <form className="invite-form" onSubmit={onInvite}>
        <label className="fieldset">
          <span className="field-label">Their email</span>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="friend@example.com"
          />
        </label>
        <label className="fieldset">
          <span className="field-label">What they can see of you</span>
          <select
            className="input"
            value={myShares}
            onChange={(e) => setMyShares(e.target.value as PrivacyTier)}
          >
            {(Object.keys(PRIVACY_LABELS) as PrivacyTier[]).map((t) => (
              <option key={t} value={t}>
                {PRIVACY_LABELS[t]}
              </option>
            ))}
          </select>
          <span className="field-help">{PRIVACY_HELP[myShares]}</span>
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Sending' : 'Invite'}
        </button>
      </form>

      {error ? <p className="error">{error}</p> : null}

      <section className="subpanel">
        <h2>Your relationships</h2>
        {rows.length === 0 ? (
          <p className="field-help">Nobody yet. Invite someone to begin.</p>
        ) : (
          <ul className="people-list">
            {rows.map((r) => (
              <li key={r.id}>
                <div className="people-main">
                  <strong>{r.peer_name}</strong>
                  <span className="muted">
                    {r.status}
                    {r.peer_email ? ` · ${r.peer_email}` : ''}
                  </span>
                  <span className="muted">
                    You share: {PRIVACY_LABELS[r.my_shares]} · They share:{' '}
                    {PRIVACY_LABELS[r.their_shares]}
                  </span>
                </div>
                <div className="people-actions">
                  {r.status === 'pending' && !r.i_am_requester ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          setAcceptFor(r);
                          setAcceptShares('distance');
                        }}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="btn"
                        onClick={async () => {
                          await declineRelationship(r.id);
                          await reload();
                        }}
                      >
                        Decline
                      </button>
                    </>
                  ) : null}
                  {r.status === 'pending' && r.i_am_requester ? (
                    <span className="muted">Waiting on them</span>
                  ) : null}
                  {r.status === 'accepted' ? (
                    <>
                      <Link className="btn btn-primary" href={`/app/people/${r.id}`}>
                        Distance over time
                      </Link>
                      <select
                        className="input compact"
                        value={r.my_shares}
                        onChange={async (e) => {
                          await updateMyShares(r.id, e.target.value as PrivacyTier);
                          await reload();
                        }}
                        aria-label="What they can see of you"
                      >
                        {(Object.keys(PRIVACY_LABELS) as PrivacyTier[]).map((t) => (
                          <option key={t} value={t}>
                            {PRIVACY_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-quiet"
                        onClick={async () => {
                          await endRelationship(r.id);
                          await reload();
                        }}
                      >
                        End
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {acceptFor ? (
        <div className="overlay" onClick={() => setAcceptFor(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Accept {acceptFor.peer_name}</h2>
            <p className="field-help">
              Choose what {acceptFor.peer_name} can see. Accepting also creates
              an encrypted channel between you two.
            </p>
            <label className="fieldset">
              <span className="field-label">Privacy</span>
              <select
                className="input"
                value={acceptShares}
                onChange={(e) => setAcceptShares(e.target.value as PrivacyTier)}
              >
                {(Object.keys(PRIVACY_LABELS) as PrivacyTier[]).map((t) => (
                  <option key={t} value={t}>
                    {PRIVACY_LABELS[t]}
                  </option>
                ))}
              </select>
              <span className="field-help">{PRIVACY_HELP[acceptShares]}</span>
            </label>
            <div className="row">
              <button type="button" className="btn" onClick={() => setAcceptFor(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  if (!keys) return;
                  try {
                    await acceptRelationship(acceptFor.id, acceptShares);
                    const requesterId =
                      acceptFor.peer_id ||
                      (await getRelationshipRequesterId(acceptFor.id));
                    if (!requesterId) throw new Error('Missing requester.');
                    await deliverRelationshipKey(keys, acceptFor.id, requesterId);
                    const places = await listPlaces(keys);
                    await publishMyShares({
                      keys,
                      relationshipId: acceptFor.id,
                      myShares: acceptShares,
                      places,
                    });
                    setAcceptFor(null);
                    await reload();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Accept failed.');
                    setAcceptFor(null);
                  }
                }}
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
