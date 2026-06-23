import { requireAdmin } from '../../_auth';

export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const url = new URL(request.url);
    const demoParam = url.searchParams.get('demo');
    const isDemo = demoParam === 'true';

    // Fetch all profiles to get user names
    const { data: profiles, error: profilesError } = await adminClient.from('profiles').select('id, email, full_name, client_id').eq('demo_user', isDemo);
    if (profilesError) throw profilesError;

    const profileMap: Record<string, any> = {};
    profiles?.forEach(p => {
      profileMap[p.id] = p;
    });

    let requestsQuery = adminClient
        .from('pay_requests')
        .select('*');
        
    const allowedUserIds = profiles ? profiles.map(p => p.id) : [];
    if (allowedUserIds.length > 0) {
      requestsQuery = requestsQuery.in('user_id', allowedUserIds);
    } else {
      return Response.json([], { status: 200 });
    }

    const { data: requests, error: requestsError } = await requestsQuery.order('created_at', { ascending: false });
        
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
