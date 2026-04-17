'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import '../login/page.css';

function RegisterForm() {
  const searchParams = useSearchParams();

  // Form field state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Field-level errors
  const [fullNameError, setFullNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');

  // Form-level state
  const [formError, setFormError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Broker referral (silent capture)
  const [brokerRef, setBrokerRef] = useState<string | null>(null);

  // On mount: read ?ref param and apply theme
  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) setBrokerRef(ref);

    try {
      const saved = localStorage.getItem('marginApexTheme');
      if (saved === 'dark') {
        document.body.classList.add('dark');
      } else {
        document.body.classList.remove('dark');
      }
    } catch {
      // localStorage unavailable — proceed without theme
    }
  }, [searchParams]);

  // Field change handlers — clear field error and form error on change
  const handleFullNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFullName(e.target.value);
    setFullNameError('');
    setFormError('');
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setEmailError('');
    setFormError('');
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setPasswordError('');
    setFormError('');
  };

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    setConfirmPasswordError('');
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate all fields non-empty
    let hasError = false;
    if (!fullName.trim()) {
      setFullNameError('Full name is required');
      hasError = true;
    }
    if (!email.trim()) {
      setEmailError('Email address is required');
      hasError = true;
    }
    if (!password) {
      setPasswordError('Password is required');
      hasError = true;
    }
    if (!confirmPassword) {
      setConfirmPasswordError('Please confirm your password');
      hasError = true;
    }
    if (hasError) return;

    // Validate password match
    if (password !== confirmPassword) {
      setConfirmPasswordError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setFormError('');

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            ...(brokerRef ? { broker_ref: brokerRef } : {}),
          },
        },
      });

      if (error) {
        setFormError(error.message);
        setIsLoading(false);
      } else {
        setIsSuccess(true);
        setIsLoading(false);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setFormError(message);
      setIsLoading(false);
    }
  };

  // Confirmation screen shown after successful sign-up
  if (isSuccess) {
    return (
      <div className="login-page">
        <div className="login-branding">
          <span className="login-brand-margin">MARGIN</span>
          <span className="login-brand-apex">APEX</span>
        </div>
        <div className="login-card">
          <h1 className="login-card-title">Check your email</h1>
          <p className="login-card-subtitle">
            We&apos;ve sent a confirmation link to <strong>{email}</strong>. Click it to verify
            your account before signing in.
          </p>
          <Link
            href="/login"
            className="login-submit-btn"
            style={{ textDecoration: 'none', marginTop: '16px', display: 'flex' }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      {/* Branding */}
      <div className="login-branding">
        <span className="login-brand-margin">MARGIN</span>
        <span className="login-brand-apex">APEX</span>
      </div>

      {/* Auth card */}
      <div className="login-card">
        <h1 className="login-card-title">Create account</h1>
        <p className="login-card-subtitle">Fill in your details to get started</p>

        <form className="login-form" onSubmit={handleSubmit} noValidate>

          {/* Full Name field */}
          <div className="login-field-group">
            <label htmlFor="fullName" className="login-label">
              Full Name
            </label>
            <div className={`login-input-wrapper${fullNameError ? ' login-input-error' : ''}`}>
              <span className="login-input-icon">
                <i className="fas fa-user"></i>
              </span>
              <input
                id="fullName"
                type="text"
                className="login-input"
                value={fullName}
                onChange={handleFullNameChange}
                autoComplete="name"
                autoCapitalize="words"
                spellCheck={false}
                disabled={isLoading}
              />
            </div>
            {fullNameError && (
              <span className="login-field-error" role="alert">
                {fullNameError}
              </span>
            )}
          </div>

          {/* Email field */}
          <div className="login-field-group">
            <label htmlFor="email" className="login-label">
              Email Address
            </label>
            <div className={`login-input-wrapper${emailError ? ' login-input-error' : ''}`}>
              <span className="login-input-icon">
                <i className="fas fa-envelope"></i>
              </span>
              <input
                id="email"
                type="email"
                className="login-input"
                value={email}
                onChange={handleEmailChange}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                disabled={isLoading}
              />
            </div>
            {emailError && (
              <span className="login-field-error" role="alert">
                {emailError}
              </span>
            )}
          </div>

          {/* Password field */}
          <div className="login-field-group">
            <label htmlFor="password" className="login-label">
              Password
            </label>
            <div className={`login-input-wrapper${passwordError ? ' login-input-error' : ''}`}>
              <span className="login-input-icon">
                <i className="fas fa-lock"></i>
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="login-input"
                value={password}
                onChange={handlePasswordChange}
                autoComplete="new-password"
                disabled={isLoading}
              />
              <button
                type="button"
                className="login-toggle-password"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <i className={showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
              </button>
            </div>
            {passwordError && (
              <span className="login-field-error" role="alert">
                {passwordError}
              </span>
            )}
          </div>

          {/* Confirm Password field */}
          <div className="login-field-group">
            <label htmlFor="confirmPassword" className="login-label">
              Confirm Password
            </label>
            <div className={`login-input-wrapper${confirmPasswordError ? ' login-input-error' : ''}`}>
              <span className="login-input-icon">
                <i className="fas fa-lock"></i>
              </span>
              <input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                className="login-input"
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                autoComplete="new-password"
                disabled={isLoading}
              />
              <button
                type="button"
                className="login-toggle-password"
                onClick={() => setShowConfirmPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                <i className={showConfirmPassword ? 'fas fa-eye-slash' : 'fas fa-eye'}></i>
              </button>
            </div>
            {confirmPasswordError && (
              <span className="login-field-error" role="alert">
                {confirmPasswordError}
              </span>
            )}
          </div>

          {/* Form-level error */}
          {formError && (
            <div className="login-form-error" role="alert">
              <i className="fas fa-circle-exclamation"></i>
              {' '}{formError}
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            className="login-submit-btn"
            disabled={isLoading}
            aria-label="Create your Margin Apex account"
          >
            {isLoading ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                {' '}Creating account…
              </>
            ) : (
              'Create account'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="login-page">
        <div className="login-branding">
          <span className="login-brand-margin">MARGIN</span>
          <span className="login-brand-apex">APEX</span>
        </div>
        <div className="login-card">
          <p className="login-card-subtitle">Loading…</p>
        </div>
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}
