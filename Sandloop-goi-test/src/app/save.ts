import { START_COINS } from '../core/config';
import { LEVELS } from '../core/levels';

export interface LevelRecord {
  attempts: number;
  wins: number;
  fails: number;
  bestTime: number;
  bestTaps: number;
  /** cleared on the very first attempt */
  firstTry: boolean;
}

export interface AttemptLog {
  level: number;
  result: 'win' | 'lose' | 'quit';
  time: number;
  taps: number;
  rejects: number;
  fullTime: number;
  idleTime: number;
  laps: number;
  sandLeft: number;
  at: number;
}

export interface SaveData {
  version: 1;
  coins: number;
  /** highest level the player may open */
  unlocked: number;
  /** level the Play button resumes */
  current: number;
  levels: Record<number, LevelRecord>;
  settings: { sound: boolean; music: boolean; haptics: boolean; colorAssist: boolean };
  /** last attempts, newest last */
  log: AttemptLog[];
  finished: boolean;
  /** one-time hints already shown */
  tips: { mystery: boolean; tap: boolean; blocked: boolean; full: boolean };
  /** Level whose attempt was started (first tap) but not finished: a reload or closed tab counts as an attempt. 0 = none. */
  pending: number;
}

const KEY = 'sandloop.save.v1';

function fresh(): SaveData {
  return {
    version: 1,
    coins: START_COINS,
    unlocked: 1,
    current: 1,
    levels: {},
    settings: { sound: true, music: true, haptics: true, colorAssist: false },
    log: [],
    finished: false,
    tips: { mystery: false, tap: false, blocked: false, full: false },
    pending: 0,
  };
}

const int = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.floor(v))) : d);
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);

/** Rebuild a save from untrusted JSON: anything missing or of the wrong type falls back to its default. Null if unusable. */
function sanitize(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  const f = fresh();
  const n = LEVELS.length;
  f.coins = int(o.coins, 0, 1e9, f.coins);
  f.unlocked = int(o.unlocked, 1, n, 1);
  f.current = int(o.current, 1, n, 1);
  f.finished = bool(o.finished, false);
  f.pending = int(o.pending, 0, n, 0);
  const st = (o.settings ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(f.settings) as Array<keyof SaveData['settings']>) f.settings[k] = bool(st[k], f.settings[k]);
  const tp = (o.tips ?? {}) as Record<string, unknown>;
  for (const k of Object.keys(f.tips) as Array<keyof SaveData['tips']>) f.tips[k] = bool(tp[k], f.tips[k]);
  if (o.levels && typeof o.levels === 'object') {
    for (const [key, val] of Object.entries(o.levels as Record<string, unknown>)) {
      const id = Number(key);
      if (!Number.isInteger(id) || id < 1 || id > n || !val || typeof val !== 'object') continue;
      const r = val as Record<string, unknown>;
      f.levels[id] = { attempts: int(r.attempts, 0, 1e6, 0), wins: int(r.wins, 0, 1e6, 0), fails: int(r.fails, 0, 1e6, 0), bestTime: int(r.bestTime, 0, 1e6, 0), bestTaps: int(r.bestTaps, 0, 1e6, 0), firstTry: bool(r.firstTry, false) };
    }
  }
  if (Array.isArray(o.log)) {
    f.log = (o.log as unknown[]).filter((x): x is AttemptLog => !!x && typeof x === 'object' && typeof (x as AttemptLog).level === 'number' && typeof (x as AttemptLog).result === 'string').slice(-200);
  }
  return f;
}

export class Save {
  data: SaveData;

  constructor() {
    this.data = fresh();
    // The main copy first, then the backup of the last copy that loaded fine, then a fresh save.
    for (const key of [KEY, KEY + '.bak']) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const ok = sanitize(JSON.parse(raw));
        if (!ok) continue;
        this.data = ok;
        if (key === KEY) localStorage.setItem(KEY + '.bak', raw);
        break;
      } catch {
        /* private mode or corrupt data: try the next copy */
      }
    }
  }

  commit(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore quota errors */
    }
  }

  record(level: number): LevelRecord {
    return (this.data.levels[level] ??= { attempts: 0, wins: 0, fails: 0, bestTime: 0, bestTaps: 0, firstTry: false });
  }

  addAttempt(a: AttemptLog): void {
    const r = this.record(a.level);
    r.attempts++;
    if (a.result === 'win') {
      if (r.wins === 0 && r.attempts === 1) r.firstTry = true;
      r.wins++;
      r.bestTime = r.bestTime ? Math.min(r.bestTime, a.time) : a.time;
      r.bestTaps = r.bestTaps ? Math.min(r.bestTaps, a.taps) : a.taps;
    } else if (a.result === 'lose') r.fails++;
    this.data.log.push(a);
    if (this.data.log.length > 200) this.data.log.splice(0, this.data.log.length - 200);
    this.commit();
  }

  addCoins(n: number): void {
    this.data.coins += n;
    this.commit();
  }

  reset(): void {
    this.data = fresh();
    this.commit();
  }
}
