import type { Game } from '../core/game';
import { Rng } from '../core/rng';
import { COLOR_COUNT } from '../core/palette';
import { analyze, confirmedTaps, prepare, SEED, type Analysis, type DesignLevel } from './analyze';
import { cloneDef, rodCells } from './model';
import { addStructure, applyMarks, bucketCells, fillQueues, NO_MECH, type MechCounts } from './mech';
import { legalMoves, newGame, randomPlayout, search, searchWin, settle } from './solver';
import { HIT, type PathReport } from './fast';
import { tune } from './tune';

/**
 * Generator of the bucket puzzle for a picture and a wanted difficulty tag.
 *
 *  1. Peel the picture layer by layer, the way sand is picked up: a bucket reaches through fewer than `layer` grains of
 *     other colours. That gives every bucket a "wave": the earliest moment its colour can fill it.
 *  2. Split the buckets between the colours of the picture by sand amount, and place them on the floor cells.
 *       - Easy  : earliest waves at the front, so the buckets that can be tapped are the ones that can pick right now.
 *       - Hard  : a few late (buried) colours are pulled to the front as bait.
 *       - Super : the front is almost all bait, one good bucket hides among them.
 *  3. Run the real game on every candidate (random players + a solver) and keep the first one whose result matches the tag.
 */
export type Tag = 'easy' | 'hard' | 'super';

export interface GenOptions {
  tag: Tag;
  layer: number;
  budgetMs: number;
  seed: number;
  /** Allow carving the board into corridors when a free layout cannot reach the tag. */
  shape?: boolean;
  runs?: number;
  /** Share of the floor cells that get a bucket (1 = every cell, like the harder levels of the game). */
  fill?: number;
  /** Mechanics to put in the level (see MechCounts); the board and the buckets are generated around them. */
  mech?: MechCounts;
  /** Layouts (layoutSig) that must not come out again, so every Gen gives a different level. */
  avoid?: string[];
  /** Use the old random-restart generator (kept for comparison). */
  legacy?: boolean;
  onProgress?: (text: string) => void;
}

export interface GenResult {
  def: DesignLevel;
  analysis: Analysis | null;
  matched: boolean;
  tries: number;
  note: string;
  carved?: boolean;
  /** Why the wanted tag was not reached, and what to change. */
  hints?: string[];
}

interface Slot { color: number; wave: number }

/** Wave in which each bucket of every colour becomes fillable (peeling `layer` grains off every column per wave). */
function planBuckets(g: Game, layer: number, total: number): Slot[] {
  const s = g.sand;
  const present: number[] = [];
  for (let c = 0; c < COLOR_COUNT; c++) if (s.counts[c] > 0) present.push(c);
  const sum = present.reduce((a, c) => a + s.counts[c], 0);
  // buckets per colour: proportional to sand, at least one each
  const n = new Map<number, number>();
  let used = 0;
  for (const c of present) { const k = Math.max(1, Math.round((total * s.counts[c]) / sum)); n.set(c, k); used += k; }
  const byDesc = [...present].sort((a, b) => s.counts[b] - s.counts[a]);
  for (let i = 0; used !== total && i < 200; i++) {
    const c = byDesc[i % byDesc.length];
    if (used > total && n.get(c)! > 1) { n.set(c, n.get(c)! - 1); used--; }
    else if (used < total) { n.set(c, n.get(c)! + 1); used++; }
  }

  // peel
  const L = layer <= 0 ? 1e9 : layer;
  const cols: number[][] = [];
  for (let x = 0; x < s.w; x++) {
    const col: number[] = [];
    for (let y = 0; y < s.h; y++) { const v = s.cells[y * s.w + x]; if (v) col.push(v - 1); }
    cols.push(col);
  }
  const cum: number[][] = [];
  const run = new Array(COLOR_COUNT).fill(0);
  const pos = new Array(s.w).fill(0);
  for (let wave = 0; wave < 80; wave++) {
    let any = false;
    for (let x = 0; x < s.w; x++) {
      for (let k = 0; k < L && pos[x] < cols[x].length; k++) { run[cols[x][pos[x]++]]++; any = true; }
    }
    if (!any) break;
    cum.push(run.slice());
  }
  const out: Slot[] = [];
  for (const c of present) {
    const k = n.get(c)!;
    for (let j = 1; j <= k; j++) {
      const need = 0.9 * s.counts[c] * (j / k);
      let w = cum.findIndex((r) => r[c] >= need);
      if (w < 0) w = cum.length;
      out.push({ color: c, wave: w });
    }
  }
  return out;
}

interface Params { fill: number; bait: number; mystery: number; noise: number; tag?: Tag }

const LANE_ROWS = 7;

/** Columns used as one-cell-wide corridors when the board is carved: 3 for wide boards, else the two edges. */
export function laneColumns(cols: number): number[] {
  if (cols >= 5) return [0, Math.floor((cols - 1) / 2), cols - 1];
  if (cols >= 2) return [0, cols - 1];
  return [0];
}

function place(def: DesignLevel, slots: Slot[], p: Params, rng: Rng, lanes = false): DesignLevel {
  const d = cloneDef(def);
  const cols = d.tiles[0].length;
  // long queues are what make a wrong first tap costly: give carved Hard / Super boards at least LANE_ROWS rows
  while (lanes && p.tag !== 'easy' && d.tiles.length < LANE_ROWS) { d.tiles.push('o'.repeat(cols)); d.buckets.push(Array(cols).fill('.')); }
  const rows = d.tiles.length;
  if (lanes) {
    // one-cell corridors under the belt: only the head of each corridor can be tapped, so the order is forced by the queue
    const keep = laneColumns(cols);
    d.tiles = d.tiles.map((row, r) => (r === 0 ? 'o'.repeat(cols) : row.split('').map((_, c) => (keep.includes(c) ? 'o' : '.')).join('')));
  }
  d.buckets = Array.from({ length: rows }, () => Array(cols).fill('.'));
  // floor cells, nearest to the belt first. Row 0 touches the belt; it is filled last so the first row of buckets is row 1.
  const byRow: number[][] = Array.from({ length: rows }, () => []);
  const under = new Set<string>();
  for (const rod of d.rods ?? []) for (const x of rodCells(rod)) under.add(`${x.r},${x.c}`);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (d.tiles[r][c] === 'o' && !under.has(`${r},${c}`)) byRow[r].push(c);
  const order: [number, number][] = [];
  const rowOrder = [...Array(rows - 1).keys()].map((i) => i + 1).concat(rows > 1 && !lanes ? [0] : []);
  for (const r of rowOrder) for (const c of rng.shuffle(byRow[r].slice())) order.push([r, c]);
  const n = Math.min(order.length, slots.length);
  const chosen = slots.slice();
  // earliest waves first (with noise so levels differ); the buckets that must wait for sand to be uncovered come last
  const key = new Map<Slot, number>();
  for (const x of chosen) key.set(x, x.wave + rng.next() * p.noise);
  chosen.sort((x, y) => key.get(x)! - key.get(y)!);
  const good = chosen.slice(0, n);
  const lateFirst = good.slice().reverse();
  const used = new Set<Slot>();
  const takeGood = (): Slot | undefined => { const x = good.find((y) => !used.has(y)); if (x) used.add(x); return x; };
  const takeLate = (): Slot | undefined => { const x = lateFirst.find((y) => !used.has(y)); if (x) used.add(x); return x; };
  if (lanes && p.tag && p.tag !== 'easy') {
    // corridor queues: the good corridor(s) hold the earliest waves, the bait corridor(s) the latest, head first
    const keep = laneColumns(cols);
    const goodLanes = p.tag === 'hard' ? Math.max(1, keep.length - 1) : 1;
    const perLane = rows - 1;
    const nGood = Math.min(n, goodLanes * perLane);
    const goodItems = chosen.slice(0, nGood);
    const baitItems = chosen.slice(nGood, n).reverse();
    const laneOrder = rng.shuffle(keep.slice());
    const put = (items: Slot[], laneCols: number[]) => {
      items.forEach((x, i) => {
        const c = laneCols[i % laneCols.length];
        const r = 1 + Math.floor(i / laneCols.length);
        if (r >= rows) return;
        d.buckets[r][c] = x.color.toString(36);
      });
    };
    put(goodItems, laneOrder.slice(0, goodLanes));
    put(baitItems, laneOrder.slice(goodLanes));
    return d;
  }
  const front = Math.min(n, byRow[rowOrder[0]].length);
  // front row: bait buckets (buried colours) next to at least one good bucket that can pick right away
  const fb = Math.min(front - 1, Math.round(p.bait * front));
  for (let i = 0; i < n; i++) {
    const [r, c] = order[i];
    let x: Slot | undefined;
    if (i < front) x = i < fb ? takeLate() : takeGood();
    else x = rng.chance(p.bait) ? takeLate() : takeGood();
    x ??= takeGood() ?? takeLate();
    if (!x) break;
    const hide = i >= front && rng.chance(p.mystery);
    d.buckets[r][c] = (hide ? '?' : '') + x.color.toString(36);
  }
  return d;
}

interface Verdict { stuckTaps?: number[] | null; rndOk?: boolean; wins: number; stucks: number; runs: number; fit: number; ok: boolean; hasWin: boolean }

function evaluate(def: DesignLevel, tag: Tag, layer: number, runs: number, seedBase: number, winMs: number): Verdict {
  const g = newGame(prepare(def, layer), SEED);
  settle(g);
  const out: Verdict = { wins: 0, stucks: 0, runs: 0, fit: 99, ok: false, hasWin: false };
  if (legalMoves(g).length === 0) return out;
  for (let i = 0; i < runs; i++) {
    const p = randomPlayout(g, seedBase + i);
    out.runs++;
    if (p.end === 'won') out.wins++;
    else if (p.end === 'stuck') { out.stucks++; if (!out.stuckTaps || p.taps.length < out.stuckTaps.length) out.stuckTaps = p.taps; }
    if (tag === 'easy' && out.wins + 0 < out.runs) break;
    if (tag === 'super' && out.wins > 0) break;
  }
  const wr = out.runs ? out.wins / runs : 0;
  if (tag === 'easy') { out.fit = out.stucks / Math.max(1, out.runs) + (out.wins < out.runs ? 0.01 : 0); out.ok = out.wins === runs; }
  else if (tag === 'hard') { out.fit = Math.abs(wr - 0.5) + (out.stucks === 0 ? 0.5 : 0) + (out.wins === 0 ? 0.5 : 0); out.ok = out.wins >= 1 && out.stucks >= 1 && wr <= 0.85; }
  else { out.fit = wr + (1 - out.stucks / runs) * 0.5; out.ok = out.wins === 0 && out.stucks >= runs - 1; }
  out.rndOk = out.ok;
  if (out.ok && tag === 'easy' && search(g, 'stuck', { ms: 2500, nodes: 3000 }, (m) => (m.exposed ? 0 : 10) + (10 - m.row))) out.ok = false;
  if (out.ok) out.hasWin = !!(confirmedTaps(def, layer, 'won', 1500) ?? searchWin(g, winMs));
  if (out.ok && !out.hasWin) out.ok = false;
  return out;
}

const preferStuck = (m: { exposed: boolean; row: number }) => (m.exposed ? 0 : 10) + (10 - m.row);

function stuckSeq(def: DesignLevel, layer: number, ms: number): number[] | null {
  const g = newGame(prepare(def, layer), SEED);
  settle(g);
  return search(g, 'stuck', { ms, nodes: 3000 }, preferStuck);
}

/** Swap the buckets of two cells; one of them is a bucket the stuck line tapped. */
function swapAround(def: DesignLevel, seq: number[], rng: Rng): DesignLevel {
  const d = cloneDef(def);
  const cells: [number, number][] = [];
  for (let r = 0; r < d.tiles.length; r++) for (let c = 0; c < d.tiles[0].length; c++) if (d.buckets[r][c] !== '.' && d.buckets[r][c] !== ' ') cells.push([r, c]);
  const a = cells[seq[rng.int(seq.length)] ?? 0] ?? cells[0];
  let b = cells[rng.int(cells.length)];
  for (let k = 0; k < 6 && (b === a || d.buckets[b[0]][b[1]].replace('?', '') === d.buckets[a[0]][a[1]].replace('?', '')); k++) b = cells[rng.int(cells.length)];
  const t = d.buckets[a[0]][a[1]];
  d.buckets[a[0]][a[1]] = d.buckets[b[0]][b[1]];
  d.buckets[b[0]][b[1]] = t;
  return d;
}

const TAG_START: Record<Tag, Params> = {
  easy: { fill: 0.6, bait: 0, mystery: 0, noise: 0.6 },
  hard: { fill: 0.7, bait: 0.4, mystery: 0.1, noise: 1.2 },
  super: { fill: 0.75, bait: 0.8, mystery: 0.15, noise: 1.2 },
};

export function generate(base: DesignLevel, o: GenOptions): GenResult {
  return o.legacy ? generateLegacy(base, o) : generateFast(base, o);
}

/** What stands between this layout and the wanted tag, in plain words. */
export function explain(rep: PathReport | null, tag: Tag, colors: number): string[] {
  const h: string[] = [];
  if (!rep) return h;
  if (!rep.solvable) { h.push('Bố cục này không có lời giải trong mô hình — thử thêm slot băng chuyền hoặc bớt xô ẩn.'); return h; }
  if (tag !== 'easy' && rep.critical.length === 0 && !rep.truncated) {
    h.push(colors <= 2
      ? 'Tranh chỉ có ' + colors + ' màu nên không màu nào bị chôn dưới màu khác — không tạo được đường kẹt. Chọn tranh nhiều lớp màu hơn.'
      : 'Với tranh và số slot này, mọi lần bấm đều còn cứu được (không có đường kẹt). Thử giảm slot băng chuyền, tăng số xô mỗi màu, hoặc chọn tranh có màu phụ thuộc nhau hơn.');
  }
  if (rep.start.lines.length > 3 && tag !== 'easy') h.push('Lượt đầu có ' + rep.start.lines.length + ' đường (>3): bật “khoét ô thành hành lang” hoặc bớt ô sát băng chuyền.');
  if (tag === 'super' && rep.freeChoiceStates > 0) h.push(rep.freeChoiceStates + ' trạng thái vẫn có ≥2 đường thắng — Siêu khó cần các xô phụ thuộc chặt hơn (bàn nhỏ hơn, hành lang dài hơn).');
  if (tag === 'hard' && rep.cls === 'super') h.push('Bố cục đang khó hơn mức “Khó” (chỉ 1 đường thắng) — thử tag Siêu khó hoặc thêm xô cho màu đầu.');
  if (tag === 'easy' && rep.critical.length > 0) h.push('Vẫn còn đường kẹt ở ' + rep.critical.length + ' quyết định — thử tăng slot băng chuyền hoặc xếp xô theo thứ tự lộ cát.');
  if (rep.truncated) h.push('Không gian trạng thái lớn: kết quả mới được kiểm một phần (đã thử mẫu ngẫu nhiên).');
  return h;
}

function generateFast(base: DesignLevel, o: GenOptions): GenResult {
  const t0 = performance.now();
  const rng = new Rng(o.seed);
  const runs = o.runs ?? (o.tag === 'hard' ? 4 : 6);
  const g0 = newGame(prepare(base, o.layer), SEED);
  const floor = base.tiles.join('').split('').filter((c) => c === 'o').length;
  const colors = new Set<number>();
  for (let c = 0; c < COLOR_COUNT; c++) if (g0.sand.counts[c] > 0) colors.add(c);
  if (floor < colors.size) {
    return { def: base, analysis: null, matched: false, tries: 0, note: `Bàn chỉ có ${floor} ô sàn mà tranh có ${colors.size} màu — cần ít nhất ${colors.size} ô.` };
  }
  const fillRatio = Math.min(1, Math.max(0.3, o.fill ?? 1));
  const mech = o.mech ?? NO_MECH;
  // tunnels and rods need the board as it is: no carving into corridors
  const structural = mech.tunnel > 0 || mech.rod > 0;
  const modes: boolean[] = structural ? [false] : o.tag === 'easy' ? (o.shape ? [false, true] : [false]) : o.shape ? [true, false] : [false];
  const avoid = new Set(o.avoid ?? []);
  const structNotes = new Set<string>();
  const verified = new Set<string>();
  let best: { def: DesignLevel; v: Verdict; rep: PathReport | null } | null = null;
  let bestAny = false;
  let bestFast: { def: DesignLevel; rep: PathReport | null; score: number } | null = null;
  let matched = false;
  let tries = 0, rounds = 0, evals = 0;
  while (!matched && performance.now() - t0 < o.budgetMs) {
    const lanes = modes[rounds % modes.length];
    rounds++;
    const left = o.budgetMs - (performance.now() - t0);
    const slice = Math.max(4000, Math.min(left * 0.55, o.budgetMs * 0.3));
    const seeds: DesignLevel[] = [];
    const laneCap = laneColumns(base.tiles[0].length).length * ((o.tag === 'easy' ? base.tiles.length : Math.max(base.tiles.length, LANE_ROWS)) - 1);
    for (let i = 0; i < 8; i++) {
      const p: Params = { ...TAG_START[o.tag], tag: o.tag, mystery: o.mech ? 0 : TAG_START[o.tag].mystery, bait: o.tag === 'easy' ? 0 : Math.min(1, Math.max(0, TAG_START[o.tag].bait + (rng.next() - 0.5) * 0.5)) };
      // tunnels and rods first (they change the board), then the buckets around them, then the marks on the buckets
      const st = lanes ? { def: base, queueCount: 0, notes: [] as string[] } : addStructure(base, mech, rng);
      for (const n of st.notes) structNotes.add(n);
      const cap = lanes ? laneCap : bucketCells(st.def).length;
      const total = Math.max(colors.size - st.queueCount > 0 ? colors.size - st.queueCount : 1, Math.min(cap, Math.round(cap * fillRatio)));
      const all = planBuckets(g0, o.layer, total + st.queueCount);
      // buckets in a tunnel arrive late, so they take the colours that are uncovered last
      const queueSlots = st.queueCount ? all.slice().sort((a, b) => b.wave - a.wave).slice(0, st.queueCount) : [];
      const boardSlots = all.filter((x) => !queueSlots.includes(x));
      const cand = place(st.def, boardSlots, p, rng, lanes);
      fillQueues(cand, rng.shuffle(queueSlots.map((x) => x.color)));
      for (const n of applyMarks(cand, mech, rng)) structNotes.add(n);
      seeds.push(cand);
    }
    o.onProgress?.(`Vòng ${rounds}: ${lanes ? 'hành lang' : 'bàn tự do'} — tối ưu ${Math.round(slice / 1000)}s trên mô hình nhanh`);
    const res = tune(seeds, { tag: o.tag, layer: o.layer, budgetMs: slice, rng, lanes, shape: !!o.shape, fixedCount: true, wantHits: 4, avoid, onProgress: o.onProgress });
    evals += res.evals;
    if (res.cands.length && (!bestFast || res.cands[0].score < bestFast.score)) bestFast = { def: res.cands[0].def, rep: res.cands[0].rep, score: res.cands[0].score };
    o.onProgress?.(`Mô hình nhanh: ${res.evals} bố cục trong ${Math.round(res.ms / 1000)}s, tốt nhất ${res.cands[0]?.score.toFixed(1) ?? '—'}. Kiểm lại bằng game thật…`);
    const todo = res.cands.filter((c) => !verified.has(c.sig)).slice(0, c0Count(res.cands));
    for (const cand of todo) {
      // the budget covers the search and the checks; always check at least one layout
      if (bestAny && performance.now() - t0 > o.budgetMs) break;
      bestAny = true;
      verified.add(cand.sig);
      tries++;
      const left2 = o.budgetMs - (performance.now() - t0);
      let v: Verdict;
      try { v = evaluate(cand.def, o.tag, o.layer, runs, rng.int(1_000_000), Math.max(1500, Math.min(10000, left2 * 0.5))); }
      catch { v = { wins: 0, stucks: 0, runs: 0, fit: 99, ok: false, hasWin: false }; }
      o.onProgress?.(`Kiểm game thật #${tries}: điểm mô hình ${cand.score.toFixed(1)} → thắng ${v.wins}/${v.runs}, kẹt ${v.stucks}${v.ok ? ' — khớp' : v.rndOk ? ' — chưa tìm thấy lời giải' : ''}`);
      if (!best || v.fit < best.v.fit) best = { def: cand.def, v, rep: cand.rep };
      if (v.ok) { matched = true; best = { def: cand.def, v, rep: cand.rep }; break; }
    }
  }
  const def = best ? best.def : bestFast ? bestFast.def : base;
  let analysis: Analysis | null = null;
  if ((best || bestFast) && performance.now() - t0 < o.budgetMs + 60000) {
    o.onProgress?.('Đang đo lại bố cục đã chọn…');
    analysis = analyze(def, { layer: o.layer, playouts: 6, winMs: 20000, stuckMs: 6000, known: best && best.def === def && best.v.runs >= 3 ? { wins: best.v.wins, stucks: best.v.stucks, runs: best.v.runs, stuckTaps: best.v.stuckTaps ?? null } : undefined });
  }
  const rep = (best?.rep ?? bestFast?.rep) ?? null;
  const hints = [...structNotes, ...(matched ? [] : explain(rep, o.tag, colors.size))];
  let note: string;
  if (matched) note = `Khớp độ khó sau ${tries} lần kiểm (${rounds} vòng, ${evals} bố cục thử trên mô hình nhanh).`;
  else note = `Chưa khớp sau ${rounds} vòng (${evals} bố cục thử, ${tries} lần kiểm game thật) — giữ bố cục gần nhất.`;
  void HIT;
  return { def, analysis, matched, tries, note, hints };
}

function c0Count(c: { score: number }[]): number {
  // verify every layout that meets the spec (at most 3); if none does, only the best one
  const ok = c.filter((x) => x.score <= HIT * 2).length;
  return Math.max(1, Math.min(3, ok));
}

function generateLegacy(base: DesignLevel, o: GenOptions): GenResult {
  const t0 = performance.now();
  const rng = new Rng(o.seed);
  const runs = o.runs ?? (o.tag === 'hard' ? 6 : 8);
  const g0 = newGame(prepare(base, o.layer), SEED);
  const floor = base.tiles.join('').split('').filter((c) => c === 'o').length;
  const colors = new Set<number>();
  for (let c = 0; c < COLOR_COUNT; c++) if (g0.sand.counts[c] > 0) colors.add(c);
  if (floor < colors.size) {
    return { def: base, analysis: null, matched: false, tries: 0, note: `Bàn chỉ có ${floor} ô sàn mà tranh có ${colors.size} màu — cần ít nhất ${colors.size} ô.` };
  }
  let p: Params = { ...TAG_START[o.tag], tag: o.tag };
  let best: { def: DesignLevel; v: Verdict } | null = null;
  let tries = 0;
  let matched = false;
  while (performance.now() - t0 < o.budgetMs) {
    tries++;
    const lanes = !!o.shape && (tries > 5 || performance.now() - t0 > o.budgetMs * 0.3);
    const cap = lanes ? laneColumns(base.tiles[0].length).length * ((o.tag === 'easy' ? base.tiles.length : Math.max(base.tiles.length, LANE_ROWS)) - 1) : floor;
    const fill = lanes ? Math.min(1, p.fill + 0.2) : p.fill;
    const total = Math.max(colors.size, Math.min(cap, Math.round(cap * Math.min(0.95, Math.max(0.35, fill + (rng.next() - 0.5) * 0.12)))));
    const slots = planBuckets(g0, o.layer, total);
    const cand = place(base, slots, p, rng, lanes);
    const left = o.budgetMs - (performance.now() - t0);
    const v = evaluate(cand, o.tag, o.layer, runs, rng.int(1_000_000), Math.max(1500, Math.min(10000, left * 0.5)));
    o.onProgress?.(`Thử bố cục ${tries}: thắng ${v.wins}/${v.runs}, kẹt ${v.stucks}${v.ok ? ' — khớp' : v.rndOk ? ' — chưa tìm thấy lời giải' : ''} bait=${p.bait.toFixed(2)} xô=${total}`);
    if (!best || v.fit < best.v.fit) best = { def: cand, v };
    if (v.ok) { matched = true; best = { def: cand, v }; break; }
    if (lanes && o.tag === 'easy') { /* ordered corridors: random variation only */ }
    // steer the bait ratio: too easy → more bait, too hard → less
    if (o.tag === 'easy') p.bait = 0;
    else if (v.wins === v.runs) p.bait = Math.min(1, p.bait + 0.1);
    else if (v.wins === 0 && o.tag === 'hard') p.bait = Math.max(0, p.bait - 0.1);
    else if (v.wins > 0 && o.tag === 'super') p.bait = Math.min(1, p.bait + 0.1);
    if (tries % 4 === 0) p.noise = Math.max(0.3, p.noise + (rng.next() - 0.5));
  }
  // Easy needs "no stuck line at all": walk away from every stuck line the search can still find
  if (!matched && o.tag === 'easy' && best && !o.shape) {
    let cur = best.def;
    let seq = stuckSeq(cur, o.layer, 2500);
    let steps = 0;
    while (performance.now() - t0 < o.budgetMs * 1.6 && seq) {
      steps++;
      const cand = swapAround(cur, seq, rng);
      const s2 = stuckSeq(cand, o.layer, 2500);
      if (!s2 || s2.length > seq.length || (s2.length === seq.length && rng.chance(0.35))) { cur = cand; seq = s2; }
      if (steps % 5 === 0) o.onProgress?.('Chỉnh bố cục: đường kẹt ngắn nhất còn ' + (seq ? seq.length + ' bước' : 'không còn'));
    }
    if (!seq) {
      const v = evaluate(cur, 'easy', o.layer, runs, rng.int(1_000_000), 8000);
      o.onProgress?.('Kiểm tra lại: thắng ' + v.wins + '/' + v.runs + ', kẹt ' + v.stucks + (v.ok ? ' — khớp' : ''));
      best = { def: cur, v };
      matched = v.ok;
    } else best = { def: cur, v: best.v };
  }
  const def = best ? best.def : base;
  let analysis: Analysis | null = null;
  if (best && performance.now() - t0 < o.budgetMs + 60000) {
    o.onProgress?.('Đang đo lại bố cục đã chọn…');
    analysis = analyze(def, { layer: o.layer, playouts: 6, winMs: 20000, stuckMs: 6000 });
  }
  let note: string;
  if (matched) note = `Đã gen ${tries} bố cục, bố cục #${tries} khớp độ khó yêu cầu.`;
  else if (o.tag !== 'easy' && colors.size <= 2) note = 'Không khớp: tranh chỉ có 2 màu, ít phụ thuộc màu nên khó tạo case stuck. Thử tranh nhiều màu hơn.';
  else note = `Chưa khớp sau ${tries} bố cục — giữ bố cục gần nhất. Thử gen lại hoặc tăng thời gian.`;
  return { def, analysis, matched, tries, note };
}
