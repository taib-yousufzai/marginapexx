/**
 * GET /api/broker/users
 * POST /api/broker/users
 *
 * Scoped user management for brokers.
 */

import { NextResponse } from 'next/server';
import { requireBroker } from '../_auth';

export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireBroker(request);
    if (!authResult || !('adminClient' in authResult) || !authResult.adminClient) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { adminClient, callerUser } = authResult as any;

    // Brokers see only users where parent_id matches their ID
    const { data, error } = await adminClient
      .from('profiles')
      .select('id, email, full_name, phone, role, parent_id, segments, active, read_only, demo_user, balance, created_at, scheduled_delete_at')
      .eq('parent_id', callerUser.id);

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data ?? [], { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const PROFILE_FIELDS = [
  'full_name',
  'phone',
  'role',
  'segments',
  'active',
  'read_only',
  'demo_user',
  'intraday_sq_off',
  'auto_sqoff',
  'sqoff_method',
] as const;

export async function POST(request: Request): Promise<Response> {
  try {
    const authResult = await requireBroker(request);
    if (!authResult || !('adminClient' in authResult) || !authResult.adminClient) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { adminClient, callerUser } = authResult as any;

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { email, password } = body;
    if (!email || !password) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeof password === 'string' && password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const profileFields: Record<string, unknown> = {};
    for (const field of PROFILE_FIELDS) {
      if (field in body && body[field] !== '') {
        profileFields[field] = body[field];
      }
    }

    // Force parent_id to the broker's ID
    profileFields['parent_id'] = callerUser.id;

    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: email as string,
      password: password as string,
      email_confirm: true,
      user_metadata: { username: body.username },
    });

    if (createError || !createData?.user) {
      return Response.json({ error: createError?.message ?? 'Failed to create user' }, { status: 422 });
    }

    const newUser = createData.user;

    await adminClient.auth.admin.updateUserById(newUser.id, {
      user_metadata: { role: body.role ?? 'user', username: body.username }
    });

    const { error: insertError } = await adminClient
      .from('profiles')
      .update({ email: email as string, ...profileFields })
      .eq('id', newUser.id);

    if (insertError) {
      await adminClient.auth.admin.deleteUser(newUser.id);
      return Response.json({ error: 'Failed to create profile' }, { status: 500 });
    }

    return Response.json({ id: newUser.id, email: newUser.email }, { status: 201 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
