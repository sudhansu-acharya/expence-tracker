// Phase 1 & 3: On-Device SMS/UPI/Credit Card Bill Parser, RBI AA Importer, Wallets, Categories & Rules
import { iconSvg } from '../icons.js';
import { formatMoney, escHtml } from '../format.js';
import { computeWalletBalances } from '../rules.js';

export function renderCaptureView(ctx) {
  const { state, data } = ctx;
  const settings = data.settings;
  const balances = computeWalletBalances(data.wallets, data.transactions);
  const catMap = new Map(data.categories.map(c => [c.id, c]));

  const queueHtml = state.parseQueue.length ? `
    <div style="margin-top:14px;border-top:1px solid var(--border);padding-top:12px">
      <div class="card-header" style="margin-bottom:8px">
        <div class="card-title">Review Queue (${state.parseQueue.length} parsed on-device)</div>
        <div style="display:flex;gap:6px">
          <button class="btn-primary" data-action="approve-all-parsed" style="min-height:34px;padding:6px 12px;font-size:12px">Approve All</button>
          <button class="btn-soft" data-action="clear-parse-queue" style="min-height:34px;padding:6px 10px;font-size:12px">Clear</button>
        </div>
      </div>
      <div class="tx-list">
        ${state.parseQueue.map((item, idx) => {
          if (item.kind === 'credit_card_bill') {
            return `
              <div class="tx-row">
                <div class="cat-badge" style="background:var(--amber-soft);color:var(--amber)">${iconSvg('card')}</div>
                <div class="tx-info">
                  <div class="tx-title">${escHtml(item.cardName)} ••${escHtml(item.last4Digits)} <span class="chip chip-amber">CC Bill Reminder</span></div>
                  <div class="tx-meta">Total Due ${escHtml(formatMoney(item.totalDue, settings))} • Min ${escHtml(formatMoney(item.minDue, settings))} • Due ${escHtml(item.dueDate)}</div>
                </div>
                <button class="btn-primary" style="min-height:34px;padding:6px 12px;font-size:12px" data-action="approve-parsed" data-idx="${idx}">Save Bill</button>
              </div>`;
          }
          const cat = catMap.get(item.categoryId);
          return `
            <div class="tx-row">
              <div class="cat-badge" style="background:var(--accent-tint);color:var(--accent)">${iconSvg(cat?.icon || 'sparkles')}</div>
              <div class="tx-info">
                <div class="tx-title">
                  ${escHtml(item.merchant)}
                  <span class="chip chip-accent">${escHtml(cat?.name || 'Other')}</span>
                  ${item.isSelfTransfer ? '<span class="chip chip-blue">Self-Transfer</span>' : ''}
                </div>
                <div class="tx-meta">${escHtml(item.source)} • ${escHtml(item.date.slice(0, 10))} ${(item.tags || []).map(t => `<span class="tag-pill">${escHtml(t)}</span>`).join('')}</div>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <span class="tx-amount ${item.type === 'income' ? 'income' : (item.type === 'transfer' ? 'transfer' : 'expense')}">${escHtml(formatMoney(item.amount, settings))}</span>
                <button class="btn-primary" style="min-height:34px;padding:6px 10px;font-size:12px" data-action="approve-parsed" data-idx="${idx}">Save</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>` : '';

  const walletCards = data.wallets.map(w => {
    const bal = balances.get(w.id) ?? 0;
    const util = w.type === 'credit_card' && w.creditLimit > 0 ? Math.min(100, Math.round((Math.abs(Math.min(0, bal)) / w.creditLimit) * 100)) : null;
    return `
      <div class="card">
        <div class="card-header" style="margin-bottom:6px">
          <div class="card-title">${iconSvg(w.icon || 'wallet')} ${escHtml(w.name)}</div>
          <span class="chip">${escHtml(w.type.replace('_', ' ').toUpperCase())} ${w.last4Digits ? '••' + escHtml(w.last4Digits) : ''}</span>
        </div>
        <div style="font-size:20px;font-weight:800;color:${bal < 0 ? 'var(--red)' : 'var(--text-1)'}">${escHtml(formatMoney(bal, settings))}</div>
        ${util !== null ? `
          <div class="progress-track"><div class="progress-fill" style="width:${util}%;background:var(--red)"></div></div>
          <div class="muted">Credit Utilization: ${util}% of ${escHtml(formatMoney(w.creditLimit, settings))}</div>
        ` : `<div class="muted" style="margin-top:6px">${escHtml(w.institution || 'Local Encrypted Account')}</div>`}
      </div>`;
  }).join('');

  const rulesHtml = data.categorization_rules.map(r => `
    <div class="tx-row">
      <div class="tx-info">
        <div class="tx-title"><code>${escHtml(r.pattern)}</code> → <span class="chip chip-accent">${escHtml(catMap.get(r.categoryId)?.name || 'Category')}</span></div>
        <div class="tx-meta">${escHtml(r.matchType)} • Tags: ${(r.tags || []).join(' ') || 'none'} • Matches: ${r.hitCount || 0}</div>
      </div>
      <button class="icon-btn" style="width:32px;height:32px" data-action="delete-rule" data-id="${escHtml(r.id)}">${iconSvg('trash')}</button>
    </div>`).join('');

  return `
    <div class="stack">
      <!-- On-Device SMS / UPI / Credit Card Bill Parser -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">${iconSvg('sparkles')} On-Device SMS, UPI &amp; Credit Card Bill Parser</div>
          <span class="chip chip-green">100% Local • Zero Server</span>
        </div>
        <p class="muted" style="margin-bottom:8px">Paste one or multiple lines of Indian bank SMS, GPay/PhonePe/Paytm alerts, or Credit Card Bill SMS (one message per line):</p>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
          <button class="btn-soft" data-action="load-sample-sms" data-sample="hdfcDebit">Sample: HDFC Debit SMS</button>
          <button class="btn-soft" data-action="load-sample-sms" data-sample="gpayUpi">Sample: GPay UPI Alert</button>
          <button class="btn-soft" data-action="load-sample-sms" data-sample="ccBill">Sample: Credit Card Bill SMS</button>
          <button class="btn-soft" data-action="load-sample-sms" data-sample="selfTransfer">Sample: Self-Transfer SMS</button>
        </div>
        <textarea class="input textarea" id="smsParserInput" placeholder="Paste bank SMS, UPI notification, or credit card statement alert here...">${escHtml(state.smsDraft || '')}</textarea>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;align-items:center">
          <button class="btn-primary" data-action="run-sms-parser">Parse On-Device</button>
          <label class="btn-soft" style="cursor:pointer">
            ${iconSvg('upload')} Import RBI AA JSON / Bank CSV
            <input type="file" id="aaImportFile" accept=".json,.csv,text/csv,application/json" class="hidden" />
          </label>
        </div>
        ${queueHtml}
      </div>

      <!-- Wallets & Accounts -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">${iconSvg('wallet')} Wallets &amp; Credit Cards</div>
          <button class="btn-soft" data-action="open-wallet-modal">+ Add Wallet</button>
        </div>
        <div class="grid-2">${walletCards}</div>
      </div>

      <!-- Custom Categories -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Categories &amp; Icons (${data.categories.length})</div>
          <button class="btn-soft" data-action="open-category-modal">+ New Category</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${data.categories.map(c => `
            <span class="chip" style="background:${escHtml(c.color)}22;color:${escHtml(c.color)};padding:6px 11px">
              ${iconSvg(c.icon)} ${escHtml(c.name)}
            </span>`).join('')}
        </div>
      </div>

      <!-- Auto-Categorization Rules -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">Auto-Categorization Rules</div>
          <button class="btn-soft" data-action="open-rule-modal">+ Add Rule</button>
        </div>
        <div class="tx-list">${rulesHtml}</div>
      </div>
    </div>`;
}
