'use client';

import { useEffect, useRef, useState } from 'react';
import { Field } from '@/components/Field';
import { Bandscape } from '@/components/Bandscape';
import { UserMenu } from '@/components/UserMenu';
import { SettingsModal } from '@/components/SettingsModal';
import { useAuth } from '@/lib/auth';
import { supabase, type UnwaveringUser } from '@/lib/supabase';
import { getPosition, type Reading } from '@/lib/geo';

export default function Home() {
  const { user, profile, loading, error, signInWithGoogle, setProfile } =
    useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  /*
   * Every signed in page visit gets logged once: location, date and time.
   * If the person turned sharing off, or the browser will not say where they
   * are, the visit is logged with no coordinates. The withdrawal of consent
   * is respected: an explicit opt out means we do not even ask the browser.
   */
  const loggedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user || !profile || loggedFor.current === user.id) return;
    loggedFor.current = user.id;

    (async () => {
      const optedOut =
        !profile.location_sharing && profile.location_opted_out_at !== null;

      let reading: Reading | null = null;
      if (!optedOut) {
        try {
          const pos = await getPosition();
          reading = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: pos.coords.accuracy,
          };
        } catch {
          // They said no, or the browser could not find them. Still a visit.
        }
      }

      await supabase.from('visits').insert({
        user_id: user.id,
        lat: reading?.lat ?? null,
        lng: reading?.lng ?? null,
        accuracy_m: reading?.accuracy_m ?? null,
      });

      if (reading) {
        const { data } = await supabase
          .from('users')
          .update({
            location_sharing: true,
            location_opted_in_at:
              profile.location_opted_in_at ?? new Date().toISOString(),
            location_opted_out_at: null,
            last_lat: reading.lat,
            last_lng: reading.lng,
            last_location_accuracy_m: reading.accuracy_m,
            last_location_at: new Date().toISOString(),
          })
          .eq('id', user.id)
          .select()
          .single();
        if (data) setProfile(data as UnwaveringUser);
      }
    })();
  }, [user, profile, setProfile]);

  if (loading) {
    return (
      <>
        <Field />
        <main className="hero">
          <h1 className="wordmark">
            unwavering<span className="dot">.band</span>
          </h1>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Field />
        <main className="hero">
          <h1 className="wordmark">
            unwavering<span className="dot">.band</span>
          </h1>
          <button className="btn btn-primary" onClick={signInWithGoogle}>
            Sign in and Share Your Location to begin
          </button>
          {error ? <p className="error">{error}</p> : null}
        </main>
      </>
    );
  }

  return (
    <>
      <Field />
      <Bandscape />
      <header className="profilebar">
        <UserMenu onSettings={() => setSettingsOpen(true)} />
      </header>
      <div className="wordmark-top">
        <h1 className="wordmark small">
          unwavering<span className="dot">.band</span>
        </h1>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
