// Phase 3: Category Caps (75%/100% Alerts), Savings Goals, Recurring Bills/EMIs & Credit Card Reminders
import { iconSvg } from '../icons.js';
import { formatMoney, escHtml } from '../format.js';
import { computeBudgetSpend, detectRecurringCandidates, getActiveCreditCardReminders } from '../reminders.js';

export function renderBudgetsView(ctx) {
  const { data } = ctx;
  const settings = data.settings;
  const catMap = new Map(data.categories.map(c => [c.id, c]));

  const budgetCards = data.budgets.map(b => {
    const spent = computeBudgetSpend(b, data.transactions);
    const pct = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
    const status = pct >= 100
      ? { cls: 'chip-red', label: '100% Limit Exceeded', bar: 'var(--red)' }
      : pct >= 75
        ? { cls: 'chip-amber', label: '75% Warning Alert', bar: 'var(--amber)' }
        : { cls: 'chip-green', label: 'On Track', bar: 'var(--green)' };
    const catNames = (b.categoryIds || []).map(id => catMap.get(id)?.name).filter(Boolean).join(', ') || 'All Expenses';

    return `
      <div class="card">
        <div class="card-header" style="margin-bottom:4px">
          <div>
            <div class="card-title">${escHtml(b.name)}</div>
            <div class="muted">${escHtml(b.period)} • ${escHtml(catNames)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="chip ${status.cls}">${status.label}</span>
            <button class="icon-btn" style="width:32px;height:32px" data-action="delete-budget" data-id="${escHtml(b.id)}" title="Delete Budget">${iconSvg('trash')}</button>
          </div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;margin-top:8px">
          <span>${escHtml(formatMoney(spent, settings))} spent</span>
          <span class="muted">Cap ${escHtml(formatMoney(b.amount, settings))} (${pct}%)</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${Math.min(pct, 100)}%;background:${status.bar}"></div>
        </div>
      </div>`;
  }).join('');

  const ccReminders = getActiveCreditCardReminders(data.credit_card_bills);
  const ccRows = data.credit_card_bills.map(bill => {
    const rem = ccReminders.find(r => r.bill.id === bill.id);
    const statusChip = bill.status === 'paid'
      ? '<span class="chip chip-green">Paid</span>'
      : (rem?.daysLeft <= 0 ? '<span class="chip chip-red">Due / Overdue</span>' : `<span class="chip chip-amber">Due ${escHtml(bill.dueDate)}</span>`);
    return `
      <div class="tx-row">
        <div class="cat-badge" style="background:var(--amber-soft);color:var(--amber)">${iconSvg('card')}</div>
        <div class="tx-info">
          <div class="tx-title">${escHtml(bill.cardName)} ••${escHtml(bill.last4Digits)} ${statusChip}</div>
          <div class="tx-meta">Total Due ${escHtml(formatMoney(bill.totalDue, settings))} • Min Due ${escHtml(formatMoney(bill.minDue, settings))}</div>
        </div>
        ${bill.status !== 'paid'
          ? `<button class="btn-primary" style="min-height:34px;padding:6px 12px;font-size:12px" data-action="mark-cc-paid" data-id="${escHtml(bill.id)}">Mark Paid</button>`
          : ''}
      </div>`;
  }).join('');

  const recRows = data.recurring.map(r => `
    <div class="tx-row">
      <div class="cat-badge" style="background:var(--accent-tint);color:var(--accent)">${iconSvg('bell')}</div>
      <div class="tx-info">
        <div class="tx-title">${escHtml(r.title)} <span class="chip">${escHtml(r.kind.toUpperCase())}</span></div>
        <div class="tx-meta">Due ${escHtml(r.nextDueDate)} • ${escHtml(r.frequency)} • Pre-due reminder active</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <span class="tx-amount expense">${escHtml(formatMoney(r.amount, settings))}</span>
        <button class="icon-btn" style="width:32px;height:32px" data-action="delete-recurring" data-id="${escHtml(r.id)}">${iconSvg('trash')}</button>
      </div>
    </div>`).join('');

  const candidates = detectRecurringCandidates(data.transactions, data.recurring);
  const candHtml = candidates.length ? `
    <div class="card" style="border-color:var(--accent)">
      <div class="card-header"><div class="card-title">${iconSvg('sparkles')} Auto-Detected Recurring Bills / EMIs</div></div>
      <div class="tx-list">
        ${candidates.map((c, idx) => `
          <div class="tx-row">
            <div class="tx-info">
              <div class="tx-title">${escHtml(c.title)} <span class="chip chip-accent">${escHtml(c.kind)}</span></div>
              <div class="tx-meta">Detected monthly debit • Next est. ${escHtml(c.nextDueDate)}</div>
            </div>
            <button class="btn-primary" style="min-height:34px;padding:6px 12px;font-size:12px" data-action="accept-recurring-candidate" data-idx="${idx}">Track (${escHtml(formatMoney(c.amount, settings))})</button>
          </div>`).join('')}
      </div>
    </div>` : '';

  const goalCards = data.goals.map(g => {
    const pct = g.targetAmount > 0 ? Math.min(100, Math.round(((g.currentAmount || 0) / g.targetAmount) * 100)) : 0;
    const r = 24, c = 2 * Math.PI * r, dash = (pct / 100) * c;
    return `
      <div class="card" style="display:flex;align-items:center;gap:14px">
        <svg width="62" height="62" viewBox="0 0 62 62" style="flex-shrink:0">
          <circle cx="31" cy="31" r="${r}" fill="none" stroke="var(--bg-card-2)" stroke-width="6"/>
          <circle cx="31" cy="31" r="${r}" fill="none" stroke="${escHtml(g.color || 'var(--accent)')}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${dash.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 31 31)"/>
          <text x="31" y="35" text-anchor="middle" font-size="11" font-weight="800" fill="var(--text-1)">${pct}%</text>
        </svg>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:14.5px">${escHtml(g.name)}</div>
          <div class="muted">${escHtml(formatMoney(g.currentAmount || 0, settings))} of ${escHtml(formatMoney(g.targetAmount, settings))}</div>
        </div>
        <button class="btn-soft" data-action="contribute-goal" data-id="${escHtml(g.id)}">+ Add</button>
      </div>`;
  }).join('');

  return `
    <div class="stack">
      <div class="card">
        <div class="card-header">
          <div class="card-title">${iconSvg('target')} Category Caps (75% &amp; 100% Real-Time Alerts)</div>
          <button class="btn-primary" data-action="open-budget-modal">+ New Cap</button>
        </div>
        <div class="grid-2">
          ${budgetCards || '<p class="muted">No category caps yet. Create a cap to get real-time 75% and 100% spending alerts.</p>'}
        </div>
      </div>

      ${candHtml}

      <div class="card">
        <div class="card-header">
          <div class="card-title">${iconSvg('card')} Credit Card Bills (Parsed from SMS)</div>
          <button class="btn-soft" data-action="nav" data-nav="capture">Parse CC Bill SMS</button>
        </div>
        <div class="tx-list">
          ${ccRows || '<p class="muted">No credit card bills detected yet. Paste or share a bank credit card statement SMS in Smart Capture.</p>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">${iconSvg('bell')} Recurring Bills, EMIs &amp; Subscriptions</div>
          <button class="btn-soft" data-action="open-recurring-modal">+ Add Bill / EMI</button>
        </div>
        <div class="tx-list">
          ${recRows || '<p class="muted">No recurring bills or EMIs scheduled yet.</p>'}
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Savings Goals</div>
          <button class="btn-soft" data-action="open-goal-modal">+ New Goal</button>
        </div>
        <div class="grid-2">
          ${goalCards || '<p class="muted">No savings goals yet. Set a target like Emergency Fund or Travel.</p>'}
        </div>
      </div>
    </div>`;
}
