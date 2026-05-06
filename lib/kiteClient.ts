/**
 * Shared helper for Kite API calls from the client.
 * Attaches the Supabase Bearer token so server-side routes can
 * reliably identify the user without relying on cookie parsing.
 */

import { supabase } from './supabaseClient';

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function kiteRestore(): Promise<void> {
  const headers = await getAuthHeader();
  await fetch('/api/kite/restore', { method: 'POST', headers }).catch(() => {});
}

export async function kiteStatus(): Promise<{ connected: boolean; userName?: string }> {
  const headers = await getAuthHeader();
  const res = await fetch('/api/kite/status', { cache: 'no-store', headers });
  return res.json();
}

export async function kiteLogin(): Promise<void> {
  // In this project, the login URL is typically /api/kite/login or a direct Zerodha redirect
  window.location.href = '/api/kite/login';
}
