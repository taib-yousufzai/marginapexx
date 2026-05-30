import { useMemo } from 'react';
import { ERRORS } from '../lib/positionValidator';
import type { PositionKey, PositionSide } from '../lib/positionValidator';

export interface PositionGuardState {
  canBuy: boolean;
  canSell: boolean;
  canBuyExit: boolean;
  canSellExit: boolean;
  disabledReason: {
    BUY: string | null;
    SELL: string | null;
    BUY_EXIT: string | null;
    SELL_EXIT: string | null;
  };
}

export function computePositionGuard(
  positionKey: PositionKey | null,
  openPositions: Array<{
    symbol: string;
    side: PositionSide;
    qty_open: number;
  }>,
): PositionGuardState {
  const result: PositionGuardState = {
    canBuy: true,
    canSell: true,
    canBuyExit: true,
    canSellExit: true,
    disabledReason: {
      BUY: null,
      SELL: null,
      BUY_EXIT: null,
      SELL_EXIT: null,
    },
  };

  if (!positionKey) {
    return result;
  }

  const parseSymbol = (sym: string) => {
    const clean = sym.includes(':') ? sym.split(':')[1] : sym;
    const match = clean.toUpperCase().match(/^([A-Z]+)(\d{2}[A-Z0-9]{3})(\d+(?:\.\d+)?)(CE|PE)$/);
    if (!match) return null;
    return {
      strike: parseFloat(match[3]),
      optionType: match[4],
    };
  };

  const matchingPos = openPositions.find((p) => {
    const parsed = parseSymbol(p.symbol);
    return (
      parsed &&
      parsed.strike === positionKey.strike_price &&
      parsed.optionType === positionKey.option_type
    );
  });

  const side = matchingPos ? matchingPos.side : null;
  const quantity = matchingPos ? Number(matchingPos.qty_open) : 0;

  if (side === 'SELL') {
    result.canBuy = false;
    result.disabledReason.BUY = ERRORS.CANNOT_BUY_WHILE_SELL_ACTIVE;
  }
  if (side === 'BUY') {
    result.canSell = false;
    result.disabledReason.SELL = ERRORS.CANNOT_SELL_WHILE_BUY_ACTIVE;
  }

  if (quantity === 0 || side !== 'BUY') {
    result.canBuyExit = false;
    result.disabledReason.BUY_EXIT = ERRORS.NO_ACTIVE_BUY_TO_EXIT;
  }
  if (quantity === 0 || side !== 'SELL') {
    result.canSellExit = false;
    result.disabledReason.SELL_EXIT = ERRORS.NO_ACTIVE_SELL_TO_EXIT;
  }

  return result;
}

export function usePositionGuard(
  positionKey: PositionKey | null,
  openPositions: Array<{
    symbol: string;
    side: PositionSide;
    qty_open: number;
  }>,
): PositionGuardState {
  return useMemo(() => {
    return computePositionGuard(positionKey, openPositions);
  }, [positionKey?.strike_price, positionKey?.option_type, openPositions]);
}
