/**
 * Zero-dependency Web Crypto AES-256-GCM encryption for note payloads.
 * Ensures note titles, markdown text, checklists, and widget data are encrypted
 * before leaving the browser for Firestore.
 */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateBoardKeyBase64(): string {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return bytesToBase64(raw);
}

export function generateSaltBase64(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bytesToBase64(salt);
}

async function importAesKey(keyBase64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(keyBase64);
  const copy = new Uint8Array(raw.byteLength);
  copy.set(raw);
  return crypto.subtle.importKey('raw', copy.buffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptJsonPayload(
  keyBase64: string,
  data: unknown
): Promise<{ encryptedPayload: string; iv: string }> {
  const key = await importAesKey(keyBase64);
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    encryptedPayload: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptJsonPayload<T>(
  keyBase64: string,
  encryptedPayload: string,
  ivBase64: string
): Promise<T> {
  const key = await importAesKey(keyBase64);
  const iv = base64ToBytes(ivBase64);
  const ivCopy = new Uint8Array(iv.byteLength);
  ivCopy.set(iv);
  const ciphertext = base64ToBytes(encryptedPayload);
  const cipherCopy = new Uint8Array(ciphertext.byteLength);
  cipherCopy.set(ciphertext);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivCopy },
    key,
    cipherCopy.buffer
  );
  const json = new TextDecoder().decode(decrypted);
  return JSON.parse(json) as T;
}

async function derivePassphraseKey(passphrase: string, saltBase64: string): Promise<CryptoKey> {
  const passBytes = new TextEncoder().encode(passphrase);
  const baseKey = await crypto.subtle.importKey('raw', passBytes, 'PBKDF2', false, ['deriveKey']);
  const salt = base64ToBytes(saltBase64);
  const saltCopy = new Uint8Array(salt.byteLength);
  saltCopy.set(salt);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltCopy.buffer,
      iterations: 120000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function wrapBoardKeyWithPassphrase(
  boardKeyBase64: string,
  passphrase: string,
  saltBase64: string
): Promise<{ wrappedKey: string; keyCheck: string }> {
  const wrappingKey = await derivePassphraseKey(passphrase, saltBase64);
  const iv1 = new Uint8Array(12);
  crypto.getRandomValues(iv1);
  const rawBoardKey = new TextEncoder().encode(boardKeyBase64);
  const wrappedBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv1 }, wrappingKey, rawBoardKey);

  // Store iv + ciphertext combined as base64 in wrappedKey
  const combined = new Uint8Array(iv1.length + wrappedBuf.byteLength);
  combined.set(iv1, 0);
  combined.set(new Uint8Array(wrappedBuf), iv1.length);

  // Create a verification check token
  const iv2 = new Uint8Array(12);
  crypto.getRandomValues(iv2);
  const checkData = new TextEncoder().encode('STICKYBOARD_KEY_VERIFIED');
  const checkBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv2 }, wrappingKey, checkData);
  const checkCombined = new Uint8Array(iv2.length + checkBuf.byteLength);
  checkCombined.set(iv2, 0);
  checkCombined.set(new Uint8Array(checkBuf), iv2.length);

  return {
    wrappedKey: bytesToBase64(combined),
    keyCheck: bytesToBase64(checkCombined),
  };
}

export async function unwrapBoardKeyWithPassphrase(
  wrappedKeyBase64: string,
  passphrase: string,
  saltBase64: string
): Promise<string> {
  const wrappingKey = await derivePassphraseKey(passphrase, saltBase64);
  const combined = base64ToBytes(wrappedKeyBase64);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrappingKey, ciphertext);
  return new TextDecoder().decode(decrypted);
}
