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
    return { isSelfTransfer: true, reason: 'Transfer between own wallets', suggestedToWalletId: toWalletId };
  }

  const sourceWallet = wallets.find(w => w.id === walletId);
  const combined = `${merchant} ${note}`.toLowerCase();
  const ccPaymentPatterns = [
    /\bcredit\s+card\s+(?:bill\s+)?payment\b/,
    /\bcc\s+bill\s+pay/,
    /\bcred\.club\b/,
    /\bpay(?:ment)?\s+(?:to|towards)\s+(?:hdfc|icici|sbi|axis|kotak|amex|idfc|onecard)\s*(?:cc|credit\s*card)/
  ];
  const selfPatterns = [
    /\bself[\s-]?transfer\b/,
    /\bown\s+account\b/,
    /\bwallet\s+(?:top[\s-]?up|load|add\s+money)\b/,
    ...ccPaymentPatterns
  ];

  // If spending ON a credit card wallet itself, don't misclassify a normal swipe as a self-transfer
  if (sourceWallet?.type !== 'credit_card' && selfPatterns.some(re => re.test(combined))) {
    let suggestedToWalletId = toWalletId || null;
    if (!suggestedToWalletId && ccPaymentPatterns.some(re => re.test(combined))) {
      const ccWallets = wallets.filter(w => w.type === 'credit_card' && !w.deletedAt);
      const matchedByDigits = ccWallets.find(w => w.last4Digits && combined.includes(w.last4Digits));
      suggestedToWalletId = (matchedByDigits || ccWallets[0])?.id || null;
    }
    return { isSelfTransfer: true, reason: 'Matched self-transfer / card bill payment pattern', suggestedToWalletId };
  }

  // Check if merchant mentions another owned wallet's last 4 digits
  const otherWallets = wallets.filter(w => w.id !== walletId && w.last4Digits && /^\d{4}$/.test(w.last4Digits));
  for (const ow of otherWallets) {
    if (combined.includes(ow.last4Digits)) {
      return { isSelfTransfer: true, reason: `Matched own account ••${ow.last4Digits}`, suggestedToWalletId: ow.id };
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
      return { isSelfTransfer: true, reason: 'Matched opposite debit/credit across own wallets within 10 min', suggestedToWalletId: match.walletId };
    }
  }

  return { isSelfTransfer: false, reason: null, suggestedToWalletId: null };
}

export function isCreditCardPaymentTx(tx, ccWalletIds = new Set()) {
  if (!tx || tx.deletedAt) return false;
  if (tx.type === 'transfer' && tx.toWalletId && ccWalletIds.has(tx.toWalletId)) return true;
  if (Array.isArray(tx.tags) && tx.tags.some(t => /^#(?:cc-?bill|cc-?pay|cc-?dues)$/i.test(t))) return true;
  // Normal expense swipes ON a credit card wallet itself are spending, not bill payments
  if (tx.type === 'expense' && ccWalletIds.has(tx.walletId)) return false;
  if (tx.type === 'income') return false;

  const merchant = String(tx.merchant || '').trim().toLowerCase();
  const note = String(tx.note || '').trim().toLowerCase();
  const combined = `${merchant} ${note}`;

  // Exclude normal merchant purchases paid *using* a credit card (e.g. RuPay Credit Card on UPI)
  if (/\b(?:paid\s+)?(?:using|via|by|through|from)\s+(?:rupay\s+)?credit\s*card\b/.test(combined)) {
    return false;
  }

  // Match known Indian credit card issuers & bill payment narrations (singular & plural "card/cards")
  return (
    /\bsbi\s*cards?\b/.test(combined) ||
    /\bsbicards?\b/.test(combined) ||
    /\b(?:hdfc|icici|axis|kotak|rbl|indusind|idfc|bob|au|yes|hsbc|citi|scb|standard\s*chartered|federal|pnb|canara)\s*(?:bank\s*)?(?:credit\s*)?cards?\b/.test(combined) ||
    /\b(?:amex|american\s*express|onecard|bob\s*financial)\b/.test(combined) ||
    /\bcredit\s*cards?\s*(?:bill|pay|payment|due|settlement|autopay|services)\b/.test(combined) ||
    /\b(?:bill|pay|payment)\s*(?:for|to|towards)\s*(?:a\s*)?credit\s*cards?\b/.test(combined) ||
    /\bcc\s*(?:bill|pay|payment|due|autopay)\b/.test(combined) ||
    /\bcard\s*(?:bill|payment|due)\b/.test(combined) ||
    /\b(?:cred\.club|cred\s*pay|credapp|dreamplug)\b/.test(combined) ||
    /^cred(?:\s|$|\/|\-)/.test(merchant)
  );
}

export function computeCreditCardSummary(wallets = [], transactions = [], ccBills = []) {
  const ccWallets = wallets.filter(w => w.type === 'credit_card' && !w.deletedAt);
  const ccWalletIds = new Set(ccWallets.map(w => w.id));
  const balances = computeWalletBalances(wallets, transactions);

  let ledgerDues = 0;
  for (const w of ccWallets) {
    const bal = balances.get(w.id) ?? 0;
    if (bal < 0) ledgerDues += Math.abs(bal);
  }

  const unpaidBillSum = ccBills
    .filter(b => !b.deletedAt && b.status !== 'paid')
    .reduce((s, b) => s + (Number(b.totalDue) || 0), 0);

  let totalSwipes = 0;
  let totalPaid = 0;
  let paidCount = 0;
  for (const tx of transactions) {
    if (tx.deletedAt) continue;
    const amt = Number(tx.amount) || 0;
    if (tx.type === 'expense' && ccWalletIds.has(tx.walletId)) {
      totalSwipes += amt;
    } else if (isCreditCardPaymentTx(tx, ccWalletIds)) {
      totalPaid += amt;
      paidCount += 1;
    }
  }

  return {
    ccWalletIds,
    ledgerDues,
    unpaidBillSum,
    effectiveDues: Math.max(ledgerDues, unpaidBillSum),
    totalSwipes,
    totalPaid,
    paidCount
  };
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
