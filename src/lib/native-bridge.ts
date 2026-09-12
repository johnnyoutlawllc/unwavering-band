'use client';

/**
 * Capacitor bridge for Unwavering Band native shells.
 * Safe on web: every export no-ops when not running inside the app.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from './supabase';

type PermissionState = 'always' | 'whenInUse' | 'denied' | 'prompt';

type BackgroundLocationPlugin = {
  setAuthSession(options: {
    accessToken: string;
    refreshToken?: string;
    userId: string;
    supabaseUrl: string;
    supabaseAnonKey: string;
  }): Promise<{ stored: boolean }>;
  clearAuthSession(): Promise<{ cleared: boolean }>;
  requestPermissions(): Promise<{
    tracking: boolean;
    hasSession: boolean;
    permission: PermissionState;
  }>;
  startTracking(): Promise<{ tracking: boolean }>;
  stopTracking(): Promise<{ tracking: boolean }>;
  getStatus(): Promise<{
    tracking: boolean;
    hasSession: boolean;
    permission: PermissionState;
  }>;
};

const BackgroundLocation = registerPlugin<BackgroundLocationPlugin>('BackgroundLocation');

export function isNativeApp(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

export function nativePlatform(): string {
  if (!isNativeApp()) return 'web';
  return Capacitor.getPlatform();
}

function requireEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value =
    name === 'NEXT_PUBLIC_SUPABASE_URL'
      ? process.env.NEXT_PUBLIC_SUPABASE_URL
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

/** Persist the signed-in session so the native layer can write while backgrounded. */
export async function syncNativeAuthSession(): Promise<void> {
  if (!isNativeApp()) return;
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session?.user) {
    await BackgroundLocation.clearAuthSession();
    return;
  }
  await BackgroundLocation.setAuthSession({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    userId: session.user.id,
    supabaseUrl: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    supabaseAnonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  });
}

export async function clearNativeAuthSession(): Promise<void> {
  if (!isNativeApp()) return;
  await BackgroundLocation.stopTracking().catch(() => undefined);
  await BackgroundLocation.clearAuthSession();
}

/**
 * Ask for Always location, then start the native background tracker.
 * Live coordinates are written as plaintext last_lat/last_lng (and visits rows)
 * so the Now canvas and distance history keep working while the app is closed.
 * Timeline vault encryption is unchanged and separate.
 */
export async function enableNativeBackgroundTracking(): Promise<{
  tracking: boolean;
  permission: PermissionState;
}> {
  if (!isNativeApp()) {
    return { tracking: false, permission: 'prompt' };
  }
  await syncNativeAuthSession();
  const perms = await BackgroundLocation.requestPermissions();
  if (perms.permission === 'denied') {
    return { tracking: false, permission: 'denied' };
  }
  const started = await BackgroundLocation.startTracking();
  const status = await BackgroundLocation.getStatus();
  return { tracking: started.tracking, permission: status.permission };
}

export async function disableNativeBackgroundTracking(): Promise<void> {
  if (!isNativeApp()) return;
  await BackgroundLocation.stopTracking();
}

export async function getNativeTrackingStatus(): Promise<{
  tracking: boolean;
  hasSession: boolean;
  permission: PermissionState;
} | null> {
  if (!isNativeApp()) return null;
  return BackgroundLocation.getStatus();
}
