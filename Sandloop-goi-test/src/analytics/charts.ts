import type { JourneyResult, Sample } from './journey';
import type { Thresholds } from './issues';
import { cellOf, mixWinRate, type Dataset, type LevelMeta } from './types';

/** Hand-written SVG charts. Every function returns a string; a column of data-level attributes lets the page react to clicks. */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (v: number) => `${Math.round(v * 100)}%`;
const C = { ink: '#1b2550', muted: '#6b7a99', grid: '#e3ecf7', blue: '#3d9bff', green: '#1f9d55', orange: '#e8860c', red: '#d6372c', grey: '#aab4cb', band: 'rgba(31,157,85,0.11)' };

interface Frame { w: number; h: number; l: number; r: number; t: number; b: number }
const frame = (w: number, h: number, l = 44, r = 14, t = 14, b = 34): Frame => ({ w, h, l, r, t, b });
const px = (f: Frame, i: number, n: number) => f.l + ((i + 0.5) / n) * (f.w - f.l - f.r);
const py = (f: Frame, v: number, max: number) => f.t + (1 - v / max) * (f.h - f.t - f.b);
const open = (f: Frame, extra = '') => `<svg viewBox="0 0 ${f.w} ${f.h}" class="chart" role="img" ${extra}>`;

function yGrid(f: Frame, max: number, fmt: (v: number) => string, steps = 4): string {
  let s = '<g class="ax">';
  for (let i = 0; i <= steps; i++) {
    const v = (max * i) / steps, y = py(f, v, max);
    s += `<line x1="${f.l}" x2="${f.w - f.r}" y1="${y}" y2="${y}" stroke="${C.grid}"/><text x="${f.l - 6}" y="${y + 4}" text-anchor="end">${fmt(v)}</text>`;
  }
  return s + '</g>';
}
function xLabels(f: Frame, labels: string[], sel?: number): string {
  let s = '<g class="ax">';
  labels.forEach((l, i) => {
    const on = sel !== undefined && String(sel) === l;
    s += `<text x="${px(f, i, labels.length)}" y="${f.h - f.b + 16}" text-anchor="middle"${on ? ' class="on"' : ''}>${esc(l)}</text>`;
  });
  return s + '</g>';
}
/** Invisible full-height columns: click a level anywhere in the chart. */
function hits(f: Frame, levels: number[]): string {
  const cw = (f.w - f.l - f.r) / levels.length;
  return levels.map((L, i) => `<rect class="hit" data-level="${L}" x="${f.l + i * cw}" y="${f.t}" width="${cw}" height="${f.h - f.t - f.b}" fill="transparent"/>`).join('');
}
function selBand(f: Frame, levels: number[], sel?: number): string {
  const i = levels.indexOf(sel ?? -1);
  if (i < 0) return '';
  const cw = (f.w - f.l - f.r) / levels.length;
  return `<rect x="${f.l + i * cw}" y="${f.t}" width="${cw}" height="${f.h - f.t - f.b}" fill="rgba(61,155,255,0.10)"/>`;
}
const empty = (msg: string) => `<div class="empty">${esc(msg)}</div>`;

// ---------------------------------------------------------------- 1. difficulty curve
export function difficultyChart(d: Dataset, t: Thresholds, sel?: number): string {
  const levels = d.levels.map((l) => l.level);
  if (!levels.length) return empty('Chưa có dữ liệu.');
  const f = frame(780, 330);
  let s = open(f);
  s += yGrid(f, 1, pct);
  // target band
  s += `<rect x="${f.l}" y="${py(f, 0.9, 1)}" width="${f.w - f.l - f.r}" height="${py(f, t.winLo, 1) - py(f, 0.9, 1)}" fill="${C.band}"/>`;
  s += `<text x="${f.w - f.r - 4}" y="${py(f, 0.9, 1) + 13}" text-anchor="end" class="note">dải mục tiêu ${pct(t.winLo)}–90%</text>`;
  s += selBand(f, levels, sel) + xLabels(f, levels.map(String), sel);
  for (const p of d.personas) {
    const pts = levels.map((L, i) => { const c = cellOf(d, L, p.id); return c ? { x: px(f, i, levels.length), y: py(f, c.winRate, 1), c, L } : null; });
    const path = pts.map((q, i) => (q ? `${pts.slice(0, i).some(Boolean) && pts[i - 1] ? 'L' : 'M'}${q.x},${q.y}` : '')).join('');
    s += `<path d="${path}" fill="none" stroke="${p.color}" stroke-width="2" opacity="0.85"/>`;
    for (const q of pts) if (q) s += `<circle cx="${q.x}" cy="${q.y}" r="3.2" fill="${p.color}"><title>${esc(p.name)} · màn ${q.L}: thắng ${pct(q.c.winRate)} (${q.c.runs} lượt)</title></circle>`;
  }
  // population mix
  const mix = levels.map((L, i) => ({ x: px(f, i, levels.length), y: py(f, mixWinRate(d, L), 1), L, v: mixWinRate(d, L) }));
  s += `<path d="${mix.map((q, i) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join('')}" fill="none" stroke="${C.ink}" stroke-width="3.2" stroke-dasharray="1 0"/>`;
  for (const q of mix) {
    const bad = q.v < t.winLo || (q.L > t.easyLevels && q.v > t.winHi);
    s += `<circle cx="${q.x}" cy="${q.y}" r="${bad ? 6.5 : 4.5}" fill="${bad ? C.red : C.ink}" stroke="#fff" stroke-width="1.6"><title>Trung bình cả tệp · màn ${q.L}: ${pct(q.v)}</title></circle>`;
  }
  s += hits(f, levels) + '</svg>';
  const legend = `<div class="legend">${d.personas.map((p) => `<span><i style="background:${p.color}"></i>${esc(p.name)} ${pct(p.share)}</span>`).join('')}<span><i style="background:${C.ink};height:4px"></i>Trung bình cả tệp</span><span><i class="ring"></i>Ngoài dải</span></div>`;
  return s + legend;
}

// ---------------------------------------------------------------- 2. spikes
export function spikeChart(d: Dataset, t: Thresholds, sel?: number): string {
  const levels = d.levels.map((l) => l.level);
  if (levels.length < 2) return empty('Cần ít nhất 2 màn.');
  const f = frame(780, 250);
  const deltas = levels.map((L, i) => (i ? mixWinRate(d, L) - mixWinRate(d, levels[i - 1]) : 0));
  const max = Math.max(0.5, ...deltas.map(Math.abs));
  const y0 = f.t + (f.h - f.t - f.b) / 2;
  const sc = (v: number) => (v / max) * ((f.h - f.t - f.b) / 2);
  let s = open(f) + selBand(f, levels, sel);
  s += `<g class="ax"><line x1="${f.l}" x2="${f.w - f.r}" y1="${y0}" y2="${y0}" stroke="${C.muted}"/>`;
  for (const v of [-max, -max / 2, max / 2, max]) s += `<text x="${f.l - 6}" y="${y0 - sc(v) + 4}" text-anchor="end">${v > 0 ? '+' : ''}${Math.round(v * 100)}</text>`;
  s += '</g>' + xLabels(f, levels.map(String), sel);
  const bw = Math.min(34, ((f.w - f.l - f.r) / levels.length) * 0.6);
  deltas.forEach((v, i) => {
    if (!i) return;
    const x = px(f, i, levels.length) - bw / 2, h = Math.abs(sc(v));
    const bad = -v >= t.spike;
    s += `<rect x="${x}" y="${v >= 0 ? y0 - h : y0}" width="${bw}" height="${Math.max(1, h)}" rx="3" fill="${bad ? C.red : v >= 0 ? C.green : C.orange}" opacity="${bad ? 1 : 0.7}"><title>Màn ${levels[i]}: ${v >= 0 ? '+' : ''}${Math.round(v * 100)} điểm so với màn ${levels[i - 1]}</title></rect>`;
  });
  // threshold
  s += `<line x1="${f.l}" x2="${f.w - f.r}" y1="${y0 + sc(t.spike)}" y2="${y0 + sc(t.spike)}" stroke="${C.red}" stroke-dasharray="4 4" opacity="0.6"/>`;
  s += `<text x="${f.w - f.r - 4}" y="${y0 + sc(t.spike) - 4}" text-anchor="end" class="note">ngưỡng spike −${Math.round(t.spike * 100)} điểm</text>`;
  return s + hits(f, levels) + '</svg>';
}

// ---------------------------------------------------------------- 3. skill gap
export function skillGapChart(d: Dataset, sel?: number): string {
  const levels = d.levels.map((l) => l.level);
  if (!levels.length) return empty('Chưa có dữ liệu.');
  const f = frame(780, 250);
  const lo: number[] = [], hi: number[] = [], mid: number[] = [];
  for (const L of levels) {
    const v = d.personas.map((p) => cellOf(d, L, p.id)?.winRate).filter((x): x is number => x !== undefined);
    lo.push(v.length ? Math.min(...v) : 0); hi.push(v.length ? Math.max(...v) : 0); mid.push(mixWinRate(d, L));
  }
  let s = open(f) + yGrid(f, 1, pct) + selBand(f, levels, sel) + xLabels(f, levels.map(String), sel);
  const up = levels.map((_, i) => `${i ? 'L' : 'M'}${px(f, i, levels.length)},${py(f, hi[i], 1)}`).join('');
  const down = levels.map((_, i) => `L${px(f, levels.length - 1 - i, levels.length)},${py(f, lo[levels.length - 1 - i], 1)}`).join('');
  s += `<path d="${up}${down}Z" fill="rgba(61,155,255,0.22)" stroke="none"/>`;
  s += `<path d="${levels.map((_, i) => `${i ? 'L' : 'M'}${px(f, i, levels.length)},${py(f, hi[i], 1)}`).join('')}" fill="none" stroke="${C.green}" stroke-width="2"/>`;
  s += `<path d="${levels.map((_, i) => `${i ? 'L' : 'M'}${px(f, i, levels.length)},${py(f, lo[i], 1)}`).join('')}" fill="none" stroke="${C.red}" stroke-width="2"/>`;
  s += `<path d="${levels.map((_, i) => `${i ? 'L' : 'M'}${px(f, i, levels.length)},${py(f, mid[i], 1)}`).join('')}" fill="none" stroke="${C.ink}" stroke-width="2.4" stroke-dasharray="5 4"/>`;
  levels.forEach((L, i) => { s += `<circle cx="${px(f, i, levels.length)}" cy="${py(f, (hi[i] + lo[i]) / 2, 1)}" r="9" fill="transparent"><title>Màn ${L}: nhóm yếu nhất ${pct(lo[i])}, nhóm giỏi nhất ${pct(hi[i])}, chênh ${Math.round((hi[i] - lo[i]) * 100)} điểm</title></circle>`; });
  s += hits(f, levels) + '</svg>';
  return s + `<div class="legend"><span><i style="background:${C.green}"></i>Nhóm tốt nhất</span><span><i style="background:${C.red}"></i>Nhóm yếu nhất</span><span><i style="background:${C.ink};height:3px"></i>Trung bình cả tệp</span><span class="muted">Vùng xanh càng rộng thì kỹ năng càng quan trọng.</span></div>`;
}

// ---------------------------------------------------------------- 4. heatmap
const heat = (v: number) => {
  // red -> amber -> green
  const a = [214, 55, 44], b = [255, 205, 80], c = [60, 170, 100];
  const [p, q, k] = v < 0.5 ? [a, b, v / 0.5] : [b, c, (v - 0.5) / 0.5];
  return `rgb(${p.map((x, i) => Math.round(x + (q[i] - x) * k)).join(',')})`;
};
export function heatmap(d: Dataset, sel?: number): string {
  const levels = d.levels.map((l) => l.level);
  if (!levels.length) return empty('Chưa có dữ liệu.');
  const rows = [...d.personas.map((p) => ({ id: p.id, name: p.name, mix: false })), { id: '', name: 'Trung bình', mix: true }];
  let s = `<table class="heat"><thead><tr><th></th>${levels.map((L) => `<th class="${L === sel ? 'sel' : ''}" data-level="${L}">${L}</th>`).join('')}</tr></thead><tbody>`;
  for (const r of rows) {
    s += `<tr class="${r.mix ? 'mix' : ''}"><th>${esc(r.name)}</th>`;
    for (const L of levels) {
      const v = r.mix ? mixWinRate(d, L) : cellOf(d, L, r.id)?.winRate;
      s += v === undefined ? '<td class="na" title="Không có dữ liệu">–</td>' : `<td data-level="${L}" style="background:${heat(v)}" title="Màn ${L} · ${esc(r.name)}: ${pct(v)}">${Math.round(v * 100)}</td>`;
    }
    s += '</tr>';
  }
  return s + '</tbody></table>';
}

// ---------------------------------------------------------------- 5. where do they lose
export function lossChart(d: Dataset, sel?: number): string {
  const levels = d.levels.map((l) => l.level);
  if (!levels.length) return empty('Chưa có dữ liệu.');
  const f = frame(780, 250);
  let s = open(f) + yGrid(f, 1, pct) + selBand(f, levels, sel) + xLabels(f, levels.map(String), sel);
  const bw = Math.min(34, ((f.w - f.l - f.r) / levels.length) * 0.6);
  levels.forEach((L, i) => {
    let w = 0, sand = 0, near = 0, lossW = 0;
    for (const p of d.personas) {
      const c = cellOf(d, L, p.id);
      if (!c || c.sandLeftOnLoss === undefined) continue;
      const lw = p.share * (1 - c.winRate);
      lossW += lw; sand += lw * c.sandLeftOnLoss; near += lw * (c.nearMiss ?? 0); w += p.share;
    }
    if (lossW <= 0) { s += `<text x="${px(f, i, levels.length)}" y="${py(f, 0, 1) - 4}" text-anchor="middle" class="note">✓</text>`; return; }
    const left = sand / lossW, nm = near / lossW;
    const x = px(f, i, levels.length) - bw / 2;
    s += `<rect x="${x}" y="${py(f, left, 1)}" width="${bw}" height="${py(f, 0, 1) - py(f, left, 1)}" rx="3" fill="${left > 0.85 ? C.red : left > 0.5 ? C.orange : C.green}" opacity="0.8"><title>Màn ${L}: khi thua còn ${pct(left)} cát; ${pct(nm)} lượt thua là suýt thắng (<20% cát)</title></rect>`;
    s += `<circle cx="${px(f, i, levels.length)}" cy="${py(f, nm, 1)}" r="4" fill="${C.ink}"/>`;
  });
  s += hits(f, levels) + '</svg>';
  return s + `<div class="legend"><span><i style="background:${C.red}"></i>Thua sớm (còn &gt;85% cát)</span><span><i style="background:${C.orange}"></i>Thua giữa chừng</span><span><i style="background:${C.green}"></i>Thua gần cuối</span><span><i class="dot"></i>Tỉ lệ suýt thắng</span><span class="muted">✓ = không ai thua.</span></div>`;
}

// ---------------------------------------------------------------- 6. attempts to clear
export function attemptsChart(d: Dataset, level: number, quitAfterLoss: number): string {
  const p = mixWinRate(d, level);
  const f = frame(380, 230);
  const K = 8;
  const pass: number[] = [], quit: number[] = [];
  let alive = 1;
  for (let k = 1; k <= K; k++) {
    pass.push(alive * p);
    const lose = alive * (1 - p);
    quit.push(lose * quitAfterLoss);
    alive = lose * (1 - quitAfterLoss);
  }
  const max = Math.max(0.05, ...pass.map((v, i) => v + quit[i]));
  const top = Math.min(1, Math.ceil(max * 10) / 10);
  let s = open(f) + yGrid(f, top, pct) + xLabels(f, Array.from({ length: K }, (_, i) => String(i + 1)));
  const bw = ((f.w - f.l - f.r) / K) * 0.62;
  for (let k = 0; k < K; k++) {
    const x = px(f, k, K) - bw / 2;
    s += `<rect x="${x}" y="${py(f, pass[k], top)}" width="${bw}" height="${py(f, 0, top) - py(f, pass[k], top)}" fill="${C.green}" opacity="0.85"><title>Qua màn đúng ở lần thử ${k + 1}: ${(pass[k] * 100).toFixed(1)}%</title></rect>`;
    s += `<rect x="${x}" y="${py(f, pass[k] + quit[k], top)}" width="${bw}" height="${py(f, pass[k], top) - py(f, pass[k] + quit[k], top)}" fill="${C.red}" opacity="0.8"><title>Bỏ chơi sau lần thử ${k + 1}: ${(quit[k] * 100).toFixed(1)}%</title></rect>`;
  }
  s += `<text x="${f.w / 2}" y="${f.h - 2}" text-anchor="middle" class="note">lần thử thứ…</text></svg>`;
  return s + `<div class="legend"><span><i style="background:${C.green}"></i>Qua màn ở lần này</span><span><i style="background:${C.red}"></i>Bỏ chơi sau lần này</span><span class="muted">Còn ${pct(alive)} vẫn thử sau ${K} lần.</span></div>`;
}

// ---------------------------------------------------------------- 7. funnel
export function funnelChart(d: Dataset, j: JourneyResult | null, sel?: number): string {
  if (!j) return empty('Chạy mô phỏng hành trình để thấy phễu.');
  const levels = j.levels.map((l) => l.level);
  const f = frame(780, 270);
  const max = Math.max(1, ...j.levels.map((l) => l.entered));
  const top = Math.ceil(max / Math.pow(10, Math.max(0, String(Math.round(max)).length - 2))) * Math.pow(10, Math.max(0, String(Math.round(max)).length - 2));
  let s = open(f) + yGrid(f, top, (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v)))) + selBand(f, levels, sel) + xLabels(f, levels.map(String), sel);
  const bw = Math.min(40, ((f.w - f.l - f.r) / levels.length) * 0.62);
  j.levels.forEach((l, i) => {
    const x = px(f, i, levels.length) - bw / 2;
    const quit = l.quitLoss + l.quitHearts, left = l.leftAfterWin;
    const cont = Math.max(0, l.entered - quit - left);
    let y = py(f, 0, top);
    const seg = (n: number, color: string, label: string) => {
      const h = py(f, 0, top) - py(f, n, top);
      y -= h;
      return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" fill="${color}" opacity="0.85"><title>Màn ${l.level} · ${label}: ${n} người (${pct(l.entered ? n / l.entered : 0)} số người vào màn)</title></rect>`;
    };
    s += seg(cont, C.green, 'đi tiếp') + seg(left, C.grey, 'rời game sau khi thắng') + seg(quit, C.red, 'bỏ chơi tại màn');
    if (quit > 0 && quit / Math.max(1, l.entered) >= 0.1) s += `<text x="${px(f, i, levels.length)}" y="${y - 4}" text-anchor="middle" class="note bad">${pct(quit / l.entered)}</text>`;
  });
  // the GD export's measured funnel, scaled to the same player count
  if (d.measured && d.measured.length) {
    const first = d.measured[0].entered || 1;
    const k = j.players / first;
    const pts = d.measured.map((m) => ({ i: levels.indexOf(m.level), v: m.entered * k })).filter((q) => q.i >= 0);
    s += pts.map((q) => `<circle cx="${px(f, q.i, levels.length)}" cy="${py(f, q.v, top)}" r="4.5" fill="#fff" stroke="${C.ink}" stroke-width="2"><title>Bảng GD: ${Math.round(q.v)} người vào màn (quy về ${j.players} người)</title></circle>`).join('');
  }
  s += hits(f, levels) + '</svg>';
  return s + `<div class="legend"><span><i style="background:${C.green}"></i>Đi tiếp</span><span><i style="background:${C.grey}"></i>Rời game sau khi thắng</span><span><i style="background:${C.red}"></i>Bỏ chơi tại màn</span>${d.measured?.length ? '<span><i class="ring ink"></i>Số liệu bảng GD (đối chiếu)</span>' : ''}</div>`;
}

// ---------------------------------------------------------------- 8. structure vs win rate
export interface Metric { key: keyof LevelMeta; label: string }
export const METRICS: Metric[] = [
  { key: 'buckets', label: 'Số xô' }, { key: 'mystery', label: 'Xô bí ẩn' }, { key: 'colors', label: 'Số màu cát' },
  { key: 'depthFirst', label: 'Độ sâu tới màu cần đầu tiên' }, { key: 'depthMax', label: 'Xô nằm sâu nhất' }, { key: 'depthAvg', label: 'Độ sâu trung bình' },
  { key: 'openAtStart', label: 'Xô bấm được ngay' }, { key: 'openNeeded', label: 'Xô bấm được và đang cần' }, { key: 'firstTapGood', label: 'Lần bấm đầu đúng (0–1)' },
];

export function scatterChart(d: Dataset, metric: keyof LevelMeta, sel?: number): string {
  const pts = d.levels.map((l) => ({ L: l.level, name: l.name, x: l[metric] as number | undefined, y: mixWinRate(d, l.level) })).filter((p): p is { L: number; name: string; x: number; y: number } => typeof p.x === 'number');
  const label = METRICS.find((m) => m.key === metric)?.label ?? String(metric);
  if (pts.length < 3) return empty('Không đủ dữ liệu cấu trúc màn cho thông số này.');
  const f = frame(380, 260, 44, 16, 14, 40);
  const xs = pts.map((p) => p.x);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), span = x1 - x0 || 1;
  const X = (v: number) => f.l + ((v - x0) / span) * (f.w - f.l - f.r - 20) + 10;
  let s = open(f) + yGrid(f, 1, pct);
  for (const v of [x0, (x0 + x1) / 2, x1]) s += `<text x="${X(v)}" y="${f.h - f.b + 16}" text-anchor="middle" class="ax-t">${Math.round(v * 100) / 100}</text>`;
  s += `<text x="${f.w / 2}" y="${f.h - 4}" text-anchor="middle" class="note">${esc(label)}</text>`;
  // least squares line and correlation
  const n = pts.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = pts.reduce((a, p) => a + p.y, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
  const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  if (sxx > 0) {
    const b1 = sxy / sxx, b0 = my - b1 * mx;
    const ya = Math.max(0, Math.min(1, b0 + b1 * x0)), yb = Math.max(0, Math.min(1, b0 + b1 * x1));
    s += `<line x1="${X(x0)}" y1="${py(f, ya, 1)}" x2="${X(x1)}" y2="${py(f, yb, 1)}" stroke="${C.blue}" stroke-width="2" stroke-dasharray="5 4"/>`;
  }
  for (const p of pts) {
    const on = p.L === sel;
    s += `<circle class="hit" data-level="${p.L}" cx="${X(p.x)}" cy="${py(f, p.y, 1)}" r="${on ? 9 : 7}" fill="${on ? C.blue : '#fff'}" stroke="${C.ink}" stroke-width="1.6"><title>Màn ${p.L} ${esc(p.name)}: ${label} = ${Math.round(p.x * 100) / 100}, thắng ${pct(p.y)}</title></circle>`;
    s += `<text x="${X(p.x)}" y="${py(f, p.y, 1) + 3.6}" text-anchor="middle" class="pt${on ? ' on' : ''}">${p.L}</text>`;
  }
  s += '</svg>';
  const strength = Math.abs(r) >= 0.7 ? 'mạnh' : Math.abs(r) >= 0.4 ? 'vừa' : 'yếu';
  return s + `<div class="legend"><span>Hệ số tương quan r = <b>${r.toFixed(2)}</b> (${strength}${r < -0.1 ? ', càng cao càng khó' : r > 0.1 ? ', càng cao càng dễ' : ''})</span></div>`;
}

// ---------------------------------------------------------------- 9. crowd over time
export function timeChart(j: JourneyResult, cursor: number): string {
  const S = j.samples;
  const f = frame(780, 210, 44, 14, 12, 28);
  const N = j.players;
  const x = (t: number) => f.l + (t / j.endOfTime) * (f.w - f.l - f.r);
  const layers: { key: (s: Sample) => number; color: string; name: string }[] = [
    { key: (s) => s.done, color: C.green, name: 'Hoàn thành' },
    { key: (s) => s.active.reduce((a, b) => a + b, 0) - s.waiting, color: C.blue, name: 'Đang chơi' },
    { key: (s) => s.waiting, color: '#6b9ca3', name: 'Chờ hồi tim' },
    { key: (s) => s.leftAfterWin, color: C.grey, name: 'Rời sau khi thắng' },
    { key: (s) => s.quitLoss + s.quitHearts, color: C.red, name: 'Bỏ chơi' },
  ];
  let s = open(f) + yGrid(f, 1, pct);
  const base = new Array(S.length).fill(0);
  for (const ly of layers) {
    const top = S.map((q, i) => base[i] + ly.key(q) / N);
    const up = S.map((q, i) => `${i ? 'L' : 'M'}${x(q.t)},${py(f, top[i], 1)}`).join('');
    const down = S.map((q, i) => `L${x(S[S.length - 1 - i].t)},${py(f, base[S.length - 1 - i], 1)}`).join('');
    s += `<path d="${up}${down}Z" fill="${ly.color}" opacity="0.85"/>`;
    top.forEach((v, i) => (base[i] = v));
  }
  const hours = j.endOfTime / 3600;
  const tickEvery = hours > 48 ? 24 : hours > 12 ? 6 : hours > 3 ? 1 : 0.25;
  s += '<g class="ax">';
  for (let h = 0; h <= hours + 1e-9; h += tickEvery) s += `<text x="${x(h * 3600)}" y="${f.h - 8}" text-anchor="middle">${tickEvery < 1 ? `${Math.round(h * 60)}′` : `${h}h`}</text>`;
  s += '</g>';
  s += `<line x1="${x(cursor)}" x2="${x(cursor)}" y1="${f.t}" y2="${f.h - f.b}" stroke="${C.ink}" stroke-width="2"/>`;
  s += '</svg>';
  return s + `<div class="legend">${layers.slice().reverse().map((l) => `<span><i style="background:${l.color}"></i>${l.name}</span>`).join('')}<span class="muted">Trục ngang: thời gian từ lúc cài game.</span></div>`;
}

// ---------------------------------------------------------------- 10. players per level at a moment
export function crowdChart(j: JourneyResult, sample: Sample): string {
  const f = frame(520, 190, 40, 10, 12, 26);
  const levels = j.levels.map((l) => l.level);
  const max = Math.max(1, ...sample.active, j.players * 0.1);
  const top = Math.ceil((max * 1.1) / 50) * 50;
  let s = open(f) + yGrid(f, top, (v) => String(Math.round(v)), 3) + xLabels(f, levels.map(String));
  const bw = Math.min(26, ((f.w - f.l - f.r) / levels.length) * 0.62);
  sample.active.forEach((n, i) => {
    s += `<rect x="${px(f, i, levels.length) - bw / 2}" y="${py(f, n, top)}" width="${bw}" height="${py(f, 0, top) - py(f, n, top)}" rx="3" fill="${C.blue}" opacity="0.85"><title>Màn ${levels[i]}: ${n} người đang ở màn này</title></rect>`;
  });
  return s + '</svg>';
}
