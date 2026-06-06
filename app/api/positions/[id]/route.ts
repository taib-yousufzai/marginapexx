import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';

/**
 * PATCH /api/positions/[id]
 * 
 * Updates an internal platform position (e.g., stop loss, target).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminClient();

    // Fields that can be updated by the user on their position
    const allowedUpdates: Record<string, any> = {};
    if ('stop_loss' in body) allowedUpdates.stop_loss = body.stop_loss !== null ? parseFloat(body.stop_loss) : null;
    if ('target' in body) allowedUpdates.target = body.target !== null ? parseFloat(body.target) : null;

    const { data, error } = await admin
      .from('positions')
      .update(allowedUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'open')
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Could not update position. It might already be closed.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, position: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
