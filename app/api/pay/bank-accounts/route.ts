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

export async function PATCH(request: Request): Promise<Response> {
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
    const { id, account_name, account_no, ifsc, bank_name, upi_id, is_primary } = body;

    if (!id) {
      return Response.json({ error: 'Missing account id' }, { status: 400 });
    }

    if (is_primary) {
      await adminClient
        .from('user_bank_accounts')
        .update({ is_primary: false })
        .eq('user_id', userData.user.id);
    }

    const updateData: any = {};
    if (account_name !== undefined) updateData.account_name = account_name;
    if (account_no !== undefined) updateData.account_no = account_no;
    if (ifsc !== undefined) updateData.ifsc = ifsc;
    if (bank_name !== undefined) updateData.bank_name = bank_name === '' ? null : bank_name;
    if (upi_id !== undefined) updateData.upi_id = upi_id === '' ? null : upi_id;
    if (is_primary !== undefined) updateData.is_primary = !!is_primary;

    const { data, error } = await adminClient
      .from('user_bank_accounts')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userData.user.id)
      .select()
      .single();

    if (error) {
      console.error('[PATCH /api/pay/bank-accounts] update error:', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data);
  } catch (err) {
    console.error('[PATCH /api/pay/bank-accounts] catch error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'Missing account id' }, { status: 400 });
    }

    const { error } = await adminClient
      .from('user_bank_accounts')
      .delete()
      .eq('id', id)
      .eq('user_id', userData.user.id);

    if (error) {
      console.error('[DELETE /api/pay/bank-accounts] error:', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/pay/bank-accounts] catch error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
