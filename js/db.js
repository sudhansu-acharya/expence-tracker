// Encrypted IndexedDB Storage Engine (cashew_vault_db)
import { encryptJson, decryptJson } from './crypto.js';
import { uuid, nowIso } from './format.js';

const DB_NAME = 'cashew_vault_db';
const DB_VERSION = 1;

export const ENCRYPTED_STORES = [
  'wallets',
  'categories',
  'transactions',
  'budgets',
  'goals',
  'recurring',
  'credit_card_bills',
  'categorization_rules',
  'settings'
];

let dbPromise = null;
let sessionVmk = null;

export function setSessionKey(vmk) {
  sessionVmk = vmk;
}

export function clearSessionKey() {
  sessionVmk = null;
}

export function hasSessionKey() {
  return sessionVmk !== null;
}

export function getSessionKey() {
  if (!sessionVmk) throw new Error('Vault is locked');
  return sessionVmk;
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('auth_meta')) {
        db.createObjectStore('auth_meta', { keyPath: 'id' });
      }
      for (const storeName of ENCRYPTED_STORES) {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Unencrypted Auth Metadata Store
export async function getAuthMeta() {
  const db = await openDb();
  const tx = db.transaction('auth_meta', 'readonly');
  return idbRequest(tx.objectStore('auth_meta').get('primary'));
}

export async function saveAuthMeta(meta) {
  const db = await openDb();
  const tx = db.transaction('auth_meta', 'readwrite');
  await idbRequest(tx.objectStore('auth_meta').put({ ...meta, id: 'primary' }));
}

// Encrypted Store CRUD
export async function putRecord(storeName, record) {
  const vmk = getSessionKey();
  const now = nowIso();
  const full = {
    ...record,
    id: record.id || uuid(),
    createdAt: record.createdAt || now,
    updatedAt: record.updatedAt || now,
    deletedAt: record.deletedAt ?? null
  };
  const { ivB64, ciphertextB64 } = await encryptJson(vmk, full);
  const envelope = {
    id: full.id,
    updatedAt: full.updatedAt,
    deletedAt: full.deletedAt,
    ivB64,
    ciphertextB64
  };
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  await idbRequest(tx.objectStore(storeName).put(envelope));
  return full;
}

export async function softDeleteRecord(storeName, record) {
  return putRecord(storeName, {
    ...record,
    updatedAt: nowIso(),
    deletedAt: nowIso()
  });
}

export async function getAllRecords(storeName, { includeDeleted = false } = {}) {
  const vmk = getSessionKey();
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  const envelopes = await idbRequest(tx.objectStore(storeName).getAll());
  const results = [];
  for (const env of envelopes) {
    if (!includeDeleted && env.deletedAt) continue;
    const decrypted = await decryptJson(vmk, env.ivB64, env.ciphertextB64);
    if (!includeDeleted && decrypted.deletedAt) continue;
    results.push(decrypted);
  }
  return results;
}

export async function clearStore(storeName) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  await idbRequest(tx.objectStore(storeName).clear());
}

export async function loadAllVaultData({ includeDeleted = false } = {}) {
  const data = {};
  for (const s of ENCRYPTED_STORES) {
    data[s] = await getAllRecords(s, { includeDeleted });
  }
  return data;
}

export const DEFAULT_INVESTMENT_CATEGORIES = [
  { name: 'Mutual Fund / SIP', type: 'investment', icon: 'target', color: '#8b5cf6', isSystem: true },
  { name: 'Fixed Deposit (FD)', type: 'investment', icon: 'bank', color: '#6366f1', isSystem: true },
  { name: 'Stocks / Equity', type: 'investment', icon: 'sparkles', color: '#0ea5e9', isSystem: true },
  { name: 'PPF / EPF / NPS', type: 'investment', icon: 'shield', color: '#14b8a6', isSystem: true },
  { name: 'Gold / SGB', type: 'investment', icon: 'income', color: '#eab308', isSystem: true },
  { name: 'Recurring Deposit (RD)', type: 'investment', icon: 'wallet', color: '#a855f7', isSystem: true }
];

export async function ensureInvestmentCategories() {
  const existing = await getAllRecords('categories', { includeDeleted: true });
  const hasInvest = existing.some(c => c.type === 'investment' && !c.deletedAt);
  if (hasInvest) return false;
  for (const c of DEFAULT_INVESTMENT_CATEGORIES) {
    await putRecord('categories', { ...c, parentId: null });
  }
  return true;
}

export async function seedInitialVaultData() {
  const existingCats = await getAllRecords('categories', { includeDeleted: true });
  if (existingCats.length > 0) return;

  const defaultCategories = [
    { name: 'Food & Dining', type: 'expense', icon: 'food', color: '#f97316', isSystem: true },
    { name: 'Groceries', type: 'expense', icon: 'cart', color: '#10b981', isSystem: true },
    { name: 'Commute & Fuel', type: 'expense', icon: 'car', color: '#3b82f6', isSystem: true },
    { name: 'Bills & Utilities', type: 'expense', icon: 'bolt', color: '#eab308', isSystem: true },
    { name: 'Shopping', type: 'expense', icon: 'bag', color: '#ec4899', isSystem: true },
    { name: 'Entertainment & OTT', type: 'expense', icon: 'tv', color: '#8b5cf6', isSystem: true },
    { name: 'Health', type: 'expense', icon: 'heart', color: '#ef4444', isSystem: true },
    { name: 'EMI & Loans', type: 'expense', icon: 'bank', color: '#6366f1', isSystem: true },
    { name: 'Rent & Housing', type: 'expense', icon: 'homeHouse', color: '#0ea5e9', isSystem: true },
    { name: 'Travel', type: 'expense', icon: 'plane', color: '#14b8a6', isSystem: true },
    { name: 'Salary', type: 'income', icon: 'income', color: '#10b981', isSystem: true },
    { name: 'Freelance & Bonus', type: 'income', icon: 'sparkles', color: '#0d9488', isSystem: true },
    { name: 'Cashback & Refunds', type: 'income', icon: 'target', color: '#22c55e', isSystem: true }
  ];

  const catMap = {};
  for (const c of [...defaultCategories, ...DEFAULT_INVESTMENT_CATEGORIES]) {
    const saved = await putRecord('categories', { ...c, parentId: null });
    catMap[c.name] = saved.id;
  }

  const defaultWallets = [
    { name: 'Bank Account', type: 'bank', currency: 'INR', initialBalance: 0, currentBalance: 0, last4Digits: '', institution: '', color: '#0d9488', icon: 'bank', isArchived: false },
    { name: 'UPI', type: 'upi', currency: 'INR', initialBalance: 0, currentBalance: 0, last4Digits: '', institution: '', color: '#3b82f6', icon: 'wallet', isArchived: false },
    { name: 'Cash', type: 'cash', currency: 'INR', initialBalance: 0, currentBalance: 0, last4Digits: '', institution: '', color: '#10b981', icon: 'wallet', isArchived: false },
    { name: 'Credit Card', type: 'credit_card', currency: 'INR', initialBalance: 0, currentBalance: 0, creditLimit: 0, billingDay: 1, dueDay: 20, last4Digits: '', institution: '', color: '#f43f5e', icon: 'card', isArchived: false }
  ];
  for (const w of defaultWallets) {
    await putRecord('wallets', w);
  }

  const defaultRules = [
    { pattern: 'swiggy|zomato|starbucks|dominos|kfc|mcdonald', matchType: 'regex', categoryId: catMap['Food & Dining'], tags: ['#dining'], priority: 10, hitCount: 0, isUserDefined: false },
    { pattern: 'blinkit|zepto|bigbasket|dmart|instamart|kirana|supermarket', matchType: 'regex', categoryId: catMap['Groceries'], tags: ['#home'], priority: 10, hitCount: 0, isUserDefined: false },
    { pattern: 'uber|ola|rapido|metro|irctc|petrol|hpcl|iocl|bpcl|fastag', matchType: 'regex', categoryId: catMap['Commute & Fuel'], tags: ['#commute'], priority: 10, hitCount: 0, isUserDefined: false },
    { pattern: 'netflix|spotify|prime|hotstar|youtube|bookmyshow', matchType: 'regex', categoryId: catMap['Entertainment & OTT'], tags: ['#ott'], priority: 10, hitCount: 0, isUserDefined: false },
    { pattern: 'airtel|jio|vi|bescom|tata power|indane|bharatgas|broadband|electricity', matchType: 'regex', categoryId: catMap['Bills & Utilities'], tags: ['#bills'], priority: 10, hitCount: 0, isUserDefined: false },
    { pattern: 'amazon|flipkart|myntra|ajio|nykaa|croma', matchType: 'regex', categoryId: catMap['Shopping'], tags: ['#shopping'], priority: 9, hitCount: 0, isUserDefined: false },
    { pattern: 'apollo|pharmeasy|1mg|medplus|hospital|clinic', matchType: 'regex', categoryId: catMap['Health'], tags: ['#health'], priority: 10, hitCount: 0, isUserDefined: false },
    { pattern: 'emi|loan|bajaj finserv', matchType: 'regex', categoryId: catMap['EMI & Loans'], tags: ['#emi'], priority: 10, hitCount: 0, isUserDefined: false }
  ];
  for (const r of defaultRules) {
    await putRecord('categorization_rules', r);
  }

  await putRecord('settings', {
    id: 'app_settings',
    defaultCurrency: 'INR',
    numberFormat: 'en-IN',
    themeMode: 'system',
    accentColor: 'emerald',
    glassLevel: 70,
    hideAmounts: false,
    monthlyIncomeEstimate: 0,
    monthlySavingsTarget: 0,
    autoLockMinutes: 15,
    syncProvider: 'none',
    gdriveClientId: '',
    lastSyncAt: null
  });
}
