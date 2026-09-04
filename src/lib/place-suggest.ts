import type { PlaceSuggestion } from './geocode';
import { supabase } from './supabase';

export type { PlaceSuggestion };

export async function fetchPlaceSuggestions(
  lat: number,
  lng: number,
): Promise<PlaceSuggestion[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return [];

  const res = await fetch('/api/place-suggest', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ lat, lng }),
  });
  if (!res.ok) return [];
  const body = (await res.json()) as { suggestions?: PlaceSuggestion[] };
  return Array.isArray(body.suggestions) ? body.suggestions : [];
}
