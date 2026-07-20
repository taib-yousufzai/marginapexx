/**
 * PATCH  /api/broker/payment-accounts/[id]
 * DELETE /api/broker/payment-accounts/[id]
 */

import { requireBroker } from '../../_auth';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  try {
    const authResult = await requireBroker(request);
    if (authResult instanceof Response) return authResult;
    const { brokerClient, callerUser } = authResult;

    // Resolve params properly for Next.js 15
    const resolvedParams = await (context.params instanceof Promise ? context.params : Promise.resolve(context.params));
    const { id } = resolvedParams;

    if (!id) return Response.json({ error: 'Missing account ID' }, { status: 400 });

    let body: any;
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    } else {
      body = await request.json();
    }

    const updateData: Record<string, any> = {};
    if (body.account_holder !== undefined) updateData.account_holder = body.account_holder;
    if (body.bank_name !== undefined) updateData.bank_name = body.bank_name;
    if (body.account_no !== undefined) updateData.account_no = body.account_no;
    if (body.ifsc !== undefined) updateData.ifsc = body.ifsc;
    if (body.upi_id !== undefined) updateData.upi_id = body.upi_id;
    if (body.sort_order !== undefined) updateData.sort_order = parseInt(body.sort_order, 10) || 0;
    if (body.is_active !== undefined) updateData.is_active = body.is_active === 'true' || body.is_active === true;

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await brokerClient
      .from('payment_accounts')
      .update(updateData)
      .eq('id', id)
      .eq('created_by', callerUser.id)
      .select()
      .single();

    if (error) {
      console.error(`[PATCH /api/broker/payment-accounts/${id}] DB error:`, error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data, { status: 200 });
  } catch (e: any) {
    console.error(`[PATCH /api/broker/payment-accounts/[id]] Error:`, e.message);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> | { id: string } }): Promise<Response> {
  try {
    const authResult = await requireBroker(request);
    if (authResult instanceof Response) return authResult;
    const { brokerClient, callerUser } = authResult;

    // Resolve params properly for Next.js 15
    const resolvedParams = await (context.params instanceof Promise ? context.params : Promise.resolve(context.params));
    const { id } = resolvedParams;

    if (!id) return Response.json({ error: 'Missing account ID' }, { status: 400 });

    const { error } = await brokerClient
      .from('payment_accounts')
      .delete()
      .eq('id', id)
      .eq('created_by', callerUser.id);

    if (error) {
      console.error(`[DELETE /api/broker/payment-accounts/${id}] DB error:`, error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (e: any) {
    console.error(`[DELETE /api/broker/payment-accounts/[id]] Error:`, e.message);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
