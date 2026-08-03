'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase, type UnwaveringUser } from '@/lib/supabase';

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.2 15.5 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.8 28.3c-.4-1.3-.7-2.7-.7-4.3s.3-3 .7-4.3v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.6z"
      />
      <path
        fill="#EA4335"
        d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.1 29.9 2 24 2 15.5 2 8.1 6.8 4.5 13.8l7.3 5.7c1.7-5.2 6.5-8.8 12.2-8.8z"
      />
    </svg>
  );
}

/** Ask the browser where we are. Wrapped because the callback API is ancient. */
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This browser cannot share a location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 60000,
    });
  });
}

function geoMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as GeolocationPositionError).code;
    if (code === 1) return 'Location permission was denied in the browser.';
    if (code === 2) return 'The browser could not work out where you are.';
    if (code === 3) return 'Locating timed out. Try once more.';
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export function Panel() {
  const {
    user,
    profile,
    loading,
    displayName,
    avatarUrl,
    error,
    signInWithGoogle,
    signOut,
    setProfile,
  } = useAuth();

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const sharing = profile?.location_sharing ?? false;

  async function optIn() {
    setBusy(true);
    setLocalError(null);
    try {
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

      if (err) setLocalError(err.message);
      else setProfile(data as UnwaveringUser);
    } catch (e) {
      setLocalError(geoMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function optOut() {
    setBusy(true);
    setLocalError(null);
    // Turning it off wipes the coordinates. Consent withdrawn means the data
    // goes too, not just the flag.
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

    if (err) setLocalError(err.message);
    else setProfile(data as UnwaveringUser);
    setBusy(false);
  }

  if (loading) {
    return (
      <div className="panel">
        <p className="note">Looking for you.</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="panel">
        <p className="lede">
          Sign in and you are on the list. Nothing is built yet. That is the
          honest pitch.
        </p>
        <button className="btn btn-primary" onClick={signInWithGoogle}>
          <GoogleMark />
          Continue with Google
        </button>
        <p className="note">
          We keep your name, your email and your picture, because Google hands
          them over. Location is a separate question and you get asked it after.
        </p>
        {error ? <p className="error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="who">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : null}
        <div>
          <p className="name">You are here, {displayName}.</p>
          <p className="mail">{user.email}</p>
        </div>
      </div>

      <hr className="rule" />

      <div className="row">
        <div>
          <p className="toggle-label">Share where you are</p>
          <p className="note">
            One reading, taken now. Not a live trail, not a background tracker.
          </p>
        </div>
        {sharing ? (
          <button className="btn" onClick={optOut} disabled={busy}>
            {busy ? 'Working' : 'Turn it off'}
          </button>
        ) : (
          <button className="btn btn-primary" onClick={optIn} disabled={busy}>
            {busy ? 'Locating' : 'Turn it on'}
          </button>
        )}
      </div>

      <p className="status">
        <span className={`pip${sharing ? '' : ' off'}`} />
        {sharing
          ? 'On. You can switch it off any time and the coordinates go with it.'
          : 'Off. Nothing about where you are is stored.'}
      </p>

      {localError ? <p className="error">{localError}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      <hr className="rule" />

      <button className="btn-quiet" onClick={signOut}>
        Sign out
      </button>
    </div>
  );
}
