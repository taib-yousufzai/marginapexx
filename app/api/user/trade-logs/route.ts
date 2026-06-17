import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminClient();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get('limit') || '50'), 100);

    // Fetch trades, executions, and strategy runs in parallel
    const [tradesRes, execsRes, strategiesRes] = await Promise.all([
      admin
        .from('trades')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_time', { ascending: false })
        .limit(limit),
      admin
        .from('executions')
        .select('*')
        .eq('user_id', user.id)
        .order('execution_time', { ascending: false })
        .limit(limit),
      admin
        .from('strategy_executions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit)
    ]);

    if (tradesRes.error) throw tradesRes.error;
    if (execsRes.error) throw execsRes.error;
    if (strategiesRes.error) throw strategiesRes.error;

    return NextResponse.json({
      trades: tradesRes.data || [],
      executions: execsRes.data || [],
      strategyRuns: strategiesRes.data || []
    });
  } catch (err: any) {
    console.error('[Trade Logs API] Error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
