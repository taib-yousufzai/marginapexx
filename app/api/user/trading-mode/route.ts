import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '../../../../lib/adminClient';

export async function GET(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdminClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('trading_mode, mode_locked_until')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  return NextResponse.json({
    trading_mode: profile.trading_mode ?? 'normal',
    mode_locked_until: profile.mode_locked_until ?? null,
  });
}

export async function POST(request: NextRequest) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { trading_mode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { trading_mode } = body;
  if (!trading_mode || !['normal', 'scalper'].includes(trading_mode)) {
    return NextResponse.json({ error: 'Invalid trading mode. Must be "normal" or "scalper"' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Fetch current mode and lock status
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('trading_mode, mode_locked_until')
    .eq('id', user.id)
    .single();

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }

  const currentMode = profile.trading_mode ?? 'normal';
  const lockedUntilStr = profile.mode_locked_until;

  // No-op if target mode is same as current mode
  if (currentMode === trading_mode) {
    return NextResponse.json({
      success: true,
      trading_mode: currentMode,
      mode_locked_until: lockedUntilStr,
    });
  }

  let updatedLockedUntil: string | null = null;

  // Enforce lock if switching from scalper to normal
  if (currentMode === 'scalper' && trading_mode === 'normal') {
    if (lockedUntilStr) {
      const lockedUntil = new Date(lockedUntilStr);
      if (lockedUntil.getTime() > Date.now()) {
        const remainingMs = lockedUntil.getTime() - Date.now();
        const remainingHours = (remainingMs / (1000 * 60 * 60)).toFixed(1);
        return NextResponse.json({
          error: `Cannot switch back to Normal Mode. Scalper Mode is locked for another ${remainingHours} hours (until ${lockedUntil.toLocaleString()}).`
        }, { status: 400 });
      }
    }
  }

  // If switching from normal to scalper, set the lock for 48 hours
  if (trading_mode === 'scalper') {
    updatedLockedUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  }

  // Perform the update
  const { error: updateErr } = await admin
    .from('profiles')
    .update({
      trading_mode,
      mode_locked_until: updatedLockedUntil,
    })
    .eq('id', user.id);

  if (updateErr) {
    console.error('[POST /api/user/trading-mode] Error updating mode:', updateErr);
    return NextResponse.json({ error: 'Failed to update trading mode' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    trading_mode,
    mode_locked_until: updatedLockedUntil,
  });
}
