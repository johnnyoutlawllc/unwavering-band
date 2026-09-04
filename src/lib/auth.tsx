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

type Ctx = {
  user: User | null;
  profile: UnwaveringUser | null;
  loading: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  signUpWithPassword: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<boolean>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  setProfile: (row: UnwaveringUser) => void;
  clearError: () => void;
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
        redirectTo: `${window.location.origin}/app`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (err) setError(err.message);
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (err) {
      setError(err.message);
      return false;
    }
    return true;
  }, []);

  const signUpWithPassword = useCallback(
    async (email: string, password: string, displayName?: string) => {
      setError(null);
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: displayName
            ? { full_name: displayName, name: displayName }
            : undefined,
          emailRedirectTo: `${window.location.origin}/app`,
        },
      });
      if (err) {
        setError(err.message);
        return false;
      }
      if (!data.session) {
        setError(
          'Check your email to confirm the account, then sign in. On this shared project, confirmation may be required.',
        );
        return false;
      }
      return true;
    },
    [],
  );

  const signOut = useCallback(async () => {
    setError(null);
    const { error: err } = await supabase.auth.signOut();
    if (err) setError(err.message);
    else setProfile(null);
  }, []);

  const refreshProfile = useCallback(async () => {
    await loadProfile(user);
  }, [loadProfile, user]);

  const clearError = useCallback(() => setError(null), []);

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
      signInWithPassword,
      signUpWithPassword,
      signOut,
      refreshProfile,
      setProfile,
      clearError,
    }),
    [
      user,
      profile,
      loading,
      error,
      signInWithGoogle,
      signInWithPassword,
      signUpWithPassword,
      signOut,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
