import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Discriminated union returned by signIn.
 * On success: { session, user }
 * On failure: { error }
 */
export type SignInResult =
  | { session: Session; user: User; error?: never }
  | { session?: never; user?: never; error: string };

/**
 * Returns the role of the given Supabase user.
 * Returns 'admin' only when user.user_metadata.role strictly equals 'admin'.
 * Returns 'user' for all other inputs (null user, missing field, any other value).
 *
 * Validates: Requirements 5.1, 5.2, 5.4
 */
export function getRole(user: User | null): 'admin' | 'user' {
  return user?.user_metadata?.role === 'admin' ? 'admin' : 'user';
}

// ─── Auth functions ───────────────────────────────────────────────────────────

/**
 * Signs in a user with email and password via Supabase Auth.
 *
 * On success returns { session, user }.
 * On any error returns { error: "Invalid credentials. Please try again." } —
 * the raw Supabase error is never surfaced to callers.
 *
 * Validates: Requirements 2.1, 2.3, 5.3
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session || !data.user) {
    return { error: 'Invalid credentials. Please try again.' };
  }

  return { session: data.session, user: data.user };
}

/**
 * Signs out the current user via Supabase Auth and redirects to /login.
 * The redirect happens regardless of whether the sign-out call succeeds or fails.
 * Any error is logged to the console but not surfaced to the caller.
 *
 * Validates: Requirements 4.1, 4.2, 4.3
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('signOut error:', error);
  }
  window.location.href = '/login';
}

// ─── Session helpers ──────────────────────────────────────────────────────────

/**
 * Returns the current Supabase session, or null if the user is not authenticated.
 * Safe to call only inside useEffect or event handlers (never during SSR).
 *
 * Validates: Requirements 3.2
 */
export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

