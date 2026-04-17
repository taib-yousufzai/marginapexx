/**
 * Property-based tests for getRole in lib/auth.ts
 * Uses fast-check with a minimum of 100 runs per property.
 *
 * Feature: alternate-registration
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { User } from '@supabase/supabase-js';
import { getRole } from '../auth';

const VALID_ROLES = ['super_admin', 'admin', 'broker', 'user'] as const;

// Arbitrary that produces a User-like object with an arbitrary role string,
// or null, or a user with no user_metadata, or a user with no role field.
const userLikeArb = fc.oneof(
  // null
  fc.constant(null),
  // user with no user_metadata
  fc.constant({} as unknown as User),
  // user with user_metadata but no role
  fc.constant({ user_metadata: {} } as unknown as User),
  // user with an arbitrary role string (covers known and unknown values)
  fc.string().map((role) => ({ user_metadata: { role } } as unknown as User)),
);

describe('getRole – Property 1: always returns a member of the valid role set', () => {
  /**
   * Validates: Requirements 1.1, 1.6
   *
   * For any input — including null, a User with no user_metadata, a User with
   * user_metadata.role set to an arbitrary string, or a User with
   * user_metadata.role set to one of the four known values — getRole SHALL
   * return exactly one of 'super_admin' | 'admin' | 'broker' | 'user'.
   */
  it('getRole always returns a valid AppRole', () => {
    fc.assert(
      fc.property(userLikeArb, (user) => {
        const result = getRole(user);
        return (VALID_ROLES as readonly string[]).includes(result);
      }),
      { numRuns: 100 },
    );
  });
});

describe('getRole – Property 2: round-trip identity for known roles', () => {
  /**
   * Validates: Requirements 1.2, 1.3, 1.4, 1.5, 7.2
   *
   * For any role string r drawn from { 'super_admin', 'admin', 'broker', 'user' },
   * constructing a mock User with user_metadata.role = r and calling getRole
   * SHALL return r unchanged.
   */
  it('getRole returns the exact known role when set in user_metadata', () => {
    fc.assert(
      fc.property(fc.constantFrom(...VALID_ROLES), (role) => {
        const user = { user_metadata: { role } } as unknown as User;
        return getRole(user) === role;
      }),
      { numRuns: 100 },
    );
  });
});

describe('getRole – Property 3: defaults to "user" for all unknown inputs', () => {
  /**
   * Validates: Requirements 1.5
   *
   * For any string that is not one of the four known role values (including
   * empty string, whitespace-only strings, and arbitrary alphanumeric strings),
   * getRole SHALL return 'user'.
   */
  it('getRole returns "user" for any unrecognised role string', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !(VALID_ROLES as readonly string[]).includes(s)),
        (unknownRole) => {
          const user = { user_metadata: { role: unknownRole } } as unknown as User;
          return getRole(user) === 'user';
        },
      ),
      { numRuns: 100 },
    );
  });
});
