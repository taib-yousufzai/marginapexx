/**
 * PATCH /api/admin/positions/[id]
 * DELETE /api/admin/positions/[id]
 *
 * PATCH: Update editable fields on a position row, recalculate closed PnL, and sync ledger transactions.
 * DELETE: Remove a position row and clean up associated ledger transactions.
 *
 * Validates: Requirements 7.8–7.9, 12.1–12.6
 */

import { requireAdmin } from '../../_auth';

// Editable position fields allowed via PATCH
const EDITABLE_FIELDS = [
  'sl',
  'tp',
  'qty_open',
  'avg_price',
  'ltp',
  'exit_price',
  'duration_seconds',
  'brokerage',
  'settlement',
  'status',
  'qty_total',
] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient, callerUser } = authResult;

    // Step 2: Resolve params
    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    // Step 3: Parse JSON body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Step 4: Fetch existing position row
    const { data: existingPosition, error: fetchError } = await adminClient
      .from('positions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingPosition) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 5: Extract only editable fields from body
    const updateFields: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in body) {
        updateFields[field] = body[field];
      }
    }

    // Keep entry_price in sync with avg_price if avg_price is edited
    if ('avg_price' in updateFields) {
      updateFields['entry_price'] = updateFields['avg_price'];
    }

    if (Object.keys(updateFields).length === 0) {
      return Response.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    // Step 6: Construct merged representation to calculate/recalculate PnL
    const mergedPosition = {
      ...existingPosition,
      ...updateFields,
    };

    if (mergedPosition.status === 'closed') {
      const qty = Number(mergedPosition.qty_total || 0);
      const entryPrice = Number(mergedPosition.entry_price || 0);
      const exitPrice = Number(mergedPosition.exit_price || 0);
      const side = mergedPosition.side;
      const calculatedPnl = side === 'BUY'
        ? (exitPrice - entryPrice) * qty
        : (entryPrice - exitPrice) * qty;
      mergedPosition.pnl = calculatedPnl;
      updateFields['pnl'] = calculatedPnl;
    } else {
      // Open / active positions have 0 settled PnL
      updateFields['pnl'] = 0;
      mergedPosition.pnl = 0;
    }

    // Step 7: Update the position row
    const { data: updatedPosition, error: updateError } = await adminClient
      .from('positions')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (updateError || !updatedPosition) {
      return Response.json({ error: 'Failed to update position' }, { status: 500 });
    }

    // Step 7b: Margin adjustment — sync user balance when position value changes
    // Position value = avg_price × qty_total. If admin changes either, the difference
    // must be debited or credited to the user's balance.
    const oldValue = Number(existingPosition.avg_price || 0) * Number(existingPosition.qty_total || 0);
    const newValue = Number(updatedPosition.avg_price || 0) * Number(updatedPosition.qty_total || 0);
    const valueDiff = newValue - oldValue; // positive = user owes more, negative = user gets refund

    if (Math.abs(valueDiff) > 0.01) {
      const adjRefId = `MADJ_${id}`;
      const adjType = valueDiff > 0 ? 'MARGIN_ADJ_DEBIT' : 'MARGIN_ADJ_CREDIT';
      const adjAmount = Math.abs(valueDiff);

      // Check if an adjustment transaction already exists for this position
      const { data: existingAdjTx } = await adminClient
        .from('transactions')
        .select('id, amount, type')
        .eq('ref_id', adjRefId)
        .maybeSingle();

      if (existingAdjTx) {
        // Update existing adjustment transaction
        await adminClient
          .from('transactions')
          .update({
            type: adjType,
            amount: adjAmount,
            status: 'APPROVED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingAdjTx.id);
      } else {
        // Create new adjustment transaction
        await adminClient
          .from('transactions')
          .insert({
            user_id: updatedPosition.user_id,
            type: adjType,
            amount: adjAmount,
            status: 'APPROVED',
            ref_id: adjRefId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
      }
    }

    // Step 8: Sync PnL transaction
    if (updatedPosition.status === 'closed') {
      const { data: existingPnlTx } = await adminClient
        .from('transactions')
        .select('id')
        .eq('ref_id', id)
        .maybeSingle();

      const pnlType = updatedPosition.pnl >= 0 ? 'PNL_CREDIT' : 'PNL_DEBIT';
      const pnlAmount = Math.abs(updatedPosition.pnl);

      if (existingPnlTx) {
        await adminClient
          .from('transactions')
          .update({
            type: pnlType,
            amount: pnlAmount,
            status: 'APPROVED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPnlTx.id);
      } else {
        await adminClient
          .from('transactions')
          .insert({
            user_id: updatedPosition.user_id,
            type: pnlType,
            amount: pnlAmount,
            status: 'APPROVED',
            ref_id: id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
      }
    } else {
      // If status changed to open/active, remove any PnL transaction
      await adminClient
        .from('transactions')
        .delete()
        .eq('ref_id', id);
    }

    // Step 9: Sync Brokerage transaction
    const { data: relatedOrders } = await adminClient
      .from('orders')
      .select('id')
      .eq('user_id', updatedPosition.user_id)
      .eq('symbol', updatedPosition.symbol);

    const orderIds = relatedOrders ? relatedOrders.map((o: any) => o.id) : [];
    const candidateRefIds = [`BKG_${id}`, ...orderIds.map((oId: any) => `BKG_${oId}`)];

    const { data: bkgTxs } = await adminClient
      .from('transactions')
      .select('*')
      .eq('user_id', updatedPosition.user_id)
      .eq('type', 'BROKERAGE_DEBIT')
      .in('ref_id', candidateRefIds);

    const targetBrokerage = Number(updatedPosition.brokerage || 0);

    if (targetBrokerage > 0) {
      if (bkgTxs && bkgTxs.length > 0) {
        // Update first one and delete the rest to avoid duplicates
        const firstBkgTx = bkgTxs[0];
        await adminClient
          .from('transactions')
          .update({
            amount: targetBrokerage,
            ref_id: `BKG_${id}`,
            status: 'APPROVED',
            updated_at: new Date().toISOString(),
          })
          .eq('id', firstBkgTx.id);

        if (bkgTxs.length > 1) {
          const remainingIds = bkgTxs.slice(1).map((tx: any) => tx.id);
          await adminClient
            .from('transactions')
            .delete()
            .in('id', remainingIds);
        }
      } else {
        // Create new brokerage transaction
        await adminClient
          .from('transactions')
          .insert({
            user_id: updatedPosition.user_id,
            type: 'BROKERAGE_DEBIT',
            amount: targetBrokerage,
            status: 'APPROVED',
            ref_id: `BKG_${id}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
      }
    } else {
      // If brokerage updated to 0, clean up any existing transactions
      if (bkgTxs && bkgTxs.length > 0) {
        await adminClient
          .from('transactions')
          .delete()
          .in('id', bkgTxs.map((tx: any) => tx.id));
      }
    }

    // Step 10: Log action to act_logs
    const adjInfo = Math.abs(valueDiff) > 0.01
      ? `, Margin Adj: ${valueDiff > 0 ? '-' : '+'}₹${Math.abs(valueDiff).toFixed(2)} (${valueDiff > 0 ? 'debited' : 'credited'})`
      : '';
    await adminClient.from('act_logs').insert({
      type: 'POSITION_EDIT',
      user_id: callerUser.id,
      target_user_id: updatedPosition.user_id,
      symbol: updatedPosition.symbol,
      qty: updatedPosition.qty_total,
      price: updatedPosition.avg_price,
      reason: `Admin updated position ${id}. Status: ${updatedPosition.status}, PnL: ${updatedPosition.pnl}, Brokerage: ${updatedPosition.brokerage}${adjInfo}`,
    });

    // Step 11: Return the updated position row
    return Response.json(updatedPosition, { status: 200 });
  } catch (error) {
    console.error('[PATCH /api/admin/positions/[id]] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient, callerUser } = authResult;

    // Step 2: Resolve params
    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    // Step 3: Fetch the position details before deletion to clean up transactions & log
    const { data: position, error: fetchError } = await adminClient
      .from('positions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !position) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 4: Delete associated PnL transaction
    await adminClient
      .from('transactions')
      .delete()
      .eq('ref_id', id);

    // Step 5: Delete associated Brokerage transaction(s)
    const { data: relatedOrders } = await adminClient
      .from('orders')
      .select('id')
      .eq('user_id', position.user_id)
      .eq('symbol', position.symbol);

    const orderIds = relatedOrders ? relatedOrders.map((o: any) => o.id) : [];
    const candidateRefIds = [`BKG_${id}`, ...orderIds.map((oId: any) => `BKG_${oId}`)];

    await adminClient
      .from('transactions')
      .delete()
      .eq('user_id', position.user_id)
      .eq('type', 'BROKERAGE_DEBIT')
      .in('ref_id', candidateRefIds);

    // Step 6: Delete the position row
    const { error: deleteError, count } = await adminClient
      .from('positions')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (deleteError) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (count === 0) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 7: Log action to act_logs
    await adminClient.from('act_logs').insert({
      type: 'POSITION_DELETE',
      user_id: callerUser.id,
      target_user_id: position.user_id,
      symbol: position.symbol,
      qty: position.qty_total,
      price: position.avg_price,
      reason: `Admin deleted position ${id}. Status was: ${position.status}, PnL was: ${position.pnl}, Brokerage was: ${position.brokerage}`,
    });

    // Step 8: Return success
    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[DELETE /api/admin/positions/[id]] Error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
