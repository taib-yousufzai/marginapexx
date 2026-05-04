import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';

const ALLOWED_FIELDS = [
    'full_name', 'phone', 'date_of_birth',
    'city', 'state', 'pan_number',
    'bank_name', 'account_no', 'ifsc',
] as const;

export async function GET(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = getAdminClient();
    const { data, error } = await admin
        .from('profiles')
        .select('full_name, email, phone, role, segments, created_at, date_of_birth, city, state, pan_number, bank_name, account_no, ifsc')
        .eq('id', user.id)
        .single();

    if (error || !data) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let body: Record<string, unknown>;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid request body' }, { status: 400 }); }

    const updates: Record<string, string> = {};
    for (const field of ALLOWED_FIELDS) {
        if (typeof body[field] === 'string') updates[field] = (body[field] as string).trim();
    }

    if (Object.keys(updates).length === 0)
        return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });

    const admin = getAdminClient();
    const { error } = await admin.from('profiles').update(updates).eq('id', user.id);
    if (error) {
        console.error('[PATCH /api/user/profile]', error);
        return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
}
