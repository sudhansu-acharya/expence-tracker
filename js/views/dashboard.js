// Phase 2: Daily, Weekly, Monthly & Custom Graphical Dashboards + Safe-to-Spend & Net Worth Snapshot
import { iconSvg } from '../icons.js';
import { formatMoney, escHtml, getPeriodBounds, formatShortDate } from '../format.js';
import { computeWalletBalances, expandCategoryAllocations } from '../rules.js';
import { computeSafeToSpend, getActiveCreditCardReminders } from '../reminders.js';
import { drawTrendChart, drawComparisonBarChart, renderCategoryDonutHtml } from '../charts.js';

export function renderDashboardView(ctx) {
  const { state, data } = ctx;
  const settings = data.settings;
  const balances = computeWalletBalances(data.wallets, data.transactions);

  let liquidAssets = 0;
  let creditDues = 0;
  for (const w of data.wallets) {
    const bal = balances.get(w.id) ?? 0;
    if (w.type === 'credit_card') {
      if (bal < 0) creditDues += Math.abs(bal);
    } else {
      liquidAssets += bal;
    }
  }
  // Include unpaid SMS-detected credit card bills if higher than ledger card balance
  const unpaidBillSum = data.credit_card_bills
    .filter(b => b.status !== 'paid')
    .reduce((s, b) => s + (Number(b.totalDue) || 0), 0);
  const effectiveDues = Math.max(creditDues, unpaidBillSum);
  const netWorth = liquidAssets - effectiveDues;

  const { start, end, label } = getPeriodBounds(state.dashPeriod, state.dashAnchor, state.customStart, state.customEnd);
  const periodTxs = data.transactions.filter(tx => {
    const dt = new Date(tx.date);
    return dt >= start && dt <= end;
  });

  let periodInflow = 0;
  let periodOutflow = 0;
  const catTotals = new Map();
  const tagTotals = new Map();

  for (const tx of periodTxs) {
    if (tx.isSelfTransfer) continue;
    if (tx.type === 'income') periodInflow += Number(tx.amount) || 0;
    if (tx.type === 'expense') {
      periodOutflow += Number(tx.amount) || 0;
      for (const alloc of expandCategoryAllocations(tx)) {
        catTotals.set(alloc.categoryId, (catTotals.get(alloc.categoryId) || 0) + alloc.amount);
      }
      for (const tg of (tx.tags || [])) {
        tagTotals.set(tg, (tagTotals.get(tg) || 0) + (Number(tx.amount) || 0));
      }
    }
  }

  const catMap = new Map(data.categories.map(c => [c.id, c]));
  const donutSlices = [...catTotals.entries()]
    .map(([id, amount]) => {
      const c = catMap.get(id) || { id, name: 'Other', color: '#64748b' };
      return { id: c.id, name: c.name, color: c.color, amount };
    })
    .sort((a, b) => b.amount - a.amount);

  const safe = computeSafeToSpend({
    transactions: data.transactions,
    recurring: data.recurring,
    ccBills: data.credit_card_bills,
    settings
  });

  const ccReminders = getActiveCreditCardReminders(data.credit_card_bills);
  const ccBannerHtml = ccReminders.slice(0, 2).map(r => `
    <div class="alert-banner ${r.daysLeft <= 0 ? 'danger' : ''}">
      <div class="alert-left">
        <div class="alert-icon">${iconSvg('bell')}</div>
        <div>
          <div style="font-size:13.5px;font-weight:800">
            ${escHtml(r.bill.cardName)} ••${escHtml(r.bill.last4Digits)} — ${r.daysLeft < 0 ? `Overdue by ${Math.abs(r.daysLeft)}d` : (r.daysLeft === 0 ? 'Due Today!' : `Due in ${r.daysLeft} day${r.daysLeft > 1 ? 's' : ''}`)}
          </div>
          <div class="muted" style="color:var(--text-2);margin-top:2px">
            Total Due <strong>${escHtml(formatMoney(r.bill.totalDue, settings))}</strong> • Min Due ${escHtml(formatMoney(r.bill.minDue, settings))} • Due ${escHtml(r.bill.dueDate)}
          </div>
        </div>
      </div>
      <button class="btn-primary" data-action="mark-cc-paid" data-id="${escHtml(r.bill.id)}" style="min-height:34px;padding:6px 12px;font-size:12px">Mark Paid</button>
    </div>`).join('');

  const topTagsHtml = [...tagTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tg, amt]) => `<button class="pill-btn" data-action="drill-tag" data-tag="${escHtml(tg)}">${escHtml(tg)} • ${escHtml(formatMoney(amt, settings))}</button>`)
    .join('');

  const walletMap = new Map(data.wallets.map(w => [w.id, w]));
  const recentHtml = [...data.transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map(tx => renderCompactTxRow(tx, catMap, walletMap, settings))
    .join('');

  return `
    <div class="stack">
      ${ccBannerHtml}

      <div class="grid-2">
        <div class="card hero-safe">
          <div class="hero-label">${iconSvg('shield')} SAFE-TO-SPEND DAILY ALLOWANCE</div>
          <div class="hero-amount">${escHtml(formatMoney(safe.dailyAllowance, settings))} <span style="font-size:13px;font-weight:600;opacity:0.9">/ today</span></div>
          <div class="hero-sub">${safe.remainingDays} day${safe.remainingDays > 1 ? 's' : ''} left this month • Status: <strong>${escHtml(safe.status)}</strong></div>
          <button class="hero-pill-btn" data-action="toggle-safe-formula">${state.showSafeFormula ? 'Hide formula' : 'See calculation breakdown'}</button>
          ${state.showSafeFormula ? `
            <div class="formula-box">
              Income (${escHtml(formatMoney(safe.monthlyIncome, settings))}) − Fixed Bills/EMIs/CC (${escHtml(formatMoney(safe.upcomingFixed, settings))}) − Savings Goal (${escHtml(formatMoney(safe.savingsTarget, settings))}) − Spent (${escHtml(formatMoney(safe.monthSpend, settings))})
              = <strong>${escHtml(formatMoney(safe.remainingPool, settings))}</strong> ÷ ${safe.remainingDays} days
            </div>` : ''}
        </div>

        <div class="card">
          <div class="card-header" style="margin-bottom:6px">
            <div class="card-title">${iconSvg('wallet')} Cash Flow &amp; Net Worth</div>
            <span class="chip chip-green">Self-Transfers Excluded</span>
          </div>
          <div style="font-size:26px;font-weight:800;letter-spacing:-0.03em">${escHtml(formatMoney(netWorth, settings))} <span class="muted" style="font-weight:600">Net Worth</span></div>
          <div class="nw-grid">
            <div class="nw-box">
              <div class="nw-box-label">Bank + UPI + Cash</div>
              <div class="nw-box-val" style="color:var(--green)">${escHtml(formatMoney(liquidAssets, settings))}</div>
            </div>
            <div class="nw-box">
              <div class="nw-box-label">Credit Card Dues</div>
              <div class="nw-box-val" style="color:var(--red)">${escHtml(formatMoney(-effectiveDues, settings))}</div>
            </div>
            <div class="nw-box">
              <div class="nw-box-label">Net Cash Flow</div>
              <div class="nw-box-val" style="color:${periodInflow - periodOutflow >= 0 ? 'var(--green)' : 'var(--red)'}">${escHtml(formatMoney(periodInflow - periodOutflow, settings, { showSign: true }))}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Period Switcher -->
      <div class="card" style="padding:12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
          <div class="segmented cols-4" style="flex:1;min-width:240px">
            <button class="seg-btn ${state.dashPeriod === 'daily' ? 'active' : ''}" data-action="set-period" data-period="daily">Daily</button>
            <button class="seg-btn ${state.dashPeriod === 'weekly' ? 'active' : ''}" data-action="set-period" data-period="weekly">Weekly</button>
            <button class="seg-btn ${state.dashPeriod === 'monthly' ? 'active' : ''}" data-action="set-period" data-period="monthly">Monthly</button>
            <button class="seg-btn ${state.dashPeriod === 'custom' ? 'active' : ''}" data-action="set-period" data-period="custom">Custom</button>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <button class="btn-soft" data-action="shift-period" data-dir="-1">◀</button>
            <span style="font-size:12.5px;font-weight:700;min-width:120px;text-align:center">${escHtml(label)}</span>
            <button class="btn-soft" data-action="shift-period" data-dir="1">▶</button>
          </div>
        </div>
        ${state.dashPeriod === 'custom' ? `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
            <input class="input" type="date" id="customStartInput" value="${escHtml(state.customStart)}" />
            <input class="input" type="date" id="customEndInput" value="${escHtml(state.customEnd)}" />
          </div>` : ''}
      </div>

      <!-- Charts -->
      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Spending Trend</div>
            <span class="chip chip-red">Outflow ${escHtml(formatMoney(periodOutflow, settings))}</span>
          </div>
          <canvas class="chart-canvas" id="dashTrendCanvas"></canvas>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">Category Breakdown</div>
            <span class="muted">Click any category to filter</span>
          </div>
          ${renderCategoryDonutHtml(donutSlices, settings)}
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-header">
            <div class="card-title">Income vs. Expense</div>
            <span class="chip chip-green">Inflow ${escHtml(formatMoney(periodInflow, settings))}</span>
          </div>
          <canvas class="chart-canvas" id="dashBarCanvas"></canvas>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">${iconSvg('tag')} Top #Tags (${escHtml(state.dashPeriod)})</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${topTagsHtml || '<p class="muted">Add #tags like #vacation or #reimbursable to transactions to track events here.</p>'}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="card-title">Recent Activity</div>
          <button class="btn-soft" data-action="nav" data-nav="transactions">View All</button>
        </div>
        <div class="tx-list">
          ${recentHtml || '<p class="muted" style="text-align:center;padding:18px">No transactions yet. Tap + Add Expense to record your first entry.</p>'}
        </div>
      </div>
    </div>`;
}

export function hydrateDashboardCharts(ctx) {
  const { state, data } = ctx;
  const { start, end } = getPeriodBounds(state.dashPeriod, state.dashAnchor, state.customStart, state.customEnd);
  const periodTxs = data.transactions.filter(tx => {
    if (tx.isSelfTransfer) return false;
    const dt = new Date(tx.date);
    return dt >= start && dt <= end;
  });

  const labels = [];
  const expBuckets = [];
  const incBuckets = [];

  if (state.dashPeriod === 'daily') {
    const slots = ['0-4', '4-8', '8-12', '12-16', '16-20', '20-24'];
    slots.forEach(s => { labels.push(s + 'h'); expBuckets.push(0); incBuckets.push(0); });
    for (const tx of periodTxs) {
      const idx = Math.min(5, Math.floor(new Date(tx.date).getHours() / 4));
      if (tx.type === 'expense') expBuckets[idx] += Number(tx.amount) || 0;
      if (tx.type === 'income') incBuckets[idx] += Number(tx.amount) || 0;
    }
  } else if (state.dashPeriod === 'weekly') {
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    dayNames.forEach(d => { labels.push(d); expBuckets.push(0); incBuckets.push(0); });
    for (const tx of periodTxs) {
      const d = new Date(tx.date).getDay();
      const idx = d === 0 ? 6 : d - 1;
      if (tx.type === 'expense') expBuckets[idx] += Number(tx.amount) || 0;
      if (tx.type === 'income') incBuckets[idx] += Number(tx.amount) || 0;
    }
  } else {
    for (let w = 1; w <= 5; w++) { labels.push(`W${w}`); expBuckets.push(0); incBuckets.push(0); }
    for (const tx of periodTxs) {
      const dayOfMonth = new Date(tx.date).getDate();
      const idx = Math.min(4, Math.floor((dayOfMonth - 1) / 7));
      if (tx.type === 'expense') expBuckets[idx] += Number(tx.amount) || 0;
      if (tx.type === 'income') incBuckets[idx] += Number(tx.amount) || 0;
    }
  }

  drawTrendChart(document.getElementById('dashTrendCanvas'), labels, expBuckets, data.settings);
  drawComparisonBarChart(document.getElementById('dashBarCanvas'), labels, incBuckets, expBuckets);
}

export function renderCompactTxRow(tx, catMap, walletMap, settings) {
  const cat = catMap.get(tx.categoryId) || { name: tx.type === 'transfer' ? 'Transfer' : 'General', icon: tx.type === 'transfer' ? 'swap' : 'wallet', color: '#6366f1' };
  const wallet = walletMap.get(tx.walletId)?.name || 'Wallet';
  const tagsHtml = (tx.tags || []).map(t => `<span class="tag-pill">${escHtml(t)}</span>`).join('');
  const splitBadge = Array.isArray(tx.splits) && tx.splits.length ? `<span class="chip chip-blue">Split ×${tx.splits.length}</span>` : '';
  const selfBadge = tx.isSelfTransfer ? `<span class="chip">Self-Transfer</span>` : '';
  const amtClass = tx.type === 'income' ? 'income' : (tx.type === 'transfer' ? 'transfer' : 'expense');
  const signed = tx.type === 'income' ? tx.amount : (tx.type === 'transfer' ? tx.amount : -tx.amount);

  return `
    <div class="tx-row clickable" data-action="edit-tx" data-id="${escHtml(tx.id)}">
      <div class="cat-badge" style="background:${escHtml(cat.color)}22;color:${escHtml(cat.color)}">${iconSvg(cat.icon)}</div>
      <div class="tx-info">
        <div class="tx-title">${escHtml(tx.merchant || cat.name)} ${splitBadge} ${selfBadge}</div>
        <div class="tx-meta"><span>${escHtml(cat.name)} • ${escHtml(wallet)} • ${escHtml(formatShortDate(tx.date))}</span> ${tagsHtml}</div>
      </div>
      <div class="tx-amount ${amtClass}">${tx.type === 'transfer' ? escHtml(formatMoney(tx.amount, settings)) : escHtml(formatMoney(signed, settings, { showSign: true }))}</div>
    </div>`;
}
