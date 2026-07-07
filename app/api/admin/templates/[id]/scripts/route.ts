/**
 * GET    /api/admin/templates/[id]/scripts
 *        Returns all scripts in this template's allowlist.
 *        Empty array = no restrictions (all scripts allowed).
 *
 * POST   /api/admin/templates/[id]/scripts
 *        Add one or more scripts to the template's allowlist.
 *        Body: { scripts: { symbol: string; exchange?: string }[] }
 *        Silently ignores duplicates (upsert on conflict).
 *
 * DELETE /api/admin/templates/[id]/scripts
 *        Remove specific scripts from the template's allowlist.
 *        Body: { symbols: string[] }
 *        Does NOT delete from master library — only removes from this template.
 */

import { requireAuth as apiRequireAuth } from '@/lib/api-middleware';

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    const authResult = await apiRequireAuth(request, ['MANAGE_TEMPLATES']);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const { id } = await Promise.resolve(params);

    const { data, error } = await adminClient
      .from('template_scripts')
      .select('id, symbol, exchange, created_at')
      .eq('template_id', id)
      .order('symbol', { ascending: true });

    if (error) {
      console.error('[GET /api/admin/templates/[id]/scripts]', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data ?? [], { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    const authResult = await apiRequireAuth(request, ['MANAGE_TEMPLATES']);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const { id: templateId } = await Promise.resolve(params);

    // Parse body first — before any DB calls
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Verify the template exists
    const { data: template, error: tmplErr } = await adminClient
      .from('account_templates')
      .select('id')
      .eq('id', templateId)
      .single();

    if (tmplErr || !template) {
      return Response.json({ error: 'Template not found' }, { status: 404 });
    }

    const scripts = body.scripts;
    if (!Array.isArray(scripts) || scripts.length === 0) {
      return Response.json({ error: 'scripts must be a non-empty array' }, { status: 400 });
    }

    // Validate each entry
    for (const s of scripts) {
      if (typeof s !== 'object' || s === null || typeof (s as Record<string, unknown>).symbol !== 'string') {
        return Response.json({ error: 'Each script must have a symbol (string)' }, { status: 400 });
      }
    }

    const rows = (scripts as { symbol: string; exchange?: string }[]).map(s => ({
      template_id: templateId,
      symbol: (s.symbol as string).toUpperCase().trim(),
      exchange: s.exchange ?? null,
    }));

    // Upsert — silently ignore duplicates
    const { data, error } = await adminClient
      .from('template_scripts')
      .upsert(rows, { onConflict: 'template_id,symbol' })
      .select('id, symbol, exchange, created_at');

    if (error) {
      console.error('[POST /api/admin/templates/[id]/scripts]', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data ?? [], { status: 201 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    const authResult = await apiRequireAuth(request, ['MANAGE_TEMPLATES']);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const { id: templateId } = await Promise.resolve(params);

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const symbols = body.symbols;
    if (!Array.isArray(symbols) || symbols.length === 0) {
      return Response.json({ error: 'symbols must be a non-empty array' }, { status: 400 });
    }

    // Normalise to uppercase
    const normalised = (symbols as string[]).map(s => s.toUpperCase().trim());

    // Remove scripts from this template only — master library is untouched
    const { error } = await adminClient
      .from('template_scripts')
      .delete()
      .eq('template_id', templateId)
      .in('symbol', normalised);

    if (error) {
      console.error('[DELETE /api/admin/templates/[id]/scripts]', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json({ removed: normalised.length }, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
