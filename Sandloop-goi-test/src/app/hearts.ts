/**
 * Hearts (lives), modelled on sand-storm-2's HeartSystem:
 *  - up to HEART_MAX hearts, one comes back every HEART_REGEN_S seconds while below the maximum;
 *  - the regen clock keeps its leftover time across app closes (it is a timestamp, not a counter), so a closed tab
 *    keeps regenerating, and a partly elapsed interval is never thrown away;
 *  - a heart is spent when an attempt is thrown away (lost level, or leaving / restarting a level that was started),
 *    never merely for starting a level and never refunded for winning;
 *  - an "infinite hearts" boost is a timestamp too and stacks when bought again while it is still running;
 *  - only the player's clock is available, so a clock set back re-anchors the timer instead of paying out negative time.
 */
import { HEART_MAX, HEART_REGEN_S } from '../core/economy';

export interface HeartState {
  count: number;
  /** ms epoch at which the running regen interval started (only meaningful while count < max). */
  since: number;
  /** ms epoch until which hearts are infinite (0 or in the past = off). */
  infiniteUntil: number;
}

export function freshHearts(now = Date.now()): HeartState {
  return { count: HEART_MAX, since: now, infiniteUntil: 0 };
}

export class Hearts {
  constructor(readonly s: HeartState) {}

  /** Apply the regen that happened since the last call. Call it before reading anything. */
  sync(now = Date.now()): void {
    const s = this.s;
    if (this.infinite(now)) {
      s.count = Math.max(s.count, HEART_MAX);
      s.since = now;
      return;
    }
    if (s.count >= HEART_MAX) {
      s.count = HEART_MAX;
      s.since = now;
      return;
    }
    const step = HEART_REGEN_S * 1000;
    const elapsed = now - s.since;
    if (elapsed < 0) {
      s.since = now; // the clock went backwards
      return;
    }
    const n = Math.floor(elapsed / step);
    if (n > 0) {
      s.count = Math.min(HEART_MAX, s.count + n);
      s.since = s.count >= HEART_MAX ? now : s.since + n * step;
    }
  }

  infinite(now = Date.now()): boolean {
    return this.s.infiniteUntil > now;
  }

  /** Hearts shown on the HUD. */
  count(now = Date.now()): number {
    this.sync(now);
    return this.s.count;
  }

  get max(): number {
    return HEART_MAX;
  }

  full(now = Date.now()): boolean {
    return this.count(now) >= HEART_MAX;
  }

  /** Can a level be started? (There is no check when infinite.) */
  canPlay(now = Date.now()): boolean {
    return this.infinite(now) || this.count(now) > 0;
  }

  /** Seconds until the next heart, 0 when full. While infinite: seconds of the boost left. */
  secondsLeft(now = Date.now()): number {
    this.sync(now);
    if (this.infinite(now)) return Math.ceil((this.s.infiniteUntil - now) / 1000);
    if (this.s.count >= HEART_MAX) return 0;
    return Math.max(0, Math.ceil((this.s.since + HEART_REGEN_S * 1000 - now) / 1000));
  }

  /** Spend a heart for a thrown-away attempt. False when there was none (the caller already checked canPlay). */
  consume(now = Date.now()): boolean {
    this.sync(now);
    if (this.infinite(now)) return true;
    if (this.s.count <= 0) return false;
    // Spending from a full set starts the regen clock; otherwise the running interval carries on.
    if (this.s.count >= HEART_MAX) this.s.since = now;
    this.s.count--;
    return true;
  }

  /** Give hearts (rewarded ad, gift, pack); n = Infinity fills up. */
  add(n: number, now = Date.now()): void {
    this.sync(now);
    this.s.count = Math.min(HEART_MAX, this.s.count + (Number.isFinite(n) ? n : HEART_MAX));
    if (this.s.count >= HEART_MAX) this.s.since = now;
  }

  missing(now = Date.now()): number {
    return HEART_MAX - this.count(now);
  }

  /** Stack minutes of infinite hearts on top of whatever is left. */
  addInfinite(minutes: number, now = Date.now()): void {
    const from = Math.max(now, this.s.infiniteUntil);
    this.s.infiniteUntil = from + minutes * 60_000;
    this.s.count = HEART_MAX;
    this.s.since = now;
  }
}

export function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
