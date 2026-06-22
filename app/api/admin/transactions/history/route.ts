import { requireAdmin } from '../../_auth';

export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Fetch all profiles to get user names
    const { data: profiles, error: profilesError } = await adminClient.from('profiles').select('id, email, full_name, client_id');
    if (profilesError) throw profilesError;

    const profileMap: Record<string, any> = {};
    profiles?.forEach(p => {
      profileMap[p.id] = p;
    });

    // Fetch all pay requests
    const { data: requests, error: requestsError } = await adminClient
        .from('pay_requests')
        .select('*')
        .order('created_at', { ascending: false });
        
    if (requestsError) throw requestsError;

    const merged = (requests || []).map(r => ({
      ...r,
      user_name: profileMap[r.user_id]?.full_name || profileMap[r.user_id]?.email || r.user_id,
      user_client_id: profileMap[r.user_id]?.client_id || '',
    }));

    return Response.json(merged, { status: 200 });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
