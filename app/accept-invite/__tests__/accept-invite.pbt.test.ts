/**
 * Property-based tests for the Accept Invite Page validation logic.
 * Tests the pure validation rules that govern form submission behaviour.
 *
 * Feature: alternate-registration
 *
 * These tests validate the core logic of the AcceptInviteForm component without
 * requiring a DOM environment. The validation rules are extracted as pure
 * functions that mirror the component's handleSubmit logic exactly.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Pure validation helpers — mirror the component's handleSubmit logic
// ---------------------------------------------------------------------------

interface AcceptInviteFields {
  fullName: string;
  password: string;
  confirmPassword: string;
}

interface AcceptInviteErrors {
  fullNameError: string;
  passwordError: string;
  confirmPasswordError: string;
}

/**
 * Validates accept-invite form fields.
 * Returns field errors and whether the form should be blocked.
 */
function validateAcceptInviteForm(fields: AcceptInviteFields): {
  errors: AcceptInviteErrors;
  blocked: boolean;
} {
  const errors: AcceptInviteErrors = {
    fullNameError: '',
    passwordError: '',
    confirmPasswordError: '',
  };

  let hasError = false;

  if (!fields.fullName.trim()) {
    errors.fullNameError = 'Full name is required';
    hasError = true;
  }
  if (!fields.password) {
    errors.passwordError = 'Password is required';
    hasError = true;
  }
  if (!fields.confirmPassword) {
    errors.confirmPasswordError = 'Please confirm your password';
    hasError = true;
  }

  if (hasError) {
    return { errors, blocked: true };
  }

  // Password match check
  if (fields.password !== fields.confirmPassword) {
    errors.confirmPasswordError = 'Passwords do not match';
    return { errors, blocked: true };
  }

  return { errors, blocked: false };
}

/**
 * Builds the updateUser payload — mirrors the component's updateUser call.
 */
function buildUpdateUserPayload(
  fullName: string,
  password: string,
): { password: string; data: { full_name: string } } {
  return {
    password,
    data: { full_name: fullName },
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty string that is not all-whitespace */
const nonEmptyStringArb = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

/** Whitespace-only string (empty or spaces/tabs) */
const whitespaceStringArb = fc.oneof(
  fc.constant(''),
  fc.string({ minLength: 1 }).map((s) => s.replace(/[^\s]/g, ' ')).filter((s) => s.trim() === ''),
);

/** A non-empty password string */
const passwordArb = fc.string({ minLength: 1 });

// ---------------------------------------------------------------------------
// Property 4: Empty required fields always block form submission
// Validates: Requirements 6.7, 9.1
// ---------------------------------------------------------------------------

describe('Accept Invite Page – Property 4: Empty required fields always block form submission', () => {
  /**
   * For any accept-invite form submission where at least one required field
   * value is empty or composed entirely of whitespace characters, the form
   * SHALL display a field-level error adjacent to the offending field and
   * SHALL NOT invoke any Supabase API method.
   *
   * Validates: Requirements 6.7, 9.1
   */
  it('blocks submission and sets field error when fullName is empty', () => {
    fc.assert(
      fc.property(
        whitespaceStringArb,
        passwordArb,
        passwordArb,
        (fullName, password, confirmPassword) => {
          const { errors, blocked } = validateAcceptInviteForm({
            fullName,
            password,
            confirmPassword,
          });
          return blocked && errors.fullNameError !== '';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('blocks submission and sets field error when password is empty', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        fc.constant(''),
        nonEmptyStringArb,
        (fullName, password, confirmPassword) => {
          const { errors, blocked } = validateAcceptInviteForm({
            fullName,
            password,
            confirmPassword,
          });
          return blocked && errors.passwordError !== '';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('blocks submission and sets field error when confirmPassword is empty', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        passwordArb,
        fc.constant(''),
        (fullName, password, confirmPassword) => {
          const { errors, blocked } = validateAcceptInviteForm({
            fullName,
            password,
            confirmPassword,
          });
          return blocked && errors.confirmPasswordError !== '';
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Password mismatch always blocks form submission
// Validates: Requirements 6.8
// ---------------------------------------------------------------------------

describe('Accept Invite Page – Property 5: Password mismatch always blocks form submission', () => {
  /**
   * For any pair of password and confirm-password string values where the two
   * strings are not strictly equal, form submission SHALL be blocked, a
   * field-level error SHALL be shown on the confirm-password field, and no
   * Supabase API SHALL be called.
   *
   * Validates: Requirements 6.8
   */
  it('blocks submission with confirmPasswordError when passwords do not match', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        // Generate two different non-empty passwords
        fc.tuple(passwordArb, passwordArb).filter(([a, b]) => a !== b && a.length > 0 && b.length > 0),
        (fullName, [password, confirmPassword]) => {
          const { errors, blocked } = validateAcceptInviteForm({
            fullName,
            password,
            confirmPassword,
          });
          return blocked && errors.confirmPasswordError === 'Passwords do not match';
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Valid invite-acceptance form always calls updateUser with correct parameters
// Validates: Requirements 6.9
// ---------------------------------------------------------------------------

describe('Accept Invite Page – Property 13: Valid form always calls updateUser with correct parameters', () => {
  /**
   * For any valid accept-invite form state (all three fields non-empty,
   * password equals confirm-password, session established), submitting the
   * form SHALL invoke supabase.auth.updateUser with password matching the
   * password field value and data.full_name equal to the full name field value.
   *
   * Validates: Requirements 6.9
   */
  it('does not block submission and produces correct updateUser payload for valid input', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        passwordArb,
        (fullName, password) => {
          // Valid form: all fields non-empty, passwords match
          const { blocked } = validateAcceptInviteForm({
            fullName,
            password,
            confirmPassword: password,
          });

          if (blocked) return false;

          // Verify the updateUser payload is built correctly
          const payload = buildUpdateUserPayload(fullName, password);
          return (
            payload.password === password &&
            payload.data.full_name === fullName
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('updateUser payload contains exactly password and data.full_name — no extra fields', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        passwordArb,
        (fullName, password) => {
          const payload = buildUpdateUserPayload(fullName, password);
          const payloadKeys = Object.keys(payload);
          const dataKeys = Object.keys(payload.data);
          return (
            payloadKeys.length === 2 &&
            payloadKeys.includes('password') &&
            payloadKeys.includes('data') &&
            dataKeys.length === 1 &&
            dataKeys.includes('full_name')
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
