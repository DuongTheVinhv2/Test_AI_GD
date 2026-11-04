import './analytics.css';
import { LEVELS } from '../core/levels';
import baselineJson from './baseline.json';
import csv01 from '../../gd/csv/01_tong_hop_man.csv?raw';
import csv02 from '../../gd/csv/02_hieu_suat_theo_nhom.csv?raw';
import csv03 from '../../gd/csv/03_tien_trinh_theo_nhom.csv?raw';
import csv04 from '../../gd/csv/04_cau_truc_man.csv?raw';
import { levelMeta, TIME_CAP } from './bot';
import { METRICS, attemptsChart, crowdChart, difficultyChart, funnelChart, heatmap, lossChart, scatterChart, skillGapChart, spikeChart, timeChart } from './charts';
import { buildDataset, datasetFromCsv, datasetToCsv, personaMeta } from './data';
import { buildDiagram, DIAGRAM_LEGEND, type Diagram } from './diagram';
import { DEFAULT_THRESHOLDS, SEVERITY_LABEL, detectIssues, reportMarkdown, type Issue, type Severity, type Thresholds } from './issues';
import { DEFAULT_ECONOMY, runJourney, type EconomyParams, type JourneyResult } from './journey';
import { DEFAULT_PERSONAS, clonePersonas, newPersona } from './personas';
import { runBots, type RunHandle } from './runner';
import { cellOf, mixWinRate, type Dataset, type LevelMeta, type PersonaDef } from './types';

// ------------------------------------------------------------------ state

type Tab = 'overview' | 'charts' | 'journey' | 'bots';

const gd = datasetFromCsv(
  [
    { name: '01', text: csv01 }, { name: '02', text: csv02 }, { name: '03', text: csv03 }, { name: '04', text: csv04 },
  ],
  'Dữ liệu GD · 10 màn (CSV có sẵn)',
);
gd.id = 'gd';
gd.origin = 'sample';
gd.note = 'Bảng CSV của GD (thư mục gd/csv), ngày tạo 2/11/2026: số liệu do máy mô phỏng, không phải người chơi thật. Đó là bản game 10 màn cũ, chưa có hệ thống tim.';

const baseline = baselineJson as unknown as Dataset;

const S = {
  sources: [baseline, gd] as Dataset[],
  cur: baseline.id,
  personas: clonePersonas(DEFAULT_PERSONAS),
  thr: { ...DEFAULT_THRESHOLDS } as Thresholds,
  eco: { ...DEFAULT_ECONOMY } as EconomyParams,
  players: 4000,
  seed: 7,
  journey: null as JourneyResult | null,
  pinned: null as { label: string; r: JourneyResult } | null,
  issues: [] as Issue[],
  tab: 'overview' as Tab,
  sel: undefined as number | undefined,
  metric: 'buckets' as keyof LevelMeta,
  filter: 'all' as Severity | 'all',
  play: { idx: 0, on: false, speed: 1 },
  run: { busy: false, done: 0, total: 0, seeds: 24, cap: TIME_CAP, handle: null as RunHandle | null, msg: '', bad: false },
  csvMsg: '',
};
const D = (): Dataset => S.sources.find((s) => s.id === S.cur) ?? S.sources[0];

let diagram: Diagram | null = null;
let raf = 0;
let lastFrame = 0;

const root = document.getElementById('root')!;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (v: number | undefined, k = 0) => (v === undefined ? '–' : `${(v * 100).toFixed(k)}%`);
const n0 = (v: number) => Math.round(v).toLocaleString('vi-VN');

function recompute(): void {
  const d = D();
  const hard = d.levels.filter((l) => l.hard).map((l) => l.level);
  S.journey = d.cells.length ? runJourney(d, S.personas, { players: S.players, seed: S.seed, economy: S.eco, hardLevels: hard }) : null;
  S.issues = detectIssues(d, S.thr, S.journey);
  S.play.idx = Math.min(S.play.idx, (S.journey?.samples.length ?? 1) - 1);
}

// ------------------------------------------------------------------ rendering

function render(): void {
  cancelAnimationFrame(raf);
  diagram = null;
  const d = D();
  const high = S.issues.filter((i) => i.severity === 'high').length;
  root.innerHTML = `
  <div class="app">
    <div class="card top">
      <div><div class="tag">Sand Loop · công cụ cho GD</div><h1>Phân tích số liệu &amp; mô phỏng hành trình</h1></div>
      <div class="right">
        <label class="muted">Nguồn số liệu</label>
        <select class="select" id="src">${S.sources.map((s) => `<option value="${s.id}" ${s.id === S.cur ? 'selected' : ''}>${esc(s.title)}</option>`).join('')}</select>
        <button class="btn" id="dl-md">Tải báo cáo .md</button>
        <button class="btn" id="dl-csv">Tải bảng .csv</button>
      </div>
    </div>
    <div class="origin"><span>⚠️</span><div><b>${d.origin === 'csv' ? 'Số liệu nhập từ file.' : 'Số liệu do bot mô phỏng, không phải người chơi thật.'}</b> ${esc(d.note)}</div></div>
    <div class="tabs">
      ${tabBtn('overview', 'Tổng quan &amp; vấn đề', high)}${tabBtn('charts', 'Biểu đồ')}${tabBtn('journey', 'Mô phỏng hành trình')}${tabBtn('bots', 'Bot &amp; nhóm người chơi')}
    </div>
    <div id="view"></div>
  </div>`;
  const view = root.querySelector('#view') as HTMLElement;
  if (S.tab === 'overview') view.innerHTML = overviewHtml();
  else if (S.tab === 'charts') view.innerHTML = chartsHtml();
  else if (S.tab === 'journey') { view.innerHTML = journeyHtml(); mountJourney(); }
  else view.innerHTML = botsHtml();
}
const tabBtn = (t: Tab, label: string, n = 0) => `<button class="tab ${S.tab === t ? 'on' : ''}" data-tab="${t}">${label}${n ? `<span class="n">${n}</span>` : ''}</button>`;

// ---------------------------------------------------------------- overview

function overviewHtml(): string {
  const d = D();
  const levels = d.levels.map((l) => l.level);
  const mixes = levels.map((L) => mixWinRate(d, L));
  const avg = mixes.length ? mixes.reduce((a, b) => a + b, 0) / mixes.length : 0;
  const outside = mixes.filter((m, i) => m < S.thr.winLo || (levels[i] > S.thr.easyLevels && m > S.thr.winHi)).length;
  const cnt = (s: Severity) => S.issues.filter((i) => i.severity === s).length;
  const j = S.journey;
  const worst = j ? j.levels.reduce((a, b) => ((b.quitLoss + b.quitHearts) / Math.max(1, b.entered) > (a.quitLoss + a.quitHearts) / Math.max(1, a.entered) ? b : a)) : null;
  const shown = S.issues.filter((i) => S.filter === 'all' || i.severity === S.filter);

  const kpi = (k: string, v: string, s: string, cls = '') => `<div class="kpi ${cls}"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  return `
  <div class="kpis">
    ${kpi('Số màn', String(levels.length), `${d.personas.length} nhóm người chơi`)}
    ${kpi('Tỉ lệ thắng trung bình', pct(avg), 'trung bình cả tệp, một lượt chơi', avg < S.thr.winLo ? 'red' : avg > 0.8 ? 'orange' : 'green')}
    ${kpi('Màn ngoài dải mục tiêu', String(outside), `ngưỡng ${pct(S.thr.winLo)}–${pct(S.thr.winHi)}`, outside ? 'red' : 'green')}
    ${kpi('Vấn đề phát hiện', String(S.issues.length), `${cnt('high')} nghiêm trọng · ${cnt('med')} đáng chú ý · ${cnt('low')} nhẹ`, cnt('high') ? 'red' : '')}
    ${j ? kpi('Người chơi tới màn cuối', pct(j.finished / j.players, 1), `mô phỏng ${n0(j.players)} người`, j.finished / j.players < 0.1 ? 'red' : '') : ''}
    ${worst ? kpi('Màn gây bỏ chơi nhiều nhất', `Màn ${worst.level}`, `${pct((worst.quitLoss + worst.quitHearts) / Math.max(1, worst.entered))} số người vào màn`, 'red') : ''}
  </div>
  <div class="grid2">
    <div class="card">
      <div class="row sp"><h2>Vấn đề phát hiện</h2>
        <div class="chips">${(['all', 'high', 'med', 'low'] as const).map((f) => `<button class="chip ${S.filter === f ? 'on' : ''}" data-filter="${f}">${f === 'all' ? `Tất cả ${S.issues.length}` : `${SEVERITY_LABEL[f]} ${cnt(f)}`}</button>`).join('')}</div></div>
      <p class="sub">Tool tự đọc số liệu và so với các ngưỡng ở bên phải. Bấm tên màn để xem biểu đồ của màn đó.</p>
      ${shown.length ? shown.map(issueHtml).join('') : '<div class="empty">Không có vấn đề nào ở mức này với ngưỡng hiện tại.</div>'}
    </div>
    <div>
      <div class="card" style="margin-bottom:14px">
        <h2>Ngưỡng đánh giá</h2>
        <p class="sub">Đổi ngưỡng để xem danh sách vấn đề thay đổi theo mục tiêu thiết kế của bạn.</p>
        <div class="form">
          ${thrRow('winLo', 'Thắng tối thiểu (dưới là quá khó)', 0.05, 0.8, 0.05, true)}
          ${thrRow('winHi', 'Thắng tối đa (trên là quá dễ)', 0.6, 1, 0.01, true)}
          ${thrRow('spike', 'Spike: tụt quá bấy nhiêu điểm', 0.1, 0.8, 0.05, true)}
          ${thrRow('quit', 'Bỏ chơi tại một màn quá', 0.02, 0.6, 0.01, true)}
          ${thrRow('noHearts', 'Hết tim quá (trên số người vào màn)', 0.1, 1, 0.05, true)}
          ${thrRow('easyLevels', 'Số màn đầu được phép dễ', 0, 6, 1, false)}
          ${thrRow('longWin', 'Lượt thắng dài quá (giây)', 30, 240, 10, false)}
        </div>
        <button class="btn sm" id="thr-reset" style="margin-top:10px">Khôi phục mặc định</button>
      </div>
      <div class="card">
        <h2>Các màn</h2>
        <p class="sub">Tỉ lệ thắng mỗi nhóm; chấm màu là các vấn đề gắn với màn.</p>
        ${levelTable()}
      </div>
    </div>
  </div>`;
}

function thrRow(key: keyof Thresholds, label: string, min: number, max: number, step: number, asPct: boolean): string {
  const v = S.thr[key];
  return `<label>${label}</label><div class="range"><input type="range" data-thr="${key}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${asPct ? pct(v) : v}</output></div>`;
}

function issueHtml(i: Issue): string {
  const d = D();
  const nm = i.level ? ` <button class="btn sm" data-goto="${i.level}">Xem màn ${i.level}${esc(d.levels.find((l) => l.level === i.level)?.name ? ' · ' + d.levels.find((l) => l.level === i.level)!.name : '')}</button>` : '';
  return `<div class="issue ${i.severity}"><div class="t"><span class="badge ${i.severity}">${SEVERITY_LABEL[i.severity]}</span>${esc(i.title)}${nm}</div><div class="e">${esc(i.evidence)}</div><div class="a">${esc(i.advice)}</div></div>`;
}

function levelTable(): string {
  const d = D();
  const head = `<tr><th>Màn</th>${d.personas.map((p) => `<th class="num" style="color:${p.color}">${esc(p.name.slice(0, 9))}</th>`).join('')}<th class="num">TB</th><th></th></tr>`;
  const rows = d.levels.map((l) => {
    const m = mixWinRate(d, l.level);
    const flags = S.issues.filter((i) => i.level === l.level);
    const cls = m < S.thr.winLo ? 'bad' : m < 0.6 ? 'mid' : 'good';
    return `<tr class="row-lv ${S.sel === l.level ? 'sel' : ''}" data-goto="${l.level}"><td>${l.level} · ${esc(l.name)}${l.hard ? ' ★' : ''}</td>${d.personas.map((p) => `<td class="num">${pct(cellOf(d, l.level, p.id)?.winRate)}</td>`).join('')}<td class="num"><span class="pill ${cls}">${pct(m)}</span></td><td>${flags.map((f) => `<span class="dotflag ${f.severity}" title="${esc(f.title)}"></span>`).join('')}</td></tr>`;
  });
  return `<div style="overflow:auto"><table class="t">${head}${rows.join('')}</table></div>`;
}

// ---------------------------------------------------------------- charts

function chartsHtml(): string {
  const d = D();
  const sel = S.sel;
  const metricOpts = METRICS.filter((m) => d.levels.some((l) => typeof l[m.key] === 'number')).map((m) => `<option value="${String(m.key)}" ${m.key === S.metric ? 'selected' : ''}>${m.label}</option>`).join('');
  const j = S.journey;
  return `
  ${sel ? levelDetail(sel) : '<div class="origin"><span>👆</span><div>Bấm vào một màn trên bất kỳ biểu đồ nào để xem chi tiết màn đó ở đây.</div></div>'}
  <div class="grid2">
    <div class="card"><h2>Đường cong độ khó</h2><p class="sub">Tỉ lệ thắng mỗi lượt theo màn, theo từng nhóm. Đường đậm là trung bình cả tệp; chấm đỏ nằm ngoài dải mục tiêu.</p><div data-chart>${difficultyChart(d, S.thr, sel)}</div></div>
    <div class="card"><h2>Bản đồ nhiệt</h2><p class="sub">Một cái nhìn cho mọi màn × nhóm. Đỏ là khó, xanh là dễ.</p>${heatmap(d, sel)}</div>
  </div>
  <div class="grid2">
    <div class="card"><h2>Độ khó tăng vọt (spike)</h2><p class="sub">Chênh lệch tỉ lệ thắng trung bình so với màn trước. Cột đỏ vượt ngưỡng.</p><div data-chart>${spikeChart(d, S.thr, sel)}</div></div>
    <div class="card"><h2>Khoảng cách kỹ năng</h2><p class="sub">Từ nhóm yếu nhất tới nhóm giỏi nhất. Vùng rộng nghĩa là màn thưởng cho kỹ năng.</p><div data-chart>${skillGapChart(d, sel)}</div></div>
  </div>
  <div class="grid2">
    <div class="card"><h2>Người chơi thua ở đâu?</h2><p class="sub">Lượng cát còn lại trong khung khi thua. Cột đỏ nghĩa là thua rất sớm, người chơi không thấy tiến triển.</p><div data-chart>${lossChart(d, sel)}</div></div>
    <div class="card"><h2>Phễu giữ chân người chơi</h2><p class="sub">${j ? `Mô phỏng ${n0(j.players)} người đi qua các màn, có tính tim, xu và quảng cáo.` : ''} Đỏ là người bỏ chơi tại màn.</p><div data-chart>${funnelChart(d, j, sel)}</div></div>
  </div>
  <div class="grid3">
    <div class="card"><h2>Số lần thử để qua màn</h2><p class="sub">${sel ? `Màn ${sel}` : 'Chọn một màn'}: sau mỗi lần thua một phần người chơi bỏ cuộc.</p>${sel ? attemptsChart(d, sel, S.personas[1]?.quitAfterLoss ?? 0.2) : '<div class="empty">Chọn một màn.</div>'}</div>
    <div class="card"><div class="row sp"><h2>Cấu trúc màn ↔ độ khó</h2><select class="select" id="metric">${metricOpts}</select></div><p class="sub">Yếu tố thiết kế nào làm màn khó hơn?</p><div data-chart>${scatterChart(d, S.metric, sel)}</div></div>
    <div class="card"><h2>Cách đọc</h2><div class="sub" style="line-height:1.7">
      <b>Dải mục tiêu</b>: vùng xanh trên đường cong; đường đậm nằm trong dải là ổn.<br>
      <b>Spike</b>: người chơi trung bình thấy màn này khó hơn hẳn màn trước.<br>
      <b>Khoảng cách kỹ năng</b>: nếu nhóm yếu và nhóm giỏi thắng như nhau thì lựa chọn của người chơi không có ý nghĩa.<br>
      <b>Thua sớm</b>: băng chuyền kẹt gần như ngay, người chơi không thấy mình tiến gần.<br>
      <b>Phễu</b>: dùng để thấy màn nào làm mất người chơi.
    </div></div>
  </div>`;
}

function levelDetail(L: number): string {
  const d = D();
  const lm = d.levels.find((l) => l.level === L);
  if (!lm) return '';
  const issues = S.issues.filter((i) => i.level === L);
  const struct = [
    ['Số xô', lm.buckets], ['Xô bí ẩn', lm.mystery], ['Số màu', lm.colors], ['Xô nằm sâu nhất', lm.depthMax], ['Độ sâu tới màu cần', lm.depthFirst], ['Bấm được ngay', lm.openAtStart], ['…và đang cần', lm.openNeeded],
  ].filter((x) => x[1] !== undefined).map((x) => `<span class="chip">${x[0]}: <b>${x[1]}</b></span>`).join(' ');
  const rows = d.personas.map((p) => {
    const c = cellOf(d, L, p.id);
    if (!c) return `<tr><td>${esc(p.name)}</td><td colspan="6" class="muted">không có dữ liệu</td></tr>`;
    return `<tr><td><span class="dotflag" style="background:${p.color}"></span>${esc(p.name)}</td><td class="num">${c.runs}</td><td class="num"><b>${pct(c.winRate)}</b></td><td class="num">${c.avgWinTime ? `${c.avgWinTime.toFixed(0)} s` : '–'}</td><td class="num">${c.taps ? c.taps.toFixed(1) : '–'}</td><td class="num">${c.sandLeftOnLoss !== undefined ? pct(c.sandLeftOnLoss) : '–'}</td><td class="num">${c.nearMiss !== undefined ? pct(c.nearMiss) : '–'}</td></tr>`;
  }).join('');
  const f = S.journey?.levels.find((x) => x.level === L);
  return `<div class="card" style="margin-bottom:14px">
    <div class="row sp"><h2>Màn ${L} · ${esc(lm.name)}${lm.hard ? ' ★ khó' : ''}</h2><button class="btn sm" id="clear-sel">Bỏ chọn</button></div>
    <div class="chips" style="margin:6px 0 10px">${struct || '<span class="muted">Không có thông số cấu trúc màn.</span>'}</div>
    <div class="grid2" style="margin:0">
      <div style="overflow:auto"><table class="t"><tr><th>Nhóm</th><th class="num">Lượt</th><th class="num">Thắng</th><th class="num">Thời gian thắng</th><th class="num">Bấm</th><th class="num">Cát còn khi thua</th><th class="num">Suýt thắng</th></tr>${rows}</table>
      ${f ? `<p class="sub" style="margin-top:10px">Mô phỏng hành trình: ${n0(f.entered)} người vào, ${n0(f.passed)} qua màn, ${n0(f.quitLoss + f.quitHearts)} bỏ chơi, ${n0(f.outOfHearts)} lần hết tim; trung bình mỗi người thua ${(f.losses / Math.max(1, f.entered)).toFixed(1)} lượt.</p>` : ''}</div>
      <div>${issues.length ? issues.map(issueHtml).join('') : '<div class="empty">Không có vấn đề nào gắn với màn này.</div>'}</div>
    </div></div>`;
}

// ---------------------------------------------------------------- journey

function ecoRow(key: keyof EconomyParams, label: string, min: number, max: number, step: number, unit = ''): string {
  const v = S.eco[key];
  const shown = key === 'regenSeconds' ? `${Math.round(v / 60)} phút` : `${v}${unit}`;
  const val = key === 'regenSeconds' ? v / 60 : v;
  const [mn, mx, st] = key === 'regenSeconds' ? [1, 120, 1] : [min, max, step];
  return `<label>${label}</label><div class="range"><input type="range" data-eco="${key}" min="${mn}" max="${mx}" step="${st}" value="${val}"><output>${shown}</output></div>`;
}

const PRESETS: { id: string; label: string; apply: (e: EconomyParams) => EconomyParams }[] = [
  { id: 'default', label: 'Mặc định của game', apply: () => ({ ...DEFAULT_ECONOMY }) },
  { id: 'regen', label: 'Tim hồi nhanh gấp đôi', apply: (e) => ({ ...e, regenSeconds: Math.max(60, e.regenSeconds / 2) }) },
  { id: 'hearts10', label: '10 tim tối đa', apply: (e) => ({ ...e, heartMax: 10 }) },
  { id: 'ad3', label: 'Quảng cáo cho 3 tim', apply: (e) => ({ ...e, adHearts: 3 }) },
  { id: 'reward2', label: 'Thưởng xu gấp đôi', apply: (e) => ({ ...e, rewardFirst: e.rewardFirst * 2, rewardHard: e.rewardHard * 2, firstTryBonus: e.firstTryBonus * 2 }) },
  { id: 'cheap', label: 'Tim rẻ (10 xu)', apply: (e) => ({ ...e, heartPrice: 10 }) },
];

function journeyHtml(): string {
  const j = S.journey;
  if (!j) return '<div class="empty">Không có số liệu để mô phỏng.</div>';
  return `
  <div class="journey">
    <div>
      <div class="card" style="margin-bottom:14px">
        <h2>Tham số</h2>
        <p class="sub">Tỉ lệ thắng mỗi lượt lấy từ số liệu của từng nhóm; phần còn lại theo luật kinh tế của game (<code>economy.ts</code>).</p>
        <div class="form">
          <label>Số người chơi ảo</label><input class="num" type="number" id="players" min="200" max="30000" step="500" value="${S.players}">
          <label>Hạt giống ngẫu nhiên</label><input class="num" type="number" id="seed" min="1" max="99999" value="${S.seed}">
          ${ecoRow('heartMax', 'Tim tối đa', 1, 12, 1)}
          ${ecoRow('regenSeconds', 'Một tim hồi sau', 1, 120, 1)}
          ${ecoRow('heartPrice', 'Giá một tim (xu)', 5, 200, 5)}
          ${ecoRow('adHearts', 'Tim mỗi lần xem quảng cáo', 1, 5, 1)}
          ${ecoRow('rewardFirst', 'Thưởng qua màn (xu)', 0, 200, 5)}
          ${ecoRow('firstTryBonus', 'Thưởng qua ngay lần đầu', 0, 100, 5)}
          ${ecoRow('menuSeconds', 'Nghỉ giữa hai lượt (giây)', 0, 60, 2)}
        </div>
        <h3>Thử nhanh</h3>
        <div class="presets">${PRESETS.map((p) => `<button class="btn sm" data-preset="${p.id}">${p.label}</button>`).join('')}</div>
        <div class="row"><button class="btn primary sm" id="pin">Ghim kết quả này để so sánh</button>${S.pinned ? '<button class="btn sm" id="unpin">Bỏ ghim</button>' : ''}</div>
        <p class="sub" style="margin-top:8px">Hành vi bỏ chơi, xem quảng cáo, mua tim của từng nhóm chỉnh ở tab "Bot &amp; nhóm người chơi".</p>
      </div>
      ${S.pinned ? compareHtml(S.pinned) : ''}
    </div>
    <div>
      <div class="card" style="margin-bottom:14px">
        <div class="row sp"><h2>Sơ đồ hành trình</h2><div class="muted" id="clock-top"></div></div>
        <p class="sub">Mỗi ô là một phần của vòng chơi: ${n0(j.players)} người chơi ảo đi từ lúc cài game. Đường nối nhấp nháy khi có người đi qua; đường càng dày thì lưu lượng càng lớn.</p>
        <div id="diagram"></div>
        <div class="player">
          <button class="btn primary sm" id="play">▶ Chạy</button>
          <button class="btn sm" id="restart">⟲</button>
          <input type="range" id="scrub" min="0" max="${j.samples.length - 1}" value="${S.play.idx}">
          <span class="clock" id="clock"></span>
          <select class="select" id="speed" style="padding:4px 8px"><option value="0.5">x0,5</option><option value="1" selected>x1</option><option value="2">x2</option><option value="4">x4</option></select>
        </div>
        <div class="kind-legend">${DIAGRAM_LEGEND.map((l) => `<span><i style="background:${l.color}">${l.symbol}</i>${l.name}</span>`).join('')}</div>
      </div>
      <div class="grid2" style="grid-template-columns:1.4fr 1fr">
        <div class="card"><h2>Người chơi theo thời gian</h2><div id="timechart"></div></div>
        <div class="card"><h2>Đang ở màn nào</h2><p class="sub">Tại thời điểm đang chọn.</p><div id="crowd"></div></div>
      </div>
      <div class="card"><h2>Hành trình theo màn</h2>${journeyTable(j)}</div>
    </div>
  </div>`;
}

function journeyTable(j: JourneyResult): string {
  const d = D();
  const head = '<tr><th>Màn</th><th class="num">Vào màn</th><th class="num">Qua màn</th><th class="num">Bỏ chơi</th><th class="num">Rời sau thắng</th><th class="num">Lượt TB/người</th><th class="num">Hết tim</th><th class="num">QC</th><th class="num">Mua tim</th><th class="num">Tới màn lúc (trung vị)</th></tr>';
  const rows = j.levels.map((f) => {
    const q = (f.quitLoss + f.quitHearts) / Math.max(1, f.entered);
    const when = f.medianArrival < 3600 ? `${Math.round(f.medianArrival / 60)} phút` : `${(f.medianArrival / 3600).toFixed(1)} giờ`;
    return `<tr class="row-lv" data-goto="${f.level}"><td>${f.level} · ${esc(d.levels.find((l) => l.level === f.level)?.name ?? '')}</td><td class="num">${n0(f.entered)}</td><td class="num">${n0(f.passed)}</td><td class="num">${n0(f.quitLoss + f.quitHearts)} <span class="pill ${q >= S.thr.quit * 2 ? 'bad' : q >= S.thr.quit ? 'mid' : 'good'}">${pct(q)}</span></td><td class="num">${n0(f.leftAfterWin)}</td><td class="num">${(f.attempts / Math.max(1, f.entered)).toFixed(1)}</td><td class="num">${n0(f.outOfHearts)}</td><td class="num">${n0(f.ads)}</td><td class="num">${n0(f.buys)}</td><td class="num">${f.entered ? when : '–'}</td></tr>`;
  });
  return `<div style="overflow:auto"><table class="t">${head}${rows.join('')}</table></div>`;
}

function summary(r: JourneyResult) {
  const worst = r.levels.reduce((a, b) => ((b.quitLoss + b.quitHearts) / Math.max(1, b.entered) > (a.quitLoss + a.quitHearts) / Math.max(1, a.entered) ? b : a));
  const last = r.samples[r.samples.length - 1];
  return {
    finished: r.finished / r.players,
    quit: r.quitTotal / r.players,
    worst: `Màn ${worst.level} (${pct((worst.quitLoss + worst.quitHearts) / Math.max(1, worst.entered))})`,
    hours: r.meanSeconds / 3600,
    ads: last.cumAds / r.players,
    buys: last.cumBuys / r.players,
    coins: last.avgCoins,
  };
}

function compareHtml(p: { label: string; r: JourneyResult }): string {
  const a = summary(p.r), b = summary(S.journey!);
  const row = (label: string, x: number, y: number, fmt: (v: number) => string, goodUp: boolean) => {
    const d = y - x;
    const cls = Math.abs(d) < 1e-9 ? '' : (d > 0) === goodUp ? 'up' : 'down';
    return `<tr><td>${label}</td><td>${fmt(x)}</td><td>${fmt(y)}</td><td class="delta ${cls}">${d > 0 ? '+' : ''}${fmt(d)}</td></tr>`;
  };
  return `<div class="card"><h2>So sánh với bản đã ghim</h2><p class="sub">Đã ghim: ${esc(p.label)}</p><table class="t cmp"><tr><th></th><th>Đã ghim</th><th>Hiện tại</th><th>Chênh</th></tr>
    ${row('Hoàn thành', a.finished, b.finished, (v) => pct(v, 1), true)}
    ${row('Bỏ chơi', a.quit, b.quit, (v) => pct(v, 1), false)}
    <tr><td>Màn bỏ nhiều nhất</td><td>${a.worst}</td><td>${b.worst}</td><td></td></tr>
    ${row('Thời gian chơi TB (giờ)', a.hours, b.hours, (v) => v.toFixed(1), true)}
    ${row('Xem QC / người', a.ads, b.ads, (v) => v.toFixed(2), true)}
    ${row('Mua tim / người', a.buys, b.buys, (v) => v.toFixed(2), true)}
    ${row('Xu TB cuối', a.coins, b.coins, (v) => String(Math.round(v)), true)}</table></div>`;
}

function fmtClock(sec: number): string {
  if (sec < 3600) return `${Math.floor(sec / 60)} phút`;
  const h = sec / 3600;
  return h < 48 ? `${h.toFixed(1)} giờ` : `${(h / 24).toFixed(1)} ngày`;
}

function mountJourney(): void {
  const j = S.journey;
  if (!j) return;
  diagram = buildDiagram(j);
  (root.querySelector('#diagram') as HTMLElement).appendChild(diagram.svg);
  const speedSel = root.querySelector('#speed') as HTMLSelectElement;
  speedSel.value = String(S.play.speed);
  const scrub = root.querySelector('#scrub') as HTMLInputElement;
  const playBtn = root.querySelector('#play') as HTMLButtonElement;
  let shown = -1;
  const paint = () => {
    const i = Math.round(S.play.idx);
    if (i === shown) return;
    shown = i;
    const s = j.samples[i];
    diagram!.update(i);
    scrub.value = String(i);
    (root.querySelector('#clock') as HTMLElement).textContent = fmtClock(s.t);
    (root.querySelector('#clock-top') as HTMLElement).textContent = `${pct(s.done / j.players, 1)} đã hoàn thành · ${pct((s.quitLoss + s.quitHearts) / j.players, 1)} đã bỏ chơi`;
    (root.querySelector('#timechart') as HTMLElement).innerHTML = timeChart(j, s.t);
    (root.querySelector('#crowd') as HTMLElement).innerHTML = crowdChart(j, s);
  };
  const tick = (now: number) => {
    if (S.play.on) {
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      S.play.idx += dt * S.play.speed * (j.samples.length / 14);
      if (S.play.idx >= j.samples.length - 1) { S.play.idx = j.samples.length - 1; S.play.on = false; }
      playBtn.textContent = S.play.on ? '⏸ Dừng' : '▶ Chạy';
    }
    lastFrame = now;
    paint();
    raf = requestAnimationFrame(tick);
  };
  playBtn.textContent = S.play.on ? '⏸ Dừng' : '▶ Chạy';
  playBtn.onclick = () => {
    if (!S.play.on && S.play.idx >= j.samples.length - 1) S.play.idx = 0;
    S.play.on = !S.play.on;
    playBtn.textContent = S.play.on ? '⏸ Dừng' : '▶ Chạy';
  };
  (root.querySelector('#restart') as HTMLElement).onclick = () => { S.play.idx = 0; };
  scrub.oninput = () => { S.play.on = false; S.play.idx = Number(scrub.value); playBtn.textContent = '▶ Chạy'; };
  speedSel.onchange = () => { S.play.speed = Number(speedSel.value); };
  raf = requestAnimationFrame((t) => { lastFrame = t; tick(t); });
}

// ---------------------------------------------------------------- bots tab

const pctField = (id: string, f: string, v: number, max = 100) => `<div class="range"><input type="range" data-p="${id}" data-f="${f}" min="0" max="${max}" step="1" value="${Math.round(v * 100)}"><output>${Math.round(v * 100)}%</output></div>`;
const numField = (id: string, f: string, v: number, min: number, max: number, step: number) => `<input class="num" type="number" data-p="${id}" data-f="${f}" min="${min}" max="${max}" step="${step}" value="${v}">`;

function personaCard(p: PersonaDef): string {
  return `<div class="persona">
    <div class="head"><input type="color" data-p="${p.id}" data-f="color" value="${p.color}"><input class="txt" style="flex:1" data-p="${p.id}" data-f="name" value="${esc(p.name)}"><button class="btn red sm" data-del="${p.id}" ${S.personas.length <= 1 ? 'disabled' : ''}>Xóa</button></div>
    <div class="cols">
      <h4>Cách chơi một màn (chạy trên lõi game thật)</h4>
      <div class="form"><label>Chọn xô</label><select class="select" data-p="${p.id}" data-f="policy">
        <option value="random" ${p.policy === 'random' ? 'selected' : ''}>Bấm bừa</option><option value="exposed" ${p.policy === 'exposed' ? 'selected' : ''}>Ưu tiên xô có màu đang lộ</option><option value="smallest" ${p.policy === 'smallest' ? 'selected' : ''}>Ưu tiên xô nhỏ nhất có màu lộ</option></select></div>
      <div class="form"><label>Nhìn trước khi phải đào (nước)</label>${numField(p.id, 'lookDepth', p.lookDepth, 0, 6, 1)}</div>
      <div class="form"><label>Chừa ô băng chuyền khi đào</label>${numField(p.id, 'reserveSlots', p.reserveSlots, 0, 4, 1)}</div>
      <div class="form"><label>Nghĩ mỗi lần bấm (giây)</label><span>${numField(p.id, 'thinkMin', p.thinkMin, 0.1, 5, 0.1)} – ${numField(p.id, 'thinkMax', p.thinkMax, 0.1, 8, 0.1)}</span></div>
      <div class="form"><label>Bấm trượt</label>${pctField(p.id, 'miss', p.miss, 50)}</div>
      <h4>Hành vi quanh màn chơi (mô phỏng hành trình)</h4>
      <div class="form"><label>Bỏ chơi sau một lượt thua</label>${pctField(p.id, 'quitAfterLoss', p.quitAfterLoss, 80)}</div>
      <div class="form"><label>Rời game sau khi thắng</label>${pctField(p.id, 'leaveAfterWin', p.leaveAfterWin, 30)}</div>
      <div class="form"><label>Hết tim: xem quảng cáo</label>${pctField(p.id, 'adProb', p.adProb)}</div>
      <div class="form"><label>Hết tim: mua tim (nếu đủ xu)</label>${pctField(p.id, 'buyProb', p.buyProb)}</div>
      <div class="form"><label>Hết tim: chờ hồi</label>${pctField(p.id, 'waitProb', p.waitProb)}</div>
      <div class="form"><label class="muted">Phần còn lại bỏ chơi</label><b>${Math.max(0, 100 - Math.round((p.adProb + p.buyProb + p.waitProb) * 100))}%</b></div>
    </div></div>`;
}

function botsHtml(): string {
  const d = D();
  const total = d.personas.reduce((a, p) => a + p.share, 0) || 1;
  const r = S.run;
  return `
  <div class="grid2" style="grid-template-columns:1fr 1fr">
    <div>
      <div class="card" style="margin-bottom:14px">
        <h2>Cơ cấu người chơi</h2>
        <p class="sub">Tỉ lệ từng nhóm trong tệp người chơi. Đổi tỉ lệ thì mọi biểu đồ và mô phỏng tính lại ngay, không cần chạy lại bot.</p>
        <div class="mixbar">${d.personas.map((p) => `<span style="background:${p.color};width:${(p.share / total) * 100}%" title="${esc(p.name)} ${pct(p.share / total)}">${p.share / total > 0.08 ? pct(p.share / total) : ''}</span>`).join('')}</div>
        <div class="form">${d.personas.map((p) => `<label><span class="dotflag" style="background:${p.color}"></span>${esc(p.name)}</label><div class="range"><input type="range" data-share="${p.id}" min="0" max="100" step="1" value="${Math.round((p.share / total) * 100)}"><output>${pct(p.share / total)}</output></div>`).join('')}</div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <h2>Chạy bot trên game thật</h2>
        <p class="sub">Mỗi nhóm chơi mỗi màn nhiều lần bằng chính lõi game (cát, băng chuyền, luật thua). Chạy song song bằng nhiều luồng nền; 15 màn × ${S.personas.length} nhóm × ${r.seeds} lượt mất khoảng vài phút.</p>
        <div class="form">
          <label>Số lượt mỗi (màn, nhóm)</label><div class="range"><input type="range" id="seeds" min="8" max="60" step="4" value="${r.seeds}"><output>${r.seeds}</output></div>
          <label>Giới hạn một lượt (giây game)</label><div class="range"><input type="range" id="cap" min="60" max="400" step="20" value="${r.cap}"><output>${r.cap}</output></div>
        </div>
        <div class="row" style="margin-top:12px"><button class="btn primary" id="run-bots" ${r.busy ? 'disabled' : ''}>▶ Chạy bot</button>${r.busy ? '<button class="btn red" id="cancel-bots">Hủy</button>' : ''}</div>
        ${r.busy ? `<div class="progress"><i id="prog" style="width:${(r.done / Math.max(1, r.total)) * 100}%"></i></div><div class="muted" id="prog-t">${r.done}/${r.total} gói</div>` : ''}
        ${r.msg ? `<div class="msg ${r.bad ? 'bad' : 'ok'}">${esc(r.msg)}</div>` : ''}
      </div>
      <div class="card">
        <h2>Nhập số liệu từ file CSV</h2>
        <p class="sub">Thả hoặc chọn các file CSV của GD (nhận ra bảng theo tên cột): cần bảng "Hiệu suất theo nhóm"; bảng cấu trúc màn, tiến trình, tổng hợp là tùy chọn.</p>
        <input type="file" id="csv" accept=".csv,text/csv" multiple>
        <div class="drop">…hoặc kéo thả file vào bất kỳ đâu trên trang</div>
        ${S.csvMsg ? `<div class="msg ${S.csvMsg.startsWith('Lỗi') ? 'bad' : 'ok'}">${esc(S.csvMsg)}</div>` : ''}
      </div>
    </div>
    <div>
      <div class="row sp" style="margin-bottom:10px"><h2>Hành vi của từng nhóm</h2><div class="row"><button class="btn sm" id="add-persona">+ Thêm nhóm</button><button class="btn sm" id="reset-personas">Khôi phục 4 nhóm mặc định</button></div></div>
      <p class="sub">Tham số cách chơi chỉ có tác dụng ở lần chạy bot kế tiếp. Tham số hành vi (bỏ chơi, quảng cáo, mua tim) áp dụng ngay cho mô phỏng hành trình.</p>
      ${S.personas.map(personaCard).join('')}
    </div>
  </div>`;
}

// ------------------------------------------------------------------ events

function download(name: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setDataset(d: Dataset): void {
  const i = S.sources.findIndex((s) => s.id === d.id);
  if (i >= 0) S.sources[i] = d; else S.sources.push(d);
  S.cur = d.id;
  S.sel = undefined;
  S.play.idx = 0;
  recompute();
}

async function importFiles(files: File[]): Promise<void> {
  try {
    const texts = await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() })));
    const d = datasetFromCsv(texts, `Nhập từ file · ${files.map((f) => f.name).slice(0, 2).join(', ')}${files.length > 2 ? '…' : ''}`);
    setDataset(d);
    S.csvMsg = `Đã đọc ${d.cells.length} dòng (màn × nhóm) cho ${d.levels.length} màn và ${d.personas.length} nhóm.`;
    S.tab = 'overview';
  } catch (e) {
    S.csvMsg = `Lỗi: ${e instanceof Error ? e.message : String(e)}`;
  }
  render();
}

async function startRun(): Promise<void> {
  const r = S.run;
  if (r.busy) return;
  const levels = LEVELS.map((_, i) => i + 1);
  r.busy = true; r.done = 0; r.msg = ''; r.bad = false;
  const personas = clonePersonas(S.personas);
  r.handle = runBots({
    personas, levels, seeds: r.seeds, cap: r.cap,
    onProgress: (done, total) => {
      r.done = done; r.total = total;
      const bar = root.querySelector('#prog') as HTMLElement | null;
      if (bar) { bar.style.width = `${(done / total) * 100}%`; (root.querySelector('#prog-t') as HTMLElement).textContent = `${done}/${total} gói`; }
    },
  });
  render();
  try {
    const results = await r.handle.promise;
    const metas = LEVELS.map((def, i) => levelMeta(def, i));
    const d = buildDataset({
      id: 'run', title: `Bot vừa chạy · ${new Date().toLocaleTimeString('vi-VN')}`, origin: 'bot', personas, levels: metas, results,
      note: `Bot chơi ${r.seeds} lượt cho mỗi màn và nhóm trên lõi game thật, giới hạn ${r.cap} giây mỗi lượt. Không phải người chơi thật.`,
    });
    r.busy = false;
    r.msg = `Xong: ${d.cells.length} ô số liệu. Đã chuyển sang nguồn "${d.title}".`;
    setDataset(d);
    S.tab = 'overview';
  } catch (e) {
    r.busy = false; r.bad = true;
    r.msg = `Lỗi khi chạy bot: ${e instanceof Error ? e.message : String(e)}`;
  }
  render();
}

root.addEventListener('click', (e) => {
  const t = e.target as Element;
  const tab = t.closest('[data-tab]') as HTMLElement | null;
  if (tab) { S.tab = tab.dataset.tab as Tab; S.play.on = false; render(); return; }
  const filter = t.closest('[data-filter]') as HTMLElement | null;
  if (filter) { S.filter = filter.dataset.filter as Severity | 'all'; render(); return; }
  const go = t.closest('[data-goto]') as HTMLElement | null;
  if (go) { S.sel = Number(go.dataset.goto); if (S.tab !== 'journey') S.tab = 'charts'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  const lv = t.closest('[data-level]') as HTMLElement | null;
  if (lv && S.tab === 'charts') { const L = Number(lv.dataset.level); S.sel = S.sel === L ? undefined : L; render(); return; }
  const preset = t.closest('[data-preset]') as HTMLElement | null;
  if (preset) {
    const p = PRESETS.find((x) => x.id === preset.dataset.preset);
    if (p) { S.eco = p.apply(S.eco); recompute(); render(); }
    return;
  }
  const del = t.closest('[data-del]') as HTMLElement | null;
  if (del) { S.personas = S.personas.filter((p) => p.id !== del.dataset.del); render(); return; }
  switch ((t.closest('button') as HTMLElement | null)?.id) {
    case 'thr-reset': S.thr = { ...DEFAULT_THRESHOLDS }; recompute(); render(); break;
    case 'clear-sel': S.sel = undefined; render(); break;
    case 'dl-md': download('bao-cao-phan-tich.md', reportMarkdown(D(), S.issues, S.journey), 'text/markdown'); break;
    case 'dl-csv': download('so-lieu-theo-man.csv', datasetToCsv(D()), 'text/csv'); break;
    case 'pin': if (S.journey) { S.pinned = { label: `${S.eco.heartMax} tim, hồi ${Math.round(S.eco.regenSeconds / 60)} phút, QC +${S.eco.adHearts}, thưởng ${S.eco.rewardFirst} xu`, r: S.journey }; render(); } break;
    case 'unpin': S.pinned = null; render(); break;
    case 'run-bots': void startRun(); break;
    case 'cancel-bots': S.run.handle?.cancel(); S.run.busy = false; S.run.msg = 'Đã hủy.'; render(); break;
    case 'add-persona': S.personas.push(newPersona(S.personas.length)); render(); break;
    case 'reset-personas': S.personas = clonePersonas(DEFAULT_PERSONAS); recompute(); render(); break;
  }
});

const toNum = (f: string, v: string): number | string => {
  if (f === 'name' || f === 'color' || f === 'policy') return v;
  return Number(v);
};
const PCT_FIELDS = new Set(['miss', 'quitAfterLoss', 'leaveAfterWin', 'adProb', 'buyProb', 'waitProb']);

root.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  const out = t.parentElement?.querySelector('output');
  if (t.type === 'range' && out) {
    if (t.dataset.thr) out.textContent = ['easyLevels', 'longWin'].includes(t.dataset.thr) ? t.value : `${Math.round(Number(t.value) * 100)}%`;
    else if (t.dataset.eco) out.textContent = t.dataset.eco === 'regenSeconds' ? `${t.value} phút` : t.value;
    else out.textContent = t.dataset.p || t.dataset.share ? `${t.value}%` : t.value;
  }
});

root.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement & HTMLSelectElement;
  if (t.id === 'src') { S.cur = t.value; S.sel = undefined; S.play.idx = 0; recompute(); render(); return; }
  if (t.id === 'metric') { S.metric = t.value as keyof LevelMeta; render(); return; }
  if (t.id === 'players') { S.players = Math.max(200, Math.min(30000, Number(t.value) || 4000)); recompute(); render(); return; }
  if (t.id === 'seed') { S.seed = Number(t.value) || 1; recompute(); render(); return; }
  if (t.id === 'seeds') { S.run.seeds = Number(t.value); render(); return; }
  if (t.id === 'cap') { S.run.cap = Number(t.value); render(); return; }
  if (t.id === 'csv') { const files = [...(t.files ?? [])]; if (files.length) void importFiles(files); return; }
  if (t.dataset.thr) {
    (S.thr as unknown as Record<string, number>)[t.dataset.thr] = Number(t.value);
    S.issues = detectIssues(D(), S.thr, S.journey);
    render();
    return;
  }
  if (t.dataset.eco) {
    const k = t.dataset.eco as keyof EconomyParams;
    S.eco = { ...S.eco, [k]: k === 'regenSeconds' ? Number(t.value) * 60 : Number(t.value) };
    recompute(); render();
    return;
  }
  if (t.dataset.share) {
    const d = D();
    const p = d.personas.find((x) => x.id === t.dataset.share);
    if (p) {
      p.share = Number(t.value) / 100;
      const bp = S.personas.find((x) => x.id === p.id);
      if (bp) bp.share = p.share;
      recompute(); render();
    }
    return;
  }
  if (t.dataset.p && t.dataset.f) {
    const p = S.personas.find((x) => x.id === t.dataset.p);
    if (!p) return;
    const f = t.dataset.f;
    let v = toNum(f, t.value);
    if (typeof v === 'number' && PCT_FIELDS.has(f)) v /= 100;
    (p as unknown as Record<string, unknown>)[f] = v;
    if (f === 'thinkMin' && p.thinkMax < p.thinkMin) p.thinkMax = p.thinkMin;
    if (f === 'thinkMax' && p.thinkMin > p.thinkMax) p.thinkMin = p.thinkMax;
    const dp = D().personas.find((x) => x.id === p.id);
    if (dp && (f === 'name' || f === 'color')) (dp as unknown as Record<string, unknown>)[f] = v;
    recompute(); render();
  }
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; document.body.classList.add('dragging'); } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
  const files = [...(e.dataTransfer?.files ?? [])].filter((f) => /\.csv$/i.test(f.name));
  if (files.length) void importFiles(files);
});

recompute();
render();
// handy for tests
(window as unknown as { __analytics: unknown }).__analytics = { S, personaMeta };
