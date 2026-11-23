// Real-Time 75%/100% Category Cap Alerts, Credit Card Bill Reminders & Recurring Detector
import { getPeriodBounds, getPeriodKey, formatMoney } from './format.js';
import { expandCategoryAllocations } from './rules.js';
import { putRecord } from './db.js';

export async function sendLocalNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, {
            body,
            icon: './assets/icons/icon-192.png',
            badge: './assets/icons/icon-192.png',
            tag: 'cashewflow-reminder',
            renotify: true
          });
          return true;
        }
      }
      new Notification(title, { body, icon: './assets/icons/icon-192.png' });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export function computeBudgetSpend(budget, transactions = [], refDate = new Date()) {
  const { start, end } = getPeriodBounds(budget.period || 'monthly', refDate);
  const catSet = new Set(budget.categoryIds || []);
  let spent = 0;

  for (const tx of transactions) {
    if (tx.deletedAt || tx.isSelfTransfer || tx.type !== 'expense') continue;
    const dt = new Date(tx.date);
    if (dt < start || dt > end) continue;
    const allocs = expandCategoryAllocations(tx);
    for (const a of allocs) {
      if (catSet.size === 0 || catSet.has(a.categoryId)) {
        spent += a.amount;
      }
    }
  }
  return spent;
}

// Evaluate all budgets after a transaction change and fire deduplicated 75% / 100% alerts
export async function evaluateBudgetAlerts(budgets, transactions, settings, notifyToast) {
  const alerts = [];
  const now = new Date();

  for (const b of budgets) {
    if (b.deletedAt || !b.amount || b.amount <= 0) continue;
    const periodKey = getPeriodKey(b.period || 'monthly', now);
    const spent = computeBudgetSpend(b, transactions, now);
    const pct = Math.round((spent / b.amount) * 100);

    let updated = null;
    if (pct >= 100 && b.alert100SentPeriod !== periodKey) {
      const msg = `${b.name} hit ${pct}% (${formatMoney(spent, settings)} / ${formatMoney(b.amount, settings)})!`;
      alerts.push({ level: 'danger', budgetId: b.id, pct, message: msg });
      sendLocalNotification('Budget Limit Reached (100%)', msg);
      if (notifyToast) notifyToast(`⚠️ 100% Cap: ${msg}`);
      updated = { ...b, alert100SentPeriod: periodKey, alert75SentPeriod: periodKey };
    } else if (pct >= 75 && pct < 100 && b.alert75SentPeriod !== periodKey) {
      const msg = `${b.name} reached ${pct}% (${formatMoney(spent, settings)} / ${formatMoney(b.amount, settings)}).`;
      alerts.push({ level: 'warning', budgetId: b.id, pct, message: msg });
      sendLocalNotification('Budget Alert (75%)', msg);
      if (notifyToast) notifyToast(`🔔 75% Cap: ${msg}`);
      updated = { ...b, alert75SentPeriod: periodKey };
    }

    if (updated) {
      await putRecord('budgets', updated);
    }
  }
  return alerts;
}

// Evaluate Credit Card Bills for 5d, 2d, due-day, and overdue reminders
export function getActiveCreditCardReminders(ccBills = []) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reminders = [];

  for (const bill of ccBills) {
    if (bill.deletedAt || bill.status === 'paid') continue;
    const due = new Date(`${bill.dueDate}T00:00:00`);
    if (Number.isNaN(due.getTime())) continue;
    const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000);

    let stage = null;
    if (daysLeft < 0) stage = 'overdue';
    else if (daysLeft === 0) stage = 'due_today';
    else if (daysLeft <= 2) stage = 'due_2d';
    else if (daysLeft <= 5) stage = 'due_5d';
    else if (daysLeft <= 10) stage = 'upcoming';

    if (stage) {
      reminders.push({
        bill,
        daysLeft,
        stage,
        urgent: daysLeft <= 5
      });
    }
  }
  return reminders.sort((a, b) => a.daysLeft - b.daysLeft);
}

// Detect recurring expenses (~25-33 days apart with similar merchant & amount)
export function detectRecurringCandidates(transactions = [], existingRecurring = []) {
  const existingTitles = new Set(existingRecurring.map(r => r.title.toLowerCase()));
  const byMerchant = new Map();

  for (const tx of transactions) {
    if (tx.deletedAt || tx.isSelfTransfer || tx.type !== 'expense' || !tx.merchant) continue;
    const key = tx.merchant.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    if (!key) continue;
    if (!byMerchant.has(key)) byMerchant.set(key, []);
    byMerchant.get(key).push(tx);
  }

  const candidates = [];
  for (const [, list] of byMerchant.entries()) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => new Date(b.date) - new Date(a.date));
    const latest = sorted[0];
    const prev = sorted[1];
    const diffDays = Math.abs((new Date(latest.date) - new Date(prev.date)) / 86400000);
    const amtRatio = Math.abs(latest.amount - prev.amount) / Math.max(latest.amount, 1);

    if (diffDays >= 25 && diffDays <= 34 && amtRatio <= 0.15 && !existingTitles.has(latest.merchant.toLowerCase())) {
      const nextDue = new Date(latest.date);
      nextDue.setMonth(nextDue.getMonth() + 1);
      candidates.push({
        title: latest.merchant,
        amount: latest.amount,
        walletId: latest.walletId,
        categoryId: latest.categoryId,
        nextDueDate: nextDue.toISOString().slice(0, 10),
        kind: /emi|loan/i.test(latest.merchant) ? 'emi' : (/netflix|spotify|prime|hotstar|jio|airtel/i.test(latest.merchant) ? 'subscription' : 'bill')
      });
    }
  }
  return candidates;
}

// Safe-to-Spend Daily Allowance Calculation
export function computeSafeToSpend({ transactions = [], recurring = [], ccBills = [], settings = {} }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const remainingDays = Math.max(1, daysInMonth - now.getDate() + 1);

  const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

  let loggedIncome = 0;
  let monthSpend = 0;
  for (const tx of transactions) {
    if (tx.deletedAt || tx.isSelfTransfer) continue;
    const dt = new Date(tx.date);
    if (dt < monthStart || dt > monthEnd) continue;
    if (tx.type === 'income') loggedIncome += Number(tx.amount) || 0;
    if (tx.type === 'expense') monthSpend += Number(tx.amount) || 0;
  }

  const monthlyIncome = Math.max(loggedIncome, Number(settings.monthlyIncomeEstimate) || 0);
  const savingsTarget = Number(settings.monthlySavingsTarget) || 0;

  let upcomingFixed = 0;
  for (const r of recurring) {
    if (r.deletedAt || !r.isActive || r.type !== 'expense') continue;
    const due = new Date(`${r.nextDueDate}T00:00:00`);
    if (due >= now && due <= monthEnd) {
      upcomingFixed += Number(r.amount) || 0;
    }
  }
  for (const b of ccBills) {
    if (b.deletedAt || b.status === 'paid') continue;
    const due = new Date(`${b.dueDate}T00:00:00`);
    if (due >= now && due <= monthEnd) {
      upcomingFixed += Number(b.totalDue) || 0;
    }
  }

  const remainingPool = monthlyIncome - upcomingFixed - savingsTarget - monthSpend;
  const dailyAllowance = Math.max(0, Math.floor(remainingPool / remainingDays));

  return {
    monthlyIncome,
    upcomingFixed,
    savingsTarget,
    monthSpend,
    remainingPool,
    remainingDays,
    dailyAllowance,
    status: monthlyIncome <= 0 ? 'Not Set' : (remainingPool <= 0 ? 'Over Pace' : (dailyAllowance < 500 ? 'Tight' : 'On Track'))
  };
}

// ============================================================
// SCHEDULED EXPENSE UPDATE REMINDER (Daily / Weekly / Yearly)
// ============================================================
function hasLoggedToday(transactions = [], now = new Date()) {
  const todayStr = now.toDateString();
  return transactions.some(tx => !tx.deletedAt && new Date(tx.date).toDateString() === todayStr);
}

export function getExpenseReminderDueInfo(settings = {}, transactions = [], now = new Date()) {
  if (!settings.reminderEnabled) return { due: false };
  const freq = settings.reminderFrequency || 'daily'; // daily | weekly | yearly
  const timeStr = settings.reminderTime || '21:00';
  const [hh, mm] = timeStr.split(':').map(n => parseInt(n, 10) || 0);

  const scheduledToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  if (now < scheduledToday) return { due: false };

  if (freq === 'weekly') {
    const targetDow = Number(settings.reminderDayOfWeek ?? 0); // 0=Sun..6=Sat
    if (now.getDay() !== targetDow) return { due: false };
  } else if (freq === 'yearly') {
    const targetMonth = Number(settings.reminderMonth ?? 1); // 1..12
    const targetDay = Number(settings.reminderDay ?? 1);
    if ((now.getMonth() + 1) !== targetMonth || now.getDate() !== targetDay) return { due: false };
  }

  if (settings.reminderSkipIfLoggedToday && hasLoggedToday(transactions, now)) {
    return { due: false, skippedLoggedToday: true };
  }

  const occurrenceKey = `${freq}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const message = (settings.reminderMessage || "Please update today's expenses!").trim();

  return {
    due: true,
    occurrenceKey,
    alreadySent: settings.lastReminderSentKey === occurrenceKey,
    dismissed: settings.lastReminderDismissedKey === occurrenceKey,
    message,
    timeStr,
    freq
  };
}

export async function checkAndFireExpenseReminder(settings, transactions, notifyToast) {
  const info = getExpenseReminderDueInfo(settings, transactions);
  if (!info.due || info.alreadySent) return false;

  await sendLocalNotification('CashewFlow Reminder', info.message);
  if (notifyToast) notifyToast(`🔔 ${info.message}`);
  await putRecord('settings', {
    ...settings,
    lastReminderSentKey: info.occurrenceKey,
    updatedAt: new Date().toISOString()
  });
  return true;
}

// Generate an RFC-5545 .ics recurring calendar alarm for reliable OS-level reminders even when browser is closed
export function buildReminderIcs(settings = {}) {
  const freq = (settings.reminderFrequency || 'daily').toUpperCase();
  const timeStr = settings.reminderTime || '21:00';
  const [hh, mm] = timeStr.split(':').map(n => parseInt(n, 10) || 0);
  const message = (settings.reminderMessage || "Please update today's expenses!").replace(/\r?\n/g, ' ');

  const now = new Date();
  let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
  if (freq === 'WEEKLY') {
    const targetDow = Number(settings.reminderDayOfWeek ?? 0);
    const diff = (targetDow - start.getDay() + 7) % 7;
    start.setDate(start.getDate() + diff);
  } else if (freq === 'YEARLY') {
    const targetMonth = Number(settings.reminderMonth ?? 1) - 1;
    const targetDay = Number(settings.reminderDay ?? 1);
    start = new Date(now.getFullYear(), targetMonth, targetDay, hh, mm, 0);
    if (start < now) start.setFullYear(start.getFullYear() + 1);
  }

  const pad = n => String(n).padStart(2, '0');
  const dtLocal = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}T${pad(hh)}${pad(mm)}00`;
  const endDate = new Date(start.getTime() + 15 * 60000);
  const dtEnd = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}T${pad(endDate.getHours())}${pad(endDate.getMinutes())}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const dayCodes = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  let rrule = `FREQ=${freq}`;
  if (freq === 'WEEKLY') rrule += `;BYDAY=${dayCodes[Number(settings.reminderDayOfWeek ?? 0)]}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CashewFlow//Expense Reminder//EN',
    'BEGIN:VEVENT',
    `UID:cashewflow-expense-reminder@offline`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtLocal}`,
    `DTEND:${dtEnd}`,
    `RRULE:${rrule}`,
    `SUMMARY:CashewFlow: ${message}`,
    `DESCRIPTION:${message} Open CashewFlow to log your expenses.`,
    'BEGIN:VALARM',
    'TRIGGER:PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${message}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}
