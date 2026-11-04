import { Game, LANE_TIME, laneX } from '../src/core/game';
import { LEVELS } from '../src/core/levels';

if (process.env.OLD) {
  const proto = Game.prototype as any;
  const orig = proto.reserveSlot;
  proto.reserveSlot = function (b: any) {
    const fly = b.flyTime;
    orig.call(this, b, undefined);
    if (b.flyTime !== fly) { b.flyTime = fly; b.landPhase = -1; }
  };
}
let landed: number[] = [], stretched = 0, hovered = 0, taps = 0, won = 0, lost = 0;
for (let li = 0; li < LEVELS.length; li++) {
  const g = new Game(LEVELS[li], 1);
  g.onEvent = (e) => { if (e.type === 'land') landed.push(laneX(e.bucket.phase / LANE_TIME)); };
  let guard = 0;
  while (g.status === 'playing' && guard++ < 60 * 400) {
    if (guard % (Number(process.env.GAP) || 20) === 0) {
      const open = g.openBuckets();
      if (open.length && g.slotsUsed < g.slots) {
        const b = open[Math.floor(Math.random() * open.length)];
        const r = g.tap(b.id);
        if (r === 'ok') {
          taps++;
          const bb = g.belt.find((x) => x.id === b.id)!;
          if (bb.flyTime > 0.41) stretched++;
          if (bb.landPhase < 0) hovered++;
        }
      }
    }
    g.advance(1 / 60);
  }
  if (g.status === 'won') won++; else lost++;
}
const hist = new Array(12).fill(0);
for (const x of landed) hist[Math.max(0, Math.min(11, Math.floor(((x + 0.1) / 1.2) * 12)))]++;
console.log({ levels: LEVELS.length, taps, stretched, hovered, won, lost, landHist: hist.join(',') });
