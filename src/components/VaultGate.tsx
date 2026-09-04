'use client';

import { FormEvent, useState } from 'react';
import { useVault } from '@/lib/vault';

/** Blocks app content until the encryption vault is set up and unlocked. */
export function VaultGate({ children }: { children: React.ReactNode }) {
  const {
    ready,
    enabled,
    unlocked,
    busy,
    error,
    migrating,
    migrateProgress,
    setup,
    unlock,
    clearError,
  } = useVault();
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [mode, setMode] = useState<'unlock' | 'setup'>('unlock');

  if (!ready) {
    return (
      <div className="app-loading">
        <p>Loading</p>
      </div>
    );
  }

  if (unlocked) {
    return (
      <>
        {migrating ? (
          <div className="vault-banner">{migrateProgress ?? 'Encrypting…'}</div>
        ) : null}
        {children}
      </>
    );
  }

  const showingSetup = !enabled || mode === 'setup';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    try {
      if (showingSetup) {
        if (passphrase !== confirm) {
          throw new Error('Passphrases do not match.');
        }
        await setup(passphrase);
      } else {
        await unlock(passphrase);
      }
      setPassphrase('');
      setConfirm('');
    } catch {
      // error already on vault
    }
  }

  return (
    <div className="vault-gate">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1 className="modal-title">
          {showingSetup ? 'Create your encryption key' : 'Unlock your timeline'}
        </h1>
        <p className="field-help">
          Location data is encrypted on your device before it is stored. We
          (and anyone with database access) cannot read your coordinates without
          this passphrase. If you forget it, your history cannot be recovered.
        </p>
        <label className="fieldset">
          <span className="field-label">Encryption passphrase</span>
          <input
            className="input"
            type="password"
            required
            minLength={8}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        {showingSetup ? (
          <label className="fieldset">
            <span className="field-label">Confirm passphrase</span>
            <input
              className="input"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Working' : showingSetup ? 'Enable encryption' : 'Unlock'}
        </button>
        {enabled ? (
          <button
            type="button"
            className="btn-quiet"
            onClick={() => {
              clearError();
              setMode(mode === 'setup' ? 'unlock' : 'setup');
            }}
          >
            {mode === 'setup'
              ? 'Back to unlock'
              : 'Lost access? You must create a new key (old ciphertext stays sealed)'}
          </button>
        ) : null}
      </form>
    </div>
  );
}
