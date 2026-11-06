// Single-series line chart with a touch crosshair. Labels are text, never HTML.

import { fmtNum, fmtShort, niceTicks } from './logic.js';

const HEIGHT = 208;
const M = { top: 26, right: 14, bottom: 26, left: 40 };

export function drawLineChart(container, points, { unit = '' } = {}) {
  container.textContent = '';
  const width = container.clientWidth || 320;
  const fmtValue = (v) => (unit ? `${fmtNum(v)} ${unit}` : fmtNum(v));

  const times = points.map((p) => Date.parse(p.date));
  const values = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(...values), Math.max(...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const plotW = width - M.left - M.right;
  const plotH = HEIGHT - M.top - M.bottom;
  const x = (t) => (tMax === tMin ? M.left + plotW / 2 : M.left + ((t - tMin) / (tMax - tMin)) * plotW);
  const y = (v) => M.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  const xy = points.map((p, i) => [x(times[i]), y(p.value)]);
  const path = xy.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)} ${b.toFixed(1)}`).join('');
  const bottom = M.top + plotH;
  const area = `${path}L${xy[xy.length - 1][0].toFixed(1)} ${bottom}L${xy[0][0].toFixed(1)} ${bottom}Z`;
  const [endX, endY] = xy[xy.length - 1];
  const lastLabelAnchor = endX > width - 60 ? 'end' : 'middle';

  const grid = ticks.map((t) => `
    <line class="c-grid" x1="${M.left}" x2="${width - M.right}" y1="${y(t)}" y2="${y(t)}"/>
    <text class="c-axis" x="${M.left - 8}" y="${y(t) + 4}" text-anchor="end">${fmtNum(t)}</text>`).join('');

  const axisDates = points.length > 1
    ? `<text class="c-axis" x="${M.left}" y="${HEIGHT - 6}">${fmtShort(points[0].date)}</text>
       <text class="c-axis" x="${width - M.right}" y="${HEIGHT - 6}" text-anchor="end">${fmtShort(points[points.length - 1].date)}</text>`
    : `<text class="c-axis" x="${endX}" y="${HEIGHT - 6}" text-anchor="middle">${fmtShort(points[0].date)}</text>`;

  const wrap = document.createElement('div');
  wrap.className = 'chart';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', `Chart with ${points.length} workouts, latest value ${fmtValue(values[values.length - 1])}`);
  wrap.innerHTML = `
    <svg width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" aria-hidden="true">
      ${grid}${axisDates}
      <path class="c-area" d="${area}"/>
      <path class="c-line" d="${path}"/>
      <line class="c-cross" y1="${M.top}" y2="${bottom}" visibility="hidden"/>
      <circle class="c-dot c-end" cx="${endX}" cy="${endY}" r="4"/>
      <circle class="c-dot c-active" r="5" visibility="hidden"/>
      <text class="c-label" x="${lastLabelAnchor === 'end' ? endX + 4 : endX}" y="${Math.max(14, endY - 12)}" text-anchor="${lastLabelAnchor}">${fmtValue(values[values.length - 1])}</text>
    </svg>
    <div class="c-tip" hidden><strong></strong><span></span></div>`;
  container.append(wrap);

  const cross = wrap.querySelector('.c-cross');
  const dot = wrap.querySelector('.c-active');
  const tip = wrap.querySelector('.c-tip');
  const [tipValue, tipDetail] = tip.children;
  let current = points.length - 1;

  function show(i) {
    current = i;
    const [px, py] = xy[i];
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', px);
    dot.setAttribute('cy', py);
    dot.setAttribute('visibility', 'visible');
    tipValue.textContent = fmtValue(points[i].value);
    tipDetail.textContent = `${fmtShort(points[i].date)} · ${points[i].detail}`;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.min(width - w - 2, Math.max(2, px - w / 2))}px`;
  }

  function nearest(clientX) {
    const px = clientX - wrap.getBoundingClientRect().left;
    let best = 0;
    for (let i = 1; i < xy.length; i += 1) {
      if (Math.abs(xy[i][0] - px) < Math.abs(xy[best][0] - px)) best = i;
    }
    return best;
  }

  wrap.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  wrap.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(Math.max(0, current - 1));
    if (e.key === 'ArrowRight') show(Math.min(points.length - 1, current + 1));
  });
}
