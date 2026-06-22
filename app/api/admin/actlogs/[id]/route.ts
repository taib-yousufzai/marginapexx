import { requireAdmin } from '../../_auth';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;
    if (!id) {
      return Response.json({ error: 'Missing ID' }, { status: 400 });
    }

    const body = await request.json();
    const { type, symbol, qty, price, reason } = body;

    const updates: Record<string, any> = {};
    if (type !== undefined) updates.type = type;
    if (symbol !== undefined) updates.symbol = symbol;
    if (qty !== undefined) updates.qty = qty;
    if (price !== undefined) updates.price = price;
    if (reason !== undefined) updates.reason = reason;

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { error } = await adminClient
      .from('act_logs')
      .update(updates)
      .eq('id', id);

    if (error) {
      return Response.json({ error: 'Database error updating log' }, { status: 500 });
    }

    return Response.json({ message: 'Log updated successfully' }, { status: 200 });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
