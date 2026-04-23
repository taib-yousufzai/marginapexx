// Feature: admin-panel-live-data, Property 2: Dashboard deposit/withdrawal arithmetic
// Feature: admin-panel-live-data, Property 3: Dashboard position metrics arithmetic
// Feature: admin-panel-live-data, Property 4: Dashboard cache TTL

/**
 * Property-based tests for Admin Dashboard API route.
 *
 * Feature: admin-panel-live-data
 *
 * Tests the pure computation functions exported from GET /api/admin/users/[id]/dashboard.
 * Uses fast-check to verify correctness properties from the design document.
 *
 * Validates: Requirements 3.3, 3.4, 3.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { computeTransactionMetrics, computePositionMetrics, GET, type TransactionRecord, type PositionRecord } from '../route';

// ---------------------------------------------------------------------------
// Mocks for Property 4 (Dashboard cache TTL)
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockSingle = vi.fn();
const mockGt = vi.fn();
const mockEqDateTo = vi.fn();
const mockEqDateFrom = vi.fn();
const mockEqUserId = vi.fn();
const mockSelectMetrics = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const transactionArb = fc.record({
  type: fc.constantFrom('DEPOSIT', 'WITHDRAWAL'),
  amount: fc.float({ min: 1, max: 1e6, noNaN: true }),
});

const transactionsArrayArb = fc.array(transactionArb);

// ---------------------------------------------------------------------------
// Property 2: Dashboard deposit/withdrawal arithmetic
// Feature: admin-panel-live-data, Property 2: Dashboard deposit/withdrawal arithmetic
// Validates: Requirements 3.3
// ---------------------------------------------------------------------------

describe('Admin Dashboard API - Property 2: Dashboard deposit/withdrawal arithmetic', () => {
  // Feature: admin-panel-live-data, Property 2: Dashboard deposit/withdrawal arithmetic
  // Validates: Requirements 3.3

  it('total_deposits equals sum of all DEPOSIT amounts', async () => {
    await fc.assert(
      fc.asyncProperty(transactionsArrayArb, async (txns) => {
        const result = computeTransactionMetrics(txns as TransactionRecord[]);
        const expectedDeposits = txns
          .filter((t) => t.type === 'DEPOSIT')
          .reduce((sum, t) => sum + t.amount, 0);
        
        // Allow small floating point error
        return Math.abs(result.total_deposits - expectedDeposits) < 0.01;
      }),
      { numRuns: 100 },
    );
  });

  it('total_withdrawals equals sum of all WITHDRAWAL amounts', async () => {
    await fc.assert(
      fc.asyncProperty(transactionsArrayArb, async (txns) => {
        const result = computeTransactionMetrics(txns as TransactionRecord[]);
        const expectedWithdrawals = txns
          .filter((t) => t.type === 'WITHDRAWAL')
          .reduce((sum, t) => sum + t.amount, 0);
        
        // Allow small floating point error
        return Math.abs(result.total_withdrawals - expectedWithdrawals) < 0.01;
      }),
      { numRuns: 100 },
    );
  });

  it('net equals total_deposits minus total_withdrawals', async () => {
    await fc.assert(
      fc.asyncProperty(transactionsArrayArb, async (txns) => {
        const result = computeTransactionMetrics(txns as TransactionRecord[]);
        const expectedNet = result.total_deposits - result.total_withdrawals;
        
        // Allow small floating point error
        return Math.abs(result.net - expectedNet) < 0.01;
      }),
      { numRuns: 100 },
    );
  });

  it('avg_deposit equals total_deposits divided by deposit count (or 0 when count is 0)', async () => {
    await fc.assert(
      fc.asyncProperty(transactionsArrayArb, async (txns) => {
        const result = computeTransactionMetrics(txns as TransactionRecord[]);
        const deposits = txns.filter((t) => t.type === 'DEPOSIT');
        const depositCount = deposits.length;
        
        if (depositCount === 0) {
          return result.avg_deposit === 0;
        }
        
        const expectedAvg = result.total_deposits / depositCount;
        // Allow small floating point error
        return Math.abs(result.avg_deposit - expectedAvg) < 0.01;
      }),
      { numRuns: 100 },
    );
  });

  it('avg_withdrawal equals total_withdrawals divided by withdrawal count (or 0 when count is 0)', async () => {
    await fc.assert(
      fc.asyncProperty(transactionsArrayArb, async (txns) => {
        const result = computeTransactionMetrics(txns as TransactionRecord[]);
        const withdrawals = txns.filter((t) => t.type === 'WITHDRAWAL');
        const withdrawalCount = withdrawals.length;
        
        if (withdrawalCount === 0) {
          return result.avg_withdrawal === 0;
        }
        
        const expectedAvg = result.total_withdrawals / withdrawalCount;
        // Allow small floating point error
        return Math.abs(result.avg_withdrawal - expectedAvg) < 0.01;
      }),
      { numRuns: 100 },
    );
  });

  it('all arithmetic properties hold simultaneously for any transaction array', async () => {
    await fc.assert(
      fc.asyncProperty(transactionsArrayArb, async (txns) => {
        const result = computeTransactionMetrics(txns as TransactionRecord[]);
        
        // Compute expected values
        const deposits = txns.filter((t) => t.type === 'DEPOSIT');
        const withdrawals = txns.filter((t) => t.type === 'WITHDRAWAL');
        
        const expectedTotalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);
        const expectedTotalWithdrawals = withdrawals.reduce((sum, t) => sum + t.amount, 0);
        const expectedNet = expectedTotalDeposits - expectedTotalWithdrawals;
        const expectedAvgDeposit = deposits.length > 0 ? expectedTotalDeposits / deposits.length : 0;
        const expectedAvgWithdrawal = withdrawals.length > 0 ? expectedTotalWithdrawals / withdrawals.length : 0;
        
        // Verify all properties simultaneously
        const epsilon = 0.01;
        return (
          Math.abs(result.total_deposits - expectedTotalDeposits) < epsilon &&
          Math.abs(result.total_withdrawals - expectedTotalWithdrawals) < epsilon &&
          Math.abs(result.net - expectedNet) < epsilon &&
          Math.abs(result.avg_deposit - expectedAvgDeposit) < epsilon &&
          Math.abs(result.avg_withdrawal - expectedAvgWithdrawal) < epsilon
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Dashboard position metrics arithmetic
// Feature: admin-panel-live-data, Property 3: Dashboard position metrics arithmetic
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------

const positionArb = fc.record({
  pnl: fc.float({ min: -1e6, max: 1e6, noNaN: true }),
  side: fc.constantFrom('BUY', 'SELL'),
});

const positionsArrayArb = fc.array(positionArb);

describe('Admin Dashboard API - Property 3: Dashboard position metrics arithmetic', () => {
  // Feature: admin-panel-live-data, Property 3: Dashboard position metrics arithmetic
  // Validates: Requirements 3.4

  it('avg_profit equals mean of pnl > 0 (or 0 when none)', async () => {
    await fc.assert(
      fc.asyncProperty(positionsArrayArb, async (positions) => {
        const result = computePositionMetrics(positions as PositionRecord[]);
        const profits = positions.filter((p) => p.pnl > 0);

        if (profits.length === 0) {
          return result.avg_profit === 0;
        }

        const expectedAvgProfit = profits.reduce((s, p) => s + p.pnl, 0) / profits.length;
        return Math.abs(result.avg_profit - expectedAvgProfit) < 0.01;
      }),
      { numRuns: 100 },
    );
  });

  it('avg_loss equals mean of pnl < 0 (or 0 when none)', async () => {
    await fc.assert(
      fc.asyncProperty(positionsArrayArb, async (positions) => {
        const result = computePositionMetrics(positions as PositionRecord[]);
        const losses = positions.filter((p) => p.pnl < 0);

        if (losses.length === 0) {
          return result.avg_loss === 0;
        }

        const expectedAvgLoss = losses.reduce((s, p) => s + p.pnl, 0) / losses.length;
        return Math.abs(result.avg_loss - expectedAvgLoss) < 0.01;
      }),
      { numRuns: 100 },
    );
  });

  it('profitable_clients equals count of positions with pnl > 0', async () => {
    await fc.assert(
      fc.asyncProperty(positionsArrayArb, async (positions) => {
        const result = computePositionMetrics(positions as PositionRecord[]);
        const expectedCount = positions.filter((p) => p.pnl > 0).length;
        return result.profitable_clients === expectedCount;
      }),
      { numRuns: 100 },
    );
  });

  it('loss_making_clients equals count of positions with pnl < 0', async () => {
    await fc.assert(
      fc.asyncProperty(positionsArrayArb, async (positions) => {
        const result = computePositionMetrics(positions as PositionRecord[]);
        const expectedCount = positions.filter((p) => p.pnl < 0).length;
        return result.loss_making_clients === expectedCount;
      }),
      { numRuns: 100 },
    );
  });

  it('buy_position_count equals count of positions with side = BUY', async () => {
    await fc.assert(
      fc.asyncProperty(positionsArrayArb, async (positions) => {
        const result = computePositionMetrics(positions as PositionRecord[]);
        const expectedCount = positions.filter((p) => p.side === 'BUY').length;
        return result.buy_position_count === expectedCount;
      }),
      { numRuns: 100 },
    );
  });

  it('sell_position_count equals count of positions with side = SELL', async () => {
    await fc.assert(
      fc.asyncProperty(positionsArrayArb, async (positions) => {
        const result = computePositionMetrics(positions as PositionRecord[]);
        const expectedCount = positions.filter((p) => p.side === 'SELL').length;
        return result.sell_position_count === expectedCount;
      }),
      { numRuns: 100 },
    );
  });

  it('all position metrics properties hold simultaneously for any positions array', async () => {
    await fc.assert(
      fc.asyncProperty(positionsArrayArb, async (positions) => {
        const result = computePositionMetrics(positions as PositionRecord[]);

        const profits = positions.filter((p) => p.pnl > 0);
        const losses = positions.filter((p) => p.pnl < 0);

        const expectedAvgProfit =
          profits.length > 0 ? profits.reduce((s, p) => s + p.pnl, 0) / profits.length : 0;
        const expectedAvgLoss =
          losses.length > 0 ? losses.reduce((s, p) => s + p.pnl, 0) / losses.length : 0;
        const expectedProfitable = profits.length;
        const expectedLossMaking = losses.length;
        const expectedBuy = positions.filter((p) => p.side === 'BUY').length;
        const expectedSell = positions.filter((p) => p.side === 'SELL').length;

        const epsilon = 0.01;
        return (
          Math.abs(result.avg_profit - expectedAvgProfit) < epsilon &&
          Math.abs(result.avg_loss - expectedAvgLoss) < epsilon &&
          result.profitable_clients === expectedProfitable &&
          result.loss_making_clients === expectedLossMaking &&
          result.buy_position_count === expectedBuy &&
          result.sell_position_count === expectedSell
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Dashboard cache TTL
// Feature: admin-panel-live-data, Property 4: Dashboard cache TTL
// Validates: Requirements 3.7
// ---------------------------------------------------------------------------

/**
 * Helper: build a GET request for the dashboard route with a valid admin Bearer token.
 */
function makeDashboardRequest(userId: string, dateFrom?: string, dateTo?: string): Request {
  const url = new URL(`http://localhost/api/admin/users/${userId}/dashboard`);
  if (dateFrom) url.searchParams.set('date_from', dateFrom);
  if (dateTo) url.searchParams.set('date_to', dateTo);
  return new Request(url.toString(), {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-admin-token' },
  });
}

/**
 * Set up the Supabase mock chain for a cache hit:
 *   adminClient.from('dashboard_cache').select('metrics').eq(...).eq(...).eq(...).gt(...).single()
 *   → returns { data: { metrics: cachedMetrics }, error: null }
 */
function setupCacheHit(cachedMetrics: Record<string, unknown>): void {
  mockSingle.mockResolvedValue({ data: { metrics: cachedMetrics }, error: null });
  mockGt.mockReturnValue({ single: mockSingle });
  mockEqDateTo.mockReturnValue({ gt: mockGt });
  mockEqDateFrom.mockReturnValue({ eq: mockEqDateTo });
  mockEqUserId.mockReturnValue({ eq: mockEqDateFrom });
  mockSelectMetrics.mockReturnValue({ eq: mockEqUserId });
  mockFrom.mockReturnValue({ select: mockSelectMetrics });
}

beforeEach(() => {
  vi.clearAllMocks();

  // Default: authenticated admin caller
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'admin-user-id',
        user_metadata: { role: 'admin' },
      },
    },
    error: null,
  });

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

describe('Admin Dashboard API - Property 4: Dashboard cache TTL', () => {
  // Feature: admin-panel-live-data, Property 4: Dashboard cache TTL
  // Validates: Requirements 3.7

  /**
   * Arbitrary: a Date within the last 4 minutes (i.e. less than 5 minutes old).
   * The route considers cache fresh when computed_at > now() - 5 minutes.
   */
  const recentComputedAtArb = fc.date({
    min: new Date(Date.now() - 4 * 60 * 1000),
    max: new Date(),
  });

  /**
   * Arbitrary: a realistic cached metrics object with numeric fields.
   */
  const cachedMetricsArb = fc.record({
    ledger_balance: fc.float({ min: -1e6, max: 1e6, noNaN: true }),
    mark_to_market: fc.float({ min: -1e6, max: 1e6, noNaN: true }),
    net: fc.float({ min: -1e6, max: 1e6, noNaN: true }),
    total_deposits: fc.float({ min: 0, max: 1e6, noNaN: true }),
    total_withdrawals: fc.float({ min: 0, max: 1e6, noNaN: true }),
    avg_deposit: fc.float({ min: 0, max: 1e6, noNaN: true }),
    avg_withdrawal: fc.float({ min: 0, max: 1e6, noNaN: true }),
    avg_profit: fc.float({ min: 0, max: 1e6, noNaN: true }),
    avg_loss: fc.float({ min: -1e6, max: 0, noNaN: true }),
    profitable_clients: fc.integer({ min: 0, max: 1000 }),
    loss_making_clients: fc.integer({ min: 0, max: 1000 }),
    buy_position_count: fc.integer({ min: 0, max: 1000 }),
    sell_position_count: fc.integer({ min: 0, max: 1000 }),
    registered: fc.integer({ min: 0, max: 1000 }),
    added_funds: fc.integer({ min: 0, max: 1000 }),
    conversion: fc.string(),
  });

  it('returns cached metrics unchanged when computed_at is less than 5 minutes old', async () => {
    await fc.assert(
      fc.asyncProperty(
        recentComputedAtArb,
        cachedMetricsArb,
        fc.uuid(),
        async (computedAt, cachedMetrics, userId) => {
          // Arrange: mock Supabase to return a cache hit with the generated computed_at
          // The route queries: .gt('computed_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
          // Since computedAt is within the last 4 minutes, it satisfies this condition.
          setupCacheHit(cachedMetrics);

          // Act: call the route handler
          const req = makeDashboardRequest(userId);
          const res = await GET(req, { params: { id: userId } });

          // Assert: route returns 200 with the cached metrics unchanged
          if (res.status !== 200) return false;

          const body = await res.json();

          // Every key in cachedMetrics must be present in the response with the same value
          for (const [key, value] of Object.entries(cachedMetrics)) {
            if (body[key] !== value) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 200 status when cache hit occurs for any recent computed_at', async () => {
    await fc.assert(
      fc.asyncProperty(
        recentComputedAtArb,
        cachedMetricsArb,
        fc.uuid(),
        async (_computedAt, cachedMetrics, userId) => {
          setupCacheHit(cachedMetrics);

          const req = makeDashboardRequest(userId);
          const res = await GET(req, { params: { id: userId } });

          return res.status === 200;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('response body equals cached metrics object exactly on cache hit', async () => {
    await fc.assert(
      fc.asyncProperty(
        recentComputedAtArb,
        cachedMetricsArb,
        fc.uuid(),
        async (_computedAt, cachedMetrics, userId) => {
          setupCacheHit(cachedMetrics);

          const req = makeDashboardRequest(userId);
          const res = await GET(req, { params: { id: userId } });
          const body = await res.json();

          // The response body must be deeply equal to the cached metrics
          const cachedKeys = Object.keys(cachedMetrics);
          const bodyKeys = Object.keys(body);

          // Same number of keys
          if (cachedKeys.length !== bodyKeys.length) return false;

          // All values match
          for (const key of cachedKeys) {
            if (body[key] !== (cachedMetrics as Record<string, unknown>)[key]) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
