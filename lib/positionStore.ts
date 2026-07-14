import { getAdminClient } from './adminClient';
import {
  validateOrder,
  positionKeyString,
  ERRORS,
} from './positionValidator';
import type {
  PositionState,
  IncomingOrder,
  PositionKey,
  PositionKeyString,
  PositionSide,
} from './positionValidator';
import { parseOptionSymbol } from './parseOptionSymbol';

// Re-export so existing imports of parseOptionSymbol from positionStore still work.
export { parseOptionSymbol };

class PositionStoreClass {
  // Map of userId -> Map of positionKeyString -> PositionState
  private cache = new Map<string, Map<PositionKeyString, PositionState>>();
  private initializedUsers = new Set<string>();
  private activeSubscription = false;

  /**
   * Initializes the store for a given user by fetching open positions from Supabase.
   */
  async initialize(userId: string): Promise<void> {
    try {
      const admin = getAdminClient();
      const { data, error } = await admin
        .from('positions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'open');

      if (error) {
        throw new Error(error.message);
      }

      const userMap = new Map<PositionKeyString, PositionState>();

      if (data) {
        for (const row of data) {
          const parsed = parseOptionSymbol(row.symbol);
          if (parsed) {
            const keyStr = positionKeyString({ symbol: row.symbol, strike_price: parsed.strike, option_type: parsed.optionType });
            userMap.set(keyStr, {
              strike_price: parsed.strike,
              option_type: parsed.optionType,
              side: row.side as PositionSide,
              quantity: Number(row.qty_open),
            });
          }
        }
      }

      this.cache.set(userId, userMap);
      this.initializedUsers.add(userId);

      // Setup global real-time subscription if not already done
      this.setupRealtimeSubscription();
    } catch (err) {
      console.error(`[PositionStore] Failed to initialize for user ${userId}:`, err);
      throw new Error(ERRORS.POSITION_STORE_UNAVAILABLE);
    }
  }

  private setupRealtimeSubscription() {
    if (this.activeSubscription) return;
    this.activeSubscription = true;

    try {
      const admin = getAdminClient();
      admin
        .channel('public-positions-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'positions' },
          (payload) => {
            const newRow = payload.new as any;
            const oldRow = payload.old as any;
            const row = newRow || oldRow;
            if (!row || !row.user_id) return;

            const userId = row.user_id;
            // If the user is not initialized in memory, don't update to avoid partial cache state
            if (!this.initializedUsers.has(userId)) return;

            const userMap = this.cache.get(userId) || new Map<PositionKeyString, PositionState>();

            const parsed = parseOptionSymbol(row.symbol);
            if (!parsed) return;

            const keyStr = positionKeyString({ symbol: row.symbol, strike_price: parsed.strike, option_type: parsed.optionType });

            if (row.status === 'open' && Number(row.qty_open) > 0) {
              userMap.set(keyStr, {
                strike_price: parsed.strike,
                option_type: parsed.optionType,
                side: row.side as PositionSide,
                quantity: Number(row.qty_open),
              });
            } else {
              userMap.delete(keyStr);
            }
            this.cache.set(userId, userMap);
          }
        )
        .subscribe();
    } catch (err) {
      console.error('[PositionStore] Failed to setup realtime subscription:', err);
    }
  }

  /**
   * Reconciles cache against the DB, logs drift, and updates cache.
   */
  async reconcile(userId: string): Promise<void> {
    this.initializedUsers.delete(userId);
    await this.initialize(userId);
  }

  /**
   * Retrieves a cached position.
   */
  async getPosition(userId: string, key: PositionKey): Promise<PositionState | null> {
    if (!this.initializedUsers.has(userId)) {
      await this.initialize(userId);
    }
    const userMap = this.cache.get(userId);
    const keyStr = positionKeyString(key);
    return userMap?.get(keyStr) ?? null;
  }

  /**
   * Helper to fetch all open positions of a user.
   */
  async getOpenPositions(userId: string): Promise<PositionState[]> {
    if (!this.initializedUsers.has(userId)) {
      await this.initialize(userId);
    }
    const userMap = this.cache.get(userId);
    return userMap ? Array.from(userMap.values()) : [];
  }

  /**
   * Validates and applies an order.
   * Updates database via RPC or existing client flow and updates in-memory cache atomically.
   */
  async applyOrder<T>(
    userId: string,
    order: IncomingOrder,
    dbCall: () => Promise<T>,
  ): Promise<T> {
    const currentPosition = await this.getPosition(userId, order.position_key);
    
    // Validate order
    const result = validateOrder(order, currentPosition);
    if (!result.valid) {
      throw new Error(result.error);
    }

    // Call the database function to persist the order / update positions
    const dbResult = await dbCall();

    // Update the cache immediately for latency and consistency
    const userMap = this.cache.get(userId) || new Map<PositionKeyString, PositionState>();
    const keyStr = positionKeyString(order.position_key);

    let nextQty = currentPosition?.quantity ?? 0;
    let nextSide: PositionSide = currentPosition?.side ?? null;

    if (order.action === 'BUY') {
      if (nextSide === null) nextSide = 'BUY';
      nextQty += order.quantity;
    } else if (order.action === 'SELL') {
      if (nextSide === null) nextSide = 'SELL';
      nextQty += order.quantity;
    } else if (order.action === 'BUY_EXIT') {
      nextQty -= order.quantity;
      if (nextQty <= 0) {
        nextQty = 0;
        nextSide = null;
      }
    } else if (order.action === 'SELL_EXIT') {
      nextQty -= order.quantity;
      if (nextQty <= 0) {
        nextQty = 0;
        nextSide = null;
      }
    }

    if (nextQty > 0 && nextSide !== null) {
      userMap.set(keyStr, {
        strike_price: order.position_key.strike_price,
        option_type: order.position_key.option_type,
        side: nextSide,
        quantity: nextQty,
      });
    } else {
      userMap.delete(keyStr);
    }

    this.cache.set(userId, userMap);
    return dbResult;
  }

  // Clear memory cache (useful for testing)
  clear() {
    this.cache.clear();
    this.initializedUsers.clear();
  }
}

export const positionStore = new PositionStoreClass();
