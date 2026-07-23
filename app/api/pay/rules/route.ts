import { requireAuth } from '@/lib/api-middleware';
import { supabase } from '@/lib/supabaseClient';

export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireAuth(request);
    if (authResult instanceof Response) return authResult;

    const { data, error } = await supabase
      .from('wallet_rules')
      .select('withdraw_enabled, allowed_days, start_time, end_time, min_withdraw, min_deposit')
      .eq('id', 1)
      .single();

    if (error || !data) {
      return Response.json({ error: 'Rules not configured' }, { status: 404 });
    }

    return Response.json(data, { status: 200 });
  } catch (err) {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
