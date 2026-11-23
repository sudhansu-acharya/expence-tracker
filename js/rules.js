// Auto-Categorization Rule Engine & Self-Transfer Detection

export function matchCategorizationRule(text, rules = []) {
  if (!text || !rules.length) return null;
  const normalized = String(text).toLowerCase().trim();
  const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const rule of sorted) {
    if (!rule.pattern || !rule.categoryId) continue;
    try {
      if (rule.matchType === 'regex') {
        const re = new RegExp(rule.pattern, 'i');
        if (re.test(normalized)) return rule;
      } else if (rule.matchType === 'vpa') {
        if (normalized.includes(rule.pattern.toLowerCase())) return rule;
      } else {
        if (normalized.includes(rule.pattern.toLowerCase())) return rule;
      }
    } catch {
      if (normalized.includes(rule.pattern.toLowerCase())) return rule;
    }
  }
  return null;
}

export function detectSelfTransfer({ type, merchant = '', note = '', walletId, toWalletId, amount, date }, wallets = [], existingTxs = []) {
  if (type === 'transfer' && toWalletId && walletId !== toWalletId) {
    return { isSelfTransfer: true, reason: 'Transfer between own wallets' };
  }

  const combined = `${merchant} ${note}`.toLowerCase();
  const selfPatterns = [
    /\bself[\s-]?transfer\b/,
    /\bown\s+account\b/,
    /\bwallet\s+(?:top[\s-]?up|load|add\s+money)\b/,
    /\bcredit\s+card\s+(?:bill\s+)?payment\b/,
    /\bcred\.club\b/,
    /\bpay(?:ment)?\s+(?:to|towards)\s+(?:hdfc|icici|sbi|axis|kotak|amex|idfc|onecard)\s*(?:cc|credit\s*card)/
  ];
  if (selfPatterns.some(re => re.test(combined))) {
    return { isSelfTransfer: true, reason: 'Matched self-transfer / card bill payment pattern' };
  }

  // Check if merchant mentions another owned wallet's last 4 digits
  const otherWallets = wallets.filter(w => w.id !== walletId && w.last4Digits && /^\d{4}$/.test(w.last4Digits));
  for (const ow of otherWallets) {
    if (combined.includes(ow.last4Digits)) {
      return { isSelfTransfer: true, reason: `Matched own account ••${ow.last4Digits}` };
    }
  }

  // Check for opposite-direction matching amount within 10 minutes on another own wallet
  if (amount && date) {
    const ts = new Date(date).getTime();
    const tenMin = 10 * 60 * 1000;
    const match = existingTxs.find(tx =>
      !tx.deletedAt &&
      tx.walletId !== walletId &&
      Math.abs(Number(tx.amount) - Number(amount)) < 0.01 &&
      tx.type !== type &&
      (tx.type === 'expense' || tx.type === 'income') &&
      Math.abs(new Date(tx.date).getTime() - ts) <= tenMin
    );
    if (match) {
      return { isSelfTransfer: true, reason: 'Matched opposite debit/credit across own wallets within 10 min' };
    }
  }

  return { isSelfTransfer: false, reason: null };
}

// Compute live wallet balances from initialBalance + non-deleted transactions
export function computeWalletBalances(wallets = [], transactions = []) {
  const balances = new Map();
  for (const w of wallets) {
    balances.set(w.id, Number(w.initialBalance) || 0);
  }
  for (const tx of transactions) {
    if (tx.deletedAt) continue;
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'expense' || tx.type === 'investment') {
      if (balances.has(tx.walletId)) balances.set(tx.walletId, balances.get(tx.walletId) - amt);
    } else if (tx.type === 'income') {
      if (balances.has(tx.walletId)) balances.set(tx.walletId, balances.get(tx.walletId) + amt);
    } else if (tx.type === 'transfer') {
      if (balances.has(tx.walletId)) balances.set(tx.walletId, balances.get(tx.walletId) - amt);
      if (tx.toWalletId && balances.has(tx.toWalletId)) {
        balances.set(tx.toWalletId, balances.get(tx.toWalletId) + amt);
      }
    }
  }
  return balances;
}

// Expand a transaction into category-level spend allocations (handles splits accurately)
export function expandCategoryAllocations(tx) {
  if (tx.isSelfTransfer || tx.type !== 'expense') return [];
  if (Array.isArray(tx.splits) && tx.splits.length > 0) {
    return tx.splits.map(s => ({ categoryId: s.categoryId, amount: Number(s.amount) || 0 }));
  }
  return [{ categoryId: tx.categoryId, amount: Number(tx.amount) || 0 }];
}

// Fast starter items for Groceries & daily essentials (shown for 1-tap entry)
export const GROCERY_QUICK_ITEMS = [
  { label: 'Milk & Dairy', icon: 'milk', tags: ['#grocery', '#daily'] },
  { label: 'Vegetables', icon: 'veggies', tags: ['#grocery', '#fresh'] },
  { label: 'Fruits', icon: 'fruit', tags: ['#grocery', '#fresh'] },
  { label: 'Kirana Store', icon: 'store', tags: ['#grocery'] },
  { label: 'Supermarket / DMart', icon: 'cart', tags: ['#grocery'] },
  { label: 'Bread & Eggs', icon: 'food', tags: ['#grocery', '#daily'] },
  { label: 'Rice / Atta / Oil', icon: 'bag', tags: ['#grocery', '#monthly'] },
  { label: 'Snacks & Tea', icon: 'coffee', tags: ['#grocery'] }
];

export const INVESTMENT_QUICK_ITEMS = [
  { label: 'Monthly SIP', icon: 'trendingUp', catMatch: 'SIP', tags: ['#sip', '#investment'] },
  { label: 'Fixed Deposit (FD)', icon: 'bank', catMatch: 'FD', tags: ['#fd', '#investment'] },
  { label: 'Nifty 50 Index Fund', icon: 'trendingUp', catMatch: 'SIP', tags: ['#sip', '#index'] },
  { label: 'Stocks / Equity', icon: 'candles', catMatch: 'Stocks', tags: ['#stocks', '#equity'] },
  { label: 'PPF / EPF Contribution', icon: 'shield', catMatch: 'PPF', tags: ['#ppf', '#tax-saving'] },
  { label: 'Gold ETF / SGB', icon: 'coins', catMatch: 'Gold', tags: ['#gold', '#investment'] },
  { label: 'Recurring Deposit (RD)', icon: 'piggy', catMatch: 'RD', tags: ['#rd', '#investment'] },
  { label: 'NPS Tier 1', icon: 'shield', catMatch: 'NPS', tags: ['#nps', '#retirement'] }
];

// Smart Past-Purchase Suggestion Engine (scans past days, weeks & months)
export function getPurchaseSuggestions(transactions = [], { type = 'expense', query = '', categoryId = '', limit = 8 } = {}) {
  const now = Date.now();
  const q = String(query || '').trim().toLowerCase();
  const grouped = new Map();

  for (const tx of transactions) {
    if (tx.deletedAt || tx.isSelfTransfer) continue;
    if (type && tx.type !== type) continue;
    const merchant = String(tx.merchant || '').trim();
    if (!merchant) continue;

    const key = `${merchant.toLowerCase()}|${tx.categoryId || ''}`;
    const ts = new Date(tx.date).getTime() || 0;
    const prev = grouped.get(key);

    if (!prev) {
      grouped.set(key, {
        key,
        merchant,
        categoryId: tx.categoryId || '',
        walletId: tx.walletId || '',
        lastAmount: Number(tx.amount) || 0,
        lastDate: tx.date,
        lastTs: ts,
        count: 1,
        tags: Array.isArray(tx.tags) ? [...tx.tags] : [],
        note: tx.note || ''
      });
    } else {
      prev.count += 1;
      if (ts > prev.lastTs) {
        prev.lastTs = ts;
        prev.lastDate = tx.date;
        prev.lastAmount = Number(tx.amount) || 0;
        prev.walletId = tx.walletId || prev.walletId;
        if (Array.isArray(tx.tags) && tx.tags.length) prev.tags = [...tx.tags];
      }
    }
  }

  const scored = [];
  for (const item of grouped.values()) {
    const mLower = item.merchant.toLowerCase();
    const tagStr = item.tags.join(' ').toLowerCase();
    if (q && !mLower.includes(q) && !tagStr.includes(q) && !item.note.toLowerCase().includes(q)) {
      continue;
    }

    const daysAgo = Math.max(0, Math.floor((now - item.lastTs) / 86400000));
    // Score favors frequency across days/months + recency + matching active category + prefix query match
    let score = item.count * 12 + Math.max(0, 30 - Math.min(daysAgo, 30));
    if (categoryId && item.categoryId === categoryId) score += 25;
    if (q && mLower.startsWith(q)) score += 30;

    scored.push({ ...item, daysAgo, score });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
