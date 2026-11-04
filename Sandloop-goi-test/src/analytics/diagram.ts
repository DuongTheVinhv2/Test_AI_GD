import type { JourneyResult, Sample } from './journey';

/**
 * The journey as a node diagram in the style of Loopcraft (Machinations): sources, pools, converters, gates, drains.
 * Nodes show what the crowd is doing at the chosen moment; edges animate when resources flow through them.
 */
type Kind = 'source' | 'pool' | 'converter' | 'gate' | 'drain' | 'delay' | 'end';
const META: Record<Kind, { color: string; symbol: string; name: string }> = {
  source: { color: '#299b78', symbol: '△', name: 'Nguồn' },
  pool: { color: '#4486d5', symbol: '○', name: 'Kho' },
  converter: { color: '#9a71cc', symbol: '▱', name: 'Chuyển đổi' },
  gate: { color: '#d69b35', symbol: '◇', name: 'Cổng' },
  drain: { color: '#d77971', symbol: '▽', name: 'Tiêu hao' },
  delay: { color: '#6b9ca3', symbol: '◷', name: 'Chờ' },
  end: { color: '#ba708c', symbol: '▣', name: 'Kết thúc' },
};

interface NodeDef {
  id: string; label: string; kind: Kind; x: number; y: number;
  value: (s: Sample, j: JourneyResult) => string;
  sub: (s: Sample, p: Sample, j: JourneyResult, dtH: number) => string;
}
interface EdgeDef { from: string; to: string; label?: string; rate: (s: Sample, p: Sample) => number; bend?: number }

const n0 = (v: number) => Math.round(v).toLocaleString('vi-VN');
const hr = (v: number, dtH: number) => (dtH > 0 ? `${n0(v / dtH)}/giờ` : '–');
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const pct = (v: number) => `${Math.round(v * 100)}%`;

const NODES: NodeDef[] = [
  { id: 'new', label: 'Người chơi mới', kind: 'source', x: 80, y: 120, value: (_s, j) => n0(j.players), sub: () => 'cài game lúc 0h' },
  { id: 'in', label: 'Đang trong game', kind: 'pool', x: 300, y: 120, value: (s) => n0(sum(s.active)), sub: (s, _p, j) => { const t = sum(s.active); if (!t) return '–'; const avg = s.active.reduce((a, n, i) => a + n * (j.levels[i].level), 0) / t; return `màn trung bình ${avg.toFixed(1)}`; } },
  { id: 'play', label: 'Chơi một lượt', kind: 'converter', x: 520, y: 120, value: (s) => n0(s.cumAttempts), sub: (s, p, _j, h) => hr(s.cumAttempts - p.cumAttempts, h) },
  { id: 'result', label: 'Kết quả lượt', kind: 'gate', x: 740, y: 120, value: (s) => (s.cumAttempts ? pct(s.cumWins / s.cumAttempts) : '–'), sub: () => 'tỉ lệ thắng' },
  { id: 'wins', label: 'Qua màn', kind: 'pool', x: 960, y: 50, value: (s) => n0(s.cumWins), sub: (s, p, _j, h) => hr(s.cumWins - p.cumWins, h) },
  { id: 'losses', label: 'Thua', kind: 'pool', x: 960, y: 190, value: (s) => n0(s.cumLosses), sub: (s, p, _j, h) => hr(s.cumLosses - p.cumLosses, h) },
  { id: 'hearts', label: 'Tim', kind: 'pool', x: 740, y: 330, value: (s) => s.avgHearts.toFixed(1), sub: () => 'trung bình / người' },
  { id: 'empty', label: 'Hết tim', kind: 'gate', x: 520, y: 330, value: (s) => n0(s.waiting), sub: () => 'người đang chờ tim' },
  { id: 'ad', label: 'Xem quảng cáo', kind: 'converter', x: 300, y: 260, value: (s) => n0(s.cumAds), sub: (s, p, _j, h) => hr(s.cumAds - p.cumAds, h) },
  { id: 'buy', label: 'Mua tim', kind: 'converter', x: 300, y: 400, value: (s) => n0(s.cumBuys), sub: (s, p, _j, h) => hr(s.cumBuys - p.cumBuys, h) },
  { id: 'wait', label: 'Chờ hồi tim', kind: 'delay', x: 520, y: 460, value: (s) => n0(s.cumWaits), sub: () => 'lần chờ' },
  { id: 'coins', label: 'Xu', kind: 'pool', x: 80, y: 400, value: (s) => n0(s.avgCoins), sub: () => 'trung bình / người' },
  { id: 'quit', label: 'Bỏ chơi', kind: 'end', x: 960, y: 330, value: (s) => n0(s.quitLoss + s.quitHearts), sub: (s) => `sau thua ${n0(s.quitLoss)} · hết tim ${n0(s.quitHearts)}` },
  { id: 'leave', label: 'Rời sau khi thắng', kind: 'drain', x: 960, y: 460, value: (s) => n0(s.leftAfterWin), sub: () => 'thoát game' },
  { id: 'done', label: 'Hoàn thành', kind: 'end', x: 740, y: 50, value: (s) => n0(s.done), sub: () => 'qua hết các màn' },
];

const EDGES: EdgeDef[] = [
  { from: 'new', to: 'in', rate: (s, p) => (p.t === 0 && s.t === 0 ? 1 : 0) },
  { from: 'in', to: 'play', rate: (s, p) => s.cumAttempts - p.cumAttempts },
  { from: 'play', to: 'result', rate: (s, p) => s.cumAttempts - p.cumAttempts },
  { from: 'result', to: 'wins', label: 'thắng', rate: (s, p) => s.cumWins - p.cumWins },
  { from: 'result', to: 'losses', label: 'thua', rate: (s, p) => s.cumLosses - p.cumLosses },
  { from: 'wins', to: 'in', label: 'màn kế', rate: (s, p) => s.cumWins - p.cumWins, bend: -70 },
  { from: 'wins', to: 'done', rate: (s, p) => s.done - p.done },
  { from: 'wins', to: 'coins', label: 'thưởng xu', rate: (s, p) => s.cumCoinsIn - p.cumCoinsIn, bend: 120 },
  { from: 'losses', to: 'hearts', label: '−1 tim', rate: (s, p) => s.cumLosses - p.cumLosses },
  { from: 'hearts', to: 'empty', label: 'khi hết', rate: (s) => s.waiting },
  { from: 'empty', to: 'ad', rate: (s, p) => s.cumAds - p.cumAds },
  { from: 'empty', to: 'buy', rate: (s, p) => s.cumBuys - p.cumBuys },
  { from: 'empty', to: 'wait', rate: (s, p) => s.cumWaits - p.cumWaits },
  { from: 'ad', to: 'hearts', label: '+1 tim', rate: (s, p) => s.cumAds - p.cumAds, bend: -50 },
  { from: 'buy', to: 'hearts', label: '+ tim', rate: (s, p) => s.cumBuys - p.cumBuys, bend: 60 },
  { from: 'wait', to: 'hearts', rate: (s, p) => s.cumWaits - p.cumWaits },
  { from: 'coins', to: 'buy', label: 'trả xu', rate: (s, p) => s.cumCoinsOut - p.cumCoinsOut },
  { from: 'losses', to: 'quit', label: 'bỏ chơi', rate: (s, p) => s.quitLoss - p.quitLoss },
  { from: 'empty', to: 'quit', rate: (s, p) => s.quitHearts - p.quitHearts, bend: 70 },
  { from: 'wins', to: 'leave', rate: (s, p) => s.leftAfterWin - p.leftAfterWin, bend: 150 },
];

const W = 1040, H = 520, NW = 150, NH = 64;
const NS = 'http://www.w3.org/2000/svg';

export interface Diagram {
  svg: SVGSVGElement;
  update: (index: number) => void;
}

function edgePath(a: NodeDef, b: NodeDef, bend = 0): { d: string; mx: number; my: number } {
  const ax = a.x, ay = a.y, bx = b.x, by = b.y;
  // leave from the side that faces the target
  const dx = bx - ax, dy = by - ay;
  const horiz = Math.abs(dx) * 0.6 > Math.abs(dy);
  const sx = horiz ? ax + Math.sign(dx) * (NW / 2) : ax, sy = horiz ? ay : ay + Math.sign(dy) * (NH / 2);
  const ex = horiz ? bx - Math.sign(dx) * (NW / 2) : bx, ey = horiz ? by : by - Math.sign(dy) * (NH / 2);
  const mx = (sx + ex) / 2, my = (sy + ey) / 2;
  const cx = horiz ? mx : mx + bend, cy = horiz ? my + bend : my;
  return { d: `M${sx},${sy} Q${cx},${cy} ${ex},${ey}`, mx: (sx + 2 * cx + ex) / 4, my: (sy + 2 * cy + ey) / 4 };
}

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

export function buildDiagram(j: JourneyResult): Diagram {
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'diagram', role: 'img' });
  svg.appendChild(svgEl('defs')).innerHTML = '<marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#8a97b4"/></marker>';
  const byId = new Map(NODES.map((n) => [n.id, n]));
  const dtH = (j.samples[1]?.t ?? 1) / 3600;

  // normalise the width of each edge against its own busiest moment
  const maxRate = EDGES.map((e) => {
    let m = 0;
    for (let i = 1; i < j.samples.length; i++) m = Math.max(m, e.rate(j.samples[i], j.samples[i - 1]));
    return m || 1;
  });

  const edgeEls = EDGES.map((e, i) => {
    const a = byId.get(e.from)!, b = byId.get(e.to)!;
    const { d, mx, my } = edgePath(a, b, e.bend ?? 0);
    const g = svgEl('g');
    const base = svgEl('path', { d, class: 'edge-base', fill: 'none' });
    const flow = svgEl('path', { d, class: 'edge-flow', fill: 'none', 'marker-end': 'url(#arr)' });
    g.append(base, flow);
    if (e.label) g.appendChild(svgEl('text', { x: mx, y: my - 5, class: 'edge-label', 'text-anchor': 'middle' }, e.label));
    svg.appendChild(g);
    return { flow, max: maxRate[i], e };
  });

  const nodeEls = NODES.map((n) => {
    const m = META[n.kind];
    const g = svgEl('g', { class: 'node', transform: `translate(${n.x - NW / 2},${n.y - NH / 2})` });
    g.appendChild(svgEl('rect', { width: NW, height: NH, rx: 14, fill: '#fff', stroke: m.color, 'stroke-width': 2.4 }));
    g.appendChild(svgEl('rect', { width: 30, height: NH, rx: 14, fill: m.color }));
    g.appendChild(svgEl('rect', { x: 16, width: 14, height: NH, fill: m.color }));
    g.appendChild(svgEl('text', { x: 15, y: NH / 2 + 7, class: 'node-sym', 'text-anchor': 'middle' }, m.symbol));
    g.appendChild(svgEl('text', { x: 38, y: 17, class: 'node-label' }, n.label));
    const value = svgEl('text', { x: 38, y: 40, class: 'node-value' }, '–');
    const sub = svgEl('text', { x: 38, y: 55, class: 'node-sub' }, '');
    g.append(value, sub);
    svg.appendChild(g);
    return { n, value, sub };
  });

  const update = (index: number) => {
    const i = Math.max(0, Math.min(j.samples.length - 1, index));
    const s = j.samples[i], p = j.samples[Math.max(0, i - 1)];
    for (const { n, value, sub } of nodeEls) {
      value.textContent = n.value(s, j);
      sub.textContent = n.sub(s, p, j, dtH);
    }
    for (const { flow, max, e } of edgeEls) {
      const r = e.rate(s, p);
      const k = Math.min(1, r / max);
      flow.setAttribute('stroke-width', String(1.5 + 6 * Math.sqrt(k)));
      flow.classList.toggle('on', r > 0);
      flow.style.opacity = r > 0 ? String(0.45 + 0.55 * Math.sqrt(k)) : '0.18';
    }
  };
  update(0);
  return { svg, update };
}

export const DIAGRAM_LEGEND = (Object.keys(META) as Kind[]).map((k) => ({ ...META[k], kind: k }));
