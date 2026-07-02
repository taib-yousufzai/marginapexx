export type LeverageType = '%' | 'Fixed' | 'Multiplier';

interface MarginCalculationParams {
  segment: string;
  side: 'BUY' | 'SELL';
  leverageType: string;
  leverage: number;
  totalQty: number;
  lotSize: number;
  baseExposure: number;
}

export function calculateMarginPortion({
  segment,
  side,
  leverageType,
  leverage,
  totalQty,
  lotSize,
  baseExposure,
}: MarginCalculationParams): number {
  const isOptionSell = segment.toUpperCase().includes('OPT') && side === 'SELL';

  // Option Selling must always use fixed template margins, irrespective of leverageType setting.
  // It should not depend on dynamic variables like baseExposure (which uses premium/LTP).
  if (isOptionSell || leverageType === 'Fixed') {
    return (totalQty / lotSize) * leverage;
  } else if (leverageType === '%') {
    return baseExposure * (leverage / 100);
  } else {
    // Default / Multiplier
    return baseExposure / leverage;
  }
}
