/**
 * GET  /api/broker/templates  — list all account templates for broker
 * POST /api/broker/templates  — create a new account template as broker.
 */

import { requireBroker } from '../_auth';

const TEMPLATE_FIELDS = [
  'name', 'description', 'is_default',
  'segments', 'read_only', 'demo_user',
  'intraday_sq_off', 'auto_sqoff', 'showcase_auto_sqoff', 'sqoff_method', 'trading_mode',
] as const;

export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireBroker(request);
    if (authResult instanceof Response) return authResult;
    const { brokerClient, callerUser } = authResult;

    const { data, error } = await brokerClient
      .from('account_templates')
      .select('id, name, description, is_default, segments, read_only, demo_user, intraday_sq_off, auto_sqoff, showcase_auto_sqoff, sqoff_method, trading_mode, created_by, created_at, updated_at')
      .or(`created_by.eq.${callerUser.id},is_default.eq.true`)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[GET /api/broker/templates]', error.message);
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

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return Response.json({ error: 'Template name is required' }, { status: 400 });
    }

    // Ensure brokers cannot set their templates as global defaults via API hacking
    // They can only set it as their own default if we supported broker-level defaults,
    // but for now we enforce is_default = false for broker templates.
    body.is_default = false;

    const insertData: Record<string, unknown> = { created_by: callerUser.id };
    for (const field of TEMPLATE_FIELDS) {
      if (field in body) insertData[field] = body[field];
    }

    const { data, error } = await brokerClient
      .from('account_templates')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[POST /api/broker/templates]', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data, { status: 201 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
