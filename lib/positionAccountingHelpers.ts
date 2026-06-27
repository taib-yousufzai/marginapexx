/**
 * Pure helper functions for position accounting logic.
 *
 * These functions are isolated here (no external imports) so they can be
 * unit-tested without loading the full Next.js API route, which requires
 * path-alias resolution (@/...) that vitest does not support out of the box.
 *
 * Used by: app/api/admin/positions/[id]/route.ts
 */

/**
 * Computes the settled PnL for a closed position.
 *
 * BUY:  profit when exit > entry  →  (exitPrice - entryPrice) × qty
 * SELL: profit when entry > exit  →  (entryPrice - exitPrice) × qty
 *
 * A negative result is a loss that should be settled as a PNL_DEBIT transaction.
 */
export function calculateClosedPnl(
  side: string,
  entryPrice: number,
  exitPrice: number,
  qty: number,
): number {
  return side === 'BUY'
    ? (exitPrice - entryPrice) * qty
    : (entryPrice - exitPrice) * qty;
}

/**
 * Determines whether a PATCH update payload would affect floating PnL on an
 * open position.  Any such change must trigger a full account-level liquidation
 * check.
 *
 * PnL-affecting fields:
 *   - avg_price   — the entry reference price used in the PnL formula
 *   - qty_open    — the open quantity (position size)
 *   - qty_total   — total quantity (used for closed PnL recalculation)
 *   - ltp         — the current mark price; changing it directly shifts floating PnL
 *
 * NOTE: ltp was previously missing from this check, which was the root cause of
 * Issue 2 (admin ltp edits bypassing the liquidation risk engine).
 */
export function pnlAffectingFieldsChanged(updateFields: Record<string, unknown>): boolean {
  return (
    'avg_price' in updateFields ||
    'qty_open' in updateFields ||
    'qty_total' in updateFields ||
    'ltp' in updateFields ||
    'side' in updateFields
  );
}

/**
 * Returns true only when the admin has explicitly reopened a previously closed
 * position (status transitioned from 'closed' → something other than 'closed').
 *
 * This is the ONLY case where the existing PNL_CREDIT/DEBIT transaction should be
 * deleted.  For all other open-position edits (ltp, sl, tp, qty, etc.) we must NOT
 * touch the PnL transaction because:
 *   a) close_position() stores the settled PnL transaction with ref_id = position_id
 *   b) Deleting it reverses the realized loss from the user's wallet
 *      — the root cause of Issue 1 ("losses getting reset after square-off")
 */
export function isStatusExplicitlyReopened(
  updateFields: Record<string, unknown>,
  existingStatus: string,
  updatedStatus: string,
): boolean {
  return (
    'status' in updateFields &&
    existingStatus === 'closed' &&
    updatedStatus !== 'closed'
  );
}
