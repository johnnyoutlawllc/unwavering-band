'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Field } from '@/components/Field';
import { useAuth } from '@/lib/auth';

export default function SignInPage() {
  const {
    user,
    loading,
    error,
    clearError,
    signInWithGoogle,
    signInWithPassword,
    signUpWithPassword,
  } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/app/history');
  }, [loading, user, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setBusy(true);
    const ok =
      mode === 'in'
        ? await signInWithPassword(email, password)
        : await signUpWithPassword(email, password, name || undefined);
    setBusy(false);
    if (ok) router.replace('/app/history');
  }

  return (
    <>
      <Field />
      <main className="auth-page">
        <Link href="/" className="wordmark small auth-brand">
          unwavering<span className="dot">.band</span>
        </Link>

        <div className="auth-card">
          <h1 className="modal-title">{mode === 'in' ? 'Sign in' : 'Create account'}</h1>
          <p className="field-help">
            Google works for the accounts that already have timeline data.
            Email is here for testing and for people who prefer a password.
          </p>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => signInWithGoogle()}
            disabled={busy}
          >
            Continue with Google
          </button>

          <div className="auth-or">or</div>

          <form className="auth-form" onSubmit={onSubmit}>
            {mode === 'up' ? (
              <label className="fieldset">
                <span className="field-label">Display name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </label>
            ) : null}
            <label className="fieldset">
              <span className="field-label">Email</span>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </label>
            <label className="fieldset">
              <span className="field-label">Password</span>
              <input
                className="input"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              />
            </label>
            {error ? <p className="error">{error}</p> : null}
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Working' : mode === 'in' ? 'Sign in with email' : 'Create account'}
            </button>
          </form>

          <p className="field-help" style={{ textAlign: 'center' }}>
            By continuing you agree to the{' '}
            <Link href="/terms">Terms</Link> and{' '}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>

          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              clearError();
              setMode(mode === 'in' ? 'up' : 'in');
            }}
          >
            {mode === 'in' ? 'Need an account? Create one' : 'Already have one? Sign in'}
          </button>
        </div>
      </main>
    </>
  );
}
