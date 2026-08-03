'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase, type UnwaveringUser } from './supabase';

/*
 * Google is the only way in. There is no password to forget and no profile to
 * fill out, because the whole point of the thing is that being here is enough.
 *
 * The row in `unwavering.users` is normally created by a trigger on auth.users.
 * The trigger only fires on INSERT, though, so anyone who already had an
 * account on this Supabase project before this site existed arrives with no
 * row and has to be backfilled here.
 *
 * That backfill has to be an upsert, not an insert, and it has to be
 * single flight. Supabase fires getSession() and onAuthStateChange() at
 * roughly the same moment on a fresh sign in, so two loads race, both see no
 * row, and both try to create one. The loser used to surface a raw
 * "duplicate key value violates unique constraint" at the user.
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

  // One profile load at a time per user, so the two callers cannot race.
  const inFlight = useRef<Map<string, Promise<void>>>(new Map());

  const runLoad = useCallback(async (u: User) => {
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
      setError(null);
      return;
    }

    // No row. Either the trigger has not landed yet or this account predates
    // it. Upsert rather than insert: if the other caller got there first we
    // want the existing row back, not a primary key violation.
    const meta = u.user_metadata ?? {};
    const { data: row, error: upsertErr } = await supabase
      .from('users')
      .upsert(
        {
          id: u.id,
          email: u.email ?? null,
          display_name:
            (typeof meta.full_name === 'string' && meta.full_name) ||
            (typeof meta.name === 'string' && meta.name) ||
            (u.email?.split('@')[0] ?? null),
          avatar_url: typeof meta.avatar_url === 'string' ? meta.avatar_url : null,
        },
        { onConflict: 'id' },
      )
      .select()
      .single();

    if (!upsertErr) {
      setProfile(row as UnwaveringUser);
      setError(null);
      return;
    }

    // Belt and braces. If the upsert still lost somehow, the row exists now,
    // so read it back instead of shouting Postgres at somebody.
    const { data: reread } = await supabase
      .from('users')
      .select('*')
      .eq('id', u.id)
      .maybeSingle();

    if (reread) {
      setProfile(reread as UnwaveringUser);
      setError(null);
    } else {
      setError(upsertErr.message);
    }
  }, []);

  const loadProfile = useCallback(
    async (u: User | null) => {
      if (!u) {
        setProfile(null);
        return;
      }
      const existing = inFlight.current.get(u.id);
      if (existing) return existing;

      const p = runLoad(u).finally(() => {
        inFlight.current.delete(u.id);
      });
      inFlight.current.set(u.id, p);
      return p;
    },
    [runLoad],
  );

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
