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
    if (tx.type === 'expense') {
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
