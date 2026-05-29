import type { PositionState } from './positionValidator';

export interface PositionDeltaUpdate {
  type: 'delta';
  strike_price: number;
  option_type: 'CE' | 'PE';
  changed_fields: Partial<Omit<PositionState, 'strike_price' | 'option_type'>>;
}

export interface FullStateSnapshot {
  type: 'snapshot';
  positions: PositionState[];
}

/**
 * Computes a delta update containing only changed fields between two states.
 */
export function computeDelta(
  before: PositionState | null,
  after: PositionState | null,
): Partial<PositionState> | null {
  if (!before && !after) return null;

  if (!before && after) {
    return {
      strike_price: after.strike_price,
      option_type: after.option_type,
      side: after.side,
      quantity: after.quantity,
    };
  }

  if (before && !after) {
    return {
      strike_price: before.strike_price,
      option_type: before.option_type,
      side: null,
      quantity: 0,
    };
  }

  const changes: Partial<PositionState> = {};
  let changed = false;

  if (before!.side !== after!.side) {
    changes.side = after!.side;
    changed = true;
  }

  if (before!.quantity !== after!.quantity) {
    changes.quantity = after!.quantity;
    changed = true;
  }

  if (changed) {
    changes.strike_price = after!.strike_price;
    changes.option_type = after!.option_type;
    return changes;
  }

  return null;
}

/**
 * Returns true if a full snapshot is needed due to a long disconnection (>30s).
 */
export function isFullSnapshotNeeded(disconnectedAt: number): boolean {
  const elapsed = Date.now() - disconnectedAt;
  return elapsed > 30000; // 30 seconds
}
