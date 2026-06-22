import { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from './adminClient.ts';
import { telemetry } from './metrics.ts';

export interface Quote {
  id: string; // e.g. "NSE:INFY"
  last_price: number;
}

export class InMemoryMatchingEngine {
  public isInitialized = false;
  public activeOrders = new Map<string, any>();
  public activePositions = new Map<string, any>();
  public userProfiles = new Map<string, any>();
  public segmentSettings = new Map<string, any>();

  public async initialize() {
    const admin = getAdminClient();

    const dbStart = performance.now();
    // 1. Fetch pending orders and open positions
    const [ordersRes, positionsRes] = await Promise.all([
      admin.from('orders').select('*').eq('status', 'PENDING'),
      admin.from('positions').select('*').eq('status', 'open')
    ]);

    const pendingOrders = ordersRes.data ?? [];
    const openPositions = positionsRes.data ?? [];

    this.activeOrders.clear();
    for (const order of pendingOrders) {
      this.activeOrders.set(order.id, order);
    }

    this.activePositions.clear();
    for (const pos of openPositions) {
      this.activePositions.set(pos.id, pos);
    }

    // 2. Fetch user profiles and segment settings for involved users
    const userIds = Array.from(new Set([
      ...pendingOrders.map(o => o.user_id),
      ...openPositions.map(p => p.user_id)
    ]));

    this.segmentSettings.clear();
    this.userProfiles.clear();

    if (userIds.length > 0) {
      const [segSettingsRes, profilesRes] = await Promise.all([
        admin
          .from('segment_settings')
          .select('user_id, segment, side, entry_buffer, exit_buffer')
          .in('user_id', userIds),
        admin
          .from('profiles')
          .select('id, balance, auto_sqoff')
          .in('id', userIds)
      ]);

      if (segSettingsRes.data) {
        for (const s of segSettingsRes.data) {
          const key = `${s.user_id}|${s.segment}|${s.side}`;
          this.segmentSettings.set(key, {
            entry_buffer: Number(s.entry_buffer ?? 0.003),
            exit_buffer: Number(s.exit_buffer ?? 0.0017)
          });
        }
      }

      if (profilesRes.data) {
        const dataArr = Array.isArray(profilesRes.data) ? profilesRes.data : [profilesRes.data];
        for (const p of dataArr) {
          if (p && p.id) {
            this.userProfiles.set(p.id, p);
          } else if (p && userIds.length === 1) {
            this.userProfiles.set(userIds[0], p);
          }
        }
      }
    }

    telemetry.recordDbCall('read', performance.now() - dbStart);
    this.isInitialized = true;
  }

  public setupRealtimeSync() {
    const admin = getAdminClient();

    admin
      .channel('matching-engine-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
        const row = (payload.new || payload.old) as any;
        if (!row || !row.id) return;
        if (row.status === 'PENDING') {
          this.activeOrders.set(row.id, row);
        } else {
          this.activeOrders.delete(row.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, (payload) => {
        const row = (payload.new || payload.old) as any;
        if (!row || !row.id) return;
        if (row.status === 'open') {
          this.activePositions.set(row.id, row);
        } else {
          this.activePositions.delete(row.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        const row = payload.new as any;
        if (row && row.id) {
          this.userProfiles.set(row.id, row);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'segment_settings' }, (payload) => {
        const row = payload.new as any;
        if (row && row.user_id) {
          const key = `${row.user_id}|${row.segment}|${row.side}`;
          this.segmentSettings.set(key, {
            entry_buffer: Number(row.entry_buffer ?? 0.003),
            exit_buffer: Number(row.exit_buffer ?? 0.0017)
          });
        }
      })
      .subscribe();
  }

  public async process(quotes: Quote[]) {
    const start = performance.now();
    const admin = getAdminClient();

    // Build lookup map of prices
    const pricesMap = new Map<string, number>();
    for (const quote of quotes) {
      pricesMap.set(quote.id, quote.last_price);
    }

    const pendingOrders = Array.from(this.activeOrders.values());
    const openPositions = Array.from(this.activePositions.values());

    // 1. PROCESS PENDING ORDERS
    if (pendingOrders.length > 0) {
      for (const order of pendingOrders) {
        const symbolKey = order.kite_instrument || order.symbol;
        const ltp = pricesMap.get(symbolKey);

        if (ltp === undefined || ltp <= 0) {
          continue;
        }

        let shouldTrigger = false;

        const orderType = order.order_type;
        const side = order.side;
        const triggerPrice = order.trigger_price ? Number(order.trigger_price) : null;
        const limitPrice = order.price ? Number(order.price) : null;

        if (orderType === 'LIMIT' && limitPrice !== null) {
          if (side === 'BUY' && ltp <= limitPrice) {
            shouldTrigger = true;
          } else if (side === 'SELL' && ltp >= limitPrice) {
            shouldTrigger = true;
          }
        } else if ((orderType === 'SL' || orderType === 'SLM') && triggerPrice !== null) {
          if (side === 'BUY' && ltp >= triggerPrice) {
            shouldTrigger = true;
          } else if (side === 'SELL' && ltp <= triggerPrice) {
            shouldTrigger = true;
          }
        } else if (orderType === 'GTT') {
          if (triggerPrice !== null) {
            const ltpAtEntry = order.ltp_at_entry ? Number(order.ltp_at_entry) : null;
            if (side === 'BUY') {
              if (ltpAtEntry !== null && ltpAtEntry < triggerPrice) {
                if (ltp >= triggerPrice) shouldTrigger = true;
              } else {
                if (ltp <= triggerPrice) shouldTrigger = true;
              }
            } else if (side === 'SELL') {
              if (ltpAtEntry !== null && ltpAtEntry > triggerPrice) {
                if (ltp <= triggerPrice) shouldTrigger = true;
              } else {
                if (ltp >= triggerPrice) shouldTrigger = true;
              }
            }
          }

          const stopLoss = order.stop_loss ? Number(order.stop_loss) : null;
          const target = order.target ? Number(order.target) : null;
          if (triggerPrice === null) {
            if (!shouldTrigger && stopLoss !== null) {
              if (side === 'BUY') {
                if (ltp >= stopLoss) shouldTrigger = true;
              } else if (side === 'SELL') {
                if (ltp <= stopLoss) shouldTrigger = true;
              }
            }
            if (!shouldTrigger && target !== null) {
              if (side === 'BUY') {
                if (ltp <= target) shouldTrigger = true;
              } else if (side === 'SELL') {
                if (ltp >= target) shouldTrigger = true;
              }
            }
          }
        }

        if (shouldTrigger) {
          // For exit orders only: verify an opposing open position exists in memory
          // (Entry orders are always allowed — each creates its own position row)
          if (order.is_exit) {
            const existingPos = openPositions.filter((p) => p.symbol === order.symbol);
            if (order.side === 'BUY') {
              if (!existingPos.some((p) => p.side === 'SELL')) continue;
            } else if (order.side === 'SELL') {
              if (!existingPos.some((p) => p.side === 'BUY')) continue;
            }
          }

          // ─── Apply entry/exit buffers (same logic as orders/route.ts) ───
          // fillPrice stays as raw LTP for the user's position record.
          // bufferFee = absolute price difference * qty, charged as BUFFER_FEE_DEBIT.
          const buySetting  = this.segmentSettings.get(`${order.user_id}|${order.segment}|BUY`);
          const sellSetting = this.segmentSettings.get(`${order.user_id}|${order.segment}|SELL`);
          const buyEntryBuffer  = buySetting?.entry_buffer  ?? 0.003;
          const buyExitBuffer   = buySetting?.exit_buffer   ?? 0.0017;
          const sellEntryBuffer = sellSetting?.entry_buffer ?? 0.003;
          const sellExitBuffer  = sellSetting?.exit_buffer  ?? 0.0017;

          let priceWithBuffer = ltp;
          if (order.side === 'BUY') {
            priceWithBuffer = order.is_exit
              ? ltp * (1 + sellExitBuffer)   // buying back a short: ask + exit buffer
              : ltp * (1 + buyEntryBuffer);   // long entry: ask + entry buffer
          } else {
            priceWithBuffer = order.is_exit
              ? ltp * (1 - buyExitBuffer)     // selling to close a long: bid - exit buffer
              : ltp * (1 - sellEntryBuffer);  // short entry: bid - entry buffer
          }

          // Fill price is the actual execution price (ask for BUY, bid for SELL).
          // Buffer is baked into the fill price so avg_price reflects what the user paid.
          const bufferFee = 0;
          const executionFillPrice = Math.round(priceWithBuffer * 100) / 100;

          // Trigger Executed Order Write (Business Event)
          const dbStart = performance.now();
          const { error: updateOrderErr } = await admin
            .from('orders')
            .update({
              status: 'EXECUTED',
              fill_price: executionFillPrice,
              buffer_fee: bufferFee,
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id);

          telemetry.recordDbCall('write', performance.now() - dbStart);

          if (updateOrderErr) {
            console.error(`[Order Matching] Failed to update order ${order.id} to EXECUTED:`, updateOrderErr);
            continue;
          }

          // Update memory cache immediately
          this.activeOrders.delete(order.id);

          const rpcStart = performance.now();
          const { error: rpcErr } = await admin.rpc('process_executed_position', {
            p_order_id: order.id,
          });

          telemetry.recordDbCall('write', performance.now() - rpcStart);
          telemetry.recordTriggerExecution(performance.now() - rpcStart);

          if (rpcErr) {
            console.error(`[Order Matching] Failed to process executed position for order ${order.id}:`, rpcErr);
          }

          const auditStart = performance.now();
          await admin.from('act_logs').insert({
            type: 'ORDER_EXECUTION',
            user_id: order.user_id,
            target_user_id: order.user_id,
            symbol: order.symbol,
            qty: order.qty,
            price: executionFillPrice,
            reason: `${orderType} Order Triggered @ ${ltp}`,
          });
          telemetry.recordDbCall('write', performance.now() - auditStart);
        }
      }
    }

    // 2. PROCESS OPEN POSITIONS
    if (openPositions.length > 0) {
      const userOpenPositions: Record<string, any[]> = {};
      for (const pos of openPositions) {
        if (!userOpenPositions[pos.user_id]) {
          userOpenPositions[pos.user_id] = [];
        }
        userOpenPositions[pos.user_id].push(pos);
      }

      const closedPositionIds = new Set<string>();

      for (const [userId, userPositions] of Object.entries(userOpenPositions)) {
        const profile = this.userProfiles.get(userId);
        if (!profile) continue;

        const balance = Number(profile.balance || 0);
        const autoSqoffPercent = Number(profile.auto_sqoff ?? 90);

        if (balance <= 0 || autoSqoffPercent <= 0) continue;

        const drawdownLimit = - (autoSqoffPercent / 100.0) * balance;
        let totalUnrealised = 0;
        const resolvedPositions = [];

        for (const pos of userPositions) {
          let ltp = pricesMap.get(pos.symbol);

          if (ltp === undefined) {
            for (const key of pricesMap.keys()) {
              if (key === pos.symbol || key.endsWith(`:${pos.symbol}`)) {
                ltp = pricesMap.get(key);
                break;
              }
            }
          }

          if (ltp === undefined || ltp <= 0) {
            ltp = Number(pos.ltp ?? pos.entry_price);
          }

          const entryPrice = Number(pos.entry_price ?? pos.avg_price);
          const qty = Number(pos.qty_open ?? 0);
          const buyExitBuffer = this.segmentSettings.get(`${userId}|${pos.settlement}|BUY`)?.exit_buffer ?? 0.0017;
          const sellExitBuffer = this.segmentSettings.get(`${userId}|${pos.settlement}|SELL`)?.exit_buffer ?? 0.0017;

          const pnl = pos.side === 'BUY' 
            ? ((ltp * (1 - buyExitBuffer)) - entryPrice) * qty 
            : (entryPrice - (ltp * (1 + sellExitBuffer))) * qty;

          totalUnrealised += pnl;

          resolvedPositions.push({ pos, ltp, pnl });
        }

        if (totalUnrealised <= drawdownLimit && userPositions.length > 0) {
          for (const item of resolvedPositions) {
            const pos = item.pos;
            const ltp = item.ltp;

            let exitPrice = ltp;
            if (pos.side === 'BUY') {
              const exitBuffer = this.segmentSettings.get(`${userId}|${pos.settlement}|BUY`)?.exit_buffer ?? 0.0017;
              exitPrice = ltp * (1 - exitBuffer);
            } else {
              const exitBuffer = this.segmentSettings.get(`${userId}|${pos.settlement}|SELL`)?.exit_buffer ?? 0.0017;
              exitPrice = ltp * (1 + exitBuffer);
            }
            exitPrice = Math.round(exitPrice * 10000) / 10000;

            const dbStart = performance.now();
            const { error: closeRpcErr } = await admin.rpc('close_position', {
              p_position_id: pos.id,
              p_user_id: pos.user_id,
              p_ltp: ltp,
              p_exit_price: exitPrice,
              p_closed_by: 'AUTO_SQOFF',
            });

            telemetry.recordDbCall('write', performance.now() - dbStart);
            telemetry.recordTriggerExecution(performance.now() - dbStart);

            if (closeRpcErr) {
              console.error(`[Order Matching] Failed to close position ${pos.id} via close_position RPC during drawdown:`, closeRpcErr);
            } else {
              closedPositionIds.add(pos.id);
              this.activePositions.delete(pos.id);
            }
          }
        }
      }

      // 5. PROCESS STOP LOSS AND TARGET FOR REMAINING OPEN POSITIONS
      for (const pos of openPositions) {
        if (closedPositionIds.has(pos.id)) continue;

        let ltp = pricesMap.get(pos.symbol);

        if (ltp === undefined) {
          // Robust fallback: search pricesMap for any key ending in :pos.symbol
          // This avoids hardcoding exchange prefixes like NFO, BFO, MCX, etc.
          for (const key of pricesMap.keys()) {
            if (key === pos.symbol || key.endsWith(`:${pos.symbol}`)) {
              ltp = pricesMap.get(key);
              break;
            }
          }
        }

        if (ltp === undefined || ltp <= 0) continue;

        let shouldClose = false;
        let closeReason = 'AUTO_SQOFF';

        const stopLoss = pos.stop_loss ? Number(pos.stop_loss) : (pos.sl ? Number(pos.sl) : null);
        const target = pos.target ? Number(pos.target) : (pos.tp ? Number(pos.tp) : null);
        const side = pos.side;

        if (stopLoss !== null && stopLoss > 0) {
          if (side === 'BUY' && ltp <= stopLoss) {
            shouldClose = true;
            closeReason = 'AUTO_SL';
          } else if (side === 'SELL' && ltp >= stopLoss) {
            shouldClose = true;
            closeReason = 'AUTO_SL';
          }
        }

        if (!shouldClose && target !== null && target > 0) {
          if (side === 'BUY' && ltp >= target) {
            shouldClose = true;
            closeReason = 'AUTO_TARGET';
          } else if (side === 'SELL' && ltp <= target) {
            shouldClose = true;
            closeReason = 'AUTO_TARGET';
          }
        }

        if (shouldClose) {
          let exitPrice = ltp;
          const exitBuffer = this.segmentSettings.get(`${pos.user_id}|${pos.settlement}|${pos.side}`)?.exit_buffer ?? 0.0017;
          if (pos.side === 'BUY') {
            exitPrice = ltp * (1 - exitBuffer);
          } else {
            exitPrice = ltp * (1 + exitBuffer);
          }
          exitPrice = Math.round(exitPrice * 10000) / 10000;

          const dbStart = performance.now();
          const { error: closeRpcErr } = await admin.rpc('close_position', {
            p_position_id: pos.id,
            p_user_id: pos.user_id,
            p_ltp: ltp,
            p_exit_price: exitPrice,
            p_closed_by: closeReason,
          });

          telemetry.recordDbCall('write', performance.now() - dbStart);
          telemetry.recordTriggerExecution(performance.now() - dbStart);

          if (closeRpcErr) {
            console.error(`[Order Matching] Failed to close position ${pos.id} via close_position RPC:`, closeRpcErr);
          } else {
            this.activePositions.delete(pos.id);
          }
        }
      }
    }

    const duration = performance.now() - start;
    telemetry.recordMatchingEngine(pendingOrders.length, openPositions.length, duration);
  }
}

export const matchingEngine = new InMemoryMatchingEngine();

export async function processPendingOrdersAndPositions(quotes: Quote[]): Promise<void> {
  if (!quotes || quotes.length === 0) return;

  if (!matchingEngine.isInitialized || process.env.NODE_ENV === 'test') {
    await matchingEngine.initialize();
  }

  await matchingEngine.process(quotes);
}


