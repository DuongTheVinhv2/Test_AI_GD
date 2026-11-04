import { LEVEL_REWARD } from '../core/config';
import { AD_HEARTS, FIRST_TRY_BONUS, HARD_REWARD, HEART_MAX, HEART_PRICE, HEART_REGEN_S } from '../core/economy';
import { Rng } from '../core/rng';
import { cellOf, mixWinRate, type Dataset, type PersonaDef } from './types';

/**
 * Journey simulation: a crowd of virtual players walks through the levels. The win chance of each attempt is the measured
 * win rate of the player's persona on that level; the rest (hearts, coins, ads, quitting) follows the game's economy rules.
 * It answers what the bot cannot: how long people take, where they leave, whether they run out of hearts or coins.
 */
export interface EconomyParams {
  heartMax: number;
  regenSeconds: number;
  heartPrice: number;
  adHearts: number;
  /** Seconds a rewarded ad takes. */
  adSeconds: number;
  rewardFirst: number;
  rewardHard: number;
  firstTryBonus: number;
  startCoins: number;
  /** Seconds between two attempts spent in menus. */
  menuSeconds: number;
}

export const DEFAULT_ECONOMY: EconomyParams = {
  heartMax: HEART_MAX,
  regenSeconds: HEART_REGEN_S,
  heartPrice: HEART_PRICE,
  adHearts: AD_HEARTS,
  adSeconds: 30,
  rewardFirst: LEVEL_REWARD,
  rewardHard: HARD_REWARD,
  firstTryBonus: FIRST_TRY_BONUS,
  startCoins: 0,
  menuSeconds: 6,
};

export interface JourneyParams {
  players: number;
  seed: number;
  economy: EconomyParams;
  /** Levels flagged hard pay the hard reward. */
  hardLevels: number[];
}

export interface LevelFunnel {
  level: number;
  entered: number;
  passed: number;
  quitLoss: number;
  quitHearts: number;
  leftAfterWin: number;
  attempts: number;
  losses: number;
  firstTry: number;
  coinsIn: number;
  coinsOut: number;
  outOfHearts: number;
  ads: number;
  buys: number;
  waits: number;
  /** Seconds of actual play. */
  playSeconds: number;
  /** Median wall-clock seconds since install when the level was first entered. */
  medianArrival: number;
}

/** A snapshot of the crowd at one moment, what the diagram shows. */
export interface Sample {
  t: number;
  /** Players currently inside each level (between attempts or playing). */
  active: number[];
  waiting: number;
  quitLoss: number;
  quitHearts: number;
  leftAfterWin: number;
  done: number;
  avgCoins: number;
  /** Average hearts of the players who are still in the game. */
  avgHearts: number;
  cumAttempts: number;
  cumWins: number;
  cumLosses: number;
  cumAds: number;
  cumBuys: number;
  cumWaits: number;
  cumCoinsIn: number;
  cumCoinsOut: number;
}

export interface JourneyResult {
  params: JourneyParams;
  levels: LevelFunnel[];
  samples: Sample[];
  players: number;
  /** Players that reached the end of the last level. */
  finished: number;
  quitTotal: number;
  /** Mean wall-clock seconds from first launch to the last event. */
  meanSeconds: number;
  endOfTime: number;
}

type State = 'play' | 'wait' | 'quitLoss' | 'quitHearts' | 'leftWin' | 'done';
interface Entry { t: number; state: State; level: number; hearts: number; coins: number }
type FlowKind = 'attempt' | 'win' | 'loss' | 'ad' | 'buy' | 'wait' | 'coinsIn' | 'coinsOut';

const jitter = (rng: Rng, mean: number) => Math.max(1, mean * (0.8 + rng.next() * 0.4));

export function runJourney(d: Dataset, personas: PersonaDef[], params: JourneyParams): JourneyResult {
  const rng = new Rng(params.seed);
  const eco = params.economy;
  const nLevels = d.levels.length;
  const levelNo = d.levels.map((l) => l.level);

  // per persona x level: win chance and the length of a winning / losing attempt
  const behave = new Map(personas.map((p) => [p.id, p]));
  const table = d.personas.map((pm) => {
    const rows = levelNo.map((L) => {
      const c = cellOf(d, L, pm.id);
      const win = c ? c.winRate : mixWinRate(d, L);
      const winT = c?.avgWinTime ?? c?.avgTime ?? 30;
      let lossT = 15;
      if (c && c.avgTime !== undefined && c.avgWinTime !== undefined && c.winRate < 1) lossT = Math.max(2, (c.avgTime - c.winRate * c.avgWinTime) / (1 - c.winRate));
      else if (c?.avgTime !== undefined && c.winRate === 0) lossT = c.avgTime;
      return { win, winT, lossT };
    });
    return rows;
  });
  const shares = d.personas.map((p) => Math.max(0, p.share));
  const shareSum = shares.reduce((a, b) => a + b, 0) || 1;

  const lv: LevelFunnel[] = levelNo.map((level) => ({
    level, entered: 0, passed: 0, quitLoss: 0, quitHearts: 0, leftAfterWin: 0, attempts: 0, losses: 0, firstTry: 0,
    coinsIn: 0, coinsOut: 0, outOfHearts: 0, ads: 0, buys: 0, waits: 0, playSeconds: 0, medianArrival: 0,
  }));
  const arrivals: number[][] = levelNo.map(() => []);
  const timelines: Entry[][] = [];
  const flows: { t: number; k: FlowKind; v: number }[] = [];
  const flow = (t: number, k: FlowKind, v = 1) => flows.push({ t, k, v });

  for (let n = 0; n < params.players; n++) {
    // pick the persona
    let r = rng.next() * shareSum, pi = 0;
    for (; pi < shares.length - 1; pi++) { if (r < shares[pi]) break; r -= shares[pi]; }
    const pm = d.personas[pi];
    const b = behave.get(pm.id) ?? personas[Math.min(pi, personas.length - 1)];
    const rows = table[pi];

    let t = 0, level = 0, coins = eco.startCoins, hearts = eco.heartMax, nextAt = Infinity, tries = 0;
    const tl: Entry[] = [];
    const push = (state: State) => tl.push({ t, state, level: Math.min(level, nLevels - 1), hearts, coins });
    const sync = () => {
      while (hearts < eco.heartMax && nextAt <= t) { hearts++; nextAt = hearts >= eco.heartMax ? Infinity : nextAt + eco.regenSeconds; }
      if (hearts >= eco.heartMax) nextAt = Infinity;
    };
    arrivals[0].push(0);
    lv[0].entered++;
    push('play');

    for (let guard = 0; guard < 4000; guard++) {
      sync();
      if (hearts <= 0) {
        lv[level].outOfHearts++;
        const x = rng.next();
        if (coins >= eco.heartPrice && x < b.buyProb) {
          const k = Math.min(eco.heartMax - hearts, Math.floor(coins / eco.heartPrice));
          coins -= k * eco.heartPrice; hearts += k;
          lv[level].buys++; lv[level].coinsOut += k * eco.heartPrice;
          flow(t, 'buy'); flow(t, 'coinsOut', k * eco.heartPrice);
          push('play');
        } else if (x < b.buyProb + b.adProb) {
          t += eco.adSeconds; hearts = Math.min(eco.heartMax, hearts + eco.adHearts);
          if (hearts >= eco.heartMax) nextAt = Infinity;
          lv[level].ads++; flow(t, 'ad');
          push('play');
        } else if (x < b.buyProb + b.adProb + b.waitProb) {
          push('wait');
          lv[level].waits++; flow(t, 'wait');
          t = Math.max(t, nextAt);
          sync();
          push('play');
        } else {
          lv[level].quitHearts++;
          push('quitHearts');
          break;
        }
        continue;
      }

      // one attempt
      const row = rows[level];
      const L = lv[level];
      L.attempts++; flow(t, 'attempt');
      const win = rng.chance(row.win);
      if (win) {
        const dur = jitter(rng, row.winT);
        t += dur; L.playSeconds += dur;
        const hard = params.hardLevels.includes(levelNo[level]);
        const pay = (hard ? eco.rewardHard : eco.rewardFirst) + (tries === 0 ? eco.firstTryBonus : 0);
        coins += pay; L.coinsIn += pay; flow(t, 'coinsIn', pay); flow(t, 'win');
        L.passed++; if (tries === 0) L.firstTry++;
        tries = 0;
        level++;
        if (level >= nLevels) { level = nLevels - 1; push('done'); break; }
        if (rng.chance(b.leaveAfterWin)) { lv[level - 1].leftAfterWin++; push('leftWin'); break; }
        lv[level].entered++; arrivals[level].push(t);
        t += eco.menuSeconds;
        push('play');
      } else {
        const dur = jitter(rng, row.lossT);
        t += dur; L.playSeconds += dur;
        L.losses++; flow(t, 'loss');
        tries++;
        // a thrown-away attempt costs one heart
        sync();
        if (hearts >= eco.heartMax) nextAt = t + eco.regenSeconds;
        hearts--;
        if (rng.chance(b.quitAfterLoss)) { L.quitLoss++; push('quitLoss'); break; }
        t += eco.menuSeconds;
        push('play');
      }
    }
    timelines.push(tl);
  }

  for (let i = 0; i < nLevels; i++) {
    const a = arrivals[i].sort((x, y) => x - y);
    lv[i].medianArrival = a.length ? a[Math.floor(a.length / 2)] : 0;
    lv[i].coinsIn = Math.round(lv[i].coinsIn);
  }

  // ---- snapshots over time
  const ends = timelines.map((tl) => tl[tl.length - 1].t).sort((a, b) => a - b);
  const endOfTime = Math.max(60, Math.min(ends[Math.floor(ends.length * 0.985)] ?? 3600, 7 * 86400));
  const S = 160;
  const dt = endOfTime / S;
  const samples: Sample[] = [];
  const sortedFlows = flows.sort((a, b) => a.t - b.t);
  let fi = 0;
  const cum = { attempt: 0, win: 0, loss: 0, ad: 0, buy: 0, wait: 0, coinsIn: 0, coinsOut: 0 };
  for (let s = 0; s <= S; s++) {
    const T = s * dt;
    while (fi < sortedFlows.length && sortedFlows[fi].t <= T) { cum[sortedFlows[fi].k] += sortedFlows[fi].v; fi++; }
    const active = new Array(nLevels).fill(0);
    let waiting = 0, quitLoss = 0, quitHearts = 0, leftWin = 0, done = 0, coinSum = 0, heartSum = 0, heartN = 0;
    for (const tl of timelines) {
      let lo = 0, hi = tl.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tl[m].t <= T) lo = m; else hi = m - 1; }
      const e = tl[lo];
      coinSum += e.coins;
      switch (e.state) {
        case 'play': active[e.level]++; heartSum += e.hearts; heartN++; break;
        case 'wait': waiting++; active[e.level]++; heartSum += e.hearts; heartN++; break;
        case 'quitLoss': quitLoss++; break;
        case 'quitHearts': quitHearts++; break;
        case 'leftWin': leftWin++; break;
        case 'done': done++; break;
      }
    }
    samples.push({
      t: T, active, waiting, quitLoss, quitHearts, leftAfterWin: leftWin, done,
      avgCoins: coinSum / params.players, avgHearts: heartN ? heartSum / heartN : 0,
      cumAttempts: cum.attempt, cumWins: cum.win, cumLosses: cum.loss, cumAds: cum.ad, cumBuys: cum.buy, cumWaits: cum.wait,
      cumCoinsIn: cum.coinsIn, cumCoinsOut: cum.coinsOut,
    });
  }

  const finished = timelines.filter((tl) => tl[tl.length - 1].state === 'done').length;
  return {
    params, levels: lv, samples, players: params.players, finished,
    quitTotal: params.players - finished,
    meanSeconds: ends.reduce((a, b) => a + b, 0) / Math.max(1, ends.length),
    endOfTime,
  };
}

