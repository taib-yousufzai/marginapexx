import { createClient } from '@supabase/supabase-js';

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    
    const adminClient = createAdminClient();
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await adminClient
      .from('user_bank_accounts')
      .select('*')
      .eq('user_id', userData.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/pay/bank-accounts] fetch error:', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data);
  } catch (err) {
    console.error('[GET /api/pay/bank-accounts] catch error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    
    const adminClient = createAdminClient();
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { account_name, account_no, ifsc, bank_name, upi_id, is_primary } = body;

    if (!account_name || !account_no || !ifsc) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // If is_primary is true, unset other primary accounts first
    if (is_primary) {
      await adminClient
        .from('user_bank_accounts')
        .update({ is_primary: false })
        .eq('user_id', userData.user.id);
    }

    const { data, error } = await adminClient
      .from('user_bank_accounts')
      .insert({
        user_id: userData.user.id,
        account_name,
        account_no,
        ifsc,
        bank_name: bank_name || null,
        upi_id: upi_id || null,
        is_primary: !!is_primary,
      })
      .select()
      .single();

    if (error) {
      console.error('[POST /api/pay/bank-accounts] insert error:', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data, { status: 201 });
  } catch (err) {
    console.error('[POST /api/pay/bank-accounts] catch error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
