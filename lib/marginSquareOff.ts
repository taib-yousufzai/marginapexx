import { SupabaseClient } from '@supabase/supabase-js';

export async function checkAndSquareOffPositionsForMargin(userId: string, adminClient: SupabaseClient) {
  try {
    // 1. Fetch user profile
    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('balance, trading_mode, parent_id')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) return;

    const balance = Number(profile.balance || 0);
    const isScalper = profile.trading_mode === 'scalper';
    const parentId = profile.parent_id;

    // 2. Fetch all open positions
    const { data: positions, error: posErr } = await adminClient
      .from('positions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open');

    if (posErr || !positions || positions.length === 0) return;

    // 3. Fetch all segment settings for this user (and parent if applicable)
    const settingsTable = isScalper ? 'scalper_segment_settings' : 'segment_settings';
    
    const { data: userSettings } = await adminClient
      .from(settingsTable)
      .select('*')
      .eq('user_id', userId);

    const { data: parentSettings } = parentId 
      ? await adminClient.from(settingsTable).select('*').eq('user_id', parentId)
      : { data: null };

    const userSettingsMap = new Map(userSettings?.map(s => [`${s.segment}_${s.side}`, s]));
    const parentSettingsMap = new Map(parentSettings?.map(s => [`${s.segment}_${s.side}`, s]));

    // 4. Calculate new required margin for each open position
    const positionsWithNewMargin = [];
    let totalNewUsedMargin = 0;
    let totalFloatingPnl = 0;

    for (const pos of positions) {
      // Find leverage
      const key = `${pos.settlement}_${pos.side}`;
      const setting = userSettingsMap.get(key) || parentSettingsMap.get(key);
      
      let leverage = setting 
        ? (pos.product_type === 'CARRY' ? Number(setting.holding_leverage) : Number(setting.intraday_leverage))
        : null;

      // Fallbacks
      if (!leverage || leverage <= 0) {
        if (pos.settlement?.includes('FOREX') || pos.settlement?.includes('CDS')) {
          leverage = pos.product_type === 'CARRY' ? 10 : 100;
        } else if (pos.settlement?.includes('CRYPTO')) {
          leverage = pos.product_type === 'CARRY' ? 1 : 10;
        } else {
          leverage = pos.product_type === 'CARRY' ? 5 : 50;
        }
      }

      const entryPrice = Number(pos.entry_price || 0);
      const qtyOpen = Number(pos.qty_open || 0);
      const newMargin = (qtyOpen * entryPrice) / leverage;
      
      totalNewUsedMargin += newMargin;
      totalFloatingPnl += Number(pos.pnl || 0);

      positionsWithNewMargin.push({
        ...pos,
        newMargin,
        exitBuffer: setting?.exit_buffer ?? 0.0017
      });
    }

    // 5. Check if total available margin is negative
    const freeMargin = (balance + totalFloatingPnl) - totalNewUsedMargin;
    
    if (freeMargin < 0) {
      // User has insufficient margin now!
      // We will square off the open carry positions in the segments that are over margin
      // Let's sort the positions by how much margin they consume (descending)
      const positionsToClose = positionsWithNewMargin.filter(p => p.product_type === 'CARRY');
      
      for (const pos of positionsToClose) {
        // Compute exit price using exit buffer
        const baseLtp = Number(pos.ltp || pos.entry_price);
        let exitPrice: number;
        if (pos.side === 'BUY') {
          exitPrice = (baseLtp * 0.999) * (1 - pos.exitBuffer);
        } else {
          exitPrice = (baseLtp * 1.001) * (1 + pos.exitBuffer);
        }
        exitPrice = Math.round(exitPrice * 100) / 100;

        // Call RPC close_position
        const { data: pnl, error: rpcErr } = await adminClient.rpc('close_position', {
          p_position_id: pos.id,
          p_user_id: userId,
          p_ltp: baseLtp,
          p_exit_price: exitPrice,
          p_closed_by: 'SYSTEM'
        });

        if (!rpcErr) {
          // Send notification to user
          await adminClient.from('notifications').insert({
            user_id: userId,
            type: 'GENERAL',
            title: `[Position Squared Off] ${pos.symbol}`,
            message: `Because you no longer have the carry margin, the specific instrument ${pos.symbol} has been squared off.`,
            read: false,
            created_at: new Date().toISOString()
          });

          // Also update position's margin_required to 0 in database since it's closed
          await adminClient.from('positions').update({ margin_required: 0 }).eq('id', pos.id);
        }
      }
    }
  } catch (err) {
    console.error('[checkAndSquareOffPositionsForMargin] Error:', err);
  }
}
