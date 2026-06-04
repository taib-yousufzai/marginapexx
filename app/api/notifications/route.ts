import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';
import { SupabaseClient } from '@supabase/supabase-js';

async function checkAndGenerateMarketOpenNotifications(userId: string, admin: SupabaseClient) {
  try {
    // 1. Get current time in Indian Standard Time (IST)
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    
    // Check if weekend (Saturday or Sunday) - market is closed
    const dayOfWeek = nowIST.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return;
    }

    const year = nowIST.getFullYear();
    const month = String(nowIST.getMonth() + 1).padStart(2, '0');
    const date = String(nowIST.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${date}`; // e.g. '2026-06-04'
    const currentHHMM = `${String(nowIST.getHours()).padStart(2, '0')}:${String(nowIST.getMinutes()).padStart(2, '0')}`;

    // 2. Fetch active trading hours segments
    const { data: segments, error: segError } = await admin
      .from('trading_hours')
      .select('id, name, start_time, end_time, is_active')
      .eq('is_active', true);

    if (segError || !segments) return;

    // 3. Query existing MARKET_OPEN notifications for this user created today
    const startOfDay = new Date(todayStr + 'T00:00:00+05:30').toISOString();
    const endOfDay = new Date(todayStr + 'T23:59:59+05:30').toISOString();

    const { data: existingNotifs, error: notifError } = await admin
      .from('notifications')
      .select('id, title')
      .eq('user_id', userId)
      .eq('type', 'GENERAL')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .like('title', '[Market Open]%');

    if (notifError) return;

    const existingTitles = new Set((existingNotifs || []).map(n => n.title));

    // 4. Check each segment
    for (const segment of segments) {
      // Check if current time is past the start time of the segment
      if (currentHHMM >= segment.start_time) {
        const expectedTitle = `[Market Open] ${segment.name}`;
        if (!existingTitles.has(expectedTitle)) {
          // Insert a new notification
          await admin.from('notifications').insert({
            user_id: userId,
            type: 'GENERAL',
            title: expectedTitle,
            message: `The ${segment.name} segment market has opened at ${segment.start_time} IST.`,
            read: false,
            created_at: new Date().toISOString()
          });
        }
      }
    }
  } catch (err) {
    console.error('[checkAndGenerateMarketOpenNotifications] error:', err);
  }
}

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
    
    // Auto-generate market open notifications if applicable
    await checkAndGenerateMarketOpenNotifications(user.id, admin);

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
