import { DEFAULT_PERSONAS, PERSONA_COLORS } from './personas';
import type { Cell, Dataset, GameResult, LevelMeta, MeasuredFunnel, PersonaDef, PersonaMeta } from './types';
import { toCell } from './bot';

// ------------------------------------------------------------------ dataset from bot games

export const personaMeta = (p: PersonaDef[]): PersonaMeta[] => {
  const sum = p.reduce((a, b) => a + Math.max(0, b.share), 0) || 1;
  return p.map((x) => ({ id: x.id, name: x.name, color: x.color, share: Math.max(0, x.share) / sum }));
};

export function buildDataset(opts: {
  id: string; title: string; origin: Dataset['origin']; note: string;
  personas: PersonaDef[]; levels: LevelMeta[]; results: Map<string, GameResult[]>;
}): Dataset {
  const cells: Cell[] = [];
  for (const lv of opts.levels) {
    for (const p of opts.personas) {
      const rs = opts.results.get(`${lv.level}|${p.id}`);
      if (rs && rs.length) cells.push(toCell(lv.level, p.id, rs));
    }
  }
  return {
    id: opts.id, title: opts.title, origin: opts.origin, note: opts.note, createdAt: new Date().toISOString(),
    personas: personaMeta(opts.personas), levels: opts.levels, cells,
  };
}

// ------------------------------------------------------------------ CSV (the GD export: gd/csv/01..04)

/** Minimal CSV reader: quoted fields, doubled quotes, CRLF, a leading BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); if (row.some((c) => c !== '')) rows.push(row); }
  return rows;
}

type Table = Record<string, string>[];
function toTable(rows: string[][]): Table {
  const head = rows[0] ?? [];
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v === '') return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

/** Which GD table is this? */
function kind(headers: string[]): '01' | '02' | '03' | '04' | null {
  const has = (s: string) => headers.some((h) => h.includes(s));
  if (has('Nhóm kỹ năng') && has('Số lượt mô phỏng')) return '02';
  if (has('Nhóm kỹ năng') && has('Người vào màn')) return '03';
  if (has('Số xô') && has('Số màu cát')) return '04';
  if (has('Tỉ lệ bỏ chơi') && has('Người vào màn')) return '01';
  return null;
}

const PERSONA_ALIASES: [RegExp, string][] = [
  [/ng[ẫa]u nhi[eê]n|random/i, 'random'],
  [/ph[ổo] th[ôo]ng|casual/i, 'casual'],
  [/c[ẩa]n th[ậa]n|careful/i, 'careful'],
  [/k[ếe] ho[ạa]ch|gi[ỏo]i|planner/i, 'planner'],
];
function personaId(name: string, seen: Map<string, string>): string {
  for (const [re, id] of PERSONA_ALIASES) if (re.test(name)) return id;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'nhom';
  seen.set(slug, name);
  return slug;
}

/**
 * Turn the files of a GD export into a dataset. Files are recognised by their column names, not by file name, so any
 * subset can be passed; table 02 (performance by group) is required.
 */
export function datasetFromCsv(files: { name: string; text: string }[], title = 'Dữ liệu GD (CSV)'): Dataset {
  const tables: Partial<Record<'01' | '02' | '03' | '04', Table>> = {};
  for (const f of files) {
    const rows = parseCsv(f.text);
    if (!rows.length) continue;
    const k = kind(rows[0].map((h) => h.trim()));
    if (k) tables[k] = toTable(rows);
  }
  const t2 = tables['02'];
  if (!t2 || !t2.length) throw new Error('Thiếu bảng "Hiệu suất theo nhóm" (02): cần các cột Màn, Nhóm kỹ năng, Số lượt mô phỏng, Tỉ lệ thắng.');

  const seen = new Map<string, string>();
  const names = new Map<string, string>();
  const cells: Cell[] = [];
  for (const r of t2) {
    const level = num(r['Màn']);
    const name = r['Nhóm kỹ năng'];
    if (!level || !name) continue;
    const id = personaId(name, seen);
    names.set(id, name);
    cells.push({
      level, persona: id,
      runs: num(r['Số lượt mô phỏng']) ?? 0,
      winRate: num(r['Tỉ lệ thắng (0-1)']) ?? 0,
      avgWinTime: num(r['Thời gian TB lượt thắng (giây)']),
      avgTime: num(r['Thời gian TB mọi lượt (giây)']),
      taps: num(r['Số lần bấm TB mỗi lượt']),
      stuckShare: num(r['Thua do kẹt băng chuyền (0-1)']),
      sandLeftOnLoss: num(r['Cát còn lại khi thua (0-1)']),
      nearMiss: num(r['Suýt thắng (0-1)']),
      maxSlots: num(r['Số ô băng chuyền dùng nhiều nhất']),
      fullTime: num(r['Thời gian băng chuyền đầy (giây)']),
      idleTime: num(r['Thời gian băng chuyền chạy không (giây)']),
    });
  }

  // population shares: entrants of the first level per group (table 03), else equal
  const shares = new Map<string, number>();
  for (const r of tables['03'] ?? []) {
    if (num(r['Màn']) !== 1) continue;
    const id = personaId(r['Nhóm kỹ năng'] ?? '', seen);
    shares.set(id, (shares.get(id) ?? 0) + (num(r['Người vào màn']) ?? 0));
  }
  const ids = [...names.keys()];
  const order = ['random', 'casual', 'careful', 'planner'];
  ids.sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
  const total = ids.reduce((s, id) => s + (shares.get(id) ?? 0), 0);
  const personas: PersonaMeta[] = ids.map((id, i) => {
    const d = DEFAULT_PERSONAS.find((p) => p.id === id);
    return { id, name: names.get(id) ?? id, color: d?.color ?? PERSONA_COLORS[i % PERSONA_COLORS.length], share: total > 0 ? (shares.get(id) ?? 0) / total : 1 / ids.length };
  });

  const levelNos = [...new Set(cells.map((c) => c.level))].sort((a, b) => a - b);
  const meta = new Map<number, LevelMeta>(levelNos.map((l) => [l, { level: l, name: `Màn ${l}` }]));
  for (const r of tables['04'] ?? []) {
    const l = num(r['Màn']);
    if (!l) continue;
    meta.set(l, {
      level: l, name: r['Tên màn'] || `Màn ${l}`,
      buckets: num(r['Số xô']), mystery: num(r['Xô bí ẩn']), colors: num(r['Số màu cát']), floor: num(r['Số ô sàn']), holes: num(r['Số ô lỗ']),
      slots: num(r['Số ô băng chuyền']), depthFirst: num(r['Độ sâu đào tới màu cần đầu tiên']), depthMax: num(r['Xô nằm sâu nhất']),
      depthAvg: num(r['Độ sâu trung bình']), openAtStart: num(r['Bấm được ngay từ đầu']), openNeeded: num(r['Bấm được và đang cần']),
      firstTapGood: num(r['Lần bấm đầu đúng (0-1)']),
    });
  }
  let measured: MeasuredFunnel[] | undefined;
  if (tables['01']) {
    measured = [];
    for (const r of tables['01']) {
      const l = num(r['Màn']);
      if (!l) continue; // the "Tất cả" row
      measured.push({
        level: l, entered: num(r['Người vào màn']) ?? 0, plays: num(r['Lượt chơi']) ?? 0, wins: num(r['Lượt thắng']) ?? 0,
        quit: num(r['Người bỏ chơi tại màn']) ?? 0, leftAfterWin: num(r['Người rời sau khi qua màn']) ?? 0, coinsPaid: num(r['Xu đã trả']) ?? 0,
      });
      if (!meta.has(l)) meta.set(l, { level: l, name: r['Tên màn'] || `Màn ${l}` });
      else if (!(tables['04'] ?? []).length) meta.get(l)!.name = r['Tên màn'] || meta.get(l)!.name;
    }
  }
  return {
    id: 'csv-' + Date.now().toString(36), title, origin: 'csv', createdAt: new Date().toISOString(),
    note: 'Số liệu đọc từ bảng CSV của GD. Nếu ghi là mô phỏng thì đó không phải người chơi thật.',
    personas, levels: levelNos.map((l) => meta.get(l)!), cells, measured,
  };
}

// ------------------------------------------------------------------ export

const f1 = (v: number | undefined, k = 1) => (v === undefined ? '' : String(Math.round(v * 10 ** k) / 10 ** k));

/** One flat CSV: a row per level x persona. */
export function datasetToCsv(d: Dataset): string {
  const head = ['Màn', 'Tên màn', 'Nhóm', 'Số lượt', 'Tỉ lệ thắng (0-1)', 'Thời gian TB lượt thắng (s)', 'Thời gian TB mọi lượt (s)', 'Bấm TB', 'Thua do kẹt (0-1)', 'Cát còn lại khi thua (0-1)', 'Suýt thắng (0-1)'];
  const lines = [head.join(',')];
  for (const c of d.cells) {
    const lv = d.levels.find((l) => l.level === c.level);
    const pn = d.personas.find((p) => p.id === c.persona)?.name ?? c.persona;
    lines.push([c.level, `"${lv?.name ?? ''}"`, `"${pn}"`, c.runs, f1(c.winRate, 3), f1(c.avgWinTime), f1(c.avgTime), f1(c.taps), f1(c.stuckShare, 2), f1(c.sandLeftOnLoss, 2), f1(c.nearMiss, 2)].join(','));
  }
  return '﻿' + lines.join('\n');
}
