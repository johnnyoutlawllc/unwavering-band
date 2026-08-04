'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase, type UnwaveringUser } from '@/lib/supabase';
import { getPosition } from '@/lib/geo';

/*
 * Band colour is stored as a hex string, or null for the default, which the
 * canvas renders as a blend of orange and white. Turning location sharing off
 * nulls the coordinates, not just the flag. Withdrawn consent takes the data
 * with it.
 */

export const DEFAULT_BAND_COLOR = '#ffb066';

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

  useEffect(() => {
    if (open) {
      setName(profile?.display_name ?? '');
      setColor(profile?.band_color ?? null);
      setError(null);
      setSaved(false);
    }
  }, [open, profile]);

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
        const { data, error: err } = await supabase
          .from('users')
          .update({
            location_sharing: false,
            location_opted_out_at: new Date().toISOString(),
            last_lat: null,
            last_lng: null,
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
            last_location_accuracy_m: pos.coords.accuracy,
            last_location_at: new Date().toISOString(),
          })
          .eq('id', user!.id)
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

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
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
          <button className="btn" onClick={toggleSharing} disabled={busy}>
            {busy ? 'Working' : sharing ? 'Turn it off' : 'Turn it on'}
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}

        <div className="row">
          <button className="btn-quiet" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
