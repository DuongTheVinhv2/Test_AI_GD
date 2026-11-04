import { analyze, type AnalyzeOptions, type DesignLevel } from './analyze';
import { generate, type GenOptions } from './gen';

export type WorkerRequest =
  | { kind: 'analyze'; key: string; def: DesignLevel; opts: AnalyzeOptions }
  | { kind: 'gen'; key: string; def: DesignLevel; opts: Omit<GenOptions, 'onProgress'> };

const post = (m: unknown) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const r = e.data;
  try {
    if (r.kind === 'gen') {
      const result = generate(r.def, { ...r.opts, onProgress: (text) => post({ kind: 'progress', key: r.key, text }) });
      post({ kind: 'gen', key: r.key, result });
    } else post({ kind: 'analysis', key: r.key, analysis: analyze(r.def, r.opts) });
  } catch (err) {
    post({ kind: 'error', key: r.key, error: String(err) });
  }
};
