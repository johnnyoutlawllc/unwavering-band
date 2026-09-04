import { supabase, type DistancePoint, type PrivacyTier, type RelationshipRow } from './supabase';

export async function listRelationships(): Promise<RelationshipRow[]> {
  const { data, error } = await supabase.rpc('list_my_relationships');
  if (error) throw error;
  return (data ?? []) as RelationshipRow[];
}

export async function findUserForInvite(
  email: string,
): Promise<{ id: string; display_name: string } | null> {
  const { data, error } = await supabase.rpc('find_user_for_invite', {
    p_email: email,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

export async function inviteByEmail(
  email: string,
  myShares: PrivacyTier = 'distance',
): Promise<void> {
  const peer = await findUserForInvite(email);
  if (!peer) throw new Error('No account found for that email. They need to sign in first.');

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { error } = await supabase.from('relationships').insert({
    requester_id: user.id,
    addressee_id: peer.id,
    requester_shares: myShares,
    status: 'pending',
  });
  if (error) {
    if (error.code === '23505') {
      throw new Error('You already have a relationship with that person.');
    }
    throw error;
  }
}

export async function acceptRelationship(id: string, myShares: PrivacyTier): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('relationships')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      addressee_shares: myShares,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('addressee_id', user.id)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function getRelationshipRequesterId(id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('relationships')
    .select('requester_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data?.requester_id ?? null;
}

export async function declineRelationship(id: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { error } = await supabase
    .from('relationships')
    .update({ status: 'declined', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('addressee_id', user.id)
    .eq('status', 'pending');
  if (error) throw error;
}

export async function updateMyShares(id: string, myShares: PrivacyTier): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data: rel, error: readErr } = await supabase
    .from('relationships')
    .select('requester_id, addressee_id')
    .eq('id', id)
    .single();
  if (readErr) throw readErr;

  const patch =
    rel.requester_id === user.id
      ? { requester_shares: myShares }
      : { addressee_shares: myShares };

  const { error } = await supabase
    .from('relationships')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function endRelationship(id: string): Promise<void> {
  const { error } = await supabase
    .from('relationships')
    .update({ status: 'ended', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function fetchDistanceSeries(
  relationshipId: string,
): Promise<DistancePoint[]> {
  const { data, error } = await supabase.rpc('relationship_distance_series', {
    p_rel_id: relationshipId,
  });
  if (error) throw error;
  return (data ?? []) as DistancePoint[];
}

export const PRIVACY_LABELS: Record<PrivacyTier, string> = {
  distance: 'Distance only',
  city: 'City and state',
  exact: 'Exact location',
};

export const PRIVACY_HELP: Record<PrivacyTier, string> = {
  distance: 'They see how many miles apart you are. Nothing else.',
  city: 'They see miles apart, plus a coarse place (city scale).',
  exact: 'They see miles apart and where you were that day.',
};
