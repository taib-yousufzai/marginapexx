import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Logs an administrative action to the audit_logs table.
 */
export async function auditLog(
  adminClient: SupabaseClient,
  actorId: string,
  targetId: string | null,
  action: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  const { error } = await adminClient
    .from('audit_logs')
    .insert({
      actor_id: actorId,
      target_id: targetId,
      action: action,
      metadata: metadata
    });

  if (error) {
    console.error('[auditLog] Failed to insert audit log:', error);
  }
}
