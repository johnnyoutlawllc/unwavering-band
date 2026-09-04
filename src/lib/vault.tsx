'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './auth';
import {
  openCoords,
  sealCoords,
  setupVault,
  unlockVault,
  type VaultKeys,
} from './crypto';
import { supabase, type UnwaveringUser } from './supabase';

type VaultCtx = {
  ready: boolean;
  unlocked: boolean;
  enabled: boolean;
  keys: VaultKeys | null;
  busy: boolean;
  error: string | null;
  migrating: boolean;
  migrateProgress: string | null;
  setup: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  clearError: () => void;
};

const VaultContext = createContext<VaultCtx | null>(null);

const SESSION_FLAG = 'ub_vault_unlocked';

async function migratePlaintext(userId: string, keys: VaultKeys): Promise<string> {
  // Segments with plaintext coords still present.
  const { data: segs, error: segErr } = await supabase
    .from('location_segments')
    .select(
      'id, lat, lng, start_lat, start_lng, end_lat, end_lng, lat_cipher, lng_cipher',
    )
    .eq('user_id', userId)
    .not('lat', 'is', null)
    .is('lat_cipher', null)
    .limit(500);
  if (segErr) throw segErr;

  let n = 0;
  for (const row of segs ?? []) {
    const patch: Record<string, unknown> = { lat: null, lng: null };
    if (row.lat != null && row.lng != null) {
      const c = await sealCoords(keys.dek, row.lat, row.lng);
      patch.lat_cipher = c.lat_cipher;
      patch.lng_cipher = c.lng_cipher;
    }
    if (row.start_lat != null && row.start_lng != null) {
      const c = await sealCoords(keys.dek, row.start_lat, row.start_lng);
      patch.start_lat_cipher = c.lat_cipher;
      patch.start_lng_cipher = c.lng_cipher;
      patch.start_lat = null;
      patch.start_lng = null;
    }
    if (row.end_lat != null && row.end_lng != null) {
      const c = await sealCoords(keys.dek, row.end_lat, row.end_lng);
      patch.end_lat_cipher = c.lat_cipher;
      patch.end_lng_cipher = c.lng_cipher;
      patch.end_lat = null;
      patch.end_lng = null;
    }
    const { error } = await supabase
      .from('location_segments')
      .update(patch)
      .eq('id', row.id)
      .eq('user_id', userId);
    if (error) throw error;
    n += 1;
  }

  const { data: points, error: pErr } = await supabase
    .from('location_path_points')
    .select('id, lat, lng, lat_cipher')
    .eq('user_id', userId)
    .is('lat_cipher', null)
    .limit(800);
  if (pErr) throw pErr;
  for (const row of points ?? []) {
    const c = await sealCoords(keys.dek, row.lat, row.lng);
    const { error } = await supabase
      .from('location_path_points')
      .update({
        lat_cipher: c.lat_cipher,
        lng_cipher: c.lng_cipher,
        lat: null,
        lng: null,
      })
      .eq('id', row.id)
      .eq('user_id', userId);
    if (error) throw error;
    n += 1;
  }

  // Path points require non-null lat/lng — zero them after cipher is written.
  // Prefer a sentinel; readers must use cipher when present.

  const { data: places, error: plErr } = await supabase
    .from('places')
    .select('id, lat, lng, lat_cipher')
    .eq('user_id', userId)
    .is('lat_cipher', null);
  if (plErr) throw plErr;
  for (const row of places ?? []) {
    const c = await sealCoords(keys.dek, row.lat, row.lng);
    const { error } = await supabase
      .from('places')
      .update({
        lat_cipher: c.lat_cipher,
        lng_cipher: c.lng_cipher,
        lat: null,
        lng: null,
      })
      .eq('id', row.id)
      .eq('user_id', userId);
    if (error) throw error;
    n += 1;
  }

  const { data: me } = await supabase
    .from('users')
    .select('last_lat, last_lng, last_lat_cipher')
    .eq('id', userId)
    .maybeSingle();
  if (me?.last_lat != null && me.last_lng != null && !me.last_lat_cipher) {
    const c = await sealCoords(keys.dek, me.last_lat, me.last_lng);
    await supabase
      .from('users')
      .update({
        last_lat_cipher: c.lat_cipher,
        last_lng_cipher: c.lng_cipher,
        last_lat: null,
        last_lng: null,
      })
      .eq('id', userId);
    n += 1;
  }

  return n > 0 ? `Encrypted ${n} stored locations.` : 'All locations already encrypted.';
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, setProfile, loading } = useAuth();
  const [keys, setKeys] = useState<VaultKeys | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateProgress, setMigrateProgress] = useState<string | null>(null);

  const enabled = Boolean(profile?.encryption_enabled_at && profile?.wrapped_dek);

  useEffect(() => {
    if (!user) {
      setKeys(null);
      return;
    }
    // Never persist the passphrase or DEK. Session flag only remembers that
    // this tab had unlocked; keys stay in memory and drop on refresh.
    if (sessionStorage.getItem(SESSION_FLAG) !== user.id) {
      setKeys(null);
    }
  }, [user]);

  const runMigrate = useCallback(
    async (u: string, k: VaultKeys) => {
      setMigrating(true);
      setMigrateProgress('Encrypting stored locations…');
      try {
        // Loop until a pass migrates nothing (chunked).
        for (let i = 0; i < 40; i++) {
          const msg = await migratePlaintext(u, k);
          setMigrateProgress(msg);
          if (msg.startsWith('All')) break;
        }
      } finally {
        setMigrating(false);
      }
    },
    [],
  );

  const setup = useCallback(
    async (passphrase: string) => {
      if (!user) throw new Error('Not signed in.');
      setBusy(true);
      setError(null);
      try {
        const { keys: k, payload } = await setupVault(passphrase);
        const { data, error: err } = await supabase
          .from('users')
          .update(payload)
          .eq('id', user.id)
          .select()
          .single();
        if (err) throw err;
        setProfile(data as UnwaveringUser);
        setKeys(k);
        sessionStorage.setItem(SESSION_FLAG, user.id);
        await runMigrate(user.id, k);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not set up encryption.');
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [user, setProfile, runMigrate],
  );

  const unlock = useCallback(
    async (passphrase: string) => {
      if (!user || !profile?.crypto_salt || !profile.wrapped_dek || !profile.wrapped_privkey || !profile.crypto_pubkey) {
        throw new Error('Encryption is not set up yet.');
      }
      setBusy(true);
      setError(null);
      try {
        const k = await unlockVault(passphrase, {
          crypto_salt: profile.crypto_salt,
          wrapped_dek: profile.wrapped_dek,
          wrapped_privkey: profile.wrapped_privkey,
          crypto_pubkey: profile.crypto_pubkey,
        });
        setKeys(k);
        sessionStorage.setItem(SESSION_FLAG, user.id);
        await runMigrate(user.id, k);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not unlock.');
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [user, profile, runMigrate],
  );

  const lock = useCallback(() => {
    setKeys(null);
    if (user) sessionStorage.removeItem(SESSION_FLAG);
  }, [user]);

  const value = useMemo<VaultCtx>(
    () => ({
      ready: !loading,
      unlocked: Boolean(keys),
      enabled,
      keys,
      busy,
      error,
      migrating,
      migrateProgress,
      setup,
      unlock,
      lock,
      clearError: () => setError(null),
    }),
    [loading, keys, enabled, busy, error, migrating, migrateProgress, setup, unlock, lock],
  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault() {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside <VaultProvider>');
  return ctx;
}

export async function decryptVisitRow(
  keys: VaultKeys,
  row: {
    lat: number | null;
    lng: number | null;
    lat_cipher?: string | null;
    lng_cipher?: string | null;
  },
): Promise<{ lat: number; lng: number } | null> {
  return openCoords(
    keys.dek,
    row.lat_cipher ?? null,
    row.lng_cipher ?? null,
    row.lat,
    row.lng,
  );
}
