// Formatting, Currency, Date & Safe Arithmetic Helpers

export const CURRENCIES = {
  INR: { code: 'INR', symbol: '₹', locale: 'en-IN', name: 'Indian Rupee' },
  USD: { code: 'USD', symbol: '$', locale: 'en-US', name: 'US Dollar' },
  EUR: { code: 'EUR', symbol: '€', locale: 'de-DE', name: 'Euro' },
  GBP: { code: 'GBP', symbol: '£', locale: 'en-GB', name: 'British Pound' },
  AED: { code: 'AED', symbol: 'د.إ', locale: 'en-AE', name: 'UAE Dirham' },
  SGD: { code: 'SGD', symbol: 'S$', locale: 'en-SG', name: 'Singapore Dollar' }
};

export function formatMoney(amount, settings = {}, { showSign = false, currencyOverride = null } = {}) {
  const code = currencyOverride || settings.defaultCurrency || 'INR';
  const cfg = CURRENCIES[code] || CURRENCIES.INR;
  if (settings.hideAmounts) {
    return `${cfg.symbol} •••••`;
  }
  const num = Number(amount) || 0;
  const abs = Math.abs(num);
  const locale = settings.numberFormat || cfg.locale || 'en-IN';
  const hasDecimals = Math.round(abs * 100) % 100 !== 0;
  const formatted = abs.toLocaleString(locale, {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2
  });
  const sign = num < 0 ? '−' : (showSign && num > 0 ? '+' : '');
  return `${sign}${cfg.symbol}${formatted}`;
}

export function escHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

export function uuid() {
  if (crypto && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function toDateInputValue(dateLike = new Date()) {
  const d = new Date(dateLike);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatShortDate(isoOrDate) {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return String(isoOrDate || '');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay) {
    return `Today, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

export function getPeriodBounds(period, anchorDate = new Date(), customStart = null, customEnd = null) {
  const ref = new Date(anchorDate);
  let start, end, label;

  if (period === 'daily') {
    start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 0, 0, 0, 0);
    end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999);
    label = ref.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  } else if (period === 'weekly') {
    const day = ref.getDay();
    const diffToMon = (day === 0 ? -6 : 1 - day);
    start = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + diffToMon, 0, 0, 0, 0);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
    label = `${start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`;
  } else if (period === 'custom' && customStart && customEnd) {
    start = new Date(`${customStart}T00:00:00`);
    end = new Date(`${customEnd}T23:59:59.999`);
    label = `${customStart} to ${customEnd}`;
  } else {
    start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
    label = ref.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  return { start, end, label };
}

export function getPeriodKey(period, date = new Date()) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  if (period === 'daily') return `${y}-${m}-${day}`;
  if (period === 'weekly') {
    const { start } = getPeriodBounds('weekly', d);
    return `W-${toDateInputValue(start)}`;
  }
  return `${y}-${m}`;
}

// CSP-safe arithmetic evaluator (no eval / new Function)
export function evalSafeArithmetic(expr) {
  const cleaned = String(expr || '').replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  const tokens = cleaned.match(/\d+(?:\.\d+)?|[+\-*/]/g);
  if (!tokens || !tokens.length) return 0;
  const values = [parseFloat(tokens[0]) || 0];
  const ops = [];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const nextVal = parseFloat(tokens[i + 1]);
    if (Number.isNaN(nextVal)) break;
    if (op === '*' || op === '/') {
      const prev = values.pop();
      values.push(op === '*' ? prev * nextVal : (nextVal === 0 ? 0 : prev / nextVal));
    } else {
      ops.push(op);
      values.push(nextVal);
    }
  }
  let total = values[0];
  for (let i = 0; i < ops.length; i++) {
    total = ops[i] === '+' ? total + values[i + 1] : total - values[i + 1];
  }
  return Math.max(0, Math.round(total * 100) / 100);
}
