/**
 * Persist unlocked vault keys in IndexedDB for this browser.
 * Cleared on Lock vault or sign-out. Passphrase is never stored.
 */

import type { VaultKeys } from './crypto';

const DB_NAME = 'ub_vault';
const DB_VERSION = 1;
const STORE = 'keys';

type StoredVault = {
  userId: string;
  dek: CryptoKey;
  privateKey: CryptoKey;
  publicKeySpkiB64: string;
  savedAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'userId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function saveVaultKeys(userId: string, keys: VaultKeys): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({
        userId,
        dek: keys.dek,
        privateKey: keys.privateKey,
        publicKeySpkiB64: keys.publicKeySpkiB64,
        savedAt: new Date().toISOString(),
      } satisfies StoredVault);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });
  } finally {
    db.close();
  }
}

export async function loadVaultKeys(userId: string): Promise<VaultKeys | null> {
  const db = await openDb();
  try {
    const row = await new Promise<StoredVault | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(userId);
      req.onsuccess = () => resolve(req.result as StoredVault | undefined);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
    });
    if (!row?.dek || !row.privateKey || !row.publicKeySpkiB64) return null;
    return {
      dek: row.dek,
      privateKey: row.privateKey,
      publicKeySpkiB64: row.publicKeySpkiB64,
    };
  } finally {
    db.close();
  }
}

export async function clearVaultKeys(userId?: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (userId) tx.objectStore(STORE).delete(userId);
      else tx.objectStore(STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB clear failed'));
    });
  } finally {
    db.close();
  }
}
