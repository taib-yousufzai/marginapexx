/**
 * GET    /api/broker/templates/[id]  — get a single template with segment settings
 * PATCH  /api/broker/templates/[id]  — update template profile fields
 * DELETE /api/broker/templates/[id]  — delete template (only if no users are assigned)
 */

import { requireBroker } from '../../_auth';

const TEMPLATE_FIELDS = [
  'name', 'description', 'segments', 'read_only', 'demo_user',
  'intraday_sq_off', 'auto_sqoff', 'showcase_auto_sqoff', 'sqoff_method', 'trading_mode',
] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    const authResult = await requireBroker(request);
    if (authResult instanceof Response) return authResult;
    const { brokerClient, callerUser } = authResult;

    const { id } = await Promise.resolve(params);

    const [templateRes, segRes, scalperRes] = await Promise.all([
      brokerClient
        .from('account_templates')
        .select('*')
        .eq('id', id)
        .or(`created_by.eq.${callerUser.id},is_default.eq.true`)
        .single(),
      brokerClient
        .from('template_segment_settings')
        .select('*')
        .eq('template_id', id),
      brokerClient
        .from('template_scalper_segment_settings')
        .select('*')
        .eq('template_id', id),
    ]);

    if (templateRes.error || !templateRes.data) {
      return Response.json({ error: 'Not found or not authorized' }, { status: 404 });
    }

    return Response.json({
      ...templateRes.data,
      segment_settings: segRes.data ?? [],
      scalper_segment_settings: scalperRes.data ?? [],
    }, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    const authResult = await requireBroker(request);
    if (authResult instanceof Response) return authResult;
    const { brokerClient, callerUser } = authResult;

    const { id } = await Promise.resolve(params);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    for (const field of TEMPLATE_FIELDS) {
      if (field in body) updateData[field] = body[field];
    }

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await brokerClient
      .from('account_templates')
      .update(updateData)
      .eq('id', id)
      .eq('created_by', callerUser.id) // IMPORTANT: Must be owned by broker
      .select()
      .single();

    if (error) {
      console.error('[PATCH /api/broker/templates/[id]]', error.message);
      return Response.json({ error: 'Update failed or not authorized' }, { status: 500 });
    }

    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    const authResult = await requireBroker(request);
    if (authResult instanceof Response) return authResult;
    const { brokerClient, callerUser } = authResult;

    const { id } = await Promise.resolve(params);

    // Check if in use
    const { count, error: countErr } = await brokerClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('template_id', id);

    if (countErr) {
      return Response.json({ error: 'Error checking usage' }, { status: 500 });
    }

    if (count && count > 0) {
      return Response.json({ error: `Cannot delete: ${count} users are using this template` }, { status: 400 });
    }

    const { error } = await brokerClient
      .from('account_templates')
      .delete()
      .eq('id', id)
      .eq('created_by', callerUser.id); // IMPORTANT: Must be owned by broker

    if (error) {
      console.error('[DELETE /api/broker/templates/[id]]', error.message);
      return Response.json({ error: 'Delete failed or not authorized' }, { status: 500 });
    }

    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
