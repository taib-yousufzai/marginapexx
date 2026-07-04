/**
 * Carry Brokerage Calculator
 *
 * Calculates the carry brokerage to be charged when a CARRY position is closed.
 * Carry brokerage is deferred from entry-time to exit-time to prevent
 * double-charging when users switch between INTRADAY and CARRY.
 *
 * The carry brokerage covers both entry and exit legs (× 2), calculated
 * based on the carry commission settings from the user's segment settings.
 */

export interface CarryBrokerageParams {
  /** Position's product_type at close time */
  productType: string;
  /** Quantity being closed */
  qty: number;
  /** Price used for exposure calculation (entry_price for entry leg, exit_price for exit leg) */
  entryPrice: number;
  /** Number of lots (if available) */
  lots?: number;
  /** Segment setting carry_commission_type (falls back to commission_type) */
  carryCommissionType?: string | null;
  /** Segment setting carry_commission_value (falls back to commission_value) */
  carryCommissionValue?: number | null;
  /** Segment setting commission_type (fallback for carry) */
  commissionType?: string | null;
  /** Segment setting commission_value (fallback for carry) */
  commissionValue?: number | null;
}

/**
 * Calculate carry brokerage for a position being closed.
 * Returns 0 if the position is not CARRY.
 * Returns the total carry brokerage (entry + exit = × 2).
 */
export function calculateCarryBrokerage(params: CarryBrokerageParams): number {
  if (params.productType !== 'CARRY') return 0;

  const commType = params.carryCommissionType || params.commissionType || 'Per Crore';
  const commVal = Number(params.carryCommissionValue ?? params.commissionValue ?? 0);

  if (commVal <= 0) return 0;

  const exposure = params.qty * params.entryPrice;
  const lots = params.lots ?? params.qty; // fallback to qty if lots unavailable

  let singleLegCharge = 0;

  if (commType === 'Per Crore') {
    singleLegCharge = (exposure * commVal) / 10000000;
  } else if (commType === 'Per Lot') {
    singleLegCharge = lots * commVal;
  } else if (commType === 'Per Trade' || commType === 'Flat') {
    singleLegCharge = commVal;
  } else {
    singleLegCharge = exposure * 0.001; // 0.1% fallback
  }

  // Entry + exit = × 2
  return Math.max(0, Math.round(singleLegCharge * 2 * 100) / 100);
}
