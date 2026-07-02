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
  // Option BUYs always require 100% of the premium (no leverage)
  const isOption = segment.includes('OPT');
  if (isOption && side === 'BUY') {
    return baseExposure;
  }

  // Use the leverageType setting from the admin panel to determine calculation method
  if (leverageType === 'Fixed') {
    // Fixed margin per lot
    return (totalQty / lotSize) * leverage;
  } else if (leverageType === '%') {
    // Percentage of exposure
    return baseExposure * (leverage / 100);
  } else {
    // Default / Multiplier
    return baseExposure / leverage;
  }
}
