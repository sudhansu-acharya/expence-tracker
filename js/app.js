// CashewFlow — Main Application Bootstrap, Router, Modals, Event Delegation & Native Bridge
import { iconSvg, CATEGORY_ICON_KEYS } from './icons.js';
import {
  formatMoney, escHtml, toDateInputValue, nowIso, evalSafeArithmetic
} from './format.js';
import {
  hasVaultSetup, createVault, loginWithPassword, loginWithPin,
  recoverVaultWithKey, lockSession, registerAutoLockHandler,
  setQuickPin, setAutoLockMinutes, enableBiometric, checkBiometricPresence
} from './auth.js';
import {
  getAuthMeta, loadAllVaultData, putRecord, softDeleteRecord, hasSessionKey
} from './db.js';
import { matchCategorizationRule, detectSelfTransfer } from './rules.js';
import {
  parseMessageOnDevice, AccountAggregatorAdapter, SAMPLE_SMS_LIBRARY
} from './parser.js';
import {
  evaluateBudgetAlerts, detectRecurringCandidates, requestNotificationPermission
} from './reminders.js';
import {
  exportEncryptedSnapshot, importEncryptedSnapshot, triggerFileDownload,
  buildTransactionsCsv, syncWithGoogleDrive
} from './sync.js';

import { renderDashboardView, hydrateDashboardCharts } from './views/dashboard.js';
import { renderTransactionsView } from './views/transactions.js';
import { renderBudgetsView } from './views/budgets.js';
import { renderCaptureView } from './views/capture.js';
import { renderSettingsView } from './views/settings.js';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', short: 'Home', sub: 'Safe-to-Spend • Graphical Overview', icon: 'home' },
  { key: 'transactions', label: 'Transactions', short: 'Activity', sub: 'Search, Splits, #Tags & Self-Transfers', icon: 'list' },
  { key: 'budgets', label: 'Budgets & Bills', short: 'Budgets', sub: '75%/100% Caps • Goals • CC & EMI Reminders', icon: 'target' },
  { key: 'capture', label: 'Smart Capture', short: 'Capture', sub: 'On-Device SMS/UPI Parser • Rules • AA & Wallets', icon: 'sparkles' },
  { key: 'settings', label: 'Settings & Sync', short: 'Settings', sub: 'Security • Encrypted Sync • Backups', icon: 'settings' }
];

const appState = {
  screen: 'dashboard',
  authTab: 'password', // password | pin | recover
  pendingRecoveryKey: null,
  pinBuffer: '',
  dashPeriod: 'monthly',
  dashAnchor: new Date(),
  customStart: toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  customEnd: toDateInputValue(new Date()),
  showSafeFormula: false,
  txSearch: '',
  txTypeFilter: 'all',
  txCategoryFilter: '',
  txWalletFilter: '',
  txTagFilter: '',
  smsDraft: '',
  parseQueue: [],
  deferredInstallPrompt: null,
  modalState: null
};

let vaultData = null;
let authMeta = null;
let toastTimer = null;

function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
}

function applyTheme(settings) {
  const mode = settings?.themeMode || 'system';
  const resolved = mode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : mode;
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-accent', settings?.accentColor || 'emerald');
}

async function refreshVaultData() {
  const raw = await loadAllVaultData();
  const settingsObj = raw.settings.find(s => s.id === 'app_settings') || raw.settings[0] || {
    id: 'app_settings', defaultCurrency: 'INR', numberFormat: 'en-IN', themeMode: 'system', accentColor: 'emerald', hideAmounts: false
  };
  vaultData = {
    wallets: raw.wallets,
    categories: raw.categories,
    transactions: raw.transactions,
    budgets: raw.budgets,
    goals: raw.goals,
    recurring: raw.recurring,
    credit_card_bills: raw.credit_card_bills,
    categorization_rules: raw.categorization_rules,
    settings: settingsObj
  };
  authMeta = await getAuthMeta();
  applyTheme(vaultData.settings);
}

/* ============================================================
   AUTH GATE RENDERING
   ============================================================ */
async function renderAuthGate(errorMsg = '') {
  const overlay = document.getElementById('authOverlay');
  const shell = document.getElementById('appShell');
  overlay.classList.remove('hidden');
  shell.classList.add('hidden');

  if (appState.pendingRecoveryKey) {
    overlay.innerHTML = `
      <div class="auth-card" style="text-align:center">
        <div class="auth-logo">${iconSvg('shield')}</div>
        <h2 style="font-size:20px;font-weight:800">Save Your Recovery Key</h2>
        <p class="muted" style="margin-top:6px;line-height:1.5">This offline vault is encrypted with <strong>AES-256-GCM</strong>. Store this key safely — it is the only way to reset a forgotten password.</p>
        <div class="recovery-box" id="recoveryKeyDisplay">${escHtml(appState.pendingRecoveryKey)}</div>
        <div style="display:flex;gap:8px;margin-bottom:10px">
          <button class="btn-soft" style="flex:1" data-action="copy-recovery">Copy Key</button>
          <button class="btn-soft" style="flex:1" data-action="download-recovery">Download .txt</button>
        </div>
        <button class="btn-primary" style="width:100%" data-action="finish-setup">I Saved It — Enter Vault</button>
      </div>`;
    return;
  }

  const setupExists = await hasVaultSetup();
  authMeta = await getAuthMeta();

  if (!setupExists) {
    overlay.innerHTML = `
      <div class="auth-card">
        <div class="auth-logo">${iconSvg('wallet')}</div>
        <h2 style="font-size:21px;font-weight:800;text-align:center">Create Offline Vault</h2>
        <p class="muted" style="text-align:center;margin:4px 0 16px">100% Free • Offline Encrypted • Zero Unauthorized Access</p>
        ${errorMsg ? `<div class="chip chip-red" style="width:100%;justify-content:center;margin-bottom:10px;padding:8px">${escHtml(errorMsg)}</div>` : ''}
        <form id="setupVaultForm" class="stack" style="gap:10px">
          <div>
            <label class="field-label">Local Username</label>
            <input class="input" id="setupUsername" required minlength="2" placeholder="e.g. sudhansu" autocomplete="username" />
          </div>
          <div>
            <label class="field-label">Master Password (min 6 chars)</label>
            <input class="input" type="password" id="setupPassword" required minlength="6" placeholder="Strong local password" autocomplete="new-password" />
          </div>
          <div>
            <label class="field-label">Optional Quick PIN (4–6 digits)</label>
            <input class="input" type="password" id="setupPin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" placeholder="Optional quick unlock PIN" />
          </div>
          <button class="btn-primary" type="submit" style="width:100%;margin-top:4px">Create Encrypted Vault</button>
        </form>
        <p class="muted" style="text-align:center;margin-top:12px;font-size:11px">PBKDF2-SHA256 (210k iterations) + AES-256-GCM • Stays on your device</p>
      </div>`;
    return;
  }

  const hasPin = Boolean(authMeta?.pinBundle);
  const hasBio = Boolean(authMeta?.webAuthnCredId);
  overlay.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">${iconSvg('lock')}</div>
      <h2 style="font-size:21px;font-weight:800;text-align:center">Unlock CashewFlow</h2>
      <p class="muted" style="text-align:center;margin:4px 0 14px">Encrypted Offline Vault • ${escHtml(authMeta?.username || '')}</p>
      ${errorMsg ? `<div class="chip chip-red" style="width:100%;justify-content:center;margin-bottom:10px;padding:8px">${escHtml(errorMsg)}</div>` : ''}

      <div class="segmented ${hasPin ? '' : 'cols-2'}" style="margin-bottom:14px">
        <button class="seg-btn ${appState.authTab === 'password' ? 'active' : ''}" data-action="auth-tab" data-tab="password">Password</button>
        ${hasPin ? `<button class="seg-btn ${appState.authTab === 'pin' ? 'active' : ''}" data-action="auth-tab" data-tab="pin">Quick PIN</button>` : ''}
        <button class="seg-btn ${appState.authTab === 'recover' ? 'active' : ''}" data-action="auth-tab" data-tab="recover">Recover</button>
      </div>

      ${appState.authTab === 'password' ? `
        <form id="loginPasswordForm" class="stack" style="gap:10px">
          <input class="input" id="loginUsername" value="${escHtml(authMeta?.username || '')}" placeholder="Username" required autocomplete="username" />
          <input class="input" type="password" id="loginPassword" placeholder="Master Password" required autocomplete="current-password" />
          <button class="btn-primary" type="submit" style="width:100%">Unlock Vault</button>
        </form>` : ''}

      ${appState.authTab === 'pin' && hasPin ? `
        <div style="text-align:center">
          <div class="pin-dots">
            ${[0,1,2,3,4,5].map(i => `<span class="pin-dot ${i < appState.pinBuffer.length ? 'filled' : ''}"></span>`).join('')}
          </div>
          <div class="pin-pad">
            ${['1','2','3','4','5','6','7','8','9','C','0','OK'].map(k => `<button class="pin-key" data-action="pin-key" data-key="${k}">${k}</button>`).join('')}
          </div>
        </div>` : ''}

      ${appState.authTab === 'recover' ? `
        <form id="recoverVaultForm" class="stack" style="gap:10px">
          <input class="input" id="recoverKeyInput" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" required />
          <input class="input" type="password" id="recoverNewPassword" placeholder="New Master Password (min 6 chars)" minlength="6" required />
          <button class="btn-primary" type="submit" style="width:100%">Reset Password &amp; Unlock</button>
        </form>` : ''}

      ${hasBio ? `<button class="btn-soft" style="width:100%;margin-top:10px" data-action="bio-check">${iconSvg('fingerprint')} Verify Biometric Presence</button>` : ''}
    </div>`;
}

/* ============================================================
   AUTHENTICATED SHELL & VIEW RENDERING
   ============================================================ */
function renderNavigationChrome() {
  const rail = document.getElementById('desktopRail');
  const mobileNav = document.getElementById('mobileNav');
  const navMeta = NAV_ITEMS.find(n => n.key === appState.screen) || NAV_ITEMS[0];

  document.getElementById('pageTitle').textContent = navMeta.label;
  document.getElementById('pageSub').textContent = navMeta.sub;
  document.getElementById('hdrHideBtn').innerHTML = vaultData.settings.hideAmounts ? iconSvg('eyeOff') : iconSvg('eye');
  document.getElementById('hdrHideBtn').classList.toggle('active', Boolean(vaultData.settings.hideAmounts));
  document.getElementById('hdrLockBtn').innerHTML = iconSvg('lock');
  document.getElementById('fabIcon').innerHTML = iconSvg('plus');

  rail.innerHTML = `
    <div class="rail-logo">
      <div class="rail-logo-mark">${iconSvg('wallet')}</div>
      <span>CashewFlow</span>
    </div>
    ${NAV_ITEMS.map(n => `
      <button class="rail-item ${appState.screen === n.key ? 'active' : ''}" data-action="nav" data-nav="${n.key}">
        ${iconSvg(n.icon)}<span>${n.label}</span>
      </button>`).join('')}
    <div class="rail-spacer"></div>
    <div class="rail-footer">
      <div class="chip chip-green" style="justify-content:center">Offline Encrypted • Free</div>
      <button class="rail-item" data-action="lock-vault">${iconSvg('lock')}<span>Lock Vault</span></button>
    </div>`;

  mobileNav.innerHTML = NAV_ITEMS.map(n => `
    <button class="bnav-btn ${appState.screen === n.key ? 'active' : ''}" data-action="nav" data-nav="${n.key}">
      <span class="bnav-pill">${iconSvg(n.icon)}</span>
      <span>${n.short}</span>
    </button>`).join('');
}

function renderApp() {
  if (!hasSessionKey() || !vaultData) {
    renderAuthGate();
    return;
  }
  document.getElementById('authOverlay').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  renderNavigationChrome();

  const ctx = { state: appState, data: vaultData, authMeta };
  const container = document.getElementById('viewContainer');

  if (appState.screen === 'dashboard') {
    container.innerHTML = renderDashboardView(ctx);
    requestAnimationFrame(() => hydrateDashboardCharts(ctx));
  } else if (appState.screen === 'transactions') {
    container.innerHTML = renderTransactionsView(ctx);
  } else if (appState.screen === 'budgets') {
    container.innerHTML = renderBudgetsView(ctx);
  } else if (appState.screen === 'capture') {
    container.innerHTML = renderCaptureView(ctx);
  } else if (appState.screen === 'settings') {
    container.innerHTML = renderSettingsView(ctx);
  }
}

/* ============================================================
   MODALS (TRANSACTION + CALCULATOR + SPLIT, BUDGET, GOAL, ETC.)
   ============================================================ */
function closeModal() {
  appState.modalState = null;
  const backdrop = document.getElementById('modalBackdrop');
  backdrop.classList.add('hidden');
  backdrop.innerHTML = '';
}

function openTransactionModal(existingTx = null) {
  const defaultWallet = vaultData.wallets[0]?.id || '';
  const defaultCat = vaultData.categories.find(c => c.type === 'expense')?.id || vaultData.categories[0]?.id || '';
  appState.modalState = {
    kind: 'tx',
    id: existingTx?.id || null,
    type: existingTx?.type || 'expense',
    calcBuffer: existingTx ? String(existingTx.amount) : '0',
    walletId: existingTx?.walletId || defaultWallet,
    toWalletId: existingTx?.toWalletId || (vaultData.wallets[1]?.id || defaultWallet),
    categoryId: existingTx?.categoryId || defaultCat,
    merchant: existingTx?.merchant || '',
    note: existingTx?.note || '',
    date: existingTx ? toDateInputValue(existingTx.date) : toDateInputValue(new Date()),
    tags: (existingTx?.tags || []).join(', '),
    isSplit: Boolean(existingTx?.splits?.length),
    splits: existingTx?.splits?.length
      ? existingTx.splits.map(s => ({ ...s }))
      : [
          { categoryId: defaultCat, amount: 0 },
          { categoryId: vaultData.categories[1]?.id || defaultCat, amount: 0 }
        ],
    autoRuleText: ''
  };
  renderTransactionModal();
}

function renderTransactionModal() {
  const m = appState.modalState;
  const backdrop = document.getElementById('modalBackdrop');
  backdrop.classList.remove('hidden');

  const amtNum = evalSafeArithmetic(m.calcBuffer);
  const splitSum = m.splits.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const splitDiff = Math.round((amtNum - splitSum) * 100) / 100;
  const cats = vaultData.categories.filter(c => m.type === 'income' ? c.type === 'income' : c.type === 'expense');

  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="card-header" style="margin-bottom:8px">
        <div class="card-title">${m.id ? 'Edit Transaction' : 'Add Transaction'}</div>
        <div style="display:flex;gap:6px">
          ${m.id ? `<button class="btn-danger" data-action="delete-tx" data-id="${escHtml(m.id)}">Delete</button>` : ''}
          <button class="btn-soft" data-action="close-modal">Close</button>
        </div>
      </div>

      <div class="segmented" style="margin-bottom:8px">
        ${['expense', 'income', 'transfer'].map(t => `<button class="seg-btn ${m.type === t ? 'active' : ''}" data-action="modal-tx-type" data-type="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
      </div>

      <div class="calc-display">
        <div class="calc-expr">${/[+\-*/]/.test(m.calcBuffer) ? escHtml(m.calcBuffer) : ''}</div>
        <div class="calc-val">${escHtml(formatMoney(amtNum, { ...vaultData.settings, hideAmounts: false }))}</div>
      </div>

      <div class="calc-grid">
        ${['7','8','9','/','4','5','6','*','1','2','3','-','C','0','=','+'].map(k =>
          `<button class="calc-key ${/[+\-*/=]/.test(k) ? 'op' : ''}" data-action="calc-key" data-key="${k}">${k === '*' ? '×' : k === '/' ? '÷' : k === '-' ? '−' : k}</button>`
        ).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
        <div>
          <label class="field-label">Merchant / Description</label>
          <input class="input" id="modalMerchant" value="${escHtml(m.merchant)}" placeholder="e.g. Swiggy, Uber, DMart" />
        </div>
        <div>
          <label class="field-label">Date</label>
          <input class="input" type="date" id="modalDate" value="${escHtml(m.date)}" />
        </div>
      </div>

      ${m.autoRuleText ? `<div class="chip chip-accent" style="margin-top:8px">${escHtml(m.autoRuleText)}</div>` : ''}

      <div style="display:grid;grid-template-columns:${m.type === 'transfer' ? '1fr 1fr' : '1fr'};gap:8px;margin-top:8px">
        <div>
          <label class="field-label">${m.type === 'transfer' ? 'From Wallet' : 'Wallet / Account'}</label>
          <select class="input" id="modalWallet">
            ${vaultData.wallets.map(w => `<option value="${escHtml(w.id)}" ${m.walletId === w.id ? 'selected' : ''}>${escHtml(w.name)}</option>`).join('')}
          </select>
        </div>
        ${m.type === 'transfer' ? `
          <div>
            <label class="field-label">To Wallet</label>
            <select class="input" id="modalToWallet">
              ${vaultData.wallets.map(w => `<option value="${escHtml(w.id)}" ${m.toWalletId === w.id ? 'selected' : ''}>${escHtml(w.name)}</option>`).join('')}
            </select>
          </div>` : ''}
      </div>

      ${m.type !== 'transfer' ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
          <span class="field-label" style="margin:0">Category</span>
          ${m.type === 'expense' ? `
            <label style="font-size:12px;font-weight:700;display:flex;align-items:center;gap:5px;cursor:pointer">
              <input type="checkbox" id="modalSplitToggle" ${m.isSplit ? 'checked' : ''} /> Split across categories
            </label>` : ''}
        </div>

        ${!m.isSplit ? `
          <div class="cat-grid">
            ${cats.map(c => `
              <button class="cat-pick ${m.categoryId === c.id ? 'active' : ''}" data-action="modal-pick-cat" data-id="${escHtml(c.id)}">
                <span style="color:${escHtml(c.color)}">${iconSvg(c.icon)}</span>
                <span>${escHtml(c.name.split(' ')[0])}</span>
              </button>`).join('')}
          </div>` : `
          <div style="background:var(--bg-card-2);padding:10px;border-radius:14px;margin-top:6px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-size:12px;font-weight:700">Split Rows</span>
              <span class="chip ${splitDiff === 0 ? 'chip-green' : 'chip-amber'}">${splitDiff === 0 ? 'Balanced ✓' : `Remaining: ${formatMoney(splitDiff, { ...vaultData.settings, hideAmounts: false })}`}</span>
            </div>
            ${m.splits.map((sp, i) => `
              <div style="display:grid;grid-template-columns:1fr 100px;gap:6px;margin-bottom:6px">
                <select class="input" data-split-cat="${i}">
                  ${cats.map(c => `<option value="${escHtml(c.id)}" ${sp.categoryId === c.id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('')}
                </select>
                <input class="input" type="number" step="0.01" data-split-amt="${i}" value="${escHtml(sp.amount)}" />
              </div>`).join('')}
            <button class="btn-soft" style="min-height:30px;padding:4px 10px;font-size:11.5px" data-action="add-split-row">+ Add Split Row</button>
          </div>`}
      ` : ''}

      <div style="margin-top:10px">
        <label class="field-label">Custom #Tags (comma-separated)</label>
        <input class="input" id="modalTags" value="${escHtml(m.tags)}" placeholder="#vacation, #reimbursable, #office" />
      </div>

      <div style="margin-top:8px">
        <label class="field-label">Note</label>
        <input class="input" id="modalNote" value="${escHtml(m.note)}" placeholder="Optional note" />
      </div>

      <button class="btn-primary" style="width:100%;margin-top:14px" data-action="save-tx">Save Encrypted Transaction</button>
    </div>`;
}

function openSimpleModal(title, bodyHtml) {
  const backdrop = document.getElementById('modalBackdrop');
  backdrop.classList.remove('hidden');
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="card-header">
        <div class="card-title">${escHtml(title)}</div>
        <button class="btn-soft" data-action="close-modal">Close</button>
      </div>
      ${bodyHtml}
    </div>`;
}

/* ============================================================
   SAVE / COMMIT HANDLERS
   ============================================================ */
async function handleSaveTransaction() {
  const m = appState.modalState;
  const amount = evalSafeArithmetic(m.calcBuffer);
  if (amount <= 0) {
    showToast('Enter an amount greater than 0');
    return;
  }

  let splits = null;
  if (m.type === 'expense' && m.isSplit) {
    splits = m.splits.filter(s => Number(s.amount) > 0).map(s => ({ categoryId: s.categoryId, amount: Number(s.amount) }));
    const sum = Math.round(splits.reduce((a, b) => a + b.amount, 0) * 100) / 100;
    if (Math.abs(sum - amount) > 0.01) {
      showToast('Split amounts must equal the total transaction amount');
      return;
    }
  }

  const tags = m.tags
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => (t.startsWith('#') ? t : '#' + t));

  const dateIso = new Date(`${m.date}T${new Date().toTimeString().slice(0, 8)}`).toISOString();
  const selfCheck = detectSelfTransfer({
    type: m.type,
    merchant: m.merchant,
    note: m.note,
    walletId: m.walletId,
    toWalletId: m.type === 'transfer' ? m.toWalletId : null,
    amount,
    date: dateIso
  }, vaultData.wallets, vaultData.transactions);

  const txRecord = {
    id: m.id || undefined,
    type: selfCheck.isSelfTransfer ? 'transfer' : m.type,
    amount,
    currency: vaultData.settings.defaultCurrency || 'INR',
    date: dateIso,
    walletId: m.walletId,
    toWalletId: m.type === 'transfer' ? m.toWalletId : null,
    categoryId: m.type === 'transfer' ? null : (splits ? splits[0].categoryId : m.categoryId),
    splits,
    tags,
    merchant: m.merchant.trim() || (vaultData.categories.find(c => c.id === m.categoryId)?.name || 'Transaction'),
    note: m.note.trim(),
    source: 'manual',
    isSelfTransfer: selfCheck.isSelfTransfer,
    updatedAt: nowIso()
  };

  await putRecord('transactions', txRecord);
  closeModal();
  await refreshVaultData();
  await evaluateBudgetAlerts(vaultData.budgets, vaultData.transactions, vaultData.settings, showToast);
  await refreshVaultData();
  renderApp();
  showToast(selfCheck.isSelfTransfer ? 'Saved as Self-Transfer (excluded from spend)' : 'Transaction encrypted & saved');
}

async function approveParsedItem(item) {
  if (item.kind === 'credit_card_bill') {
    const dup = vaultData.credit_card_bills.find(b => b.last4Digits === item.last4Digits && b.dueDate === item.dueDate);
    if (dup) {
      showToast('Credit card bill already tracked');
      return;
    }
    await putRecord('credit_card_bills', {
      walletId: item.walletId,
      cardName: item.cardName,
      last4Digits: item.last4Digits,
      statementMonth: item.statementMonth,
      totalDue: item.totalDue,
      minDue: item.minDue,
      dueDate: item.dueDate,
      status: 'unpaid',
      paidAmount: 0,
      rawSourceSnippet: item.rawSourceSnippet,
      remindersSent: []
    });
    return;
  }

  const dup = vaultData.transactions.find(t => t.sourceHash && t.sourceHash === item.sourceHash);
  if (dup) {
    showToast('Skipped duplicate transaction (sourceHash matched)');
    return;
  }

  await putRecord('transactions', {
    type: item.type,
    amount: item.amount,
    currency: item.currency || 'INR',
    date: item.date,
    walletId: item.walletId,
    categoryId: item.categoryId,
    splits: null,
    tags: item.tags || [],
    merchant: item.merchant,
    note: item.note,
    source: item.source || 'sms',
    sourceHash: item.sourceHash,
    isSelfTransfer: Boolean(item.isSelfTransfer)
  });

  // Auto-mark matching credit card bill paid if self-transfer payment matches card last4 or amount
  if (item.isSelfTransfer) {
    const matchingBill = vaultData.credit_card_bills.find(b =>
      b.status !== 'paid' && (Math.abs(b.totalDue - item.amount) < 1 || (item.note && item.note.includes(b.last4Digits)))
    );
    if (matchingBill) {
      await putRecord('credit_card_bills', { ...matchingBill, status: 'paid', paidAmount: item.amount, updatedAt: nowIso() });
    }
  }
}

/* ============================================================
   GLOBAL DELEGATED EVENT LISTENERS (STRICT CSP COMPLIANT)
   ============================================================ */
document.addEventListener('click', async e => {
  const drillCat = e.target.closest('[data-drill-cat]');
  if (drillCat) {
    appState.txCategoryFilter = drillCat.dataset.drillCat;
    appState.screen = 'transactions';
    renderApp();
    return;
  }

  const btn = e.target.closest('[data-action]');
  if (!btn) {
    if (e.target.id === 'modalBackdrop') closeModal();
    return;
  }
  const action = btn.dataset.action;

  try {
    if (action === 'auth-tab') {
      appState.authTab = btn.dataset.tab;
      appState.pinBuffer = '';
      await renderAuthGate();
    } else if (action === 'pin-key') {
      const k = btn.dataset.key;
      if (k === 'C') {
        appState.pinBuffer = '';
        document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('filled'));
      } else if (k === 'OK') {
        const enteredPin = appState.pinBuffer;
        appState.pinBuffer = '';
        try {
          await loginWithPin(enteredPin);
          await refreshVaultData();
          renderApp();
          showToast('Vault unlocked via PIN');
        } catch (err) {
          await renderAuthGate(err.message);
        }
      } else if (appState.pinBuffer.length < 6) {
        appState.pinBuffer += k;
        document.querySelectorAll('.pin-dot').forEach((d, idx) => d.classList.toggle('filled', idx < appState.pinBuffer.length));
      }
    } else if (action === 'copy-recovery') {
      await navigator.clipboard?.writeText(appState.pendingRecoveryKey || '');
      showToast('Recovery Key copied to clipboard');
    } else if (action === 'download-recovery') {
      triggerFileDownload(`CashewFlow Offline Recovery Key:\n${appState.pendingRecoveryKey}\nKeep this safe!`, 'cashewflow-recovery-key.txt', 'text/plain');
    } else if (action === 'finish-setup') {
      appState.pendingRecoveryKey = null;
      await refreshVaultData();
      renderApp();
      showToast('Encrypted vault ready!');
    } else if (action === 'bio-check') {
      await checkBiometricPresence();
      showToast('Biometric verified — enter Master Password or PIN to unwrap AES key');
    } else if (action === 'lock-vault') {
      lockSession();
      vaultData = null;
      appState.authTab = 'password';
      await renderAuthGate();
      showToast('Vault locked • Key wiped from memory');
    } else if (action === 'nav') {
      appState.screen = btn.dataset.nav;
      renderApp();
    } else if (action === 'toggle-hide') {
      const updated = { ...vaultData.settings, hideAmounts: !vaultData.settings.hideAmounts, updatedAt: nowIso() };
      await putRecord('settings', updated);
      await refreshVaultData();
      renderApp();
    } else if (action === 'toggle-safe-formula') {
      appState.showSafeFormula = !appState.showSafeFormula;
      renderApp();
    } else if (action === 'set-period') {
      appState.dashPeriod = btn.dataset.period;
      renderApp();
    } else if (action === 'shift-period') {
      const dir = Number(btn.dataset.dir);
      const d = new Date(appState.dashAnchor);
      if (appState.dashPeriod === 'daily') d.setDate(d.getDate() + dir);
      else if (appState.dashPeriod === 'weekly') d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      appState.dashAnchor = d;
      renderApp();
    } else if (action === 'drill-tag') {
      appState.txTagFilter = btn.dataset.tag;
      appState.screen = 'transactions';
      renderApp();
    } else if (action === 'set-tx-filter') {
      appState.txTypeFilter = btn.dataset.filter;
      renderApp();
    } else if (action === 'clear-tx-filters') {
      appState.txSearch = '';
      appState.txTypeFilter = 'all';
      appState.txCategoryFilter = '';
      appState.txWalletFilter = '';
      appState.txTagFilter = '';
      renderApp();
    } else if (action === 'open-tx-modal') {
      openTransactionModal(null);
    } else if (action === 'edit-tx') {
      const tx = vaultData.transactions.find(t => t.id === btn.dataset.id);
      if (tx) openTransactionModal(tx);
    } else if (action === 'delete-tx') {
      const tx = vaultData.transactions.find(t => t.id === btn.dataset.id);
      if (tx) {
        await softDeleteRecord('transactions', tx);
        closeModal();
        await refreshVaultData();
        renderApp();
        showToast('Transaction deleted');
      }
    } else if (action === 'close-modal') {
      closeModal();
    } else if (action === 'modal-tx-type') {
      appState.modalState.type = btn.dataset.type;
      const firstCat = vaultData.categories.find(c => c.type === (btn.dataset.type === 'income' ? 'income' : 'expense'));
      if (firstCat) appState.modalState.categoryId = firstCat.id;
      renderTransactionModal();
    } else if (action === 'calc-key') {
      const k = btn.dataset.key;
      const m = appState.modalState;
      if (k === 'C') m.calcBuffer = '0';
      else if (k === '=') m.calcBuffer = String(evalSafeArithmetic(m.calcBuffer));
      else m.calcBuffer = m.calcBuffer === '0' ? k : m.calcBuffer + k;
      renderTransactionModal();
    } else if (action === 'modal-pick-cat') {
      appState.modalState.categoryId = btn.dataset.id;
      renderTransactionModal();
    } else if (action === 'add-split-row') {
      const firstCat = vaultData.categories.find(c => c.type === 'expense')?.id || '';
      appState.modalState.splits.push({ categoryId: firstCat, amount: 0 });
      renderTransactionModal();
    } else if (action === 'save-tx') {
      await handleSaveTransaction();
    } else if (action === 'mark-cc-paid') {
      const bill = vaultData.credit_card_bills.find(b => b.id === btn.dataset.id);
      if (bill) {
        await putRecord('credit_card_bills', { ...bill, status: 'paid', paidAmount: bill.totalDue, updatedAt: nowIso() });
        const bankWallet = vaultData.wallets.find(w => w.type === 'bank') || vaultData.wallets[0];
        await putRecord('transactions', {
          type: 'transfer',
          amount: bill.totalDue,
          currency: vaultData.settings.defaultCurrency || 'INR',
          date: nowIso(),
          walletId: bankWallet?.id,
          toWalletId: bill.walletId || null,
          merchant: `Paid ${bill.cardName} ••${bill.last4Digits}`,
          note: `Credit Card Bill Payment (${bill.dueDate})`,
          tags: ['#cc-bill'],
          source: 'manual',
          isSelfTransfer: true
        });
        await refreshVaultData();
        renderApp();
        showToast('Credit Card Bill marked Paid (logged as Self-Transfer)');
      }
    } else if (action === 'open-budget-modal') {
      const expCats = vaultData.categories.filter(c => c.type === 'expense');
      openSimpleModal('Create Category Cap', `
        <form id="budgetForm" class="stack" style="gap:10px">
          <div><label class="field-label">Budget Name</label><input class="input" id="bName" placeholder="e.g. Dining Out Cap" required /></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label class="field-label">Limit Amount</label><input class="input" type="number" id="bAmt" min="1" required /></div>
            <div><label class="field-label">Period</label><select class="input" id="bPeriod"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="daily">Daily</option></select></div>
          </div>
          <div>
            <label class="field-label">Category (leave blank for all expenses)</label>
            <select class="input" id="bCat"><option value="">All Expense Categories</option>${expCats.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('')}</select>
          </div>
          <button class="btn-primary" type="submit">Save Cap (75% &amp; 100% Alerts Active)</button>
        </form>`);
    } else if (action === 'delete-budget') {
      const b = vaultData.budgets.find(x => x.id === btn.dataset.id);
      if (b) { await softDeleteRecord('budgets', b); await refreshVaultData(); renderApp(); showToast('Budget removed'); }
    } else if (action === 'open-goal-modal') {
      openSimpleModal('New Savings Goal', `
        <form id="goalForm" class="stack" style="gap:10px">
          <div><label class="field-label">Goal Name</label><input class="input" id="gName" placeholder="e.g. Emergency Fund" required /></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label class="field-label">Target Amount</label><input class="input" type="number" id="gTarget" min="1" required /></div>
            <div><label class="field-label">Saved So Far</label><input class="input" type="number" id="gCurr" value="0" min="0" /></div>
          </div>
          <button class="btn-primary" type="submit">Save Goal</button>
        </form>`);
    } else if (action === 'contribute-goal') {
      const g = vaultData.goals.find(x => x.id === btn.dataset.id);
      if (g) {
        const amt = Number(prompt(`Contribute amount to "${g.name}":`, '2000'));
        if (amt > 0) {
          const contribs = [...(g.contributions || []), { amount: amt, date: nowIso() }];
          await putRecord('goals', { ...g, currentAmount: (g.currentAmount || 0) + amt, contributions: contribs, updatedAt: nowIso() });
          await refreshVaultData();
          renderApp();
          showToast(`Added ${formatMoney(amt, vaultData.settings)} to ${g.name}`);
        }
      }
    } else if (action === 'open-recurring-modal') {
      openSimpleModal('Add Bill / EMI / Subscription', `
        <form id="recurringForm" class="stack" style="gap:10px">
          <div><label class="field-label">Title</label><input class="input" id="rTitle" placeholder="e.g. Home Loan EMI, Netflix" required /></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label class="field-label">Amount</label><input class="input" type="number" id="rAmt" min="1" required /></div>
            <div><label class="field-label">Kind</label><select class="input" id="rKind"><option value="emi">EMI</option><option value="bill">Utility Bill</option><option value="subscription">Subscription</option></select></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label class="field-label">Next Due Date</label><input class="input" type="date" id="rDue" value="${toDateInputValue()}" required /></div>
            <div><label class="field-label">Frequency</label><select class="input" id="rFreq"><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="yearly">Yearly</option></select></div>
          </div>
          <button class="btn-primary" type="submit">Save Reminder</button>
        </form>`);
    } else if (action === 'delete-recurring') {
      const r = vaultData.recurring.find(x => x.id === btn.dataset.id);
      if (r) { await softDeleteRecord('recurring', r); await refreshVaultData(); renderApp(); showToast('Reminder removed'); }
    } else if (action === 'accept-recurring-candidate') {
      const cands = detectRecurringCandidates(vaultData.transactions, vaultData.recurring);
      const c = cands[Number(btn.dataset.idx)];
      if (c) {
        await putRecord('recurring', { ...c, type: 'expense', frequency: 'monthly', remindDaysBefore: [3, 1], autoPost: false, isActive: true });
        await refreshVaultData();
        renderApp();
        showToast(`Now tracking ${c.title}`);
      }
    } else if (action === 'load-sample-sms') {
      const sample = SAMPLE_SMS_LIBRARY[btn.dataset.sample] || '';
      appState.smsDraft = sample;
      renderApp();
    } else if (action === 'run-sms-parser') {
      const raw = document.getElementById('smsParserInput')?.value || '';
      appState.smsDraft = raw;
      const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let added = 0;
      for (const line of lines) {
        const parsed = await parseMessageOnDevice(
          { body: line, source: 'sms' },
          { wallets: vaultData.wallets, categories: vaultData.categories, rules: vaultData.categorization_rules, existingTxs: vaultData.transactions }
        );
        if (parsed) {
          appState.parseQueue.push(parsed);
          added++;
        }
      }
      renderApp();
      showToast(added ? `Parsed ${added} item(s) locally (zero server calls)` : 'Could not detect amount or bill in text');
    } else if (action === 'approve-parsed') {
      const idx = Number(btn.dataset.idx);
      const item = appState.parseQueue[idx];
      if (item) {
        await approveParsedItem(item);
        appState.parseQueue.splice(idx, 1);
        await refreshVaultData();
        await evaluateBudgetAlerts(vaultData.budgets, vaultData.transactions, vaultData.settings, showToast);
        await refreshVaultData();
        renderApp();
        showToast('Saved parsed item to encrypted vault');
      }
    } else if (action === 'approve-all-parsed') {
      for (const item of appState.parseQueue) {
        await approveParsedItem(item);
      }
      appState.parseQueue = [];
      await refreshVaultData();
      await evaluateBudgetAlerts(vaultData.budgets, vaultData.transactions, vaultData.settings, showToast);
      await refreshVaultData();
      renderApp();
      showToast('All parsed items saved to encrypted vault');
    } else if (action === 'clear-parse-queue') {
      appState.parseQueue = [];
      renderApp();
    } else if (action === 'open-wallet-modal') {
      openSimpleModal('Add Wallet / Account', `
        <form id="walletForm" class="stack" style="gap:10px">
          <div><label class="field-label">Account Name</label><input class="input" id="wName" placeholder="e.g. ICICI Coral Card" required /></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label class="field-label">Type</label><select class="input" id="wType"><option value="bank">Bank</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="credit_card">Credit Card</option></select></div>
            <div><label class="field-label">Last 4 Digits</label><input class="input" id="wLast4" maxlength="4" placeholder="e.g. 4821" /></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label class="field-label">Opening Balance</label><input class="input" type="number" id="wBal" value="0" /></div>
            <div><label class="field-label">Credit Limit (if CC)</label><input class="input" type="number" id="wLim" value="0" /></div>
          </div>
          <button class="btn-primary" type="submit">Save Wallet</button>
        </form>`);
    } else if (action === 'open-category-modal') {
      openSimpleModal('New Custom Category', `
        <form id="categoryForm" class="stack" style="gap:10px">
          <div><label class="field-label">Category Name</label><input class="input" id="cName" placeholder="e.g. Pets, Coffee" required /></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label class="field-label">Type</label><select class="input" id="cType"><option value="expense">Expense</option><option value="income">Income</option></select></div>
            <div><label class="field-label">Color</label><input class="input" type="color" id="cColor" value="#0d9488" /></div>
          </div>
          <div>
            <label class="field-label">Icon</label>
            <select class="input" id="cIcon">${CATEGORY_ICON_KEYS.map(k => `<option value="${k}">${k}</option>`).join('')}</select>
          </div>
          <button class="btn-primary" type="submit">Save Category</button>
        </form>`);
    } else if (action === 'open-rule-modal') {
      openSimpleModal('Add Auto-Categorization Rule', `
        <form id="ruleForm" class="stack" style="gap:10px">
          <div><label class="field-label">Merchant / UPI Keyword or Regex</label><input class="input" id="rlPattern" placeholder="e.g. sharma kirana|local milk" required /></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div><label class="field-label">Category</label><select class="input" id="rlCat">${vaultData.categories.map(c => `<option value="${escHtml(c.id)}">${escHtml(c.name)}</option>`).join('')}</select></div>
            <div><label class="field-label">Auto #Tag</label><input class="input" id="rlTag" placeholder="#local-upi" /></div>
          </div>
          <button class="btn-primary" type="submit">Save Rule</button>
        </form>`);
    } else if (action === 'delete-rule') {
      const r = vaultData.categorization_rules.find(x => x.id === btn.dataset.id);
      if (r) { await softDeleteRecord('categorization_rules', r); await refreshVaultData(); renderApp(); showToast('Rule deleted'); }
    } else if (action === 'set-theme-mode') {
      await putRecord('settings', { ...vaultData.settings, themeMode: btn.dataset.mode, updatedAt: nowIso() });
      await refreshVaultData();
      renderApp();
    } else if (action === 'set-accent') {
      await putRecord('settings', { ...vaultData.settings, accentColor: btn.dataset.accent, updatedAt: nowIso() });
      await refreshVaultData();
      renderApp();
    } else if (action === 'save-display-settings') {
      const cur = document.getElementById('settingCurrency').value;
      const inc = Number(document.getElementById('settingIncomeEst').value) || 0;
      const sav = Number(document.getElementById('settingSavingsTarget').value) || 0;
      await putRecord('settings', {
        ...vaultData.settings,
        defaultCurrency: cur,
        numberFormat: cur === 'INR' ? 'en-IN' : 'en-US',
        monthlyIncomeEstimate: inc,
        monthlySavingsTarget: sav,
        updatedAt: nowIso()
      });
      await refreshVaultData();
      renderApp();
      showToast('Preferences saved');
    } else if (action === 'reset-zero-balances') {
      for (const w of vaultData.wallets) {
        await putRecord('wallets', { ...w, initialBalance: 0, currentBalance: 0, updatedAt: nowIso() });
      }
      await putRecord('settings', {
        ...vaultData.settings,
        monthlyIncomeEstimate: 0,
        monthlySavingsTarget: 0,
        updatedAt: nowIso()
      });
      await refreshVaultData();
      renderApp();
      showToast('All wallet opening balances & estimates reset to ₹0');
    } else if (action === 'save-quick-pin') {
      const pin = document.getElementById('settingQuickPin').value.trim();
      await setQuickPin(pin);
      authMeta = await getAuthMeta();
      renderApp();
      showToast(pin ? 'Quick PIN saved' : 'Quick PIN cleared');
    } else if (action === 'enroll-biometric') {
      await enableBiometric();
      authMeta = await getAuthMeta();
      renderApp();
      showToast('Biometric credential enrolled');
    } else if (action === 'request-notif-perm') {
      const res = await requestNotificationPermission();
      showToast(`Notification permission: ${res}`);
    } else if (action === 'export-enc-backup') {
      const pass = document.getElementById('backupPassphrase').value;
      const env = await exportEncryptedSnapshot(pass);
      triggerFileDownload(JSON.stringify(env, null, 2), `cashewflow-backup-${toDateInputValue()}.enc.json`);
      showToast('Exported AES-256-GCM encrypted backup');
    } else if (action === 'export-csv') {
      const csv = buildTransactionsCsv(vaultData.transactions, vaultData.wallets, vaultData.categories);
      triggerFileDownload(csv, `cashewflow-transactions-${toDateInputValue()}.csv`, 'text/csv;charset=utf-8');
      showToast('Exported UTF-8 CSV');
    } else if (action === 'sync-gdrive') {
      const token = document.getElementById('gdriveAccessToken').value.trim();
      const pass = document.getElementById('gdriveSyncPass').value;
      const res = await syncWithGoogleDrive(token, pass);
      await putRecord('settings', { ...vaultData.settings, syncProvider: 'gdrive', lastSyncAt: res.syncedAt, updatedAt: nowIso() });
      await refreshVaultData();
      renderApp();
      showToast(`Encrypted Google Drive sync complete (+${res.mergeStats.inserted} / ~${res.mergeStats.updated})`);
    } else if (action === 'install-pwa' && appState.deferredInstallPrompt) {
      appState.deferredInstallPrompt.prompt();
      appState.deferredInstallPrompt = null;
      document.getElementById('installPwaBtn').classList.add('hidden');
    }
  } catch (err) {
    showToast(err.message || 'Operation failed');
  }
});

// Form submissions
document.addEventListener('submit', async e => {
  e.preventDefault();
  const id = e.target.id;
  try {
    if (id === 'setupVaultForm') {
      const username = document.getElementById('setupUsername').value;
      const password = document.getElementById('setupPassword').value;
      const pin = document.getElementById('setupPin').value;
      const { recoveryKey } = await createVault({ username, password, pin });
      appState.pendingRecoveryKey = recoveryKey;
      await renderAuthGate();
    } else if (id === 'loginPasswordForm') {
      const u = document.getElementById('loginUsername').value;
      const p = document.getElementById('loginPassword').value;
      await loginWithPassword(u, p);
      await refreshVaultData();
      renderApp();
      showToast('Vault unlocked');
    } else if (id === 'recoverVaultForm') {
      const rk = document.getElementById('recoverKeyInput').value;
      const np = document.getElementById('recoverNewPassword').value;
      await recoverVaultWithKey(rk, np);
      await refreshVaultData();
      renderApp();
      showToast('Password reset & vault unlocked');
    } else if (id === 'budgetForm') {
      const catId = document.getElementById('bCat').value;
      await putRecord('budgets', {
        name: document.getElementById('bName').value.trim(),
        amount: Number(document.getElementById('bAmt').value),
        period: document.getElementById('bPeriod').value,
        categoryIds: catId ? [catId] : []
      });
      closeModal();
      await refreshVaultData();
      await evaluateBudgetAlerts(vaultData.budgets, vaultData.transactions, vaultData.settings, showToast);
      await refreshVaultData();
      renderApp();
      showToast('Category cap saved');
    } else if (id === 'goalForm') {
      await putRecord('goals', {
        name: document.getElementById('gName').value.trim(),
        targetAmount: Number(document.getElementById('gTarget').value),
        currentAmount: Number(document.getElementById('gCurr').value) || 0,
        color: '#0d9488',
        contributions: []
      });
      closeModal();
      await refreshVaultData();
      renderApp();
      showToast('Savings goal created');
    } else if (id === 'recurringForm') {
      await putRecord('recurring', {
        title: document.getElementById('rTitle').value.trim(),
        amount: Number(document.getElementById('rAmt').value),
        kind: document.getElementById('rKind').value,
        type: 'expense',
        frequency: document.getElementById('rFreq').value,
        nextDueDate: document.getElementById('rDue').value,
        remindDaysBefore: [5, 2, 0],
        autoPost: false,
        isActive: true
      });
      closeModal();
      await refreshVaultData();
      renderApp();
      showToast('Recurring bill/EMI reminder added');
    } else if (id === 'walletForm') {
      const bal = Number(document.getElementById('wBal').value) || 0;
      const type = document.getElementById('wType').value;
      await putRecord('wallets', {
        name: document.getElementById('wName').value.trim(),
        type,
        currency: vaultData.settings.defaultCurrency || 'INR',
        initialBalance: bal,
        currentBalance: bal,
        creditLimit: Number(document.getElementById('wLim').value) || 0,
        last4Digits: document.getElementById('wLast4').value.trim(),
        icon: type === 'credit_card' ? 'card' : (type === 'bank' ? 'bank' : 'wallet'),
        color: '#0d9488',
        isArchived: false
      });
      closeModal();
      await refreshVaultData();
      renderApp();
      showToast('Wallet added');
    } else if (id === 'categoryForm') {
      await putRecord('categories', {
        name: document.getElementById('cName').value.trim(),
        type: document.getElementById('cType').value,
        color: document.getElementById('cColor').value,
        icon: document.getElementById('cIcon').value,
        parentId: null,
        isSystem: false
      });
      closeModal();
      await refreshVaultData();
      renderApp();
      showToast('Custom category created');
    } else if (id === 'ruleForm') {
      const tagRaw = document.getElementById('rlTag').value.trim();
      await putRecord('categorization_rules', {
        pattern: document.getElementById('rlPattern').value.trim(),
        matchType: 'regex',
        categoryId: document.getElementById('rlCat').value,
        tags: tagRaw ? [tagRaw.startsWith('#') ? tagRaw : '#' + tagRaw] : [],
        priority: 20,
        hitCount: 0,
        isUserDefined: true
      });
      closeModal();
      await refreshVaultData();
      renderApp();
      showToast('Auto-categorization rule saved');
    }
  } catch (err) {
    if (['setupVaultForm', 'loginPasswordForm', 'recoverVaultForm'].includes(id)) {
      await renderAuthGate(err.message);
    } else {
      showToast(err.message || 'Save failed');
    }
  }
});

// Input & Change handlers
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'txSearchInput') {
    appState.txSearch = t.value;
    renderApp();
    const el = document.getElementById('txSearchInput');
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  } else if (appState.modalState?.kind === 'tx') {
    const m = appState.modalState;
    if (t.id === 'modalMerchant') {
      m.merchant = t.value;
      const hit = matchCategorizationRule(t.value, vaultData.categorization_rules);
      if (hit && t.value.trim().length >= 3) {
        m.categoryId = hit.categoryId;
        const catName = vaultData.categories.find(c => c.id === hit.categoryId)?.name || 'Matched';
        m.autoRuleText = `Auto-categorized → ${catName}`;
        renderTransactionModal();
        const el = document.getElementById('modalMerchant');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }
    } else if (t.id === 'modalTags') m.tags = t.value;
    else if (t.id === 'modalNote') m.note = t.value;
    else if (t.id === 'modalDate') m.date = t.value;
    else if (t.dataset.splitAmt !== undefined) {
      m.splits[Number(t.dataset.splitAmt)].amount = Number(t.value) || 0;
      renderTransactionModal();
      const el = document.querySelector(`[data-split-amt="${t.dataset.splitAmt}"]`);
      if (el) el.focus();
    }
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  try {
    if (t.id === 'txWalletSelect') { appState.txWalletFilter = t.value; renderApp(); }
    else if (t.id === 'customStartInput') { appState.customStart = t.value; renderApp(); }
    else if (t.id === 'customEndInput') { appState.customEnd = t.value; renderApp(); }
    else if (t.id === 'settingAutoLock') {
      await setAutoLockMinutes(Number(t.value));
      authMeta = await getAuthMeta();
      showToast('Auto-lock timer updated');
    } else if (t.id === 'modalWallet' && appState.modalState) appState.modalState.walletId = t.value;
    else if (t.id === 'modalToWallet' && appState.modalState) appState.modalState.toWalletId = t.value;
    else if (t.id === 'modalSplitToggle' && appState.modalState) {
      appState.modalState.isSplit = t.checked;
      renderTransactionModal();
    } else if (t.dataset.splitCat !== undefined && appState.modalState) {
      appState.modalState.splits[Number(t.dataset.splitCat)].categoryId = t.value;
    } else if (t.id === 'aaImportFile' && t.files?.[0]) {
      const file = t.files[0];
      const text = await file.text();
      const adapter = new AccountAggregatorAdapter();
      const ctx = { wallets: vaultData.wallets, categories: vaultData.categories, rules: vaultData.categorization_rules, existingTxs: vaultData.transactions };
      const parsed = file.name.toLowerCase().endsWith('.json')
        ? await adapter.parseRebitJson(text, ctx)
        : await adapter.parseBankCsv(text, ctx);
      appState.parseQueue.push(...parsed);
      renderApp();
      showToast(`Parsed ${parsed.length} row(s) from ${file.name}`);
      t.value = '';
    } else if ((t.id === 'importEncMergeFile' || t.id === 'importEncReplaceFile') && t.files?.[0]) {
      const pass = document.getElementById('backupPassphrase')?.value;
      if (!pass) { showToast('Enter the backup passphrase first'); t.value = ''; return; }
      const envelope = JSON.parse(await t.files[0].text());
      const mode = t.id === 'importEncReplaceFile' ? 'replace' : 'merge';
      const stats = await importEncryptedSnapshot(envelope, pass, { mode });
      await refreshVaultData();
      renderApp();
      showToast(`Backup ${mode} complete: +${stats.inserted} new, ~${stats.updated} updated`);
      t.value = '';
    }
  } catch (err) {
    showToast(err.message || 'Import error (check passphrase or file format)');
    t.value = '';
  }
});

// Desktop Keyboard Shortcuts (N, /, 1-5, H, L, Esc)
document.addEventListener('keydown', e => {
  if (!hasSessionKey()) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    if (e.key === 'Escape') closeModal();
    return;
  }
  if (e.key === 'Escape') closeModal();
  else if (e.key.toLowerCase() === 'n') { e.preventDefault(); openTransactionModal(null); }
  else if (e.key === '/') { e.preventDefault(); appState.screen = 'transactions'; renderApp(); document.getElementById('txSearchInput')?.focus(); }
  else if (e.key.toLowerCase() === 'h') document.querySelector('[data-action="toggle-hide"]')?.click();
  else if (e.key.toLowerCase() === 'l') document.querySelector('[data-action="lock-vault"]')?.click();
  else if (['1', '2', '3', '4', '5'].includes(e.key)) {
    appState.screen = NAV_ITEMS[Number(e.key) - 1].key;
    renderApp();
  }
});

// Phase 5 Android Native Companion Bridge Hook (100% On-Device)
window.CashewBridge = {
  async onIncomingMessage(payload) {
    if (!hasSessionKey() || !vaultData) return { queued: false, reason: 'locked' };
    const parsed = await parseMessageOnDevice(payload, {
      wallets: vaultData.wallets,
      categories: vaultData.categories,
      rules: vaultData.categorization_rules,
      existingTxs: vaultData.transactions
    });
    if (parsed) {
      appState.parseQueue.push(parsed);
      if (appState.screen === 'capture') renderApp();
      showToast(`Captured on-device: ${parsed.kind === 'credit_card_bill' ? parsed.cardName + ' Bill' : parsed.merchant}`);
      return { queued: true, kind: parsed.kind };
    }
    return { queued: false, reason: 'unmatched' };
  }
};

// PWA Service Worker, Install Prompt & Android Web Share Target
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  appState.deferredInstallPrompt = e;
  document.getElementById('installPwaBtn')?.classList.remove('hidden');
});

// Check for Android Web Share Target (?shared_text=...)
const urlParams = new URLSearchParams(location.search);
const sharedText = urlParams.get('shared_text') || urlParams.get('text');
if (sharedText) {
  appState.smsDraft = sharedText;
  appState.screen = 'capture';
}

registerAutoLockHandler(reason => {
  vaultData = null;
  renderAuthGate(reason);
});

renderAuthGate();
