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
    
    // Fetch profile and primary bank account in parallel
    const [profileRes, bankRes] = await Promise.all([
        admin
            .from('profiles')
            .select('full_name, email, phone, role, segments, created_at, date_of_birth, city, state, pan_number, bank_name, account_no, ifsc')
            .eq('id', user.id)
            .single(),
        admin
            .from('user_bank_accounts')
            .select('bank_name, account_no, ifsc')
            .eq('user_id', user.id)
            .eq('is_primary', true)
            .maybeSingle()
    ]);

    if (profileRes.error || !profileRes.data) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = profileRes.data;
    
    // Override with primary bank account if it exists
    if (bankRes.data) {
        profile.bank_name = bankRes.data.bank_name || profile.bank_name;
        profile.account_no = bankRes.data.account_no || profile.account_no;
        profile.ifsc = bankRes.data.ifsc || profile.ifsc;
    }

    return NextResponse.json(profile);
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

    // Also update primary bank account if bank fields are present
    if (updates.bank_name || updates.account_no || updates.ifsc) {
        await admin
            .from('user_bank_accounts')
            .update({
                bank_name: updates.bank_name,
                account_no: updates.account_no,
                ifsc: updates.ifsc
            })
            .eq('user_id', user.id)
            .eq('is_primary', true);
    }

    return NextResponse.json({ success: true });
}
