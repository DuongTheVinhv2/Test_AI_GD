import { LEVEL_REWARD } from './config';

/**
 * The coin economy in one place. See gd/ECONOMY-SINK-SOURCE.md for the reasoning and the numbers behind it.
 *
 * SOURCES: level clears (first clear, first-try bonus, hard bonus), replays (token), the daily gift.
 * SINKS:   hearts (refill, infinite time) and the boosters proposed in the same document.
 */

export interface Reward {
  base: number;
  bonus: number;
  total: number;
  label: string;
}

// ------------------------------------------------------------ coin sources

/** First clear of a hard level pays double, as in sand-storm-2 (Hard 50 against Normal 25). */
export const HARD_REWARD = 50;
export const REPLAY_REWARD = 5;
export const FIRST_TRY_BONUS = 10;

/**
 * Coins for clearing a level.
 * The first clear pays the full reward, plus a bonus if it took a single attempt. Replays pay a small token amount.
 */
export function rewardFor(firstClear: boolean, firstTry: boolean, hard = false): Reward {
  if (!firstClear) return { base: REPLAY_REWARD, bonus: 0, total: REPLAY_REWARD, label: 'Replay reward' };
  const base = hard ? HARD_REWARD : LEVEL_REWARD;
  const bonus = firstTry ? FIRST_TRY_BONUS : 0;
  return { base, bonus, total: base + bonus, label: bonus ? `+${bonus} cleared on the first try` : '' };
}

// ------------------------------------------------------------ hearts (lives)

/** Hearts a player can hold. */
export const HEART_MAX = 5;
/** Seconds for one heart to come back (sand-storm-2's effective remote value is 1200 s). */
export const HEART_REGEN_S = 20 * 60;

// ------------------------------------------------------------ coin sinks

/** Coins for one missing heart. A full refill from empty is HEART_MAX * HEART_PRICE (200). */
export const HEART_PRICE = 40;
/** Infinite hearts for this many minutes... */
export const INFINITE_MINUTES = 30;
/** ...for this many coins. */
export const INFINITE_PRICE = 250;
/** Demo of a rewarded ad: 1 heart. There is no ad SDK in this build; the button plays a short placeholder. */
export const AD_HEARTS = 1;
export const AD_SECONDS = 2.5;

// ------------------------------------------------------------ boosters

export type BoosterKey = 'handPick' | 'sandPull' | 'shuffle';
export const BOOSTER_KEYS: BoosterKey[] = ['handPick', 'sandPull', 'shuffle'];

export interface BoosterDef {
  name: string;
  desc: string;
  /** Coins for one. */
  price: number;
  /** First level where the button is usable. */
  unlock: number;
  /** Free ones handed over the first time the level is reached (sand-storm-2 gives 2 at the tutorial). */
  gift: number;
}

/**
 * Prices are about 4 to 6 times the reward of a normal level (sand-storm-2 asks 12 times, with far more levels and
 * sources). Using one disqualifies the first-try bonus, like Undo does.
 */
export const BOOSTERS: Record<BoosterKey, BoosterDef> = {
  handPick: { name: 'Hand Pick', desc: 'Send any bucket on the board to the belt', price: 150, unlock: 5, gift: 2 },
  sandPull: { name: 'Sand Pull', desc: 'Fill a belt bucket from anywhere in the picture', price: 150, unlock: 8, gift: 2 },
  shuffle: { name: 'Shuffle', desc: 'Swap the colours of the buckets on the board', price: 100, unlock: 11, gift: 0 },
};

// ------------------------------------------------------------ daily gift

export type GiftReward = { coins?: number; hearts?: number; infiniteMinutes?: number; boosters?: Partial<Record<BoosterKey, number>> };

/** A 7-day cycle, one claim per calendar day; modelled on sand-storm-2's DailyGiftConfig. */
export const DAILY_GIFTS: GiftReward[] = [
  { coins: 50 },
  { coins: 100 },
  { hearts: 2 },
  { coins: 100, infiniteMinutes: 10 },
  { coins: 100, boosters: { handPick: 1 } },
  { hearts: 3 },
  { coins: 150, infiniteMinutes: 20, boosters: { sandPull: 1 } },
];
