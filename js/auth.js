// Offline Local Authentication Gate, Vault Setup, PIN, Recovery Key, Biometrics & Auto-Lock
import {
  generateVaultMasterKey,
  wrapVaultKey,
  unwrapVaultKey,
  generateRecoveryKey,
  isWebAuthnAvailable,
  enrollBiometricCredential,
  verifyBiometricCredential
} from './crypto.js';
import {
  getAuthMeta,
  saveAuthMeta,
  setSessionKey,
  clearSessionKey,
  getSessionKey,
  seedInitialVaultData
} from './db.js';
import { nowIso } from './format.js';

let inactivityTimer = null;
let onLockCallback = null;

export function registerAutoLockHandler(callback) {
  onLockCallback = callback;
  const reset = () => resetInactivityTimer();
  ['click', 'keydown', 'touchstart', 'mousemove'].forEach(evt => {
    window.addEventListener(evt, reset, { passive: true });
  });
  window.addEventListener('beforeunload', () => clearSessionKey());
}

export async function resetInactivityTimer(minutesOverride = null) {
  clearTimeout(inactivityTimer);
  const meta = await getAuthMeta();
  const mins = minutesOverride ?? meta?.autoLockMinutes ?? 15;
  if (!mins || mins <= 0) return;
  inactivityTimer = setTimeout(() => {
    lockSession();
    if (onLockCallback) onLockCallback('Auto-locked due to inactivity');
  }, mins * 60 * 1000);
}

export function lockSession() {
  clearTimeout(inactivityTimer);
  clearSessionKey();
}

export async function hasVaultSetup() {
  const meta = await getAuthMeta();
  return Boolean(meta && meta.passwordBundle);
}

export async function createVault({ username, password, pin = '' }) {
  if (!username || username.trim().length < 2) throw new Error('Username must be at least 2 characters');
  if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');

  const vmk = await generateVaultMasterKey();
  const recoveryKey = generateRecoveryKey();
  const passwordBundle = await wrapVaultKey(vmk, password);
  const recoveryBundle = await wrapVaultKey(vmk, recoveryKey);
  const pinBundle = pin && /^\d{4,6}$/.test(pin) ? await wrapVaultKey(vmk, pin) : null;

  await saveAuthMeta({
    username: username.trim(),
    passwordBundle,
    recoveryBundle,
    pinBundle,
    webAuthnCredId: null,
    autoLockMinutes: 15,
    failedAttempts: 0,
    lockoutUntil: null,
    createdAt: nowIso()
  });

  setSessionKey(vmk);
  await seedInitialVaultData();
  await resetInactivityTimer(15);
  return { recoveryKey };
}

function checkLockout(meta) {
  if (meta.lockoutUntil && Date.now() < meta.lockoutUntil) {
    const secs = Math.ceil((meta.lockoutUntil - Date.now()) / 1000);
    throw new Error(`Too many failed attempts. Try again in ${secs}s.`);
  }
}

async function recordFailure(meta) {
  const attempts = (meta.failedAttempts || 0) + 1;
  let lockoutUntil = null;
  if (attempts >= 5) {
    const multiplier = attempts >= 10 ? 300 : (attempts >= 7 ? 120 : 30);
    lockoutUntil = Date.now() + multiplier * 1000;
  }
  await saveAuthMeta({ ...meta, failedAttempts: attempts, lockoutUntil });
}

async function clearFailures(meta) {
  if (meta.failedAttempts > 0 || meta.lockoutUntil) {
    await saveAuthMeta({ ...meta, failedAttempts: 0, lockoutUntil: null });
  }
}

export async function loginWithPassword(username, password) {
  const meta = await getAuthMeta();
  if (!meta) throw new Error('No vault found. Please set up your vault first.');
  checkLockout(meta);

  if (username.trim().toLowerCase() !== meta.username.toLowerCase()) {
    await recordFailure(meta);
    throw new Error('Invalid username or password');
  }
  try {
    const vmk = await unwrapVaultKey(meta.passwordBundle, password);
    await clearFailures(meta);
    setSessionKey(vmk);
    await resetInactivityTimer(meta.autoLockMinutes);
    return meta;
  } catch {
    await recordFailure(meta);
    throw new Error('Invalid username or password');
  }
}

export async function loginWithPin(pin) {
  const meta = await getAuthMeta();
  if (!meta || !meta.pinBundle) throw new Error('Quick PIN is not enabled');
  checkLockout(meta);
  try {
    const vmk = await unwrapVaultKey(meta.pinBundle, pin);
    await clearFailures(meta);
    setSessionKey(vmk);
    await resetInactivityTimer(meta.autoLockMinutes);
    return meta;
  } catch {
    await recordFailure(meta);
    throw new Error('Incorrect PIN');
  }
}

export async function recoverVaultWithKey(recoveryKey, newPassword) {
  const meta = await getAuthMeta();
  if (!meta || !meta.recoveryBundle) throw new Error('Recovery not available');
  if (!newPassword || newPassword.length < 6) throw new Error('New password must be at least 6 characters');
  try {
    const vmk = await unwrapVaultKey(meta.recoveryBundle, recoveryKey.trim().toUpperCase());
    const passwordBundle = await wrapVaultKey(vmk, newPassword);
    await saveAuthMeta({ ...meta, passwordBundle, failedAttempts: 0, lockoutUntil: null });
    setSessionKey(vmk);
    await resetInactivityTimer(meta.autoLockMinutes);
    return true;
  } catch {
    throw new Error('Invalid Recovery Key');
  }
}

export async function changeVaultPassword(currentPassword, newPassword) {
  const meta = await getAuthMeta();
  if (!newPassword || newPassword.length < 6) throw new Error('New password must be at least 6 characters');
  const vmk = await unwrapVaultKey(meta.passwordBundle, currentPassword);
  const passwordBundle = await wrapVaultKey(vmk, newPassword);
  await saveAuthMeta({ ...meta, passwordBundle });
}

export async function setQuickPin(pin) {
  const meta = await getAuthMeta();
  const vmk = getSessionKey();
  if (!pin) {
    await saveAuthMeta({ ...meta, pinBundle: null });
    return;
  }
  if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN must be 4 to 6 digits');
  const pinBundle = await wrapVaultKey(vmk, pin);
  await saveAuthMeta({ ...meta, pinBundle });
}

export async function setAutoLockMinutes(minutes) {
  const meta = await getAuthMeta();
  await saveAuthMeta({ ...meta, autoLockMinutes: Number(minutes) || 0 });
  await resetInactivityTimer(Number(minutes) || 0);
}

export async function enableBiometric() {
  if (!isWebAuthnAvailable()) throw new Error('Biometric WebAuthn is not supported in this browser');
  const meta = await getAuthMeta();
  const credId = await enrollBiometricCredential(meta.username);
  await saveAuthMeta({ ...meta, webAuthnCredId: credId });
  return credId;
}

export async function checkBiometricPresence() {
  const meta = await getAuthMeta();
  if (!meta?.webAuthnCredId) throw new Error('Biometric unlock is not enrolled');
  return verifyBiometricCredential(meta.webAuthnCredId);
}
