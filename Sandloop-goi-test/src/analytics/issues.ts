import type { JourneyResult } from './journey';
import { cellOf, mixWinRate, type Dataset } from './types';

/** Limits the detector judges against; every one of them can be changed in the UI. */
export interface Thresholds {
  /** Average win rate below this is too hard, 0..1. */
  winLo: number;
  /** Above this (after the first levels) is too easy. */
  winHi: number;
  /** Drop of the average win rate from one level to the next that counts as a difficulty spike. */
  spike: number;
  /** Share of the players who enter a level and quit there (journey simulation). */
  quit: number;
  /** Levels at the start allowed to be trivial. */
  easyLevels: number;
  /** A win that takes longer than this many seconds. */
  longWin: number;
  /** Share of the entrants who run out of hearts on a level. */
  noHearts: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { winLo: 0.35, winHi: 0.95, spike: 0.3, quit: 0.15, easyLevels: 3, longWin: 90, noHearts: 0.35 };

export type Severity = 'high' | 'med' | 'low';

export interface Issue {
  id: string;
  severity: Severity;
  /** 0 = the whole game. */
  level: number;
  rule: string;
  title: string;
  evidence: string;
  advice: string;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function detectIssues(d: Dataset, t: Thresholds, j: JourneyResult | null): Issue[] {
  const out: Issue[] = [];
  const add = (severity: Severity, level: number, rule: string, title: string, evidence: string, advice: string) =>
    out.push({ id: `${rule}-${level}-${out.length}`, severity, level, rule, title, evidence, advice });
  const nameOf = (l: number) => d.levels.find((x) => x.level === l)?.name ?? `Màn ${l}`;
  const levels = d.levels.map((l) => l.level);
  const mix = new Map(levels.map((l) => [l, mixWinRate(d, l)]));

  for (let i = 0; i < levels.length; i++) {
    const L = levels[i];
    const lm = d.levels[i];
    const m = mix.get(L) ?? 0;
    const by = d.personas.map((p) => ({ p, c: cellOf(d, L, p.id) })).filter((x) => x.c) as { p: Dataset['personas'][number]; c: NonNullable<ReturnType<typeof cellOf>> }[];
    const detail = by.map((x) => `${x.p.name} ${pct(x.c.winRate)}`).join(' · ');
    const title = `Màn ${L} · ${nameOf(L)}`;

    // 1. too hard for the average player
    if (m < t.winLo) {
      const sev: Severity = m < 0.15 ? 'high' : 'med';
      const extra: string[] = [];
      if (lm.openNeeded === 0) extra.push('không có xô nào bấm được ngay mà cát đang cần (phải đào ngay từ nước đầu)');
      if ((lm.mystery ?? 0) >= 4) extra.push(`${lm.mystery} xô bí ẩn`);
      if ((lm.depthMax ?? 0) >= 6) extra.push(`xô nằm sâu tới ${lm.depthMax} lớp`);
      add(sev, L, 'too-hard', `${title}: quá khó`,
        `Người chơi trung bình thắng ${pct(m)} mỗi lượt (ngưỡng ${pct(t.winLo)}). ${detail}.${extra.length ? ' Yếu tố góp phần: ' + extra.join('; ') + '.' : ''}`,
        'Giảm số xô bí ẩn hoặc số màu, mở thêm xô dùng được ngay ở hàng đầu, hoặc tăng số ô băng chuyền. Sửa trong Designer rồi chạy lại.');
    }

    // 2. a whole group is locked out while others are fine
    for (const x of by) {
      const best = Math.max(...by.map((y) => y.c.winRate));
      if (x.c.winRate <= 0.03 && best >= 0.5 && x.p.share >= 0.1 && x.c.runs >= 5) {
        add(x.p.share >= 0.3 ? 'high' : 'med', L, 'group-locked', `${title}: nhóm "${x.p.name}" gần như không qua được`,
          `${x.p.name} (${pct(x.p.share)} người chơi) thắng ${pct(x.c.winRate)}, trong khi nhóm giỏi nhất thắng ${pct(best)}.`,
          'Màn này đòi một cách chơi mà nhóm này không có. Thêm một đường đi dễ nhìn thấy hoặc một gợi ý cho lần bấm đầu.');
      }
    }

    // 3. spike against the previous level
    if (i > 0) {
      const prev = mix.get(levels[i - 1]) ?? 0;
      if (prev - m >= t.spike) {
        add(prev - m >= 0.5 ? 'high' : 'med', L, 'spike', `${title}: độ khó tăng vọt`,
          `Tỉ lệ thắng tụt từ ${pct(prev)} (màn ${levels[i - 1]}) xuống ${pct(m)}, giảm ${Math.round((prev - m) * 100)} điểm.`,
          'Chèn một màn trung gian, hoặc làm màn này dễ lên một bậc để đường cong tăng đều.');
      }
    }

    // 4. too easy after the opening levels
    const random = by.find((x) => x.p.id === 'random')?.c;
    if (L > t.easyLevels && (m > t.winHi || (random && random.winRate >= 0.9 && random.runs >= 5))) {
      add('low', L, 'too-easy', `${title}: quá dễ`,
        `Người chơi trung bình thắng ${pct(m)}${random ? `, bấm ngẫu nhiên cũng thắng ${pct(random.winRate)}` : ''}. ${detail}.`,
        'Thêm một lựa chọn sai hấp dẫn (xô cản đường, màu giống nhau) để màn có chiều sâu, hoặc coi đây là màn thư giãn có chủ ý.');
    }

    // 5. a more skilled group does clearly worse than a less skilled one (personas are listed from least to most skilled)
    for (let a = 0; a < by.length; a++) for (let b = a + 1; b < by.length; b++) {
      const lo = by[a], hi = by[b];
      if (lo.c.runs >= 8 && hi.c.runs >= 8 && lo.c.winRate - hi.c.winRate >= 0.3) {
        add('med', L, 'skill-inverted', `${title}: chơi kỹ lại thua nhiều hơn`,
          `${hi.p.name} thắng ${pct(hi.c.winRate)} nhưng ${lo.p.name} thắng ${pct(lo.c.winRate)}.`,
          'Màn có bẫy: nước đi "hợp lý" lại dẫn tới kẹt. Nếu không chủ ý, cho thêm manh mối để lựa chọn đúng nhìn ra được; nếu chủ ý, giữ ở một màn hiếm.');
        break;
      }
    }

    // 6. the result barely depends on skill
    if (by.length >= 3 && by.every((x) => x.c.runs >= 8)) {
      const rates = by.map((x) => x.c.winRate);
      const gap = Math.max(...rates) - Math.min(...rates);
      if (gap < 0.12 && m > 0.15 && m < 0.85) {
        add('low', L, 'luck', `${title}: kết quả gần như do may rủi`,
          `Mọi nhóm thắng quanh ${pct(m)} (chênh nhau chỉ ${Math.round(gap * 100)} điểm), nên chơi giỏi không giúp gì.`,
          'Làm cho lựa chọn tốt có ích hơn: thêm xô dùng được ngay đúng màu để người chơi biết nên bấm xô nào trước.');
      }
    }

    // 7. only the top group gets through
    if (random && random.winRate <= 0.05 && by.length >= 3 && Math.max(...by.map((x) => x.c.winRate)) >= 0.8 && m >= 0.1) {
      add('low', L, 'skill-cliff', `${title}: chỉ nhóm giỏi nhất qua được`,
        `${detail}.`, 'Phù hợp màn khó có chủ ý, nhưng đặt nó sau một màn dạy cách chơi đúng.');
    }

    // 8. a blind first tap is almost always wrong
    if (lm.firstTapGood !== undefined && lm.firstTapGood <= 0.2 && m < 0.6) {
      add('low', L, 'blind-start', `${title}: lần bấm đầu hầu như sai`,
        `Chỉ ${pct(lm.firstTapGood)} số xô bấm được ngay có màu cát đang cần (${lm.openNeeded ?? 0}/${lm.openAtStart ?? 0}).`,
        'Đặt ít nhất một xô cùng màu với lớp cát lộ ra ở hàng đầu để người chơi có điểm bắt đầu.');
    }

    // 9. losses come early and without progress
    const lossy = by.filter((x) => x.c.winRate < 0.5 && x.c.sandLeftOnLoss !== undefined && x.c.sandLeftOnLoss >= 0.85 && (x.c.stuckShare ?? 0) >= 0.9 && x.c.runs >= 5);
    if (lossy.length >= 2) {
      add('low', L, 'early-death', `${title}: thua sớm, không thấy tiến triển`,
        `Khi thua, trung bình còn ${pct(Math.min(...lossy.map((x) => x.c.sandLeftOnLoss!)))} cát trở lên trong khung (${lossy.map((x) => x.p.name).join(', ')}).`,
        'Băng chuyền kẹt rất nhanh. Cho phép bấm lại hoặc giảm số xô cần đào để người chơi thấy mình tiến gần hơn.');
    }

    // 10. long wins
    const slow = by.filter((x) => (x.c.avgWinTime ?? 0) >= t.longWin);
    if (slow.length) {
      add('low', L, 'long', `${title}: thắng mất nhiều thời gian`,
        `${slow.map((x) => `${x.p.name} ${Math.round(x.c.avgWinTime!)} giây`).join(', ')} cho một lượt thắng (ngưỡng ${t.longWin} giây).`,
        'Tăng tốc độ điền xô hoặc bớt số xô để một lượt không dài hơn mức người chơi muốn.');
    }
  }

  // 11. journey: where people leave, who runs out of hearts
  if (j) {
    for (const f of j.levels) {
      if (!f.entered) continue;
      const quit = (f.quitLoss + f.quitHearts) / f.entered;
      if (quit >= t.quit) {
        add(quit >= 0.4 ? 'high' : 'med', f.level, 'quit', `Màn ${f.level} · ${nameOf(f.level)}: nhiều người bỏ chơi`,
          `${pct(quit)} số người vào màn bỏ chơi ngay tại đây (${f.quitLoss + f.quitHearts}/${f.entered}), mỗi người thua trung bình ${(f.losses / f.entered).toFixed(1)} lượt. Ngưỡng ${pct(t.quit)}.`,
          'Đây là màn gây mất người chơi nhiều nhất. Giảm độ khó, hoặc cho thưởng/hồi tim khi thua liên tiếp.');
      }
      const dry = f.outOfHearts / f.entered;
      if (dry >= t.noHearts) {
        add('med', f.level, 'no-hearts', `Màn ${f.level} · ${nameOf(f.level)}: người chơi hay hết tim`,
          `Có ${f.outOfHearts} lần hết tim với ${f.entered} người vào màn (trung bình ${dry.toFixed(1)} lần mỗi người). Họ xem quảng cáo ${f.ads} lần, mua tim ${f.buys} lần, chờ ${f.waits} lần.`,
          'Màn khó kết hợp với tim ít khiến người chơi phải trả giá. Cân nhắc cho thêm tim hoặc giảm độ khó ở đoạn này.');
      }
    }
    const last = j.samples[j.samples.length - 1];
    if (last && j.players > 0) {
      const done = j.finished / j.players;
      if (done < 0.1) {
        add('high', 0, 'completion', 'Rất ít người chơi tới được màn cuối',
          `Chỉ ${pct(done)} người chơi mô phỏng hoàn thành ${d.levels.length} màn.`,
          'Xem các màn gây bỏ chơi nhiều nhất ở trên, sửa từ màn đầu tiên bị chặn.');
      }
      const earned = last.cumCoinsIn, spent = last.cumCoinsOut;
      if (earned > 0 && spent === 0) {
        add('low', 0, 'no-sink', 'Xu kiếm được nhưng không có chỗ tiêu',
          `Người chơi mô phỏng kiếm ${Math.round(earned).toLocaleString('vi-VN')} xu và tiêu 0.`,
          'Thêm chỗ tiêu xu (tim, trợ giúp, trang trí) để phần thưởng có ý nghĩa.');
      }
    }
  }

  const order: Record<Severity, number> = { high: 0, med: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity] || a.level - b.level);
}

export const SEVERITY_LABEL: Record<Severity, string> = { high: 'Nghiêm trọng', med: 'Đáng chú ý', low: 'Nhẹ' };

/** The report as Markdown, to paste into a document. */
export function reportMarkdown(d: Dataset, issues: Issue[], j: JourneyResult | null): string {
  const lines: string[] = [];
  lines.push(`# Báo cáo phân tích số liệu · ${d.title}`, '', `**Nguồn số liệu:** ${d.origin === 'bot' || d.origin === 'sample' ? 'bot mô phỏng' : 'bảng nhập vào'}. ${d.note}`, '');
  lines.push('## Tỉ lệ thắng theo màn và nhóm', '', `| Màn | ${d.personas.map((p) => p.name).join(' | ')} | Trung bình |`, `|---|${d.personas.map(() => '---').join('|')}|---|`);
  for (const l of d.levels) {
    lines.push(`| ${l.level} ${l.name} | ${d.personas.map((p) => { const c = cellOf(d, l.level, p.id); return c ? pct(c.winRate) : '–'; }).join(' | ')} | ${pct(mixWinRate(d, l.level))} |`);
  }
  if (j) {
    lines.push('', '## Hành trình người chơi (mô phỏng)', '', `${j.players.toLocaleString('vi-VN')} người chơi ảo, ${j.finished} người hoàn thành (${pct(j.finished / j.players)}).`, '', '| Màn | Vào màn | Qua màn | Bỏ chơi | Rời sau khi thắng |', '|---|---|---|---|---|');
    for (const f of j.levels) lines.push(`| ${f.level} | ${f.entered} | ${f.passed} | ${f.quitLoss + f.quitHearts} | ${f.leftAfterWin} |`);
  }
  lines.push('', `## Vấn đề phát hiện (${issues.length})`, '');
  for (const i of issues) lines.push(`- **[${SEVERITY_LABEL[i.severity]}] ${i.title}.** ${i.evidence} _Gợi ý:_ ${i.advice}`);
  return lines.join('\n');
}
