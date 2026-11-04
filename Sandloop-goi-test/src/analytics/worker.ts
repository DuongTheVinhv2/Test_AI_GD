import { LEVELS } from '../core/levels';
import { playGame } from './bot';
import type { GameResult, PersonaDef } from './types';

export interface BotJob { id: number; level: number; persona: PersonaDef; seeds: number[]; cap: number }
export interface BotDone { id: number; level: number; persona: string; results: GameResult[] }

self.onmessage = (e: MessageEvent<BotJob>) => {
  const j = e.data;
  const def = LEVELS[j.level - 1];
  const results = j.seeds.map((s) => playGame(def, j.persona, s, j.cap));
  (self as unknown as Worker).postMessage({ id: j.id, level: j.level, persona: j.persona.id, results } satisfies BotDone);
};
