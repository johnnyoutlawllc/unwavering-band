'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, type UnwaveringUser } from './supabase';

/*
 * Google is the only way in. There is no password to forget and no profile to
 * fill out, because the whole point of the thing is that being here is enough.
 *
 * The row in `unwavering.users` is created by a trigger on auth.users, so this
 * provider only ever reads it back and updates it. If the read comes up empty
 * (a user who signed in before the trigger existed) we insert it ourselves.
 */

type Ctx = {
  user: User | null;
  profile: UnwaveringUser | null;
  loading: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (row: UnwaveringUser) => void;
};

const AuthContext = createContext<Ctx | null>(null);

function nameOf(user: User | null, profile: UnwaveringUser | null): string | null {
  if (profile?.display_name) return profile.display_name.split(/\s+/)[0];
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const full =
    (typeof meta.given_name === 'string' && meta.given_name) ||
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    '';
  if (full) return full.split(/\s+/)[0];
  return user.email?.split('@')[0] ?? 'you';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UnwaveringUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (u: User | null) => {
    if (!u) {
      setProfile(null);
      return;
    }
    const { data, error: err } = await supabase
      .from('users')
      .select('*')
      .eq('id', u.id)
      .maybeSingle();

    if (err) {
      setError(err.message);
      return;
    }
    if (data) {
      setProfile(data as UnwaveringUser);
      return;
    }

    // Trigger did not fire for this account. Make the row ourselves.
    const meta = u.user_metadata ?? {};
    const { data: created, error: insertErr } = await supabase
      .from('users')
      .insert({
        id: u.id,
        email: u.email ?? null,
        display_name:
          (typeof meta.full_name === 'string' && meta.full_name) ||
          (typeof meta.name === 'string' && meta.name) ||
          (u.email?.split('@')[0] ?? null),
        avatar_url: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
      })
      .select()
      .single();

    if (insertErr) setError(insertErr.message);
    else setProfile(created as UnwaveringUser);
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      const u = data.session?.user ?? null;
      setUser(u);
      await loadProfile(u);
      if (!cancelled) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      await loadProfile(u);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${window.location.pathname}`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (err) setError(err.message);
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    const { error: err } = await supabase.auth.signOut();
    if (err) setError(err.message);
    else setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(user);
  }, [loadProfile, user]);

  const value = useMemo<Ctx>(
    () => ({
      user,
      profile,
      loading,
      displayName: nameOf(user, profile),
      avatarUrl:
        profile?.avatar_url ??
        (typeof user?.user_metadata?.avatar_url === 'string'
          ? user.user_metadata.avatar_url
          : null),
      error,
      signInWithGoogle,
      signOut,
      refreshProfile,
      setProfile,
    }),
    [user, profile, loading, error, signInWithGoogle, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
