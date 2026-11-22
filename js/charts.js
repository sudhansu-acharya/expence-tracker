// Zero-CDN High-DPI Canvas & SVG Chart Engine
import { formatMoney, escHtml } from './format.js';

function cssVar(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function drawTrendChart(canvas, labels, values, settings) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, rect.width || 340);
  const height = 185;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const accent = cssVar('--accent', '#0d9488');
  const text3 = cssVar('--text-3', '#64748b');
  const border = cssVar('--border', 'rgba(15,23,42,0.08)');
  const bgCard = cssVar('--bg-card', '#ffffff');

  ctx.clearRect(0, 0, width, height);

  const padL = 16, padR = 16, padT = 20, padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxVal = Math.max(...values, 1) * 1.18;

  // Horizontal grid lines
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padT + (plotH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(width - padR, y);
    ctx.stroke();
  }

  if (!values.length) return;
  const stepX = values.length > 1 ? plotW / (values.length - 1) : 0;
  const pts = values.map((v, i) => ({
    x: padL + (values.length > 1 ? i * stepX : plotW / 2),
    y: padT + plotH - (v / maxVal) * plotH,
    v,
    label: labels[i]
  }));

  // Gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, accent + '44');
  grad.addColorStop(1, accent + '03');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, padT + plotH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Dots + Labels
  ctx.font = '600 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  const labelStride = Math.max(1, Math.ceil(pts.length / 7));
  pts.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = bgCard;
    ctx.stroke();

    if (i % labelStride === 0 || i === pts.length - 1) {
      ctx.fillStyle = text3;
      ctx.fillText(p.label, p.x, height - 8);
    }
  });

  // Top value annotation
  const peak = pts.reduce((a, b) => (b.v > a.v ? b : a), pts[0]);
  if (peak.v > 0) {
    ctx.fillStyle = accent;
    ctx.font = '700 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(formatMoney(peak.v, settings), Math.min(Math.max(peak.x, 42), width - 42), Math.max(peak.y - 8, 12));
  }
}

export function drawComparisonBarChart(canvas, labels, incomeVals, expenseVals) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, rect.width || 340);
  const height = 185;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const green = cssVar('--green', '#10b981');
  const red = cssVar('--red', '#ef4444');
  const text3 = cssVar('--text-3', '#64748b');
  const border = cssVar('--border', 'rgba(15,23,42,0.08)');

  ctx.clearRect(0, 0, width, height);
  const padL = 14, padR = 14, padT = 18, padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxVal = Math.max(...incomeVals, ...expenseVals, 1) * 1.15;

  ctx.strokeStyle = border;
  ctx.beginPath();
  ctx.moveTo(padL, padT + plotH);
  ctx.lineTo(width - padR, padT + plotH);
  ctx.stroke();

  const groupW = plotW / Math.max(labels.length, 1);
  const barW = Math.min(18, Math.max(7, groupW * 0.28));

  ctx.font = '600 10.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';

  labels.forEach((lbl, i) => {
    const cx = padL + groupW * i + groupW / 2;
    const incH = (incomeVals[i] / maxVal) * plotH;
    const expH = (expenseVals[i] / maxVal) * plotH;

    ctx.fillStyle = green;
    ctx.beginPath();
    ctx.roundRect(cx - barW - 2, padT + plotH - incH, barW, Math.max(incH, 0), [5, 5, 0, 0]);
    ctx.fill();

    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.roundRect(cx + 2, padT + plotH - expH, barW, Math.max(expH, 0), [5, 5, 0, 0]);
    ctx.fill();

    ctx.fillStyle = text3;
    ctx.fillText(lbl, cx, height - 8);
  });
}

export function renderCategoryDonutHtml(slices, settings) {
  const total = slices.reduce((s, x) => s + x.amount, 0);
  if (total <= 0) {
    return '<p class="muted" style="text-align:center;padding:26px 0">No expenses recorded in this period.</p>';
  }
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;

  const rings = slices.map(s => {
    const len = (s.amount / total) * c;
    const seg = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${escHtml(s.color)}" stroke-width="15" stroke-dasharray="${len.toFixed(1)} ${(c - len).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" transform="rotate(-90 60 60)"><title>${escHtml(s.name)}: ${escHtml(formatMoney(s.amount, settings))}</title></circle>`;
    offset += len;
    return seg;
  }).join('');

  const legend = slices.slice(0, 6).map(s => `
    <div class="legend-item" data-drill-cat="${escHtml(s.id)}">
      <div class="legend-left">
        <span class="legend-dot" style="background:${escHtml(s.color)}"></span>
        <span>${escHtml(s.name)}</span>
      </div>
      <span style="font-weight:700">${escHtml(formatMoney(s.amount, settings))} <span class="muted">(${Math.round((s.amount / total) * 100)}%)</span></span>
    </div>`).join('');

  return `
    <div class="donut-layout">
      <svg width="124" height="124" viewBox="0 0 120 120" style="flex-shrink:0">
        ${rings}
        <text x="60" y="56" text-anchor="middle" font-size="9.5" fill="var(--text-3)" font-weight="700">SPENT</text>
        <text x="60" y="71" text-anchor="middle" font-size="12" fill="var(--text-1)" font-weight="800">${escHtml(formatMoney(total, settings))}</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>`;
}
