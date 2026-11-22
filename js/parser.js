// On-Device Indian Bank SMS, UPI Notification, Credit Card Bill SMS Parser
// & RBI Account Aggregator (ReBIT FI JSON / Bank CSV) Importer — 100% Local
import { sha256Hex } from './crypto.js';
import { matchCategorizationRule, detectSelfTransfer } from './rules.js';
import { nowIso, toDateInputValue } from './format.js';

function parseIndianDate(raw) {
  if (!raw) return nowIso();
  const cleaned = raw.trim().replace(/\//g, '-');
  const dmyAlpha = cleaned.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})$/);
  if (dmyAlpha) {
    const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const day = parseInt(dmyAlpha[1], 10);
    const mon = months[dmyAlpha[2].toLowerCase()];
    let yr = parseInt(dmyAlpha[3], 10);
    if (yr < 100) yr += 2000;
    if (mon !== undefined) return new Date(yr, mon, day, 12, 0, 0).toISOString();
  }
  const dmyNum = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (dmyNum) {
    const day = parseInt(dmyNum[1], 10);
    const mon = parseInt(dmyNum[2], 10) - 1;
    let yr = parseInt(dmyNum[3], 10);
    if (yr < 100) yr += 2000;
    return new Date(yr, mon, day, 12, 0, 0).toISOString();
  }
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? nowIso() : parsed.toISOString();
}

function parseAmount(str) {
  if (!str) return null;
  const num = parseFloat(String(str).replace(/,/g, '').trim());
  return Number.isFinite(num) && num > 0 ? num : null;
}

function detectBankName(text) {
  const banks = [
    ['HDFC', /\bhdfc\b/i],
    ['ICICI', /\bicici\b/i],
    ['SBI', /\bsbi\b|state bank/i],
    ['Axis', /\baxis\b/i],
    ['Kotak', /\bkotak\b/i],
    ['Amex', /\bamex|american express/i],
    ['IDFC First', /\bidfc\b/i],
    ['OneCard', /\bonecard\b/i],
    ['RBL', /\brbl\b/i],
    ['IndusInd', /\bindusind\b/i],
    ['Yes Bank', /\byes\s*bank\b/i]
  ];
  for (const [name, re] of banks) {
    if (re.test(text)) return name;
  }
  return 'Bank';
}

export async function parseMessageOnDevice({ body, sender = '', source = 'sms', timestamp = null }, { wallets = [], categories = [], rules = [], existingTxs = [] }) {
  const text = String(body || '').trim();
  if (!text) return null;

  const sourceHash = await sha256Hex(`${sender}|${text.toLowerCase().replace(/\s+/g, ' ').slice(0, 180)}`);
  const last4Match = text.match(/(?:xx|\*\*|••|ending(?:\s+in)?|a\/c\s*\*+|card\s*\*+)\s*(\d{4})/i);
  const last4 = last4Match ? last4Match[1] : null;
  const bankName = detectBankName(`${sender} ${text}`);

  // 1. Check for Credit Card Statement / Bill Due SMS
  const isCcBill = /(?:credit\s*card|cc\s*(?:xx|\*\*|ending)|statement\s+generated)/i.test(text) &&
    /(?:total\s*(?:amount\s*)?due|min(?:imum)?\s*(?:amount\s*)?due|due\s*date|bill\s*(?:is\s*)?generated)/i.test(text);

  if (isCcBill) {
    const totalMatch = text.match(/total\s*(?:amount\s*)?due\s*(?:is\s*)?(?:of\s*)?(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i)
      || text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
    const minMatch = text.match(/min(?:imum)?\s*(?:amount\s*)?due\s*(?:is\s*)?(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    const dueMatch = text.match(/due\s*(?:date|by|on)\s*[:\-]?\s*(\d{1,2}[-\/\s](?:[A-Za-z]{3}|\d{1,2})[-\/\s]\d{2,4})/i);

    const totalDue = parseAmount(totalMatch?.[1]);
    if (!totalDue) return null;
    const minDue = parseAmount(minMatch?.[1]) || Math.round(totalDue * 0.05);
    const dueDateIso = dueMatch ? parseIndianDate(dueMatch[1]) : new Date(Date.now() + 5 * 86400000).toISOString();
    const matchedWallet = wallets.find(w => w.type === 'credit_card' && last4 && w.last4Digits === last4)
      || wallets.find(w => w.type === 'credit_card')
      || null;

    return {
      kind: 'credit_card_bill',
      sourceHash,
      cardName: matchedWallet?.name || `${bankName} Credit Card`,
      walletId: matchedWallet?.id || null,
      last4Digits: last4 || matchedWallet?.last4Digits || '0000',
      totalDue,
      minDue,
      dueDate: toDateInputValue(dueDateIso),
      statementMonth: new Date(dueDateIso).toISOString().slice(0, 7),
      rawSourceSnippet: text.slice(0, 200)
    };
  }

  // 2. Bank Debit/Credit, UPI Notification, or Credit Card Swipe
  const amtMatch = text.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i)
    || text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:inr|rs\.?)/i);
  const amount = parseAmount(amtMatch?.[1]);
  if (!amount) return null;

  const isCredit = /(?:credited|received|deposited|refund|cashback)/i.test(text) && !/(?:debited|paid|spent|withdrawn)/i.test(text);
  const type = isCredit ? 'income' : 'expense';

  const merchantMatch =
    text.match(/(?:to\s+vpa|to|at|towards|paid\s+to)\s+([A-Za-z0-9@._&\-\s]{2,42}?)(?:\s+(?:on|via|ref|upi|using|from|\(|$|\.))/i)
    || text.match(/info:\s*([A-Za-z0-9@._&\-\s]{2,42})/i);
  const merchant = (merchantMatch?.[1] || `${bankName} ${isCredit ? 'Credit' : 'Debit'}`).trim();

  const dateMatch = text.match(/\bon\s+(\d{1,2}[-\/\s](?:[A-Za-z]{3}|\d{1,2})[-\/\s]\d{2,4})/i);
  const dateIso = dateMatch ? parseIndianDate(dateMatch[1]) : (timestamp ? new Date(timestamp).toISOString() : nowIso());

  const isUpi = /gpay|google\s*pay|phonepe|paytm|bhim|upi|vpa/i.test(`${sender} ${text}`);
  const isCardSwipe = /credit\s*card|card\s*(?:xx|\*\*|ending)/i.test(text);

  let matchedWallet = wallets.find(w => last4 && w.last4Digits === last4);
  if (!matchedWallet && isCardSwipe) matchedWallet = wallets.find(w => w.type === 'credit_card');
  if (!matchedWallet && isUpi) matchedWallet = wallets.find(w => w.type === 'upi');
  if (!matchedWallet) matchedWallet = wallets.find(w => w.type === 'bank') || wallets[0];

  const ruleHit = matchCategorizationRule(`${merchant} ${text}`, rules);
  const fallbackCat = categories.find(c => c.type === type) || categories[0];
  const selfCheck = detectSelfTransfer({
    type,
    merchant,
    note: text,
    walletId: matchedWallet?.id,
    amount,
    date: dateIso
  }, wallets, existingTxs);

  return {
    kind: 'transaction',
    sourceHash,
    type: selfCheck.isSelfTransfer ? 'transfer' : type,
    amount,
    currency: 'INR',
    date: dateIso,
    walletId: matchedWallet?.id || '',
    categoryId: ruleHit?.categoryId || fallbackCat?.id || '',
    merchant,
    note: text.slice(0, 180),
    tags: ruleHit?.tags ? [...ruleHit.tags] : ['#auto-parsed'],
    source: isUpi ? 'upi_notif' : source,
    isSelfTransfer: selfCheck.isSelfTransfer,
    selfTransferReason: selfCheck.reason,
    matchedRulePattern: ruleHit?.pattern || null
  };
}

// Pluggable RBI Account Aggregator (AA) Adapter Interface + Offline ReBIT JSON / Bank CSV Importer
export class AccountAggregatorAdapter {
  constructor({ fiuName = 'Offline ReBIT AA Importer' } = {}) {
    this.fiuName = fiuName;
  }

  async parseRebitJson(jsonText, context) {
    const parsed = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
    const rawTxs =
      parsed?.Account?.Transactions?.Transaction
      || parsed?.Transactions?.Transaction
      || parsed?.transactions
      || (Array.isArray(parsed) ? parsed : []);

    const results = [];
    for (const row of rawTxs) {
      const amount = parseAmount(row.amount ?? row.Amount ?? row.debit ?? row.credit);
      if (!amount) continue;
      const rawType = String(row.type || row.Type || (row.credit ? 'CREDIT' : 'DEBIT')).toUpperCase();
      const type = rawType.includes('CREDIT') || rawType === 'CR' ? 'income' : 'expense';
      const merchant = String(row.narration || row.Narration || row.merchant || row.description || 'AA Bank Entry').trim();
      const dateIso = parseIndianDate(row.transactionTimestamp || row.valueDate || row.date || nowIso());
      const sourceHash = await sha256Hex(`aa|${row.txnId || ''}|${amount}|${dateIso.slice(0, 10)}|${merchant.toLowerCase()}`);

      const wallet = context.wallets.find(w => w.type === 'bank') || context.wallets[0];
      const ruleHit = matchCategorizationRule(merchant, context.rules);
      const fallbackCat = context.categories.find(c => c.type === type) || context.categories[0];
      const selfCheck = detectSelfTransfer({ type, merchant, note: merchant, walletId: wallet?.id, amount, date: dateIso }, context.wallets, context.existingTxs);

      results.push({
        kind: 'transaction',
        sourceHash,
        type: selfCheck.isSelfTransfer ? 'transfer' : type,
        amount,
        currency: 'INR',
        date: dateIso,
        walletId: wallet?.id || '',
        categoryId: ruleHit?.categoryId || fallbackCat?.id || '',
        merchant: merchant.slice(0, 64),
        note: `AA Import: ${merchant.slice(0, 140)}`,
        tags: [...(ruleHit?.tags || []), '#aa-import'],
        source: 'aa_import',
        isSelfTransfer: selfCheck.isSelfTransfer,
        selfTransferReason: selfCheck.reason
      });
    }
    return results;
  }

  async parseBankCsv(csvText, context) {
    const lines = String(csvText || '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
    const idxDate = headers.findIndex(h => /date/.test(h));
    const idxDesc = headers.findIndex(h => /narration|desc|particular|merchant|remark/.test(h));
    const idxDebit = headers.findIndex(h => /debit|withdrawal|dr/.test(h));
    const idxCredit = headers.findIndex(h => /credit|deposit|cr/.test(h));
    const idxAmt = headers.findIndex(h => /^amount$/.test(h));

    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(c => c.replace(/^"|"$/g, '').trim()) || lines[i].split(',');
      const debit = idxDebit >= 0 ? parseAmount(cols[idxDebit]) : null;
      const credit = idxCredit >= 0 ? parseAmount(cols[idxCredit]) : null;
      const genericAmt = idxAmt >= 0 ? parseAmount(cols[idxAmt]) : null;
      const amount = debit || credit || genericAmt;
      if (!amount) continue;

      const type = credit && !debit ? 'income' : 'expense';
      const merchant = (idxDesc >= 0 ? cols[idxDesc] : 'Bank CSV Entry') || 'Bank CSV Entry';
      const dateIso = idxDate >= 0 ? parseIndianDate(cols[idxDate]) : nowIso();
      const sourceHash = await sha256Hex(`csv|${amount}|${dateIso.slice(0, 10)}|${merchant.toLowerCase()}`);

      const wallet = context.wallets.find(w => w.type === 'bank') || context.wallets[0];
      const ruleHit = matchCategorizationRule(merchant, context.rules);
      const fallbackCat = context.categories.find(c => c.type === type) || context.categories[0];
      const selfCheck = detectSelfTransfer({ type, merchant, note: merchant, walletId: wallet?.id, amount, date: dateIso }, context.wallets, context.existingTxs);

      results.push({
        kind: 'transaction',
        sourceHash,
        type: selfCheck.isSelfTransfer ? 'transfer' : type,
        amount,
        currency: 'INR',
        date: dateIso,
        walletId: wallet?.id || '',
        categoryId: ruleHit?.categoryId || fallbackCat?.id || '',
        merchant: merchant.slice(0, 64),
        note: `CSV Import: ${merchant.slice(0, 140)}`,
        tags: [...(ruleHit?.tags || []), '#csv-import'],
        source: 'aa_import',
        isSelfTransfer: selfCheck.isSelfTransfer,
        selfTransferReason: selfCheck.reason
      });
    }
    return results;
  }
}

export const SAMPLE_SMS_LIBRARY = {
  hdfcDebit: 'HDFC Bank: Rs. 640.00 debited from a/c **9042 on 22-Nov-26 to VPA swiggy@axisbank (UPI Ref 63261904412).',
  gpayUpi: 'Google Pay: You paid ₹320.00 to Sharma Local Kirana Store via HDFC Bank ••9042.',
  ccBill: 'HDFC Bank Credit Card xx4821 statement generated. Total Amount Due Rs 18,450.00, Min Due Rs 925.00, Due Date 25-Nov-2026. Pay on time to avoid late fees.',
  selfTransfer: 'HDFC Alert: Rs. 12,000.00 transferred from HDFC Savings **9042 towards HDFC Credit Card xx4821 bill payment.'
};
