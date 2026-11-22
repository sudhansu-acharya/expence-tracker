// Web Crypto API Security Layer: PBKDF2-SHA256, AES-256-GCM, SHA-256, WebAuthn

const PBKDF2_ITERATIONS = 210000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function bytesToB64(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function randomBytes(len) {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return b;
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function deriveAesKey(secret, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey', 'deriveBits']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
}

export async function deriveVerifierB64(secret, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    baseKey,
    256
  );
  return bytesToB64(new Uint8Array(bits));
}

export async function generateVaultMasterKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function wrapVaultKey(vmk, secret) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await deriveAesKey(secret, salt);
  const rawVmk = await crypto.subtle.exportKey('raw', vmk);
  const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, rawVmk);
  return {
    saltB64: bytesToB64(salt),
    ivB64: bytesToB64(iv),
    wrappedB64: bytesToB64(new Uint8Array(wrapped)),
    iterations: PBKDF2_ITERATIONS
  };
}

export async function unwrapVaultKey(bundle, secret) {
  const salt = b64ToBytes(bundle.saltB64);
  const iv = b64ToBytes(bundle.ivB64);
  const ciphertext = b64ToBytes(bundle.wrappedB64);
  const kek = await deriveAesKey(secret, salt, bundle.iterations || PBKDF2_ITERATIONS);
  const rawVmk = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kek, ciphertext);
  return crypto.subtle.importKey(
    'raw',
    rawVmk,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson(vmk, obj) {
  const iv = randomBytes(12);
  const plaintext = encoder.encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vmk, plaintext);
  return {
    ivB64: bytesToB64(iv),
    ciphertextB64: bytesToB64(new Uint8Array(cipher))
  };
}

export async function decryptJson(vmk, ivB64, ciphertextB64) {
  const iv = b64ToBytes(ivB64);
  const cipher = b64ToBytes(ciphertextB64);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, vmk, cipher);
  return JSON.parse(decoder.decode(plain));
}

// Standalone Passphrase-based AES-256-GCM encryption for .enc.json & Google Drive Sync
export async function encryptWithPassphrase(obj, passphrase) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveAesKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plain = encoder.encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return {
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    cipher: 'AES-256-GCM',
    saltB64: bytesToB64(salt),
    ivB64: bytesToB64(iv),
    ciphertextB64: bytesToB64(new Uint8Array(cipher))
  };
}

export async function decryptWithPassphrase(envelope, passphrase) {
  if (!envelope || !envelope.saltB64 || !envelope.ivB64 || !envelope.ciphertextB64) {
    throw new Error('Invalid encrypted backup format');
  }
  const salt = b64ToBytes(envelope.saltB64);
  const iv = b64ToBytes(envelope.ivB64);
  const cipher = b64ToBytes(envelope.ciphertextB64);
  const key = await deriveAesKey(passphrase, salt, envelope.iterations || PBKDF2_ITERATIONS);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(decoder.decode(plain));
}

export function generateRecoveryKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(24);
  let out = '';
  for (let i = 0; i < 24; i++) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function isWebAuthnAvailable() {
  return Boolean(window.PublicKeyCredential && navigator.credentials);
}

export async function enrollBiometricCredential(username) {
  if (!isWebAuthnAvailable()) throw new Error('WebAuthn not supported on this browser');
  const challenge = randomBytes(32);
  const userId = randomBytes(16);
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'CashewFlow Offline Vault' },
      user: { id: userId, name: username, displayName: username },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60000
    }
  });
  return bytesToB64(new Uint8Array(cred.rawId));
}

export async function verifyBiometricCredential(credIdB64) {
  if (!isWebAuthnAvailable()) throw new Error('WebAuthn not supported on this browser');
  const challenge = randomBytes(32);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ id: b64ToBytes(credIdB64), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000
    }
  });
  return Boolean(assertion);
}
