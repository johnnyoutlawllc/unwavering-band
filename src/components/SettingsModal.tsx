'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase, type UnwaveringUser } from '@/lib/supabase';
import { getPosition } from '@/lib/geo';
import { parseLocationHistoryFile } from '@/lib/location-history';
import {
  listLocationImports,
  uploadLocationHistory,
  type ImportProgress,
  type LocationImportSummary,
} from '@/lib/location-import';

/*
 * Band colour is stored as a hex string, or null for the default, which the
 * canvas renders as a blend of orange and white. Turning location sharing off
 * nulls the coordinates, not just the flag. Withdrawn consent takes the data
 * with it.
 *
 * Timeline upload is separate from live sharing. Importing history does not
 * put a band on the wall; it only fills the private history tables.
 */

import { DEFAULT_BAND_COLOR } from '@/lib/colors';
import {
  disableNativeBackgroundTracking,
  enableNativeBackgroundTracking,
  isNativeApp,
} from '@/lib/native-bridge';

const SWATCHES: Array<{ value: string | null; label: string }> = [
  { value: null, label: 'Orange and white, the default' },
  { value: '#6ee7ff', label: 'Cyan' },
  { value: '#a78bfa', label: 'Violet' },
  { value: '#ff6b8b', label: 'Rose' },
  { value: '#7dffb0', label: 'Green' },
  { value: '#f4f1ea', label: 'White' },
];

export function SettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user, profile, setProfile } = useAuth();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [imports, setImports] = useState<LocationImportSummary[]>([]);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(profile?.display_name ?? '');
      setColor(profile?.band_color ?? null);
      setError(null);
      setSaved(false);
      setImportError(null);
      setImportProgress(null);
    }
  }, [open, profile]);

  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    listLocationImports(user.id)
      .then((rows) => {
        if (!cancelled) setImports(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          setImportError(e instanceof Error ? e.message : 'Could not load imports.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !user) return null;

  const sharing = profile?.location_sharing ?? false;

  async function save() {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('users')
      .update({
        display_name: name.trim() || null,
        band_color: color,
      })
      .eq('id', user!.id)
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
    setBusy(true);
    setError(null);
    try {
      if (sharing) {
        if (isNativeApp()) await disableNativeBackgroundTracking();
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
          .eq('id', user!.id)
          .select()
          .single();
        if (err) setError(err.message);
        else setProfile(data as UnwaveringUser);
      } else {
        const pos = await getPosition();
        const { data, error: err } = await supabase
          .from('users')
          .update({
            location_sharing: true,
            location_opted_in_at: new Date().toISOString(),
            location_opted_out_at: null,
            last_lat: pos.coords.latitude,
            last_lng: pos.coords.longitude,
            last_lat_cipher: null,
            last_lng_cipher: null,
            last_location_accuracy_m: pos.coords.accuracy,
            last_location_at: new Date().toISOString(),
          })
          .eq('id', user!.id)
          .select()
          .single();
        if (err) setError(err.message);
        else {
          setProfile(data as UnwaveringUser);
          if (isNativeApp()) {
            const native = await enableNativeBackgroundTracking();
            if (native.permission === 'denied') {
              setError(
                'Location permission was denied. Enable Always location for Unwavering Band in system Settings.',
              );
            } else if (native.permission === 'whenInUse') {
              setError(
                'Background sharing needs Always location. Open system Settings and set Location to Always.',
              );
            }
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read your location.');
    }
    setBusy(false);
  }

  async function onPickTimeline(file: File | null) {
    if (!file || !user) return;
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
        onProgress: setImportProgress,
      });
      const rows = await listLocationImports(user.id);
      setImports(rows);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setImportBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="modal-title">Settings</p>

        <label className="fieldset">
          <span className="field-label">Public profile name</span>
          <input
            className="input"
            type="text"
            value={name}
            maxLength={40}
            placeholder="What the world calls you"
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
                className={`swatch${
                  (color ?? null) === s.value ? ' selected' : ''
                }${s.value === null ? ' blend' : ''}`}
                style={
                  s.value === null
                    ? undefined
                    : { background: s.value }
                }
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
          <span className="field-label">Share where you are</span>
          <button className="btn" onClick={toggleSharing} disabled={busy || importBusy}>
            {busy ? 'Working' : sharing ? 'Turn it off' : 'Turn it on'}
          </button>
        </div>

        <div className="fieldset">
          <span className="field-label">Your Timeline</span>
          <p className="field-help">
            Upload a Google Timeline export (location-history.json). It stays
            private to your account and does not place a band on the wall.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="file-input"
            disabled={importBusy}
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
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="row">
          <button className="btn-quiet" onClick={onClose} disabled={importBusy}>
            Close
          </button>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={busy || importBusy}
          >
            {busy ? 'Saving' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
