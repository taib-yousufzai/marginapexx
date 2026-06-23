/**
 * GET  /api/admin/templates/[id]/segments  — get segment settings for a template
 * POST /api/admin/templates/[id]/segments  — upsert segment settings for a template
 *
 * mode query param: 'scalper' | 'normal' (default: 'normal')
 */

import { requireAdmin } from '../../../_auth';

type SegmentInput = {
  segment: string;
  side: 'BUY' | 'SELL';
  commission_type?: string;
  commission_value?: number;
  carry_commission_type?: string;
  carry_commission_value?: number;
  gtt_commission_type?: string;
  gtt_commission_value?: number;
  profit_hold_sec?: number;
  loss_hold_sec?: number;
  strike_range?: number;
  max_lot?: number;
  max_order_lot?: number;
  intraday_leverage?: number;
  intraday_type?: string;
  holding_leverage?: number;
  holding_type?: string;
  entry_buffer?: number;
  exit_buffer?: number;
  trade_allowed?: boolean;
  top_limit?: number;
  min_limit?: number;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const { id } = await Promise.resolve(params);
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') ?? 'normal';
    const table = mode === 'scalper' ? 'template_scalper_segment_settings' : 'template_segment_settings';

    const { data, error } = await adminClient
      .from(table)
      .select('*')
      .eq('template_id', id);

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data ?? [], { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const { id } = await Promise.resolve(params);
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') ?? 'normal';
    const table = mode === 'scalper' ? 'template_scalper_segment_settings' : 'template_segment_settings';

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (!Array.isArray(body) || body.length === 0) {
      return Response.json({ error: 'Body must be a non-empty array' }, { status: 400 });
    }

    for (const entry of body) {
      if (
        typeof entry !== 'object' || entry === null ||
        typeof (entry as Record<string, unknown>).segment !== 'string' ||
        !['BUY', 'SELL'].includes((entry as Record<string, unknown>).side as string)
      ) {
        return Response.json({ error: 'Each entry must have segment (string) and side (BUY|SELL)' }, { status: 400 });
      }
    }

    const defaultComm = mode === 'scalper' ? 8500 : 4500;
    const defaultProfit = mode === 'scalper' ? 15 : 120;

    const rows = (body as SegmentInput[]).map(entry => ({
      template_id: id,
      segment: entry.segment,
      side: entry.side,
      commission_type: entry.commission_type ?? 'Per Crore',
      commission_value: entry.commission_value ?? defaultComm,
      carry_commission_type: entry.carry_commission_type ?? 'Per Crore',
      carry_commission_value: entry.carry_commission_value ?? defaultComm,
      gtt_commission_type: entry.gtt_commission_type ?? 'Per Trade',
      gtt_commission_value: entry.gtt_commission_value ?? 10,
      profit_hold_sec: entry.profit_hold_sec ?? defaultProfit,
      loss_hold_sec: entry.loss_hold_sec ?? 0,
      strike_range: entry.strike_range ?? 0,
      max_lot: entry.max_lot ?? 50,
      max_order_lot: entry.max_order_lot ?? 50,
      intraday_leverage: entry.intraday_leverage ?? 50,
      intraday_type: entry.intraday_type ?? 'Multiplier',
      holding_leverage: entry.holding_leverage ?? 5,
      holding_type: entry.holding_type ?? 'Multiplier',
      entry_buffer: entry.entry_buffer ?? 0.003,
      exit_buffer: entry.exit_buffer ?? 0.0017,
      trade_allowed: entry.trade_allowed ?? true,
      top_limit: entry.top_limit ?? 0,
      min_limit: entry.min_limit ?? 0,
    }));

    const { data, error } = await adminClient
      .from(table)
      .upsert(rows, { onConflict: 'template_id,segment,side' })
      .select();

    if (error) {
      console.error(`[POST /api/admin/templates/${id}/segments] ${error.message}`);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data ?? [], { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
