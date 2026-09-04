/*
 * Client-side encryption. Keys never leave the browser in the clear.
 * Admins with database access see ciphertext only.
 *
 * Passphrase -> PBKDF2 KEK -> wraps DEK + ECDH private key.
 * Coordinates are AES-GCM sealed with the DEK.
 */

const PBKDF2_ITERATIONS = 310_000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type VaultKeys = {
  dek: CryptoKey;
  privateKey: CryptoKey;
  publicKeySpkiB64: string;
};

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBuf(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function importAesRaw(raw: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  const keyData = raw instanceof Uint8Array ? (raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer) : raw;
  return crypto.subtle.importKey('raw', keyData, 'AES-GCM', true, [
    'encrypt',
    'decrypt',
  ]);
}

async function deriveKek(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: b64ToBuf(saltB64) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function aesEncrypt(key: CryptoKey, plaintext: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext as BufferSource);
  const out = new Uint8Array(iv.length + sealed.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(sealed), iv.length);
  return bufToB64(out);
}

async function aesDecrypt(key: CryptoKey, payloadB64: string): Promise<Uint8Array> {
  const all = b64ToBuf(payloadB64);
  const iv = all.slice(0, 12);
  const data = all.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return new Uint8Array(plain);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<string> {
  return aesEncrypt(key, textEncoder.encode(JSON.stringify(value)));
}

export async function decryptJson<T>(key: CryptoKey, payloadB64: string): Promise<T> {
  const bytes = await aesDecrypt(key, payloadB64);
  return JSON.parse(textDecoder.decode(bytes)) as T;
}

export async function encryptNumber(key: CryptoKey, n: number): Promise<string> {
  return encryptJson(key, n);
}

export async function decryptNumber(key: CryptoKey, payloadB64: string): Promise<number> {
  return decryptJson<number>(key, payloadB64);
}

export type CryptoSetupPayload = {
  crypto_salt: string;
  wrapped_dek: string;
  crypto_pubkey: string;
  wrapped_privkey: string;
  encryption_enabled_at: string;
};

export async function setupVault(passphrase: string): Promise<{
  keys: VaultKeys;
  payload: CryptoSetupPayload;
}> {
  if (passphrase.length < 8) {
    throw new Error('Encryption passphrase must be at least 8 characters.');
  }
  const salt = bufToB64(crypto.getRandomValues(new Uint8Array(16)));
  const kek = await deriveKek(passphrase, salt);
  const dekRaw = crypto.getRandomValues(new Uint8Array(32));
  const dek = await importAesRaw(dekRaw);
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const pubSpki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const privPkcs8 = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const wrappedDek = await aesEncrypt(kek, dekRaw);
  const wrappedPriv = await aesEncrypt(dek, new Uint8Array(privPkcs8));
  const publicKeySpkiB64 = bufToB64(pubSpki);

  return {
    keys: { dek, privateKey: pair.privateKey, publicKeySpkiB64 },
    payload: {
      crypto_salt: salt,
      wrapped_dek: wrappedDek,
      crypto_pubkey: publicKeySpkiB64,
      wrapped_privkey: wrappedPriv,
      encryption_enabled_at: new Date().toISOString(),
    },
  };
}

export async function unlockVault(
  passphrase: string,
  row: {
    crypto_salt: string;
    wrapped_dek: string;
    wrapped_privkey: string;
    crypto_pubkey: string;
  },
): Promise<VaultKeys> {
  const kek = await deriveKek(passphrase, row.crypto_salt);
  let dekRaw: Uint8Array;
  try {
    dekRaw = await aesDecrypt(kek, row.wrapped_dek);
  } catch {
    throw new Error('Wrong encryption passphrase.');
  }
  const dek = await importAesRaw(dekRaw);
  const privBytes = await aesDecrypt(dek, row.wrapped_privkey);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privBytes.buffer.slice(
      privBytes.byteOffset,
      privBytes.byteOffset + privBytes.byteLength,
    ) as ArrayBuffer,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  return {
    dek,
    privateKey,
    publicKeySpkiB64: row.crypto_pubkey,
  };
}

export async function wrapKeyWithDek(dek: CryptoKey, rawKey: Uint8Array): Promise<string> {
  return aesEncrypt(dek, rawKey);
}

export async function unwrapKeyWithDek(dek: CryptoKey, wrapped: string): Promise<CryptoKey> {
  const raw = await aesDecrypt(dek, wrapped);
  return importAesRaw(raw);
}

export async function newRelationshipKey(): Promise<{ raw: Uint8Array; key: CryptoKey }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return { raw, key: await importAesRaw(raw) };
}

/** Encrypt a relationship AES key to a peer's ECDH public key. */
export async function packageKeyForPeer(
  peerPubSpkiB64: string,
  relKeyRaw: Uint8Array,
): Promise<string> {
  const peerPub = await crypto.subtle.importKey(
    'spki',
    b64ToBuf(peerPubSpkiB64) as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const eph = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPub },
    eph.privateKey,
    256,
  );
  const wrapKey = await importAesRaw(bits);
  const ephSpki = bufToB64(await crypto.subtle.exportKey('spki', eph.publicKey));
  const cipher = await aesEncrypt(wrapKey, relKeyRaw);
  return JSON.stringify({ eph: ephSpki, cipher });
}

export async function openKeyPackage(
  privateKey: CryptoKey,
  packageJson: string,
): Promise<CryptoKey> {
  const { eph, cipher } = JSON.parse(packageJson) as { eph: string; cipher: string };
  const ephPub = await crypto.subtle.importKey(
    'spki',
    b64ToBuf(eph) as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: ephPub },
    privateKey,
    256,
  );
  const wrapKey = await importAesRaw(bits);
  const raw = await aesDecrypt(wrapKey, cipher);
  return importAesRaw(raw);
}

export type CoordPayload = {
  lat: number;
  lng: number;
  place?: string | null;
};

export async function sealCoords(dek: CryptoKey, lat: number, lng: number): Promise<{
  lat_cipher: string;
  lng_cipher: string;
}> {
  return {
    lat_cipher: await encryptNumber(dek, lat),
    lng_cipher: await encryptNumber(dek, lng),
  };
}

export async function openCoords(
  dek: CryptoKey,
  latCipher: string | null,
  lngCipher: string | null,
  fallbackLat?: number | null,
  fallbackLng?: number | null,
): Promise<{ lat: number; lng: number } | null> {
  if (latCipher && lngCipher) {
    return {
      lat: await decryptNumber(dek, latCipher),
      lng: await decryptNumber(dek, lngCipher),
    };
  }
  if (fallbackLat != null && fallbackLng != null) {
    return { lat: fallbackLat, lng: fallbackLng };
  }
  return null;
}
