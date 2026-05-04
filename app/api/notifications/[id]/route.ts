import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';

/**
 * PATCH /api/notifications/[id]
 * Mark a single notification as read.
 *
 * PATCH /api/notifications/all  (special id)
 * Mark ALL notifications as read.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await params;
    const admin = getAdminClient();

    if (id === 'all') {
        const { error } = await admin
            .from('notifications')
            .update({ read: true })
            .eq('user_id', user.id)
            .eq('read', false);

        if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
        return NextResponse.json({ success: true });
    }

    // Single notification — verify ownership via user_id filter
    const { error } = await admin
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
    return NextResponse.json({ success: true });
}
