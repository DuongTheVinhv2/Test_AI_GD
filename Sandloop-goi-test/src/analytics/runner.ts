import WorkerCtor from './worker?worker&inline';
import type { BotDone, BotJob } from './worker';
import type { GameResult, PersonaDef } from './types';

export interface RunOptions {
  personas: PersonaDef[];
  levels: number[];
  seeds: number;
  cap: number;
  onProgress: (done: number, total: number) => void;
}

export interface RunHandle {
  promise: Promise<Map<string, GameResult[]>>;
  cancel: () => void;
}

/** Play every (level, persona, seed) on a pool of workers; the real game core runs inside them. */
export function runBots(o: RunOptions): RunHandle {
  const CHUNK = 4;
  const jobs: BotJob[] = [];
  let id = 0;
  for (const level of o.levels) {
    for (const persona of o.personas) {
      for (let s = 0; s < o.seeds; s += CHUNK) {
        const seeds: number[] = [];
        for (let k = s; k < Math.min(o.seeds, s + CHUNK); k++) seeds.push(k + 1);
        jobs.push({ id: id++, level, persona, seeds, cap: o.cap });
      }
    }
  }
  const total = jobs.length;
  const results = new Map<string, GameResult[]>();
  const size = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1, total));
  const workers: Worker[] = [];
  let next = 0, done = 0, cancelled = false;

  const promise = new Promise<Map<string, GameResult[]>>((resolve, reject) => {
    const finish = () => { workers.forEach((w) => w.terminate()); };
    const feed = (w: Worker) => {
      if (cancelled) return;
      if (next < jobs.length) w.postMessage(jobs[next++]);
    };
    for (let i = 0; i < size; i++) {
      const w = new WorkerCtor();
      workers.push(w);
      w.onmessage = (e: MessageEvent<BotDone>) => {
        const r = e.data;
        const key = `${r.level}|${r.persona}`;
        const list = results.get(key);
        if (list) list.push(...r.results); else results.set(key, [...r.results]);
        o.onProgress(++done, total);
        if (done >= total) { finish(); resolve(results); } else feed(w);
      };
      w.onerror = (ev) => { finish(); reject(new Error(ev.message || 'worker error')); };
      feed(w);
    }
    if (!total) { finish(); resolve(results); }
  });
  return { promise, cancel: () => { cancelled = true; workers.forEach((w) => w.terminate()); } };
}
