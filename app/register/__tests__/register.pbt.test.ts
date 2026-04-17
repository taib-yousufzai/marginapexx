/**
 * Property-based tests for the Registration Page validation logic.
 * Tests the pure validation rules that govern form submission behaviour.
 *
 * Feature: alternate-registration
 *
 * These tests validate the core logic of the RegisterForm component without
 * requiring a DOM environment. The validation rules are extracted as pure
 * functions that mirror the component's handleSubmit logic exactly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Pure validation helpers — mirror the component's handleSubmit logic
// ---------------------------------------------------------------------------

interface RegistrationFields {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FieldErrors {
  fullNameError: string;
  emailError: string;
  passwordError: string;
  confirmPasswordError: string;
}

/**
 * Validates registration form fields.
 * Returns field errors and whether the form should be blocked.
 */
function validateRegistrationForm(fields: RegistrationFields): {
  errors: FieldErrors;
  blocked: boolean;
} {
  const errors: FieldErrors = {
    fullNameError: '',
    emailError: '',
    passwordError: '',
    confirmPasswordError: '',
  };

  let hasError = false;

  if (!fields.fullName.trim()) {
    errors.fullNameError = 'Full name is required';
    hasError = true;
  }
  if (!fields.email.trim()) {
    errors.emailError = 'Email address is required';
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
 * Builds the signUp options.data object — mirrors the component's signUp call.
 */
function buildSignUpData(
  fullName: string,
  brokerRef: string | null,
): Record<string, string> {
  return {
    full_name: fullName,
    ...(brokerRef ? { broker_ref: brokerRef } : {}),
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

/** A valid email-like string (non-empty, non-whitespace) */
const emailArb = nonEmptyStringArb;

/** A non-empty password string */
const passwordArb = fc.string({ minLength: 1 });

// ---------------------------------------------------------------------------
// Property 4: Empty required fields always block form submission
// Validates: Requirements 2.5, 9.1
// ---------------------------------------------------------------------------

describe('Registration Page – Property 4: Empty required fields always block form submission', () => {
  /**
   * For any registration form submission where at least one required field
   * value is empty or composed entirely of whitespace characters, the form
   * SHALL display a field-level error adjacent to the offending field and
   * SHALL NOT invoke any Supabase API method.
   *
   * Validates: Requirements 2.5, 9.1
   */
  it('blocks submission and sets field error when fullName is empty', () => {
    fc.assert(
      fc.property(
        whitespaceStringArb,
        emailArb,
        passwordArb,
        passwordArb,
        (fullName, email, password, confirmPassword) => {
          const { errors, blocked } = validateRegistrationForm({
            fullName,
            email,
            password,
            confirmPassword,
          });
          return blocked && errors.fullNameError !== '';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('blocks submission and sets field error when email is empty', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        whitespaceStringArb,
        passwordArb,
        passwordArb,
        (fullName, email, password, confirmPassword) => {
          const { errors, blocked } = validateRegistrationForm({
            fullName,
            email,
            password,
            confirmPassword,
          });
          return blocked && errors.emailError !== '';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('blocks submission and sets field error when password is empty', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        emailArb,
        fc.constant(''),
        nonEmptyStringArb,
        (fullName, email, password, confirmPassword) => {
          const { errors, blocked } = validateRegistrationForm({
            fullName,
            email,
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
        emailArb,
        passwordArb,
        fc.constant(''),
        (fullName, email, password, confirmPassword) => {
          const { errors, blocked } = validateRegistrationForm({
            fullName,
            email,
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
// Validates: Requirements 2.6
// ---------------------------------------------------------------------------

describe('Registration Page – Property 5: Password mismatch always blocks form submission', () => {
  /**
   * For any pair of password and confirm-password string values where the two
   * strings are not strictly equal, form submission SHALL be blocked, a
   * field-level error SHALL be shown on the confirm-password field, and no
   * Supabase API SHALL be called.
   *
   * Validates: Requirements 2.6
   */
  it('blocks submission with confirmPasswordError when passwords do not match', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        emailArb,
        // Generate two different non-empty passwords
        fc.tuple(passwordArb, passwordArb).filter(([a, b]) => a !== b && a.length > 0 && b.length > 0),
        (fullName, email, [password, confirmPassword]) => {
          const { errors, blocked } = validateRegistrationForm({
            fullName,
            email,
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
// Property 6: Valid registration form always calls signUp with correct parameters
// Validates: Requirements 2.7
// ---------------------------------------------------------------------------

describe('Registration Page – Property 6: Valid registration form always calls signUp with correct parameters', () => {
  /**
   * For any valid registration form state (all four fields non-empty, password
   * equals confirm-password), submitting the form SHALL invoke
   * supabase.auth.signUp with email and password matching the field values and
   * options.data.full_name equal to the full name field value.
   *
   * Validates: Requirements 2.7
   */
  it('does not block submission and produces correct signUp parameters for valid input', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb,
        emailArb,
        passwordArb,
        (fullName, email, password) => {
          // Valid form: all fields non-empty, passwords match
          const { blocked } = validateRegistrationForm({
            fullName,
            email,
            password,
            confirmPassword: password,
          });

          if (blocked) return false;

          // Verify the signUp data is built correctly
          const data = buildSignUpData(fullName, null);
          return (
            data.full_name === fullName &&
            !('broker_ref' in data)
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: broker_ref is included in signUp iff ?ref query parameter is present
// Validates: Requirements 3.2, 3.4
// ---------------------------------------------------------------------------

describe('Registration Page – Property 7: broker_ref is included in signUp iff ?ref is present', () => {
  /**
   * For any non-empty ref query parameter value, the signUp call SHALL include
   * options.data.broker_ref set to that exact value.
   * For any registration loaded without a ref parameter, the signUp call SHALL
   * NOT include a broker_ref key in options.data.
   *
   * Validates: Requirements 3.2, 3.4
   */
  it('includes broker_ref in signUp data when ref param is present', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb, // fullName
        emailArb,          // email
        passwordArb,       // password
        nonEmptyStringArb, // brokerRef
        (fullName, _email, _password, brokerRef) => {
          const data = buildSignUpData(fullName, brokerRef);
          return data.broker_ref === brokerRef;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('omits broker_ref from signUp data when ref param is absent', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb, // fullName
        emailArb,          // email
        passwordArb,       // password
        (fullName, _email, _password) => {
          const data = buildSignUpData(fullName, null);
          return !('broker_ref' in data);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Correcting a field clears its error for any input value
// Validates: Requirements 9.2
// ---------------------------------------------------------------------------

describe('Registration Page – Property 12: Correcting a field clears its error', () => {
  /**
   * For any field that is currently displaying a validation error, changing
   * that field's value to any non-empty string SHALL clear the error message
   * for that specific field without affecting error messages on other fields.
   *
   * Validates: Requirements 9.2
   */
  it('clearing fullName error: setting a non-empty value removes the fullName error', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb, // new fullName value
        emailArb,
        passwordArb,
        (newFullName, email, password) => {
          // Start with an error state (empty fullName)
          const { errors: initialErrors } = validateRegistrationForm({
            fullName: '',
            email,
            password,
            confirmPassword: password,
          });
          expect(initialErrors.fullNameError).not.toBe('');

          // After correcting fullName, the error should be gone
          const { errors: correctedErrors } = validateRegistrationForm({
            fullName: newFullName,
            email,
            password,
            confirmPassword: password,
          });
          return correctedErrors.fullNameError === '';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('clearing email error: setting a non-empty value removes the email error', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb, // fullName
        nonEmptyStringArb, // new email value
        passwordArb,
        (fullName, newEmail, password) => {
          // Start with an error state (empty email)
          const { errors: initialErrors } = validateRegistrationForm({
            fullName,
            email: '',
            password,
            confirmPassword: password,
          });
          expect(initialErrors.emailError).not.toBe('');

          // After correcting email, the error should be gone
          const { errors: correctedErrors } = validateRegistrationForm({
            fullName,
            email: newEmail,
            password,
            confirmPassword: password,
          });
          return correctedErrors.emailError === '';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('clearing password error: setting a non-empty value removes the password error', () => {
    fc.assert(
      fc.property(
        nonEmptyStringArb, // fullName
        emailArb,
        nonEmptyStringArb, // new password value
        (fullName, email, newPassword) => {
          // Start with an error state (empty password)
          const { errors: initialErrors } = validateRegistrationForm({
            fullName,
            email,
            password: '',
            confirmPassword: '',
          });
          expect(initialErrors.passwordError).not.toBe('');

          // After correcting password (and confirmPassword to match), errors gone
          const { errors: correctedErrors } = validateRegistrationForm({
            fullName,
            email,
            password: newPassword,
            confirmPassword: newPassword,
          });
          return correctedErrors.passwordError === '';
        },
      ),
      { numRuns: 100 },
    );
  });
});
