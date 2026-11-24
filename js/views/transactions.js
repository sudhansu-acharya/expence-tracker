// Phase 1: Searchable, Filterable Transactions List + Category & Wallet Manager
import { escHtml, formatMoney } from '../format.js';
import { isCreditCardPaymentTx } from '../rules.js';
import { renderCompactTxRow } from './dashboard.js';

export function renderTransactionsView(ctx) {
  const { state, data } = ctx;
  const settings = data.settings;
  const catMap = new Map(data.categories.map(c => [c.id, c]));
  const walletMap = new Map(data.wallets.map(w => [w.id, w]));
  const ccWalletIds = new Set(data.wallets.filter(w => w.type === 'credit_card').map(w => w.id));

  const q = (state.txSearch || '').toLowerCase().trim();
  const filtered = [...data.transactions]
    .filter(tx => {
      if (state.txTypeFilter !== 'all') {
        if (state.txTypeFilter === 'self' && !tx.isSelfTransfer) return false;
        else if (state.txTypeFilter === 'split' && !(Array.isArray(tx.splits) && tx.splits.length)) return false;
        else if (state.txTypeFilter === 'credit_card') {
          const isCcSwipe = ccWalletIds.has(tx.walletId);
          const isCcPay = isCreditCardPaymentTx(tx, ccWalletIds);
          if (!isCcSwipe && !isCcPay) return false;
        } else if (['expense', 'income', 'investment', 'transfer'].includes(state.txTypeFilter) && tx.type !== state.txTypeFilter) return false;
      }
      if (state.txCategoryFilter && tx.categoryId !== state.txCategoryFilter) {
        const inSplit = Array.isArray(tx.splits) && tx.splits.some(s => s.categoryId === state.txCategoryFilter);
        if (!inSplit) return false;
      }
      if (state.txWalletFilter && tx.walletId !== state.txWalletFilter) return false;
      if (state.txTagFilter && !(tx.tags || []).includes(state.txTagFilter)) return false;
      if (q) {
        const hay = `${tx.merchant || ''} ${tx.note || ''} ${catMap.get(tx.categoryId)?.name || ''} ${walletMap.get(tx.walletId)?.name || ''} ${(tx.tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const totalOut = filtered.filter(t => t.type === 'expense' && !t.isSelfTransfer).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalIn = filtered.filter(t => t.type === 'income' && !t.isSelfTransfer).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalInv = filtered.filter(t => t.type === 'investment' && !t.isSelfTransfer).reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const activeFilters = [];
  if (state.txCategoryFilter) activeFilters.push(`Category: ${catMap.get(state.txCategoryFilter)?.name || 'Selected'}`);
  if (state.txTagFilter) activeFilters.push(`Tag: ${state.txTagFilter}`);
  if (state.txWalletFilter) activeFilters.push(`Wallet: ${walletMap.get(state.txWalletFilter)?.name || 'Selected'}`);

  return `
    <div class="stack">
      <div class="card" style="padding:14px">
        <div style="display:grid;grid-template-columns:1fr auto;gap:8px">
          <input class="input" id="txSearchInput" placeholder="Search merchant, note, wallet, category, or #tag..." value="${escHtml(state.txSearch)}" />
          <select class="input" id="txWalletSelect" style="width:auto;min-width:130px">
            <option value="">All Wallets</option>
            ${data.wallets.map(w => `<option value="${escHtml(w.id)}" ${state.txWalletFilter === w.id ? 'selected' : ''}>${escHtml(w.name)}</option>`).join('')}
          </select>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center">
          ${[
            ['all', 'All'],
            ['expense', 'Expenses'],
            ['income', 'Income'],
            ['investment', 'Investments'],
            ['credit_card', 'Credit Card'],
            ['self', 'Self-Transfers'],
            ['split', 'Split Bills']
          ].map(([k, lbl]) => `<button class="pill-btn ${state.txTypeFilter === k ? 'active' : ''}" data-action="set-tx-filter" data-filter="${k}">${lbl}</button>`).join('')}
          ${activeFilters.length ? `<button class="btn-soft" data-action="clear-tx-filters" style="min-height:30px;padding:4px 10px;font-size:11.5px">Clear Filters (${activeFilters.join(', ')})</button>` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Transactions (${filtered.length})</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span class="chip chip-green">In ${escHtml(formatMoney(totalIn, settings))}</span>
            <span class="chip chip-red">Out ${escHtml(formatMoney(totalOut, settings))}</span>
            <span class="chip chip-purple">Inv ${escHtml(formatMoney(totalInv, settings))}</span>
          </div>
        </div>
        <div class="tx-list">
          ${filtered.length
            ? filtered.map(tx => renderCompactTxRow(tx, catMap, walletMap, settings)).join('')
            : '<p class="muted" style="text-align:center;padding:24px">No transactions match your current filter.</p>'}
        </div>
      </div>
    </div>`;
}
