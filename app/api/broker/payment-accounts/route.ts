/**
 * GET  /api/broker/payment-accounts
 * POST /api/broker/payment-accounts
 */

import { requireBroker } from '../_auth';

export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireBroker(request);
    if (authResult instanceof Response) return authResult;
    const { brokerClient, callerUser } = authResult;

    const { data, error } = await brokerClient
      .from('payment_accounts')
      .select('*')
      .eq('created_by', callerUser.id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[GET /api/broker/payment-accounts]', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data ?? [], { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const authResult = await requireBroker(request);
    if (authResult instanceof Response) return authResult;
    const { brokerClient, callerUser } = authResult;

    let body: any;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    } else {
      body = await request.json();
    }

    // Insert row into payment_accounts
    const insertData = {
      account_holder: body.account_holder,
      bank_name: body.bank_name,
      account_no: body.account_no,
      ifsc: body.ifsc,
      upi_id: body.upi_id,
      sort_order: parseInt(body.sort_order as string, 10) || 0,
      is_active: body.is_active === 'true' || body.is_active === true,
      created_by: callerUser.id,
      // Broker cannot upload QR images for now to keep it simple, or we can assume it's null
    };

    const { data, error } = await brokerClient
      .from('payment_accounts')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[POST /api/broker/payment-accounts] DB insert:', error.message);
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json(data, { status: 201 });
  } catch (e: any) {
    console.error('[POST /api/broker/payment-accounts] Error:', e.message);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
