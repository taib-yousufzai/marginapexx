import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';

/**
 * GET /api/notifications
 * Returns the authenticated user's notifications, newest first.
 * Query params: ?limit=20&unread_only=true
 */
export async function GET(request: NextRequest) {
    const user = await getUserFromRequest(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const limit      = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
    const unreadOnly = searchParams.get('unread_only') === 'true';

    const admin = getAdminClient();
    let query = admin
        .from('notifications')
        .select('id, type, title, message, read, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (unreadOnly) query = query.eq('read', false);

    const { data, error } = await query;
    if (error) {
        console.error('[GET /api/notifications]', error);
        return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
    }

    const unreadCount = (data ?? []).filter(n => !n.read).length;
    return NextResponse.json({ notifications: data ?? [], unread_count: unreadCount });
}
