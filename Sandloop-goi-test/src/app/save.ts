import { START_COINS } from '../core/config';

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
  };
}

export class Save {
  data: SaveData;

  constructor() {
    this.data = fresh();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const j = JSON.parse(raw) as SaveData;
        if (j.version === 1) this.data = { ...fresh(), ...j, settings: { ...fresh().settings, ...j.settings } };
      }
    } catch {
      /* private mode or corrupt data: start fresh */
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
