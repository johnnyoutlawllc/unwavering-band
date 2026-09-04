'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { DEFAULT_BAND_COLOR } from '@/lib/colors';
import { sealCoords } from '@/lib/crypto';
import { getPosition } from '@/lib/geo';
import { deleteMyAccount } from '@/lib/history';
import { parseLocationHistoryFile } from '@/lib/location-history';
import {
  listLocationImports,
  uploadLocationHistory,
  type ImportProgress,
  type LocationImportSummary,
} from '@/lib/location-import';
import { supabase, type UnwaveringUser } from '@/lib/supabase';
import { useVault } from '@/lib/vault';

const SWATCHES: Array<{ value: string | null; label: string }> = [
  { value: null, label: 'Orange and white, the default' },
  { value: '#6ee7ff', label: 'Cyan' },
  { value: '#a78bfa', label: 'Violet' },
  { value: '#ff6b8b', label: 'Rose' },
  { value: '#7dffb0', label: 'Green' },
  { value: '#f4f1ea', label: 'White' },
];

export default function SettingsPage() {
  const { user, profile, setProfile } = useAuth();
  const { keys, lock, unlocked } = useVault();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [imports, setImports] = useState<LocationImportSummary[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(profile?.display_name ?? '');
    setColor(profile?.band_color ?? null);
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    listLocationImports(user.id)
      .then(setImports)
      .catch((e) =>
        setImportError(e instanceof Error ? e.message : 'Could not load imports.'),
      );
  }, [user]);

  const sharing = profile?.location_sharing ?? false;

  async function save() {
    if (!user) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('users')
      .update({
        display_name: name.trim() || null,
        band_color: color,
      })
      .eq('id', user.id)
      .select()
      .single();
    if (err) setError(err.message);
    else {
      setProfile(data as UnwaveringUser);
      setSaved(true);
    }
    setBusy(false);
  }

  async function toggleSharing() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      if (sharing) {
        const { data, error: err } = await supabase
          .from('users')
          .update({
            location_sharing: false,
            location_opted_out_at: new Date().toISOString(),
            last_lat: null,
            last_lng: null,
            last_lat_cipher: null,
            last_lng_cipher: null,
            last_location_accuracy_m: null,
            last_location_at: null,
          })
          .eq('id', user.id)
          .select()
          .single();
        if (err) setError(err.message);
        else setProfile(data as UnwaveringUser);
      } else {
        const pos = await getPosition();
        const patch: Record<string, unknown> = {
          location_sharing: true,
          location_opted_in_at: new Date().toISOString(),
          location_opted_out_at: null,
          last_location_accuracy_m: pos.coords.accuracy,
          last_location_at: new Date().toISOString(),
        };
        if (keys) {
          const c = await sealCoords(keys.dek, pos.coords.latitude, pos.coords.longitude);
          patch.last_lat_cipher = c.lat_cipher;
          patch.last_lng_cipher = c.lng_cipher;
          patch.last_lat = null;
          patch.last_lng = null;
        } else {
          patch.last_lat = pos.coords.latitude;
          patch.last_lng = pos.coords.longitude;
        }
        const { data, error: err } = await supabase
          .from('users')
          .update(patch)
          .eq('id', user.id)
          .select()
          .single();
        if (err) setError(err.message);
        else setProfile(data as UnwaveringUser);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read your location.');
    }
    setBusy(false);
  }

  async function onPickTimeline(file: File | null) {
    if (!file || !user) return;
    if (!keys) {
      setImportError('Unlock encryption before importing.');
      return;
    }
    setImportBusy(true);
    setImportError(null);
    setImportProgress({
      phase: 'starting',
      message: 'Reading file…',
      segmentsDone: 0,
      segmentsTotal: 0,
      pointsDone: 0,
      pointsTotal: 0,
    });
    try {
      const parsed = await parseLocationHistoryFile(file);
      await uploadLocationHistory({
        userId: user.id,
        filename: file.name,
        byteSize: file.size,
        parsed,
        dek: keys.dek,
        onProgress: setImportProgress,
      });
      setImports(await listLocationImports(user.id));
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>Settings</h1>
        <p>Profile, encryption, live sharing, imports, and account deletion.</p>
      </header>

      <section className="subpanel">
        <h2>Encryption</h2>
        <p className="field-help">
          {unlocked
            ? 'Vault unlocked in this browser tab. Coordinates are sealed before storage.'
            : 'Vault locked.'}{' '}
          <Link href="/privacy">Privacy Policy</Link>
        </p>
        <button type="button" className="btn" onClick={() => lock()} disabled={!unlocked}>
          Lock vault
        </button>
      </section>

      <section className="subpanel">
        <label className="fieldset">
          <span className="field-label">Public profile name</span>
          <input
            className="input"
            type="text"
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
          />
        </label>

        <div className="fieldset">
          <span className="field-label">Band color</span>
          <div className="swatches">
            {SWATCHES.map((s) => (
              <button
                key={s.label}
                type="button"
                title={s.label}
                aria-label={s.label}
                className={`swatch${(color ?? null) === s.value ? ' selected' : ''}${
                  s.value === null ? ' blend' : ''
                }`}
                style={s.value === null ? undefined : { background: s.value }}
                onClick={() => {
                  setColor(s.value);
                  setSaved(false);
                }}
              />
            ))}
            <label
              className={`swatch custom${
                color !== null && !SWATCHES.some((s) => s.value === color)
                  ? ' selected'
                  : ''
              }`}
              title="Pick your own"
              style={
                color && !SWATCHES.some((s) => s.value === color)
                  ? { background: color }
                  : undefined
              }
            >
              <input
                type="color"
                value={color ?? DEFAULT_BAND_COLOR}
                onChange={(e) => {
                  setColor(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
          </div>
        </div>

        <div className="row">
          <div>
            <span className="field-label">Share where you are</span>
            <p className="field-help">
              Live presence for the Now canvas. Turning it off clears live
              coordinates.
            </p>
          </div>
          <button className="btn" onClick={toggleSharing} disabled={busy || importBusy}>
            {busy ? 'Working' : sharing ? 'Turn it off' : 'Turn it on'}
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <button className="btn btn-primary" onClick={save} disabled={busy || importBusy}>
          {busy ? 'Saving' : saved ? 'Saved' : 'Save profile'}
        </button>
      </section>

      <section className="subpanel">
        <h2>Your Timeline</h2>
        <p className="field-help">
          Upload a Google Timeline export (`location-history.json`). Stored
          encrypted with your vault key.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="file-input"
          disabled={importBusy || !keys}
          onChange={(e) => onPickTimeline(e.target.files?.[0] ?? null)}
        />
        {importProgress && importProgress.phase !== 'done' ? (
          <p className="import-status">{importProgress.message}</p>
        ) : null}
        {importProgress?.phase === 'done' ? (
          <p className="import-status ok">{importProgress.message}</p>
        ) : null}
        {importError ? <p className="error">{importError}</p> : null}
        {imports.length > 0 ? (
          <ul className="import-list">
            {imports.map((row) => (
              <li key={row.id}>
                <span className="import-name">{row.filename}</span>
                <span className="import-meta">
                  {row.status}
                  {row.status === 'complete'
                    ? ` · ${row.segment_count} segments · ${row.path_point_count} points`
                    : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="subpanel danger">
        <h2>Delete account</h2>
        <p className="field-help">
          Permanently deletes your unwavering.band profile, history, places, and
          relationships. Type DELETE to confirm.
        </p>
        <input
          className="input"
          value={deleteConfirm}
          onChange={(e) => setDeleteConfirm(e.target.value)}
          placeholder="DELETE"
        />
        <button
          type="button"
          className="btn"
          disabled={deleteConfirm !== 'DELETE' || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await deleteMyAccount();
              window.location.href = '/';
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Delete failed.');
              setBusy(false);
            }
          }}
        >
          Delete my account
        </button>
      </section>

      <p className="field-help">
        <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> ·{' '}
        <Link href="/support">Support</Link>
      </p>
    </div>
  );
}
