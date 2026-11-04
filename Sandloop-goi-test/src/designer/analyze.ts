import { ART_SOURCES, type ArtSource } from '../core/art-data';
import { LANE } from '../core/config';
import { Game } from '../core/game';
import type { LevelDef } from '../core/levels';
import { COLOR_COUNT } from '../core/palette';
import { mechProblems } from './model';
import { Puzzle, analyzeGraph, fastSearch, sandFor, summarize, type PathSummary } from './fast';
import { applyMove, legalMoves, newGame, randomPlayout, search, searchWin, settle, verdict, type Verdict } from './solver';

/** A level as the designer edits it. `customArt` replaces the built-in picture index. */
export interface DesignLevel extends LevelDef {
  customArt?: ArtSource;
}

export type Difficulty = 'easy' | 'hard' | 'super' | 'unsolvable' | 'unknown';

export interface Analysis {
  difficulty: Difficulty;
  runs: number;
  wins: number;
  stucks: number;
  winTaps: number[] | null;
  stuckTaps: number[] | null;
  openAtStart: number;
  colorsAtStart: number;
  notes: string[];
  ms: number;
  /** Decision-graph measurements (lines, stuck lines, bait, fairness) from the fast model. */
  path?: PathSummary;
}

export const SEED = 1;

/** Make the level playable by the core: register a custom picture and set the global layer rule. */
export function prepare(level: DesignLevel, layer: number): LevelDef {
  LANE.layerGrains = layer;
  if (level.customArt) {
    let i = ART_SOURCES.findIndex((a) => a === level.customArt || (a.name === level.customArt!.name && a.rows.join() === level.customArt!.rows.join()));
    if (i < 0) { ART_SOURCES.push(level.customArt); i = ART_SOURCES.length - 1; }
    return { ...level, art: i };
  }
  return level;
}

/** Problems that make a level unplayable no matter how it is solved. */
export function validate(level: DesignLevel, layer: number): string[] {
  const mech = mechProblems(level);
  if (mech.length) return mech;
  const out: string[] = [];
  const def = prepare(level, layer);
  const g = new Game(def, SEED);
  const has = new Array(COLOR_COUNT).fill(0);
  for (const b of g.board.buckets) has[b.color]++;
  for (let c = 0; c < COLOR_COUNT; c++) {
    if (g.sand.counts[c] > 0 && has[c] === 0) out.push(`Màu #${c} có cát nhưng chưa có xô nào.`);
    if (g.sand.counts[c] === 0 && has[c] > 0) out.push(`Xô màu #${c} không có cát để hút.`);
  }
  if (g.board.buckets.length === 0) out.push('Chưa đặt xô nào.');
  return out;
}

/** Replay a tap list the way the solver found it. */
export function replay(level: DesignLevel, layer: number, taps: number[]): Verdict {
  const g = newGame(prepare(level, layer), SEED);
  settle(g);
  for (const id of taps) {
    g.tap(id);
    settle(g);
  }
  return verdict(g);
}

/** A tap list from the fast model, kept only if the real game confirms it. */
export function confirmedTaps(level: DesignLevel, layer: number, goal: 'won' | 'stuck', ms: number): number[] | null {
  try {
    const def = prepare(level, layer);
    const taps = fastSearch(new Puzzle(def, sandFor(def.art, layer)), goal, { nodes: 40000, ms });
    if (taps && replay(level, layer, taps) === goal) return taps;
  } catch { /* fall back to the real search */ }
  return null;
}

export interface AnalyzeOptions {
  layer: number; playouts: number; winMs: number; stuckMs: number;
  /** Random-play results already measured on the real game for this very layout (skips the slow playouts). */
  known?: { wins: number; stucks: number; runs: number; stuckTaps?: number[] | null };
}

export function analyze(level: DesignLevel, o: AnalyzeOptions): Analysis {
  const t0 = performance.now();
  const notes: string[] = [];
  const res: Analysis = {
    difficulty: 'unknown', runs: 0, wins: 0, stucks: 0, winTaps: null, stuckTaps: null,
    openAtStart: 0, colorsAtStart: 0, notes, ms: 0,
  };
  const problems = validate(level, o.layer);
  if (problems.length) { notes.push(...problems); res.difficulty = 'unsolvable'; res.ms = performance.now() - t0; return res; }
  const def = prepare(level, o.layer);
  const g = newGame(def, SEED);
  settle(g);
  const start = legalMoves(g);
  res.openAtStart = start.length;
  res.colorsAtStart = new Set(start.map((m) => m.color)).size;

  try {
    res.path = summarize(analyzeGraph(new Puzzle(def, sandFor(def.art, o.layer)), { maxNodes: 20000, maxMs: 2500 }));
  } catch { /* the model is an extra, never a blocker */ }

  // the fast model finds the lines, the real game confirms them; the real search is only the fallback
  const quickWin = confirmedTaps(level, o.layer, 'won', 2000);
  res.winTaps = quickWin ?? searchWin(g, o.winMs);
  if (res.winTaps && !quickWin && replay(level, o.layer, res.winTaps) !== 'won') { notes.push('Lời giải tìm được không lặp lại được.'); res.winTaps = null; }

  let stuckPlayout: number[] | null = null;
  if (o.known) {
    res.runs = o.known.runs; res.wins = o.known.wins; res.stucks = o.known.stucks; stuckPlayout = o.known.stuckTaps ?? null;
  } else {
    for (let i = 1; i <= o.playouts; i++) {
      const p = randomPlayout(g, i);
      res.runs++;
      if (p.end === 'won') res.wins++;
      else if (p.end === 'stuck') { res.stucks++; if (!stuckPlayout || p.taps.length < stuckPlayout.length) stuckPlayout = p.taps; }
    }
  }
  let stuckSearch: number[] | null = null;
  let quickStuck: number[] | null = null;
  if (!(res.stucks > 0 && stuckPlayout && stuckPlayout.length <= 6)) {
    quickStuck = confirmedTaps(level, o.layer, 'stuck', 2000);
    stuckSearch = quickStuck && (!stuckPlayout || quickStuck.length <= stuckPlayout.length) ? quickStuck : search(g, 'stuck', { ms: o.stuckMs, nodes: 5000 }, (m) => (m.exposed ? 0 : 10) + (10 - m.row));
  }
  res.stuckTaps = stuckSearch ?? stuckPlayout;
  if (res.stuckTaps && res.stuckTaps !== quickStuck && replay(level, o.layer, res.stuckTaps) !== 'stuck') { notes.push('Case stuck không lặp lại được.'); res.stuckTaps = null; }

  if (!res.winTaps) {
    res.difficulty = performance.now() - t0 > o.winMs ? 'unknown' : 'unsolvable';
    notes.push(res.difficulty === 'unknown' ? 'Chưa tìm thấy lời giải trong thời gian cho phép.' : 'Không có lời giải.');
  } else if (!res.stuckTaps && res.stucks === 0) {
    res.difficulty = 'easy';
  } else {
    res.difficulty = res.wins === 0 ? 'super' : 'hard';
  }
  if (res.winTaps && !res.stuckTaps && res.stucks > 0) notes.push('Có ván ngẫu nhiên bị kẹt nhưng chưa ghi lại được chuỗi bấm — Tự giải chỉ chạy case win.');
  res.ms = performance.now() - t0;
  return res;
}

export { applyMove };
