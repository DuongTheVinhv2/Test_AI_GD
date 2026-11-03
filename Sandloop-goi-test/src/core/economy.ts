import { LEVEL_REWARD } from './config';

export interface Reward {
  base: number;
  bonus: number;
  total: number;
  label: string;
}

export const REPLAY_REWARD = 5;
export const FIRST_TRY_BONUS = 10;

/**
 * Coins for clearing a level.
 * The first clear pays the full reward, plus a bonus if it took a single attempt. Replays pay a small token amount.
 * There is nothing to spend coins on in this build: the wallet is a score of how well the player is doing.
 */
export function rewardFor(firstClear: boolean, firstTry: boolean): Reward {
  if (!firstClear) return { base: REPLAY_REWARD, bonus: 0, total: REPLAY_REWARD, label: 'Replay reward' };
  const bonus = firstTry ? FIRST_TRY_BONUS : 0;
  return { base: LEVEL_REWARD, bonus, total: LEVEL_REWARD + bonus, label: bonus ? `+${bonus} cleared on the first try` : '' };
}
