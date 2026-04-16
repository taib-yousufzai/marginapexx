'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, getSession } from '@/lib/auth';
import './page.css';

export default function LoginPage() {
  const router = useRouter();

  // Apply active theme on mount — same pattern as all other pages
  useEffect(() => {
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
  }, []);

  // Redirect to / if already authenticated (Requirement 5.2)
  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        router.replace('/');
      }
    });
  }, [router]);

  // Form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    setUsernameError('');
    setFormError('');
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setPasswordError('');
    setFormError('');
  };

  const handleDemoLogin = async () => {
    setUsername('demo@marginapex.com');
    setPassword('demo1234');
    setUsernameError('');
    setPasswordError('');
    setFormError('');
    setIsLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const result = await signIn('demo@marginapex.com', 'demo1234');

    if (!result.error) {
      router.push('/');
    } else {
      setFormError('Demo account unavailable. Please try again later.');
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Validate empty fields first — do NOT call validateCredentials (Requirement 3.5)
    let hasError = false;
    if (!username) {
      setUsernameError('Email or username is required');
      hasError = true;
    }
    if (!password) {
      setPasswordError('Password is required');
      hasError = true;
    }
    if (hasError) return;

    setIsLoading(true);
    setFormError('');

    // Small async tick so the loading state renders before the credential check
    await new Promise((resolve) => setTimeout(resolve, 0));

    const result = await signIn(username, password);

    if (!result.error) {
      router.push('/');
    } else {
      setFormError('Invalid credentials. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Branding — matches nav bar style (Requirement 1.3) */}
      <div className="login-branding">
        <span className="login-brand-margin">MARGIN</span>
        <span className="login-brand-apex">APEX</span>
      </div>

      {/* Auth card */}
      <div className="login-card">
        <h1 className="login-card-title">Sign in</h1>
        <p className="login-card-subtitle">Enter your credentials to continue</p>

        {/* form onSubmit handles Enter-key submission (Requirement 7.3) */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>

          {/* Email / Username field (Requirement 2.1) */}
          <div className="login-field-group">
            <label htmlFor="username" className="login-label">
              Email / Username
            </label>
            <div className={`login-input-wrapper${usernameError ? ' login-input-error' : ''}`}>
              <span className="login-input-icon">
                <i className="fas fa-envelope"></i>
              </span>
              <input
                id="username"
                type="text"
                className="login-input"
                value={username}
                onChange={handleUsernameChange}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                disabled={isLoading}
              />
            </div>
            {usernameError && (
              <span className="login-field-error" role="alert">
                {usernameError}
              </span>
            )}
          </div>

          {/* Password field (Requirement 2.2) */}
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
                autoComplete="current-password"
                disabled={isLoading}
              />
              {/* Password visibility toggle (Requirement 2.3) */}
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

          {/* Form-level error (Requirement 3.3) */}
          {formError && (
            <div className="login-form-error" role="alert">
              <i className="fas fa-circle-exclamation"></i>
              {' '}{formError}
            </div>
          )}

          {/* Submit button (Requirements 4.5, 7.4) */}
          <button
            type="submit"
            className="login-submit-btn"
            disabled={isLoading}
            aria-label="Log in to Margin Apex"
          >
            {isLoading ? (
              <>
                <i className="fas fa-spinner fa-spin"></i>
                {' '}Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>

          {/* Divider */}
          <div className="login-divider">
            <span className="login-divider-line" />
            <span className="login-divider-text">or</span>
            <span className="login-divider-line" />
          </div>

          {/* Demo login */}
          <button
            type="button"
            className="login-demo-btn"
            disabled={isLoading}
            onClick={handleDemoLogin}
            aria-label="Sign in with demo account"
          >
            <i className="fas fa-flask"></i>
            {' '}Try Demo Account
          </button>
        </form>
      </div>
    </div>
  );
}
