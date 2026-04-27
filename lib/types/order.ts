/**
 * Shared order types used across API routes, hooks, and UI.
 */

export type OrderSide        = 'BUY' | 'SELL';
export type OrderType        = 'MARKET' | 'LIMIT' | 'SLM' | 'GTT';
export type ProductType      = 'INTRADAY' | 'CARRY';
export type OrderStatus      = 'PENDING' | 'EXECUTED' | 'CANCELLED' | 'REJECTED';

// ─── Request (client → POST /api/orders) ─────────────────────────────────────
export interface PlaceOrderRequest {
  /** Short display symbol e.g. "NIFTY FUT" */
  symbol: string;
  /** Kite quote instrument key e.g. "NFO:NIFTY25MAYFUT"  */
  kite_instrument: string;
  /** Platform segment label e.g. "INDEX - FUTURE" */
  segment: string;
  side: OrderSide;
  order_type: OrderType;
  product_type: ProductType;
  /** Actual units (lots already converted) */
  qty: number;
  /** Number of lots for display */
  lots: number;
  /**
   * Client-side last known price — used only as fallback if Kite LTP fetch
   * fails. Server always prefers its own Kite quote fetch.
   */
  client_price: number;
}

// ─── Response (POST /api/orders) ─────────────────────────────────────────────
export interface PlaceOrderResponse {
  order_id: string;
  status: OrderStatus;
  fill_price: number;
  message: string;
}

// ─── Platform order row (GET /api/orders) ────────────────────────────────────
export interface MyOrder {
  id: string;
  symbol: string;
  segment: string;
  side: OrderSide;
  status: OrderStatus;
  qty: number;
  lots: number;
  fill_price: number;
  ltp_at_entry: number;
  order_type: OrderType;
  product_type: ProductType;
  info: string | null;
  created_at: string;
}

// ─── Platform position row ───────────────────────────────────────────────────
export interface MyPosition {
  id: string;
  symbol: string;
  side: OrderSide;
  status: 'open' | 'active' | 'closed';
  qty_open: number;
  qty_total: number;
  avg_price: number;
  entry_price: number;
  exit_price: number | null;
  ltp: number | null;
  pnl: number;
  duration_seconds: number;
  entry_time: string;
  exit_time: string | null;
  created_at: string;
}

// ─── Close position response (POST /api/positions/[id]/close) ────────────────
export interface ClosePositionResponse {
  pnl: number;
  exit_price: number;
  message: string;
}
