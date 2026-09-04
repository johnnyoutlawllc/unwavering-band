import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
  );
}

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
  last_lat_cipher: string | null;
  last_lng_cipher: string | null;
  crypto_salt: string | null;
  wrapped_dek: string | null;
  crypto_pubkey: string | null;
  wrapped_privkey: string | null;
  encryption_enabled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PrivacyTier = 'distance' | 'city' | 'exact';

export type RelationshipRow = {
  id: string;
  status: 'pending' | 'accepted' | 'declined' | 'ended';
  peer_id: string;
  peer_name: string;
  peer_email: string | null;
  peer_band_color: string | null;
  my_shares: PrivacyTier;
  their_shares: PrivacyTier;
  i_am_requester: boolean;
  created_at: string;
  accepted_at: string | null;
};

export type PlaceRow = {
  id: string;
  user_id: string;
  name: string;
  lat: number;
  lng: number;
  radius_m: number;
  created_at: string;
  updated_at: string;
};

export type VisitSegment = {
  id: string;
  start_time: string;
  end_time: string;
  lat: number | null;
  lng: number | null;
  semantic_type: string | null;
  place_id: string | null;
};

export type DistancePoint = {
  day: string;
  distance_km: number;
  their_lat: number | null;
  their_lng: number | null;
  their_place: string | null;
  their_tier: PrivacyTier;
  my_place?: string | null;
};

/** Stored per-relationship distance report (plaintext summary; no raw secrets). */
export type DistanceReportRow = {
  relationship_id: string;
  day: string;
  occurred_at: string;
  distance_km: number;
  requester_id: string;
  addressee_id: string;
  requester_name: string;
  addressee_name: string;
  requester_place: string | null;
  addressee_place: string | null;
  requester_tier: PrivacyTier;
  addressee_tier: PrivacyTier;
  requester_lat: number | null;
  requester_lng: number | null;
  addressee_lat: number | null;
  addressee_lng: number | null;
  computed_at: string;
};
