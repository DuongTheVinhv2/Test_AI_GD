import './designer.css';
import WorkerCtor from './worker?worker&inline';
import { ART_SOURCES, type ArtSource } from '../core/art-data';
import { LANE, DEFAULT_SLOTS, SIM_HZ } from '../core/config';
import { Game, laneX } from '../core/game';
import { LEVELS } from '../core/levels';
import { SAND_COLORS, colorHex } from '../core/palette';
import { analyze, prepare, validate, SEED, type Analysis, type DesignLevel, type Difficulty } from './analyze';
import { applyTool, artFromImage, blankLevel, cloneDef, levelKey, resize, rodAt, tunnelAt, DEFAULT_TOOL_OPTIONS, MAX_COLS, MAX_ROWS, MIN_SIZE, type Tool, type ToolOptions } from './model';
import { isBucketTok, tokInfo } from './tokens';
import { layoutSig } from './tune';
import type { Dir } from '../core/grid';
import { isSettled, settle, verdict, SETTLE_MAX_TICKS } from './solver';
import PRE from './precomputed.json';
import type { WorkerRequest } from './worker';
import type { GenResult, Tag } from './gen';
import { mergeIntoGame, type MergeResult } from './export';

// ───────────────────────────── state ─────────────────────────────
interface Entry {
  id: string;
  builtin: boolean;
  def: DesignLevel;
  analysis?: Analysis;
  analysisKey?: string;
  /** The difficulty the designer wants. It drives generation and the auto-solve cases; the tool only measures. */
  tag: Tag | null;
  genNote?: string;
  genHints?: string[];
  /** Layouts generated before, so the next Gen gives a different one. */
  genHistory?: string[];
  /** Id the level has in the game after "Xuất về game". */
  gameId?: number;
}

const TAG_TEXT: Record<Tag, string> = { easy: 'Dễ', hard: 'Khó', super: 'Siêu khó' };
const asTag = (d?: string | null): Tag | null => (d === 'easy' || d === 'hard' || d === 'super' ? d : null);
const tagText = (t: Tag | null): string => (t ? TAG_TEXT[t] : 'Chưa chọn');
let genSecs = 45;
let maxColors = SAND_COLORS.length;
let allowShape = false;
let autoGen = false;
let fillPct = 100;
let toolOpt: ToolOptions = { ...DEFAULT_TOOL_OPTIONS };

/** Mechanics the generator may use: tick to include, and how many of them the level gets. */
type MechKey = 'hidden' | 'tunnel' | 'frozen' | 'rod' | 'key';
const MECH_INFO: Record<MechKey, { label: string; hint: string; max: number }> = {
  hidden: { label: 'Xô ẩn (?)', hint: 'Số xô ẩn trong màn', max: 12 },
  tunnel: { label: 'Hầm', hint: 'Số hầm (mỗi hầm chứa 2–3 xô, miệng hầm nằm ngoài rìa bàn)', max: 3 },
  frozen: { label: 'Xô băng ❄', hint: 'Số xô đóng băng', max: 6 },
  rod: { label: 'Thanh chắn', hint: 'Số thanh chắn (nằm đè lên các ô sàn)', max: 3 },
  key: { label: 'Chìa / khóa 🔑', hint: 'Số cặp chìa + khóa', max: 3 },
};
const genMech: Record<MechKey, { on: boolean; n: number }> = {
  hidden: { on: true, n: 3 }, tunnel: { on: false, n: 1 }, frozen: { on: false, n: 2 }, rod: { on: false, n: 1 }, key: { on: false, n: 1 },
};
const gen = { running: false, text: '', workers: [] as Worker[], t0: 0 };

const BUILTIN_ARTS = ART_SOURCES.length;
const STORE = 'sandloop.designer.v1';
const DEFAULT_LAYER = LANE.layerGrains;
const STEPS_PER_FRAME = 10;

let layer = DEFAULT_LAYER;
let tool: Tool = 'bucket';
let color = 2;
let sel = 2;
const entries: Entry[] = LEVELS.map((lv) => {
  const def = cloneDef(lv as DesignLevel);
  const pre = (PRE as Record<string, Analysis>)[`builtin-${lv.id}`];
  return { id: `builtin-${lv.id}`, builtin: true, def, analysis: pre, analysisKey: pre ? levelKey(def, DEFAULT_LAYER) : undefined, tag: asTag(pre?.difficulty) };
});

// ───────────────────────────── persistence ─────────────────────────────
function save(): void {
  try {
    const edits: Record<string, unknown> = {};
    const custom: unknown[] = [];
    for (const e of entries) {
      if (e.builtin) {
        const orig = LEVELS.find((l) => `builtin-${l.id}` === e.id)!;
        if (levelKey(e.def, 0) !== levelKey(cloneDef(orig as DesignLevel), 0)) edits[e.id] = { def: e.def, analysis: e.analysis, analysisKey: e.analysisKey };
      } else custom.push({ id: e.id, def: e.def, analysis: e.analysis, analysisKey: e.analysisKey, gameId: e.gameId });
    }
    const tags: Record<string, Tag | null> = {};
    for (const e of entries) tags[e.id] = e.tag;
    localStorage.setItem(STORE, JSON.stringify({ edits, custom, sel, layer, tags, genSecs, allowShape2: allowShape, autoGen2: autoGen, maxColors, fillPct, genMech }));
  } catch { /* storage may be unavailable */ }
}

function load(): void {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return;
    const s = JSON.parse(raw) as { edits: Record<string, Partial<Entry>>; custom: Entry[]; sel: number; layer?: number; tags?: Record<string, Tag | null>; genSecs?: number; allowShape2?: boolean; autoGen2?: boolean; maxColors?: number; fillPct?: number; genMech?: Partial<Record<MechKey, { on: boolean; n: number }>> };
    for (const e of entries) {
      const ed = s.edits?.[e.id];
      if (ed?.def) { e.def = ed.def; e.analysis = ed.analysis; e.analysisKey = ed.analysisKey; }
    }
    for (const c of s.custom ?? []) entries.push({ ...c, builtin: false, tag: asTag(c.tag) });
    for (const e of entries) if (s.tags?.[e.id]) e.tag = asTag(s.tags[e.id]);
    if (typeof s.genSecs === 'number') genSecs = s.genSecs;
    if (typeof s.maxColors === 'number') maxColors = Math.min(SAND_COLORS.length, Math.max(2, s.maxColors));
    if (typeof s.allowShape2 === 'boolean') allowShape = s.allowShape2;
    if (typeof s.autoGen2 === 'boolean') autoGen = s.autoGen2;
    for (const k of Object.keys(genMech) as MechKey[]) { const v = s.genMech?.[k]; if (v && typeof v.n === 'number') genMech[k] = { on: !!v.on, n: Math.min(MECH_INFO[k].max, Math.max(1, v.n)) }; }
    if (typeof s.fillPct === 'number') fillPct = Math.min(100, Math.max(30, s.fillPct));
    if (typeof s.layer === 'number') layer = s.layer;
    if (typeof s.sel === 'number' && s.sel < entries.length) sel = s.sel;
  } catch { /* ignore corrupt storage */ }
}
load();

const cur = (): Entry => entries[sel];
const pad = (n: number) => String(n).padStart(2, '0');
const colorName = (id: number) => SAND_COLORS[id]?.name ?? `#${id}`;

// ───────────────────────────── skeleton ─────────────────────────────
const root = document.getElementById('root')!;
root.innerHTML = `
<div class="app">
  <header class="card top"><h1>Sand Loop · Thiết kế màn</h1><span class="tag">Công cụ thiết kế &amp; tự giải</span></header>
  <div class="cols">
    <section class="card" id="cfg">
      <h2>Cấu hình màn</h2>
      <p class="sub">Tranh cát</p>
      <button class="art-box" id="artBtn"><b>Chọn ảnh pixel</b><span>32 × 32 pixel · 4 × 4 hạt/pixel</span><span style="display:block;margin-top:6px">Bấm để chọn, hoặc kéo ảnh vào trang</span></button>
      <input type="file" id="file" accept="image/*" hidden />
      <select class="select" id="artSel" title="Tranh có sẵn"></select>
      <div class="size-row">Nền trời <select class="select mini" id="themeSel"><option value="meadow">Đồng cỏ</option><option value="garden">Vườn</option><option value="dusk">Hoàng hôn</option><option value="lagoon">Đầm nước</option></select></div>
      <div class="size-row" title="Khi tải ảnh lên, ảnh được gộp về nhiều nhất ngần này màu (màu ít dùng nhất bị gộp vào màu gần nhất)">Số màu tối đa <span class="stepper" id="stColors"></span></div>
      <h3>Độ khó mong muốn</h3>
      <div class="segs" id="tags"></div>
      <div class="size-row" title="Tỉ lệ ô sàn được đặt xô. 100% = ô sàn nào cũng có xô, như các màn khó của game">Lấp đầy ô sàn <span class="stepper" id="stFill"></span> %</div>
      <label class="chk"><input type="checkbox" id="chkShape" /> Cho phép gen đổi hình dạng bàn (khoét ô thành hành lang)</label>
      <label class="chk"><input type="checkbox" id="chkAuto" /> Tự gen ngay khi thả ảnh vào (mặc định tắt)</label>
      <div class="size-row" title="Gen dừng ngay khi tìm được bố cục khớp độ khó. Con số này chỉ là giới hạn trên để không chạy mãi khi tranh không làm được độ khó đã chọn">Gen tối đa <span class="stepper" id="stGen"></span> giây</div>
      <p class="label" style="margin-top:12px">Cơ chế sẽ gen <span class="t">(tích để dùng, điền số lượng)</span></p>
      <div class="gmech" id="genMech"></div>
      <button class="btn blue wide" id="bGen">🎲 Gen bài toán xô</button>
      <h3>Công cụ đặt ô</h3>
      <div class="tools" id="tools"></div>
      <div class="toolopts" id="toolOpts"></div>
      <p class="label" style="margin-top:16px">Màu xô</p>
      <div class="swatches" id="sw"></div>
      <div class="size-row">Bàn: cột <span class="stepper" id="stCols"></span> hàng <span class="stepper" id="stRows"></span></div>
      <h3>Luật mở đường</h3>
      <p class="rule">Xô cần đường ô trống dẫn tới hàng trên cùng.<br />Xô ẩn (?) hiện màu khi có ô kề trống.</p>
    </section>

    <section class="card" id="boardCard">
      <div class="board-head"><h2>Bố cục màn chơi</h2><span class="mode" id="modeTag">Chế độ sửa</span></div>
      <div class="stage">
        <div class="pic">
          <div class="meta"><div><span>Tranh hiện tại</span><b id="picName"></b></div><span id="picNote">Cát thay đổi khi xô hứng</span></div>
          <div class="frame"><canvas id="sand" width="128" height="144"></canvas></div>
        </div>
        <div class="belt" id="belt"></div>
        <div class="belt-cap" id="beltCap"></div>
        <div class="grid edit" id="grid"></div>
        <p class="legend" id="legend">Ô xanh đậm là tường · Dấu ? là xô ẩn · Bấm ô để đặt</p>
      </div>
    </section>

    <section class="card" id="playCard">
      <h2>Chơi thử</h2>
      <div class="info"><div class="k">Sức chứa băng chuyền</div><div class="v"><span id="vSlots"></span><span class="stepper" id="stSlots"></span></div></div>
      <div class="info"><div class="k">Lớp cát khác màu chặn hút</div><div class="v"><span id="vLayer"></span><span class="stepper" id="stLayer"></span></div></div>
      <div class="info"><div class="k">Điều kiện thắng</div><div class="v">Thu hết cát</div></div>
      <div class="btns"><button class="btn blue" id="bPlay">Chơi thử</button><button class="btn yellow" id="bAuto">Tự giải</button></div>
      <h3 style="margin-top:20px">Kết quả mô phỏng</h3>
      <div class="result" id="result"></div>
    </section>

    <section class="card" id="listCard">
      <h2>Danh sách màn</h2>
      <p class="sub" id="listSub"></p>
      <div class="list-scroll" id="list"></div>
      <button class="ghost" id="bAdd">+ Thêm màn</button>
      <button class="ghost" id="bReset" style="margin-top:8px"></button>
      <button class="ghost export" id="bExport" style="margin-top:8px" title="Ghi danh sách màn này vào game (level-data.ts, và art-data.ts nếu có tranh mới)">📤 Xuất về game</button>
      <p class="rule" id="exportNote"></p>
    </section>
  </div>
</div>`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const sandCv = $<HTMLCanvasElement>('sand');
const sandCtx = sandCv.getContext('2d')!;
const imgData = sandCtx.createImageData(128, 144);
const PAL = SAND_COLORS.map((c) => [parseInt(c.hex.slice(1, 3), 16), parseInt(c.hex.slice(3, 5), 16), parseInt(c.hex.slice(5, 7), 16)]);
const BG = [236, 245, 255];

function stepper(host: HTMLElement, id: string, value: number): void {
  host.innerHTML = `<button data-st="${id}" data-d="-1">−</button><b>${value}</b><button data-st="${id}" data-d="1">+</button>`;
}

// ───────────────────────────── analysis worker ─────────────────────────────
let worker: Worker | null = null;
let pending: { entryId: string; key: string } | null = null;
let analyzeTimer = 0;
let wantAuto = false;

function startWorker(): Worker {
  worker = new WorkerCtor();
  worker.onmessage = (e: MessageEvent<{ kind: string; key: string; analysis?: Analysis; error?: string }>) => {
    const p = pending;
    if (!p || e.data.key !== p.key) return;
    pending = null;
    const en = entries.find((x) => x.id === p.entryId);
    if (en && e.data.analysis && levelKey(en.def, layer) === p.key) {
      en.analysis = e.data.analysis;
      en.analysisKey = p.key;
      save();
    }
    renderList();
    renderResult();
    if (wantAuto && en === cur() && en.analysis) { wantAuto = false; startAuto(); }
    else wantAuto = false;
  };
  return worker;
}

function needsAnalysis(en: Entry): boolean {
  return en.analysisKey !== levelKey(en.def, layer);
}

function requestAnalysis(immediate = false): void {
  window.clearTimeout(analyzeTimer);
  const run = () => {
    const en = cur();
    if (gen.running) return;
    if (!needsAnalysis(en)) { renderResult(); return; }
    const key = levelKey(en.def, layer);
    if (pending?.key === key) return;
    worker?.terminate();
    startWorker();
    pending = { entryId: en.id, key };
    const req: WorkerRequest = { kind: 'analyze', key, def: en.def, opts: { layer, playouts: 6, winMs: 25000, stuckMs: 6000 } };
    worker!.postMessage(req);
    renderResult();
  };
  if (immediate) run();
  else analyzeTimer = window.setTimeout(run, 700);
}

// ───────────────────────────── play session ─────────────────────────────
interface Case { kind: 'stuck' | 'win'; taps: number[] }
interface Auto {
  cases: Case[];
  ci: number;
  ti: number;
  phase: 'settle' | 'delay' | 'pause' | 'run';
  /** 'eager' = taps the next bucket as soon as a belt slot is free, like a player (belt stays 4/5 full).
   *  'step'  = waits for the belt to settle after every tap (fallback when the eager run does not end as expected). */
  mode: 'eager' | 'step';
  /** earliest game tick of the next tap (eager mode) */
  nextTick: number;
  until: number;
  pulse: number;
  ticks: number;
  last: string;
  ended: string[];
}
interface Session { game: Game; mode: 'play' | 'auto'; auto?: Auto; over?: 'won' | 'lost' }
let sess: Session | null = null;

function newSession(): Game {
  return new Game(prepare(cur().def, layer), SEED);
}

function startPlay(): void {
  const v = validate(cur().def, layer);
  if (v.length) { renderResult(); return; }
  sess = { game: newSession(), mode: 'play' };
  syncAll();
}

function exitPlay(): void {
  sess = null;
  wantAuto = false;
  syncAll();
}

function startAuto(): void {
  const en = cur();
  const a = en.analysis;
  if (!a?.winTaps) { renderResult(); return; }
  const cases: Case[] = [];
  if (en.tag !== 'easy' && a.stuckTaps) cases.push({ kind: 'stuck', taps: a.stuckTaps });
  cases.push({ kind: 'win', taps: a.winTaps });
  const g = newSession();
  settle(g);
  sess = { game: g, mode: 'auto', auto: { cases, ci: 0, ti: 0, phase: 'run', mode: 'eager', nextTick: 0, until: 0, pulse: -1, ticks: 0, last: '', ended: [] } };
  syncAll();
}

function onAutoClick(): void {
  if (sess?.mode === 'auto') { exitPlay(); return; }
  const en = cur();
  if (needsAnalysis(en)) { wantAuto = true; requestAnalysis(true); return; }
  startAuto();
}

function staleAnalysis(): void {
  const en = cur();
  en.analysisKey = undefined;
  sess = null;
  wantAuto = true;
  syncAll();
  requestAnalysis(true);
}

/** A player taps again about half a second after the last tap, as long as the belt has a free slot. */
const EAGER_GAP = Math.round(SIM_HZ * 0.55);

function beltText(g: Game): string {
  return `băng chuyền ${g.slotsUsed}/${g.slots}`;
}

function endCase(s: Session, now: number): void {
  const a = s.auto!, g = s.game;
  const c = a.cases[a.ci];
  const v = verdict(g);
  const expected = c.kind === 'win' ? 'won' : 'stuck';
  if (v !== expected) {
    if (a.mode === 'eager') {
      // tapping early changed the outcome: replay this case one step at a time, waiting for the belt after every tap
      s.game = newSession();
      settle(s.game);
      a.mode = 'step'; a.phase = 'settle'; a.ti = 0; a.ticks = 0; a.pulse = -1; a.last = '';
      lastBoardSig = '';
      syncStatus();
      return;
    }
    staleAnalysis();
    return;
  }
  a.ended[a.ci] = v === 'won' ? 'THẮNG — đã hút hết cát' : 'KẸT — băng chuyền đầy xô không hút được nữa';
  a.last = '';
  a.phase = 'pause';
  a.until = now + 2800;
  syncStatus();
}

function autoAdvance(now: number): void {
  const s = sess!, a = s.auto!, g = s.game;
  const c = a.cases[a.ci];
  if (a.phase === 'run') {
    // eager: the sand and the belt keep running, the next planned bucket is tapped as soon as there is room
    for (let i = 0; i < STEPS_PER_FRAME; i++) { g.step(); a.ticks++; }
    if (a.pulse >= 0) {
      if (now >= a.until) { g.tap(a.pulse); a.pulse = -1; a.nextTick = g.ticks + EAGER_GAP; a.ticks = 0; }
    } else if (a.ti < c.taps.length && g.status === 'playing' && g.ticks >= a.nextTick && g.slotsUsed < g.slots) {
      const id = c.taps[a.ti];
      const gb = g.board.buckets[id];
      if (gb && g.board.isOpen(gb)) {
        a.pulse = id;
        a.ti++;
        a.until = now + 380;
        a.last = `Bước ${a.ti}/${c.taps.length}: bấm xô ${colorName(gb.color)} (hàng ${gb.r + 1}, cột ${gb.c + 1}) · ${beltText(g)}`;
      }
    }
    const done = a.ti >= c.taps.length && a.pulse < 0;
    if (g.status !== 'playing' || a.ticks > SETTLE_MAX_TICKS || (done && isSettled(g))) endCase(s, now);
    else syncStatus();
  } else if (a.phase === 'settle') {
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      g.step();
      a.ticks++;
      if (isSettled(g) || a.ticks > SETTLE_MAX_TICKS) {
        a.ticks = 0;
        if (a.ti < c.taps.length && verdict(g) === 'open') {
          a.pulse = c.taps[a.ti++];
          a.phase = 'delay';
          a.until = now + 520;
          const b = g.board.buckets[a.pulse];
          a.last = `Bước ${a.ti}/${c.taps.length}: bấm xô ${colorName(b.color)} (hàng ${b.r + 1}, cột ${b.c + 1})`;
        } else endCase(s, now);
        syncStatus();
        break;
      }
    }
  } else if (a.phase === 'delay') {
    if (now >= a.until) {
      g.tap(a.pulse);
      a.pulse = -1;
      a.phase = 'settle';
      a.ticks = 0;
    }
  } else if (a.phase === 'pause') {
    if (now >= a.until) {
      if (a.ci + 1 < a.cases.length) {
        a.ci++; a.ti = 0; a.phase = 'run'; a.mode = 'eager'; a.nextTick = 0; a.ticks = 0; a.pulse = -1;
        s.game = newSession();
        settle(s.game);
        lastBoardSig = '';
        syncStatus();
      } else {
        a.phase = 'pause';
        a.until = Infinity;
        syncStatus();
      }
    }
  }
}

// ───────────────────────────── rendering ─────────────────────────────
let lastBoardSig = '';
let lastBeltSig = '';
let lastResultSig = '';

const DIR_ARROW: Record<Dir, string> = { u: '↑', d: '↓', l: '←', r: '→' };

function renderConfig(): void {
  const en = cur();
  $('tools').innerHTML = (
    [['bucket', 'Xô màu'], ['wall', 'Tường'], ['hidden', 'Xô ẩn (?)'], ['frozen', 'Xô băng ❄'], ['key', 'Chìa 🔑'], ['lock', 'Khóa 🔒'], ['tunnel', 'Hầm'], ['tunnelq', 'Xô trong hầm'], ['rod', 'Thanh chắn'], ['erase', 'Xóa ô']] as [Tool, string][]
  ).map(([k, t]) => `<button class="tool ${tool === k ? 'on' : ''}" data-tool="${k}">${t}</button>`).join('');
  const dirs = (['u', 'd', 'l', 'r'] as Dir[]).map((d) => `<button class="dirbtn ${toolOpt.dir === d ? 'on' : ''}" data-dir="${d}">${DIR_ARROW[d]}</button>`).join('');
  let optsHtml = '';
  if (tool === 'frozen') optsHtml = `<div class="size-row">Tan sau <span class="stepper" id="stOF"></span> lần pop</div>`;
  else if (tool === 'key' || tool === 'lock') optsHtml = `<div class="size-row">Cặp số <span class="stepper" id="stOP"></span><span class="t"> (chìa N mở khóa N)</span></div>`;
  else if (tool === 'tunnel') optsHtml = `<div class="size-row">Hướng miệng hầm <span class="dirs">${dirs}</span></div>`;
  else if (tool === 'rod') optsHtml = `<div class="size-row">Dài <span class="stepper" id="stOS"></span> ô · hướng đầu thanh <span class="dirs">${dirs}</span></div>`;
  $('toolOpts').innerHTML = optsHtml;
  if (tool === 'frozen') stepper($('stOF'), 'ofrozen', toolOpt.frozen);
  if (tool === 'key' || tool === 'lock') stepper($('stOP'), 'opair', toolOpt.pair);
  if (tool === 'rod') stepper($('stOS'), 'osize', toolOpt.rodSize);
  $('genMech').innerHTML = (Object.keys(MECH_INFO) as MechKey[]).map((k) => {
    const g = genMech[k];
    return `<div class="gm" title="${MECH_INFO[k].hint}"><label class="chk"><input type="checkbox" data-gm="${k}" ${g.on ? 'checked' : ''} /> ${MECH_INFO[k].label}</label>${g.on ? `<span class="stepper"><button data-st="gm" data-k="${k}" data-d="-1">−</button><b>${g.n}</b><button data-st="gm" data-k="${k}" data-d="1">+</button></span>` : ''}</div>`;
  }).join('');

  const art = artOf(en.def);
  const counts = new Array(SAND_COLORS.length).fill(0);
  for (const row of art.rows) for (const ch of row) counts[parseInt(ch, 36)]++;
  const placed = new Array(SAND_COLORS.length).fill(0);
  for (const row of en.def.buckets) for (const tk of row) if (isBucketTok(tk)) placed[tokInfo(tk).color]++;
  for (const t of en.def.tunnels ?? []) for (const q of t.queue) placed[parseInt(q, 36)]++;
  const present = SAND_COLORS.filter((c) => counts[c.id] > 0);
  if (!present.some((c) => c.id === color) && present.length) color = present[0].id;
  $('sw').innerHTML = present
    .map((c) => `<button class="sw ${c.id === color ? 'on' : ''}" data-color="${c.id}" style="background:${c.hex}" title="${c.name}">${placed[c.id] ? `<small>${placed[c.id]}</small>` : ''}</button>`)
    .join('');

  const sel$ = $<HTMLSelectElement>('artSel');
  const opts = ART_SOURCES.slice(0, BUILTIN_ARTS).map((a, i) => `<option value="${i}">${a.name}</option>`);
  if (en.def.customArt) opts.unshift(`<option value="custom">Ảnh tải lên: ${en.def.customArt.name}</option>`);
  sel$.innerHTML = opts.join('');
  sel$.value = en.def.customArt ? 'custom' : String(en.def.art);

  $('tags').innerHTML = (['easy', 'hard', 'super'] as Tag[])
    .map((t) => `<button class="seg ${t} ${en.tag === t ? 'on' : ''}" data-tag="${t}">${TAG_TEXT[t]}</button>`)
    .join('');
  $<HTMLInputElement>('chkShape').checked = allowShape;
  $<HTMLInputElement>('chkAuto').checked = autoGen;
  stepper($('stGen'), 'gen', genSecs);
  stepper($('stFill'), 'fill', fillPct);
  stepper($('stColors'), 'colors', maxColors);
  $<HTMLSelectElement>('themeSel').value = en.def.theme;
  $<HTMLButtonElement>('bGen').textContent = gen.running ? '⏹ Dừng gen' : '🎲 Gen bài toán xô';
  stepper($('stCols'), 'cols', en.def.tiles[0].length);
  stepper($('stRows'), 'rows', en.def.tiles.length);
  stepper($('stSlots'), 'slots', en.def.slots ?? DEFAULT_SLOTS);
  stepper($('stLayer'), 'layer', layer);
  $('vSlots').textContent = `${en.def.slots ?? DEFAULT_SLOTS} xô`;
  $('vLayer').textContent = `Từ ${layer} hạt`;
  document.querySelectorAll<HTMLButtonElement>('#cfg button, #cfg select, #stSlots button, #stLayer button').forEach((b) => (b.disabled = !!sess || gen.running));
  $<HTMLButtonElement>('bGen').disabled = !!sess || (!en.tag && !gen.running);
  $<HTMLButtonElement>('bGen').title = !en.tag ? 'Chọn độ khó mong muốn trước khi gen' : '';
}

function artOf(def: DesignLevel): ArtSource {
  return def.customArt ?? ART_SOURCES[def.art];
}

function renderList(): void {
  const chip = (en: Entry): string => `<em class="${en.tag ?? 'none'}">${tagText(en.tag)}</em>`;
  $('list').innerHTML = entries
    .map((en, i) => `<button class="lv ${i === sel ? 'on' : ''}" data-lv="${i}"><span>${pad(i + 1)} · ${en.def.name}</span>${chip(en)}</button>`)
    .join('');
  $('listSub').textContent = `${entries.length} màn · Đang chọn ${pad(sel + 1)}`;
  const en = cur();
  const reset = $<HTMLButtonElement>('bReset');
  reset.textContent = en.builtin ? '↺ Đặt lại màn này' : '🗑 Xóa màn này';
  reset.className = en.builtin ? 'ghost' : 'ghost danger';
}

const PAIR_COLORS = ['#f2b705', '#ff6fa8', '#38b6ff', '#a56cff', '#2fc27a', '#ff8a3d', '#8d99ae', '#e63946', '#3a86ff'];

/** One bucket as the board shows it, with the badge of its mechanic. */
function bucketHtml(col: number, o: { hidden?: boolean; editHidden?: boolean; frozen?: number; key?: number; lock?: number; locked?: boolean }): string {
  const bg = o.hidden ? '#8aa3c8' : o.lock && o.locked ? '#9aa3b2' : colorHex(col);
  let badge = '';
  if (o.frozen) badge = `<span class="mk frz">❄${o.frozen}</span>`;
  else if (o.key) badge = `<span class="mk key" style="background:${PAIR_COLORS[(o.key - 1) % PAIR_COLORS.length]}">🔑${o.key}</span>`;
  else if (o.lock) badge = `<span class="mk lck" style="background:${PAIR_COLORS[(o.lock - 1) % PAIR_COLORS.length]}">${o.locked === false ? '🔓' : '🔒'}${o.lock}</span>`;
  const cls = ['bucket', o.hidden ? 'hid' : '', o.editHidden ? 'edithid' : '', o.frozen ? 'ice' : '', o.lock && o.locked ? 'locked' : ''].join(' ');
  return `<div class="${cls}" style="background:${bg}">${o.hidden ? '?' : ''}${badge}</div>`;
}

function renderBoard(force = false): void {
  const en = cur();
  const def = en.def;
  const g = sess?.game;
  const board = g?.board;
  const rows = def.tiles.length, cols = def.tiles[0].length;
  const open = new Set<number>(g ? g.openBuckets().map((b) => b.id) : []);
  const pulse = sess?.auto?.pulse ?? -1;
  const sig = board
    ? `${rows}x${cols}|${board.buckets.map((b) => (b.gone ? 'x' : b.queued ? 'q' : b.revealed ? 'r' : 'h') + b.frozen + (b.locked ? 'L' : '') + (open.has(b.id) ? 'o' : '')).join('')}|${board.rods.map((r) => (r.open ? 1 : 0)).join('')}|${board.tunnels.map((t) => t.queue.length).join(',')}|${pulse}`
    : `${rows}x${cols}|${JSON.stringify([def.tiles, def.buckets, def.tunnels ?? [], def.rods ?? []])}`;
  if (!force && sig === lastBoardSig) return;
  lastBoardSig = sig;

  const grid = $('grid');
  grid.className = `grid ${sess ? 'view' : 'edit'}`;
  grid.style.gridTemplateColumns = `repeat(${cols}, 82px)`;
  let html = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = def.tiles[r][c];
      let cls = 'cell';
      let inner = '';
      if (tile === '.') cls += ' void';
      else if (tile === 'x') cls += ' wall';
      else if (tile === 't') {
        // tunnel mouth: the colour that comes out next and how many buckets are left inside
        const ti = tunnelAt(def, r, c);
        const t = ti >= 0 ? def.tunnels![ti] : null;
        const live = board && ti >= 0 ? board.tunnels[ti] : null;
        const left = live ? live.queue.length : t ? t.queue.length : 0;
        const next = live ? (live.queue.length ? board!.buckets[live.queue[0]].color : -1) : t && t.queue.length ? parseInt(t.queue[0], 36) : -1;
        cls += ' mouth';
        inner = `<div class="mouthbox dir-${t?.dir ?? 'u'}"><span class="arr">${DIR_ARROW[t?.dir ?? 'u']}</span>${next >= 0 ? `<i style="background:${colorHex(next)}"></i>` : '<i class="none"></i>'}<b>${left}</b></div>`;
        if (!sess && t && t.queue.length) inner += `<div class="queue">${t.queue.map((q) => `<i style="background:${colorHex(parseInt(q, 36))}"></i>`).join('')}</div>`;
      } else if (tile === 'o') {
        let tk = def.buckets[r][c];
        if (board) {
          const id = board.occ[r * cols + c];
          const b = id >= 0 ? board.buckets[id] : null;
          if (b && !b.gone && !b.queued) {
            inner = bucketHtml(b.color, { hidden: b.mystery && !b.revealed, frozen: b.frozen, key: b.key, lock: b.lock, locked: b.locked });
            if (open.has(b.id)) cls += ' open';
            if (b.id === pulse) cls += ' pulse';
          }
        } else if (isBucketTok(tk)) {
          const p = tokInfo(tk);
          inner = bucketHtml(p.color, { editHidden: p.mystery, frozen: p.frozen, key: p.key, lock: p.lock, locked: true });
        }
        tk = '';
      }
      // a rod lies over its tiles until its front tile empties
      const ri = rodAt(def, r, c);
      if (ri >= 0 && (!board || !board.rods[ri].open)) {
        const rod = def.rods![ri];
        const head = rod.r === r && rod.c === c;
        cls += ` rod rod-${rod.dir}${head ? ' rod-head' : ''}`;
        inner += `<div class="rodbar">${head ? `<span>${DIR_ARROW[rod.dir]}</span>` : ''}</div>`;
      }
      html += `<button class="${cls}" data-r="${r}" data-c="${c}">${inner}</button>`;
    }
  }
  grid.innerHTML = html;
  $('legend').textContent = sess
    ? sess.mode === 'play' ? 'Bấm xô có viền sáng để đưa lên băng chuyền' : 'Đang tự giải — xô nhấp nháy là xô sắp được bấm'
    : TOOL_HINT[tool];
}

const TOOL_HINT: Record<Tool, string> = {
  bucket: 'Xô màu: bấm ô sàn để đặt xô với màu đang chọn',
  wall: 'Tường: ô bị chặn, không đi qua được',
  hidden: 'Xô ẩn (?): hiện màu khi có ô kề trống',
  frozen: 'Xô băng: tan sau N lần có xô khác đầy và nổ trên băng chuyền',
  key: 'Xô chìa: khi nó đầy và nổ thì mở mọi xô khóa cùng số cặp',
  lock: 'Xô khóa: không bấm được tới khi xô chìa cùng số cặp đầy và nổ',
  tunnel: 'Hầm: bấm ô trống kề ô sàn để đặt miệng hầm hướng vào ô sàn đó. Bấm lại miệng hầm để xoay hướng',
  tunnelq: 'Xô trong hầm: bấm miệng hầm để thêm xô màu đang chọn vào hàng đợi (Xóa ô để bỏ xô cuối)',
  rod: 'Thanh chắn: bấm ô ĐẦU thanh (chỗ có mũi tên). Ô phía trước đầu thanh phải có xô — bấm xô đó thì thanh trượt đi',
  erase: 'Xóa ô: bỏ xô, thanh chắn, xô trong hầm / hầm, tường',
};

function renderBelt(): void {
  const g = sess?.game;
  const n = cur().def.slots ?? DEFAULT_SLOTS;
  const items = g ? g.belt.filter((b) => b.state !== 'pop').sort((a, b) => a.tapTick - b.tapTick) : [];
  const slots: (typeof items[number] | null)[] = Array(Math.max(n, items.length)).fill(null);
  items.forEach((b, i) => (slots[i] = b));
  const sig = `${n}|` + slots.map((b) => (b ? `${b.id}:${Math.round((b.fill / Math.max(1, b.cap)) * 25)}:${b.state}` : '-')).join(',');
  if (sig === lastBeltSig) return;
  lastBeltSig = sig;
  $('belt').innerHTML = slots
    .map((b) => {
      if (!b) return '<div class="slot"></div>';
      const pct = Math.round((b.fill / Math.max(1, b.cap)) * 100);
      return `<div class="slot ${b.state === 'flying' || b.state === 'waiting' ? 'fly' : ''}" title="${colorName(b.color)} ${pct}%"><div class="bk" style="background:${colorHex(b.color)}"><i style="height:${pct}%"></i></div></div>`;
    })
    .join('');
  $('beltCap').textContent = `Băng chuyền · ${n} chỗ`;
}

function drawSand(): void {
  const en = cur();
  const d = imgData.data;
  for (let i = 0; i < 128 * 144; i++) { d[i * 4] = BG[0]; d[i * 4 + 1] = BG[1]; d[i * 4 + 2] = BG[2]; d[i * 4 + 3] = 255; }
  const put = (x: number, y: number, rgb: number[]) => { const k = (y * 128 + x) * 4; d[k] = rgb[0]; d[k + 1] = rgb[1]; d[k + 2] = rgb[2]; };
  if (sess) {
    const s = sess.game.sand;
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        const v = s.cells[y * s.w + x];
        if (v) put(x, s.h - 1 - y, PAL[v - 1]);
      }
    // belt lane under the picture
    for (let y = 130; y < 144; y++) for (let x = 0; x < 128; x++) put(x, y, [32, 100, 200]);
    for (const b of sess.game.belt) {
      if (b.state !== 'lane') continue;
      const cx = Math.round(laneX(b.s) * 128);
      for (let y = 132; y < 142; y++) for (let x = cx - 4; x <= cx + 4; x++) if (x >= 0 && x < 128) put(x, y, PAL[b.color]);
    }
  } else {
    const art = artOf(en.def);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const rgb = PAL[parseInt(art.rows[y][x], 36)];
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) put(x * 4 + dx, y * 4 + dy, rgb);
    }
    for (let y = 130; y < 144; y++) for (let x = 0; x < 128; x++) put(x, y, [32, 100, 200]);
  }
  sandCtx.putImageData(imgData, 0, 0);
}

function renderHeader(): void {
  const en = cur();
  $('picName').textContent = `${pad(sel + 1)} · ${en.def.name}`;
  $('modeTag').textContent = sess ? (sess.mode === 'auto' ? 'Chế độ tự giải' : 'Chế độ chơi thử') : 'Chế độ sửa';
  const bp = $<HTMLButtonElement>('bPlay'), ba = $<HTMLButtonElement>('bAuto');
  bp.textContent = sess ? 'Thoát' : 'Chơi thử';
  ba.textContent = sess?.mode === 'auto' ? 'Dừng' : 'Tự giải';
  ba.disabled = !!pending && !sess && !wantAuto ? false : false;
}

function diffBadge(d: Difficulty): string {
  const t = { easy: 'Dễ', hard: 'Khó', super: 'Siêu khó', unsolvable: 'Không giải được', unknown: 'Chưa rõ' }[d];
  return `<span class="badge ${d}">${t}</span>`;
}

const PATH_CLASS: Record<string, string> = { easy: 'Dễ', guided: 'Dễ (1 đường mở đầu)', medium: 'Vừa', hard: 'Khó', super: 'Siêu khó', unsolvable: 'Vô nghiệm', unknown: 'Chưa rõ' };
function pathHtml(p: NonNullable<Analysis['path']>): string {
  const lines = p.startLines.map((l) => `<span class="${l.winnable ? 'ok' : 'bad'}">${colorName(l.color)}${l.count > 1 ? '×' + l.count : ''} ${l.winnable ? 'thắng' : 'kẹt'}</span>`).join(' · ');
  let h = `<div class="t" style="margin-top:6px"><b>Phân tích đường đi</b> (${p.nodes.toLocaleString('vi')} trạng thái${p.truncated ? '+' : ''}, ${Math.round(p.ms)} ms)</div>`;
  h += `<div class="t">Xếp loại theo đường: <b>${PATH_CLASS[p.cls] ?? p.cls}</b> · thắng ngẫu nhiên <b>${Math.round(p.randomWin * 100)}%</b></div>`;
  h += `<div class="t">Lượt đầu: ${lines || '—'}</div>`;
  h += `<div class="t">Quyết định có đường kẹt: <b>${p.critical}</b> · quyết định nhiều đường thắng: <b>${p.freeChoiceStates}</b>/${p.decisionStates}</div>`;
  if (p.firstCritical) h += `<div class="t">Đường kẹt đầu tiên (sau ${p.firstCritical.depth} bước): ${p.firstCritical.lines.map((l) => `${colorName(l.color)} ${l.winnable ? 'thắng' : 'kẹt'}`).join(', ')} · mồi ${p.baitVisible ? 'nổi bật hơn' : 'không nổi bật'} · kẹt sau ≤${p.maxDoom} bước</div>`;
  return h;
}

function renderResult(): void {
  const en = cur();
  const el = $('result');
  let html = '';
  if (sess?.mode === 'auto') {
    const a = sess.auto!;
    const total = a.cases.length;
    html += `<b>Tự giải</b> · case ${a.ci + 1}/${total}`;
    for (let i = 0; i <= a.ci; i++) {
      const c = a.cases[i];
      const label = (c.kind === 'stuck' ? 'Case STUCK — nước đi sai, băng chuyền kẹt' : 'Case WIN — lời giải đúng') + (i === a.ci && a.mode === 'step' ? ' · chạy từng bước, chờ băng chuyền lắng' : '');
      html += `<div class="case ${c.kind}">${label}${a.ended[i] ? `<br /><span style="font-weight:600;color:var(--navy)">→ ${a.ended[i]}</span>` : ''}${i === a.ci && a.last ? `<br /><span style="font-weight:600;color:var(--navy)">${a.last}</span>` : ''}</div>`;
    }
    if (a.until === Infinity) html += `<div class="t" style="margin-top:8px">Xong. Bấm <b>Dừng</b> để quay lại chế độ sửa.</div>`;
  } else if (sess?.mode === 'play') {
    const g = sess.game;
    const total = g.sand.counts.reduce((x, y) => x + y, 0);
    html += `<b>Đang chơi thử</b><br />Cát còn lại: <b>${g.sand.total}</b><br />Xô còn trên bàn: <b>${g.board.remaining}</b> · trên băng chuyền: <b>${g.slotsUsed}/${g.slots}</b><br />Đã bấm: ${g.stats.taps} · bị chặn: ${g.stats.rejects}`;
    void total;
    if (g.status === 'won') html += `<div class="case win">THẮNG — đã hút hết cát (${g.time.toFixed(1)} s)</div>`;
    if (g.status === 'lost') html += `<div class="case stuck">THUA — băng chuyền kẹt</div>`;
  } else {
    const problems = validate(en.def, layer);
    for (const p of problems) html += `<div class="warn">⚠ ${p}</div>`;
    if (gen.running) html += `<div><span class="spin"></span><b>Đang gen bài toán xô (${tagText(en.tag)})</b><br /><span class="t">${gen.text}</span></div>`;
    else if (en.genNote) html += `<div class="case ${en.genNote.startsWith('✓') ? 'win' : 'stuck'}">${en.genNote}</div>`;
    for (const h of en.genHints ?? []) html += `<div class="warn">→ ${h}</div>`;
    html += `<div>Độ khó gán: <span class="badge ${en.tag ?? 'unknown'}">${tagText(en.tag)}</span>${en.tag ? '' : ' <span class="t">— chọn độ khó mong muốn rồi bấm Gen</span>'}</div>`;
    const a = en.analysis;
    const fresh = a && !needsAnalysis(en);
    if (pending && pending.entryId === en.id) html += `<div><span class="spin"></span>Đang chạy mô phỏng… (khoảng 10–40 giây)</div>`;
    if (a && !problems.length) {
      const meas = !en.tag ? 'chưa gán độ khó' : a.difficulty === en.tag ? 'khớp độ khó gán' : 'lệch độ khó gán';
      html += `<div>Tool đo được: ${diffBadge(a.difficulty)} <span class="t">(${meas})</span> ${fresh ? '' : '<span class="t">(kết quả cũ)</span>'}</div>`;
      html += `<div class="t">Ván ngẫu nhiên: thắng <b>${a.wins}/${a.runs}</b> · kẹt <b>${a.stucks}</b></div>`;
      html += `<div class="t">Lượt đầu: <b>${a.openAtStart}</b> xô mở · <b>${a.colorsAtStart}</b> màu</div>`;
      html += `<div class="t">Case win: <b>${a.winTaps ? `${a.winTaps.length} bước` : 'chưa có'}</b> · Case stuck: <b>${a.stuckTaps ? `${a.stuckTaps.length} bước` : 'không có'}</b></div>`;
      if (a.path) html += pathHtml(a.path);
      for (const n of a.notes) html += `<div class="warn">${n}</div>`;
      if (en.tag === 'easy') html += `<div class="t" style="margin-top:6px">Tag Dễ — Tự giải chỉ chạy case win.</div>`;
      else html += `<div class="t" style="margin-top:6px">Tag ${tagText(en.tag)} — Tự giải chạy case stuck trước, rồi case win${a.stuckTaps ? '' : ' (chưa tìm thấy case stuck cho màn này)'}.</div>`;
    } else if (!pending && !problems.length) {
      html += `<div class="t">Chưa chạy mô phỏng</div><div class="t">Hiện thứ tự chọn xô khi có lời giải.</div>`;
    }
  }
  if (html === lastResultSig) return;
  lastResultSig = html;
  el.innerHTML = html;
}

function syncStatus(): void {
  renderHeader();
  renderResult();
}

function syncAll(): void {
  lastBoardSig = ''; lastBeltSig = ''; lastResultSig = '';
  renderConfig();
  renderList();
  renderBoard(true);
  renderBelt();
  drawSand();
  syncStatus();
}

// ───────────────────────────── editing ─────────────────────────────
function edited(): void {
  const en = cur();
  en.analysisKey = undefined;
  save();
  lastBoardSig = '';
  renderConfig();
  renderList();
  renderBoard(true);
  drawSand();
  lastResultSig = '';
  renderResult();
  requestAnalysis();
}

function selectLevel(i: number): void {
  if (i === sel && !sess) return;
  sess = null;
  wantAuto = false;
  sel = i;
  save();
  syncAll();
  requestAnalysis();
}

// ───────────────────────────── generator ─────────────────────────────
function stopGen(): void {
  for (const w of gen.workers) w.terminate();
  gen.workers = [];
  gen.running = false;
  syncAll();
}

function mechCounts(): Record<MechKey, number> {
  const out = {} as Record<MechKey, number>;
  for (const k of Object.keys(genMech) as MechKey[]) out[k] = genMech[k].on ? genMech[k].n : 0;
  return out;
}

function startGen(): void {
  const en = cur();
  if (sess) return;
  if (!en.tag) { en.genNote = '⚠ Chọn độ khó mong muốn (Dễ / Khó / Siêu khó) trước khi gen.'; lastResultSig = ''; renderResult(); return; }
  const wantTag: Tag = en.tag;
  window.clearTimeout(analyzeTimer);
  worker?.terminate();
  worker = null;
  pending = null;
  gen.running = true;
  gen.t0 = Date.now();
  gen.text = 'Bắt đầu…';
  en.genNote = undefined;
  en.genHints = undefined;
  const key = levelKey(en.def, layer) + Date.now();
  // several workers race with different seeds: the first layout that matches the tag wins
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
  const target = en;
  const tagAtStart = wantTag;
  const results: GenResult[] = [];
  let finished = 0;
  let errorText = '';
  const finish = (r: GenResult | null): void => {
    for (const w of gen.workers) w.terminate();
    gen.workers = [];
    gen.running = false;
    if (r) {
      const carved = r.def.tiles.join('|') !== target.def.tiles.join('|');
      target.def = r.def;
      target.analysis = r.analysis ?? undefined;
      target.analysisKey = r.analysis ? levelKey(r.def, layer) : undefined;
      target.genHints = r.hints ?? [];
      target.genHistory = [layoutSig(r.def), ...(target.genHistory ?? [])].slice(0, 16);
      target.genNote = (r.matched ? '✓ ' : '⚠ ') + r.note + (carved ? ' Hình dạng bàn đã được chỉnh (thêm hàng cho miệng hầm hoặc khoét ô).' : '') + (r.matched ? '' : ` (tag ${TAG_TEXT[tagAtStart]})`);
      save();
    } else target.genNote = '⚠ Lỗi khi gen: ' + errorText;
    syncAll();
    requestAnalysis();
  };
  const seedBase = Math.floor(Math.random() * 1e9) + 1;
  for (let i = 0; i < n; i++) {
    const w = new WorkerCtor();
    gen.workers.push(w);
    w.onmessage = (e: MessageEvent<{ kind: string; key: string; text?: string; result?: GenResult; error?: string }>) => {
      if (e.data.key !== key || !gen.running) return;
      if (e.data.kind === 'progress') {
        if (i === 0) { gen.text = `⏱ ${Math.round((Date.now() - gen.t0) / 1000)}s · ` + (n > 1 ? `${n} luồng · ` : '') + (e.data.text ?? ''); lastResultSig = ''; renderResult(); }
        return;
      }
      finished++;
      if (e.data.kind === 'gen' && e.data.result) {
        if (e.data.result.matched) { finish(e.data.result); return; }
        results.push(e.data.result);
      } else errorText = e.data.error ?? '';
      if (finished >= n) {
        // none matched: keep the layout whose measured difficulty is the closest to the tag
        const pick = results.find((r) => r.analysis?.difficulty === tagAtStart) ?? results[0] ?? null;
        finish(pick);
      }
    };
    const req: WorkerRequest = { kind: 'gen', key, def: en.def, opts: { tag: wantTag, layer, budgetMs: genSecs * 1000, seed: (seedBase + i * 7919) % 1_000_000_007 + 1, shape: allowShape, fill: fillPct / 100, mech: mechCounts(), avoid: [layoutSig(en.def), ...(en.genHistory ?? [])] } };
    w.postMessage(req);
  }
  syncAll();
}

// ───────────────────────────── events ─────────────────────────────
document.addEventListener('click', (ev) => {
  const t = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
  if (!t) return;
  const en = cur();
  if (t.dataset.tag) { en.tag = t.dataset.tag as Tag; save(); renderConfig(); renderList(); lastResultSig = ''; renderResult(); return; }
  if (t.id === 'bGen') { if (gen.running) stopGen(); else startGen(); return; }
  if (t.dataset.tool) { tool = t.dataset.tool as Tool; renderConfig(); lastBoardSig = ''; renderBoard(true); return; }
  if (t.dataset.dir) { toolOpt.dir = t.dataset.dir as Dir; renderConfig(); return; }
  if (t.dataset.color) { color = Number(t.dataset.color); renderConfig(); return; }
  if (t.dataset.lv) { selectLevel(Number(t.dataset.lv)); return; }
  if (t.dataset.st) {
    const d = Number(t.dataset.d);
    const k = t.dataset.st;
    if (k === 'ofrozen') { toolOpt.frozen = Math.min(5, Math.max(1, toolOpt.frozen + d)); renderConfig(); return; }
    if (k === 'opair') { toolOpt.pair = Math.min(9, Math.max(1, toolOpt.pair + d)); renderConfig(); return; }
    if (k === 'osize') { toolOpt.rodSize = Math.min(4, Math.max(2, toolOpt.rodSize + d)); renderConfig(); return; }
    if (k === 'gm') { const mk = t.dataset.k as MechKey; genMech[mk].n = Math.min(MECH_INFO[mk].max, Math.max(1, genMech[mk].n + d)); save(); renderConfig(); return; }
    if (k === 'colors') { maxColors = Math.min(SAND_COLORS.length, Math.max(2, maxColors + d)); save(); renderConfig(); return; }
    if (k === 'fill') { fillPct = Math.min(100, Math.max(30, fillPct + d * 10)); save(); renderConfig(); return; }
    if (k === 'gen') { genSecs = Math.min(180, Math.max(15, genSecs + d * 15)); save(); renderConfig(); return; }
    if (sess || gen.running) return;
    if (k === 'cols') { resize(en.def, Math.min(MAX_COLS, Math.max(MIN_SIZE, en.def.tiles[0].length + d)), en.def.tiles.length); edited(); }
    else if (k === 'rows') { resize(en.def, en.def.tiles[0].length, Math.min(MAX_ROWS, Math.max(MIN_SIZE, en.def.tiles.length + d))); edited(); }
    else if (k === 'slots') { en.def.slots = Math.min(8, Math.max(1, (en.def.slots ?? DEFAULT_SLOTS) + d)); edited(); }
    else if (k === 'layer') { layer = Math.min(16, Math.max(0, layer + d)); LANE.layerGrains = layer; for (const e of entries) if (e !== en) { /* other analyses become stale through their key */ } save(); renderConfig(); renderList(); lastResultSig = ''; renderResult(); requestAnalysis(); }
    return;
  }
  if (t.id === 'bPlay') { if (sess) exitPlay(); else startPlay(); return; }
  if (t.id === 'bAuto') { onAutoClick(); return; }
  if (t.id === 'artBtn') { $<HTMLInputElement>('file').click(); return; }
  if (t.id === 'bExport') { void exportToGame(); return; }
  if (t.id === 'bAdd') {
    const n = entries.filter((e) => !e.builtin).length + 1;
    const def = blankLevel(100 + n + Math.floor(Math.random() * 1000), `Màn mới ${n}`, en.def.customArt ? 0 : en.def.art);
    if (en.def.customArt) def.customArt = en.def.customArt;
    entries.push({ id: `custom-${Date.now()}`, builtin: false, def, tag: null });
    selectLevel(entries.length - 1);
    return;
  }
  if (t.id === 'bReset') {
    if (en.builtin) {
      const orig = LEVELS.find((l) => `builtin-${l.id}` === en.id)!;
      en.def = cloneDef(orig as DesignLevel);
      const pre = (PRE as Record<string, Analysis>)[en.id];
      en.analysis = pre; en.analysisKey = pre ? levelKey(en.def, DEFAULT_LAYER) : undefined;
      sess = null;
      save(); syncAll(); requestAnalysis();
    } else {
      entries.splice(sel, 1);
      sel = Math.max(0, sel - 1);
      sess = null;
      save(); syncAll(); requestAnalysis();
    }
    return;
  }
  const cell = t.closest('.cell') as HTMLElement | null;
  if (cell) {
    const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
    if (sess) {
      if (sess.mode !== 'play' || sess.game.status !== 'playing') return;
      const id = sess.game.board.occ[r * en.def.tiles[0].length + c];
      if (id >= 0) sess.game.tap(id);
    } else {
      applyTool(en.def, r, c, tool, color, toolOpt);
      edited();
    }
  }
});

function download(name: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/**
 * Moves the levels into the game's source without rewriting what is there: new levels are appended to level-data.ts, a level
 * that was exported before (or a level of the game that was edited) replaces its own block, pictures of uploaded images are
 * appended to art-data.ts. Choose the game's src/core folder; if the browser cannot write there, the new blocks are downloaded.
 */
async function exportToGame(): Promise<void> {
  const note = (t: string) => { $('exportNote').textContent = t; };
  if (sess || gen.running) { note('Dừng chơi thử / gen trước khi xuất.'); return; }
  const bad = entries.map((e, i) => ({ i, p: validate(e.def, layer) })).filter((x) => x.p.length > 0);
  if (bad.length) { note(`Màn ${bad.map((x) => pad(x.i + 1)).join(', ')} còn lỗi (${bad[0].p[0]}) — sửa xong mới xuất được.`); return; }
  const list = entries.map((e) => {
    const orig = e.builtin ? LEVELS.find((l) => `builtin-${l.id}` === e.id) : undefined;
    return { def: e.def, tag: e.tag, builtin: e.builtin, gameId: e.gameId, edited: e.builtin ? !orig || JSON.stringify(orig) !== JSON.stringify(e.def) : true };
  });
  const done = (m: MergeResult) => {
    m.ids.forEach((id, i) => { if (!entries[i].builtin) entries[i].gameId = id; });
    save();
  };
  type FileH = { getFile(): Promise<{ text(): Promise<string> }>; createWritable(): Promise<{ write(d: string): Promise<void>; close(): Promise<void> }> };
  type Dir = { getFileHandle(n: string): Promise<FileH> };
  const picker = (window as unknown as { showDirectoryPicker?: (o: { mode: string }) => Promise<Dir> }).showDirectoryPicker;
  if (picker) {
    try {
      const dir = await picker.call(window, { mode: 'readwrite' });
      const lvFile = await dir.getFileHandle('level-data.ts');
      const artFile = await dir.getFileHandle('art-data.ts');
      const m = mergeIntoGame(await (await lvFile.getFile()).text(), await (await artFile.getFile()).text(), list);
      if (!m.added && !m.replaced) { note('Không có gì để ghi: các màn có sẵn của game chưa sửa và chưa có màn nào của bạn.'); return; }
      const ask = `Ghi vào game:\n• ${m.added} màn mới (thêm vào cuối danh sách)\n• ${m.replaced} màn được cập nhật\n• ${m.newArts} tranh mới\n\nCác màn khác giữ nguyên.`;
      if (!window.confirm(ask)) return;
      const w = await lvFile.createWritable();
      await w.write(m.levelData);
      await w.close();
      if (m.newArts) { const wa = await artFile.createWritable(); await wa.write(m.artData); await wa.close(); }
      done(m);
      note(`✓ Đã ghi vào game: ${m.added} màn mới, ${m.replaced} màn cập nhật, ${m.newArts} tranh mới. Chạy lại game / npm run build để thấy.`);
      return;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      if (name === 'AbortError') return;
      if (name === 'NotFoundError') { note('Thư mục đó không có level-data.ts / art-data.ts — hãy chọn đúng thư mục src/core của game.'); return; }
      /* anything else: fall back to downloading the blocks */
    }
  }
  const fakeLevels = 'export const LEVEL_DATA: LevelDef[] = [\n' + LEVELS.map((l) => `  {\n    id: ${l.id},\n  },`).join('\n') + '\n];\n';
  const fakeArts = 'export const ART_SOURCES: ArtSource[] = [\n' + ART_SOURCES.slice(0, BUILTIN_ARTS).map((a) => `  { name: ${JSON.stringify(a.name)} },`).join('\n') + '\n];\n';
  const m = mergeIntoGame(fakeLevels, fakeArts, list);
  if (!m.added && !m.replaced) { note('Không có gì để xuất: các màn có sẵn của game chưa sửa và chưa có màn nào của bạn.'); return; }
  download('new-levels.txt', '// Dán các khối này vào cuối mảng LEVEL_DATA trong src/core/level-data.ts (khối trùng id thì thay khối cũ).\n' + m.levelBlocks + '\n');
  if (m.newArts) download('new-arts.txt', '// Dán các khối này vào cuối mảng ART_SOURCES trong src/core/art-data.ts.\n' + m.artBlocks + '\n');
  done(m);
  note(`Trình duyệt không cho ghi thẳng: đã tải ${m.newArts ? '2 file' : '1 file'} (${m.added} màn mới, ${m.replaced} cập nhật). Dán vào src/core của game.`);
}


document.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset?.gm) { genMech[el.dataset.gm as MechKey].on = el.checked; save(); renderConfig(); }
});
$<HTMLSelectElement>('themeSel').addEventListener('change', (e) => { cur().def.theme = (e.target as HTMLSelectElement).value; edited(); });
$<HTMLInputElement>('chkAuto').addEventListener('change', (e) => { autoGen = (e.target as HTMLInputElement).checked; save(); });
$<HTMLInputElement>('chkShape').addEventListener('change', (e) => { allowShape = (e.target as HTMLInputElement).checked; save(); });

$<HTMLSelectElement>('artSel').addEventListener('change', (e) => {
  const v = (e.target as HTMLSelectElement).value;
  const en = cur();
  if (v === 'custom') return;
  delete en.def.customArt;
  en.def.art = Number(v);
  edited();
});

function readArt(f: File): Promise<ArtSource> {
  return new Promise((resolve, reject) => {
    if (!f.type.startsWith('image/')) { reject(new Error('Không phải file ảnh')); return; }
    const img = new Image();
    img.onload = () => { resolve(artFromImage(img, f.name.replace(/.[^.]+$/, ''), maxColors)); URL.revokeObjectURL(img.src); };
    img.onerror = () => reject(new Error('Không đọc được ảnh'));
    img.src = URL.createObjectURL(f);
  });
}

/** Picture picked with the button: replaces the picture of the current level. */
async function pickImage(f: File): Promise<void> {
  if (sess || gen.running) return;
  try {
    cur().def.customArt = await readArt(f);
    edited();
    if (autoGen) startGen();
  } catch (err) { cur().genNote = '⚠ ' + String(err instanceof Error ? err.message : err); lastResultSig = ''; renderResult(); }
}

/** Picture dropped on the page: becomes a new level, generated for the tag that is selected now. */
async function dropImage(f: File): Promise<void> {
  if (sess || gen.running) return;
  try {
    const art = await readArt(f);
    const n = entries.filter((e) => !e.builtin).length + 1;
    const def = blankLevel(100 + n + Math.floor(Math.random() * 1000), art.name || `Màn mới ${n}`, 0);
    def.customArt = art;
    entries.push({ id: `custom-${Date.now()}`, builtin: false, def, tag: null });
    selectLevel(entries.length - 1);
    if (autoGen) startGen();
  } catch (err) { cur().genNote = '⚠ ' + String(err instanceof Error ? err.message : err); lastResultSig = ''; renderResult(); }
}

$<HTMLInputElement>('file').addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  (e.target as HTMLInputElement).value = '';
  if (f) void pickImage(f);
});

let dragDepth = 0;
const hasFiles = (ev: DragEvent) => !!ev.dataTransfer && [...ev.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (ev) => { if (hasFiles(ev)) { dragDepth++; document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', (ev) => { if (hasFiles(ev) && --dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
window.addEventListener('dragover', (ev) => { if (hasFiles(ev)) ev.preventDefault(); });
window.addEventListener('drop', (ev) => {
  if (!hasFiles(ev)) return;
  ev.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  const f = [...(ev.dataTransfer?.files ?? [])].find((x) => x.type.startsWith('image/'));
  if (f) void dropImage(f);
});

// ───────────────────────────── main loop ─────────────────────────────
let prev = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - prev) / 1000);
  prev = now;
  if (sess) {
    if (sess.mode === 'play') {
      if (sess.game.status === 'playing') sess.game.advance(dt);
    } else autoAdvance(now);
    renderBoard();
    renderBelt();
    drawSand();
    if (sess.mode === 'play') renderResult();
  }
  requestAnimationFrame(frame);
}

LANE.layerGrains = layer;
syncAll();
requestAnimationFrame(frame);
requestAnalysis(true);
void SIM_HZ;
void analyze;
