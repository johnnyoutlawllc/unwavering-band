import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
  );
}

/*
 * Everything this site owns lives in the `unwavering` schema, never `public`.
 * The schema is exposed to PostgREST through `authenticator`'s pgrst.db_schemas
 * role setting, so the only thing the client has to do is point at it.
 */
export const supabase = createClient(url, key, {
  db: { schema: 'unwavering' },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type UnwaveringUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  band_color: string | null;
  location_sharing: boolean;
  location_opted_in_at: string | null;
  location_opted_out_at: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_location_accuracy_m: number | null;
  last_location_at: string | null;
  created_at: string;
  updated_at: string;
};
