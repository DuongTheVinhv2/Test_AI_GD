/** Shared shapes of the analytics tool: personas, bot results and the dataset every chart reads. */

/**
 * A kind of player the bot imitates. The first block says how it plays a level (it feeds the real game core),
 * the second how it behaves around the level (it feeds the journey simulation).
 */
export interface PersonaDef {
  id: string;
  name: string;
  color: string;
  /** Share of the player base, 0..1 (the shares of all personas are normalised before use). */
  share: number;

  // ---- how it plays one level
  /** random: any bucket it can tap. exposed: a bucket whose colour lies on the sand floor. cheapest: like exposed, but takes the smallest such bucket (it fills fastest). */
  policy: 'random' | 'exposed' | 'smallest';
  /** When it has to dig (no useful bucket is free) it looks this many taps ahead. 0 = taps at random. */
  lookDepth: number;
  /** Belt slots it keeps free while digging; it waits instead of filling the belt. */
  reserveSlots: number;
  /** Seconds between two taps, drawn uniformly. */
  thinkMin: number;
  thinkMax: number;
  /** Chance that a tap goes to a random open bucket instead of the one it chose. */
  miss: number;

  // ---- how it behaves around the level (journey simulation)
  /** Chance to stop for good after a lost attempt. */
  quitAfterLoss: number;
  /** Chance to leave the game after clearing a level. */
  leaveAfterWin: number;
  /** With no hearts left: chance to watch a rewarded ad, to buy hearts, to wait for regen. The rest quits. */
  adProb: number;
  buyProb: number;
  waitProb: number;
}

/** Result of one bot game. */
export interface GameResult {
  won: boolean;
  /** 'win' | 'stuck' (the belt jammed, the game said lost) | 'timeout' (the time cap ran out). */
  reason: 'win' | 'stuck' | 'timeout';
  /** Game seconds. */
  time: number;
  taps: number;
  /** Share of the sand still in the frame at the end, 0..1. */
  sandLeft: number;
  maxSlots: number;
  fullTime: number;
  idleTime: number;
}

/** What one level is made of (from its definition, or from table 04 of a GD export). */
export interface LevelMeta {
  level: number;
  name: string;
  hard?: boolean;
  buckets?: number;
  mystery?: number;
  colors?: number;
  floor?: number;
  holes?: number;
  slots?: number;
  /** Buckets that must leave before the first useful one can be tapped. */
  depthFirst?: number;
  depthMax?: number;
  depthAvg?: number;
  openAtStart?: number;
  openNeeded?: number;
  /** Chance that a blind first tap is a useful one, 0..1. */
  firstTapGood?: number;
}

export interface PersonaMeta {
  id: string;
  name: string;
  color: string;
  /** Share of players, 0..1. */
  share: number;
}

/** One level x one persona. */
export interface Cell {
  level: number;
  persona: string;
  runs: number;
  /** 0..1 */
  winRate: number;
  avgWinTime?: number;
  avgTime?: number;
  taps?: number;
  /** Among lost games: share that ended because the belt jammed (the rest timed out), 0..1. */
  stuckShare?: number;
  /** Among lost games: sand still in the frame, 0..1. */
  sandLeftOnLoss?: number;
  /** Among lost games: ended with under a fifth of the sand left, 0..1. */
  nearMiss?: number;
  maxSlots?: number;
  fullTime?: number;
  idleTime?: number;
}

/** A funnel measured elsewhere (table 01 of a GD export), kept to compare with the journey simulation. */
export interface MeasuredFunnel {
  level: number;
  entered: number;
  plays: number;
  wins: number;
  quit: number;
  leftAfterWin: number;
  coinsPaid: number;
}

export interface Dataset {
  id: string;
  title: string;
  /** Where the numbers come from, shown in every report. */
  origin: 'bot' | 'csv' | 'sample';
  note: string;
  createdAt: string;
  personas: PersonaMeta[];
  levels: LevelMeta[];
  cells: Cell[];
  measured?: MeasuredFunnel[];
}

export const cellOf = (d: Dataset, level: number, persona: string): Cell | undefined =>
  d.cells.find((c) => c.level === level && c.persona === persona);

/** Population-weighted win rate of a level: what the average player of the mix experiences on one attempt. */
export function mixWinRate(d: Dataset, level: number): number {
  let w = 0, s = 0;
  for (const p of d.personas) {
    const c = cellOf(d, level, p.id);
    if (!c) continue;
    w += p.share;
    s += p.share * c.winRate;
  }
  return w > 0 ? s / w : 0;
}
