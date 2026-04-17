import { describe, it, expect } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { getRole } from '../auth';

// Helper to build a minimal User-like object with a given role value
function makeUser(role: unknown): User {
  return { user_metadata: { role } } as unknown as User;
}

describe('getRole', () => {
  // Requirement 1.6 — null user
  it('returns "user" when user is null', () => {
    expect(getRole(null)).toBe('user');
  });

  // Requirement 1.2 — super_admin
  it('returns "super_admin" when user_metadata.role is "super_admin"', () => {
    expect(getRole(makeUser('super_admin'))).toBe('super_admin');
  });

  // Requirement 1.3 — admin
  it('returns "admin" when user_metadata.role is "admin"', () => {
    expect(getRole(makeUser('admin'))).toBe('admin');
  });

  // Requirement 1.4 — broker
  it('returns "broker" when user_metadata.role is "broker"', () => {
    expect(getRole(makeUser('broker'))).toBe('broker');
  });

  // Requirement 1.5 — explicit 'user' role
  it('returns "user" when user_metadata.role is "user"', () => {
    expect(getRole(makeUser('user'))).toBe('user');
  });

  // Requirement 1.5 — unknown string
  it('returns "user" when user_metadata.role is an unknown string', () => {
    expect(getRole(makeUser('superuser'))).toBe('user');
    expect(getRole(makeUser('moderator'))).toBe('user');
    expect(getRole(makeUser(''))).toBe('user');
  });

  // Requirement 1.5 — absent user_metadata
  it('returns "user" when user_metadata is absent', () => {
    const user = {} as unknown as User;
    expect(getRole(user)).toBe('user');
  });

  // Requirement 1.5 — user_metadata present but role absent
  it('returns "user" when user_metadata.role is undefined', () => {
    expect(getRole(makeUser(undefined))).toBe('user');
  });
});
