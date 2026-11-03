import { ART_SOURCES } from '../core/art-data';
import { SAND_COLORS } from '../core/palette';

export interface UICallbacks {
  onPlay(): void;
  onLevels(): void;
  onPause(): void;
  onResume(): void;
  onRestart(): void;
  onNext(): void;
  onRetry(): void;
  onPick(level: number): void;
  onToggle(key: 'sound' | 'music' | 'haptics' | 'colorAssist'): void;
  onTitle(): void;
}

export interface LevelCard {
  id: number;
  name: string;
  art: number;
  state: 'locked' | 'open' | 'done';
  current: boolean;
  hard: boolean;
}

const ICONS = {
  pause: '<svg viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="2"/><rect x="14" y="4" width="5" height="16" rx="2"/></svg>',
  sound: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
  music: '<svg viewBox="0 0 24 24"><path d="M9 4v11.2A3.5 3.5 0 1 0 11 18V8l8-2v7.2a3.5 3.5 0 1 0 2 3.3V3z"/></svg>',
  vibrate: '<svg viewBox="0 0 24 24"><rect x="8" y="3" width="8" height="18" rx="2.2"/><path d="M3.5 8v8M20.5 8v8M1 10.5v3M23 10.5v3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
  eye: '<svg viewBox="0 0 24 24"><path d="M12 5C6.5 5 2.7 9 1.5 12c1.2 3 5 7 10.5 7s9.3-4 10.5-7C21.3 9 17.5 5 12 5zm0 11.2a4.2 4.2 0 1 1 0-8.4 4.2 4.2 0 0 1 0 8.4z"/><circle cx="12" cy="12" r="2.1"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><path d="M7 10V8a5 5 0 0 1 10 0v2h1.5A1.5 1.5 0 0 1 20 11.5v8A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5v-8A1.5 1.5 0 0 1 5.5 10zm2.2 0h5.6V8a2.8 2.8 0 0 0-5.6 0z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#47c92a" stroke="#fff" stroke-width="2"/><path d="M6.5 12.5l3.8 3.8 7.2-7.6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export const COIN_SVG = `<svg class="coinIcon" viewBox="0 0 64 64"><defs>
<radialGradient id="cg" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#fff2a0"/><stop offset="0.45" stop-color="#ffc928"/><stop offset="1" stop-color="#e58a05"/></radialGradient></defs>
<circle cx="32" cy="32" r="29" fill="#c46a00"/><circle cx="32" cy="31" r="27" fill="url(#cg)" stroke="#fff3b8" stroke-width="2"/>
<circle cx="32" cy="31" r="19" fill="none" stroke="#d98a0a" stroke-width="2.4"/>
<path d="M32 15.5l4.2 8.9 9.7 1.2-7.1 6.7 1.8 9.6L32 37l-8.6 4.9 1.8-9.6-7.1-6.7 9.7-1.2z" fill="#fff5c4" stroke="#b86e00" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M14 22a20 20 0 0 1 12-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.8"/></svg>`;

const BUCKET_LOGO = `<svg viewBox="0 0 120 120"><defs><linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cf0c2"/><stop offset="1" stop-color="#16b684"/></linearGradient></defs>
<g stroke="#0a5a46" stroke-width="5" stroke-linejoin="round"><path d="M18 40h84l-12 62a8 8 0 0 1-8 6H38a8 8 0 0 1-8-6z" fill="url(#bg1)"/>
<ellipse cx="60" cy="40" rx="42" ry="14" fill="#0e9a72"/><ellipse cx="60" cy="38" rx="36" ry="10" fill="#f5d38c" stroke="none"/></g>
<path d="M30 56l5 38" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
<circle cx="52" cy="30" r="4" fill="#ffb84a"/><circle cx="68" cy="26" r="3" fill="#ffd23a"/><circle cx="80" cy="34" r="3.4" fill="#ff7a45"/></svg>`;

const STACK_SVG = `<svg class="stack" viewBox="0 0 120 96"><defs><linearGradient id="cs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe46b"/><stop offset="1" stop-color="#f1a408"/></linearGradient></defs>
${[
  [20, 70], [58, 74], [96, 70], [38, 58], [78, 58], [58, 46], [30, 40], [88, 42], [58, 28],
]
  .map(([x, y]) => `<g><ellipse cx="${x}" cy="${y + 7}" rx="21" ry="9" fill="#b86a00"/><ellipse cx="${x}" cy="${y + 3}" rx="21" ry="9" fill="#e59a0c"/><ellipse cx="${x}" cy="${y}" rx="21" ry="9" fill="url(#cs)" stroke="#fff0a8" stroke-width="1.6"/><ellipse cx="${x}" cy="${y}" rx="12" ry="4.6" fill="none" stroke="#c98200" stroke-width="1.6"/></g>`)
  .join('')}</svg>`;

function ribbonSvg(fail: boolean): string {
  const main = fail ? ['#ffa04a', '#d9591a'] : ['#ff6048', '#d52a20'];
  const tail = fail ? '#a8400f' : '#a8201c';
  const hi = fail ? '#ffd9a0' : '#ff9a86';
  return `<svg viewBox="0 0 820 260"><defs><linearGradient id="rg${fail ? 'f' : 'w'}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${main[0]}"/><stop offset="1" stop-color="${main[1]}"/></linearGradient></defs>
<path d="M6 84 L186 108 L186 214 L6 196 L74 140 Z" fill="${tail}" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>
<path d="M814 84 L634 108 L634 214 L814 196 L746 140 Z" fill="${tail}" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>
<path d="M150 66 Q410 6 670 66 L670 206 Q410 146 150 206 Z" fill="url(#rg${fail ? 'f' : 'w'})" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>
<path d="M170 80 Q410 26 650 80" fill="none" stroke="${hi}" stroke-width="6" stroke-linecap="round" opacity="0.7"/></svg>`;
}

/** A ring of text-shadows that reads as a clean outline, with no internal glyph contours. */
function ring(r: number, color: string, n = 16): string {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(`calc(var(--u) * ${(Math.cos(a) * r).toFixed(4)}) calc(var(--u) * ${(Math.sin(a) * r).toFixed(4)}) 0 ${color}`);
  }
  return out.join(', ');
}

/** The same idea for gradient text, which needs filter drop-shadows instead. */
function filterRing(r: number, color: string, shadow: string): string {
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(`drop-shadow(calc(var(--u) * ${(Math.cos(a) * r).toFixed(4)}) calc(var(--u) * ${(Math.sin(a) * r).toFixed(4)}) 0 ${color})`);
  }
  parts.push(shadow);
  return parts.join(' ');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export class UI {
  readonly frame: HTMLElement;
  private hud: HTMLElement;
  private lvEl: HTMLElement;
  private nameEl: HTMLElement;
  private tagEl: HTMLElement;
  private coinsBox: HTMLElement;
  private coinsNum: HTMLElement;
  private title: HTMLElement;
  private pauseL: HTMLElement;
  private winL: HTMLElement;
  private failL: HTMLElement;
  private levelsL: HTMLElement;
  private finishL: HTMLElement;
  private toastEl: HTMLElement;
  private toggles = new Map<string, HTMLElement>();
  private playBtn!: HTMLButtonElement;
  private subEl!: HTMLElement;
  private rewardAmt!: HTMLElement;
  private rewardBonus!: HTMLElement;
  private whyEl!: HTMLElement;
  private grid!: HTMLElement;
  private finishP!: HTMLElement;
  private shownCoins = 0;
  private coinAnim = 0;

  constructor(
    private root: HTMLElement,
    private cb: UICallbacks,
  ) {
    const rs = root.style;
    rs.setProperty('--ol-lv', ring(0.07, '#2b3a73'));
    rs.setProperty('--ol-btn', ring(0.045, 'rgba(12, 46, 12, 0.75)', 12));
    rs.setProperty('--ol-red', ring(0.1, '#8f1a15'));
    rs.setProperty('--ol-brown', ring(0.1, '#6d2a08'));
    rs.setProperty('--ol-amount', ring(0.09, '#3b2606'));
    rs.setProperty('--ol-head', ring(0.07, '#1f4f9c', 12));
    rs.setProperty('--fl-a', filterRing(0.1, '#5a2a06', 'drop-shadow(0 calc(var(--u) * 0.22) calc(var(--u) * 0.26) rgba(60, 30, 0, 0.4))'));
    rs.setProperty('--fl-b', filterRing(0.1, '#0b3a82', 'drop-shadow(0 calc(var(--u) * 0.22) calc(var(--u) * 0.26) rgba(0, 30, 80, 0.4))'));
    this.frame = el('div', 'frame');
    root.appendChild(this.frame);

    // HUD
    this.hud = el('div', 'hud hidden');
    const left = el('div', 'left');
    const pauseBtn = el('button', 'round', ICONS.pause);
    pauseBtn.setAttribute('aria-label', 'Pause');
    pauseBtn.onclick = () => cb.onPause();
    left.appendChild(pauseBtn);
    const mid = el('div', 'levelTag');
    this.lvEl = el('div', 'lv', 'Level 1');
    this.nameEl = el('div', 'name');
    this.tagEl = el('div', 'hard', 'Hard level');
    mid.append(this.lvEl, this.nameEl, this.tagEl);
    const right = el('div', 'right');
    this.coinsBox = el('div', 'coins', COIN_SVG);
    this.coinsNum = el('span', '', '0');
    this.coinsBox.appendChild(this.coinsNum);
    right.appendChild(this.coinsBox);
    this.hud.append(left, mid, right);
    this.frame.appendChild(this.hud);

    this.title = this.buildTitle();
    this.pauseL = this.buildPause();
    this.winL = this.buildWin();
    this.failL = this.buildFail();
    this.levelsL = this.buildLevels();
    this.finishL = this.buildFinish();
    this.toastEl = el('div', 'toast');
    this.frame.append(this.title, this.pauseL, this.winL, this.failL, this.levelsL, this.finishL, this.toastEl);

    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  private fit(): void {
    const u = Math.min(window.innerWidth / 9, window.innerHeight / 16);
    this.root.style.setProperty('--u', `${u}px`);
  }

  // ------------------------------------------------------------ builders

  private buildTitle(): HTMLElement {
    const layer = el('div', 'layer title');
    layer.appendChild(el('div', 'dim'));
    const wrap = el('div', 'logoWrap');
    const logo = el('div', 'logo');
    logo.append(el('span', 'a', 'SAND'), el('span', 'b', 'LOOP'));
    const bucket = el('div', 'bucket', BUCKET_LOGO);
    logo.appendChild(bucket);
    wrap.appendChild(logo);
    layer.appendChild(wrap);
    const actions = el('div', 'actions');
    this.playBtn = el('button', 'btn pulse', 'Play');
    this.playBtn.onclick = () => this.cb.onPlay();
    const lv = el('button', 'btn blue small', 'Levels');
    lv.onclick = () => this.cb.onLevels();
    this.subEl = el('div', 'sub', '');
    actions.append(this.playBtn, lv, this.subEl);
    layer.appendChild(actions);
    return layer;
  }

  private buildPause(): HTMLElement {
    const layer = el('div', 'layer pause');
    layer.appendChild(el('div', 'dim'));
    const card = el('div', 'card');
    const head = el('div', 'head', 'Paused');
    const x = el('button', 'x', ICONS.x);
    x.setAttribute('aria-label', 'Resume');
    x.onclick = () => this.cb.onResume();
    head.appendChild(x);
    const body = el('div', 'body');
    const tg = el('div', 'toggles');
    const mk = (key: 'sound' | 'music' | 'haptics' | 'colorAssist', label: string, icon: string) => {
      const b = el('button', 'toggle', `<span class="ico">${icon}</span><span>${label}</span>`);
      b.onclick = () => this.cb.onToggle(key);
      this.toggles.set(key, b);
      tg.appendChild(b);
    };
    mk('sound', 'Sound', ICONS.sound);
    mk('music', 'Music', ICONS.music);
    mk('haptics', 'Haptics', ICONS.vibrate);
    mk('colorAssist', 'Marks', ICONS.eye);
    const resume = el('button', 'btn', 'Resume');
    resume.onclick = () => this.cb.onResume();
    const restart = el('button', 'btn blue', 'Restart level');
    restart.onclick = () => this.cb.onRestart();
    const levels = el('button', 'btn blue', 'All levels');
    levels.onclick = () => this.cb.onLevels();
    body.append(tg, resume, restart, levels);
    card.append(head, body);
    layer.appendChild(card);
    return layer;
  }

  private buildWin(): HTMLElement {
    const layer = el('div', 'layer win');
    layer.appendChild(el('div', 'dim'));
    const rib = el('div', 'ribbon', ribbonSvg(false));
    rib.appendChild(el('div', 'txt', '<span>LEVEL</span><span>COMPLETE</span>'));
    layer.appendChild(rib);
    const reward = el('div', 'reward', STACK_SVG);
    this.rewardAmt = el('div', 'amount', 'x0');
    this.rewardBonus = el('div', 'bonus');
    reward.append(this.rewardAmt, this.rewardBonus);
    layer.appendChild(reward);
    const next = el('div', 'next');
    const nb = el('button', 'btn pulse', 'Next');
    nb.onclick = () => this.cb.onNext();
    next.appendChild(nb);
    layer.appendChild(next);
    return layer;
  }

  private buildFail(): HTMLElement {
    const layer = el('div', 'layer fail');
    layer.appendChild(el('div', 'dim'));
    const rib = el('div', 'ribbon fail', ribbonSvg(true));
    rib.appendChild(el('div', 'txt', '<span>BELT</span><span>JAMMED</span>'));
    layer.appendChild(rib);
    this.whyEl = el('div', 'why');
    layer.appendChild(this.whyEl);
    const next = el('div', 'next');
    const retry = el('button', 'btn pulse', 'Try again');
    retry.onclick = () => this.cb.onRetry();
    const lv = el('button', 'btn blue small', 'All levels');
    lv.onclick = () => this.cb.onLevels();
    next.append(retry, lv);
    layer.appendChild(next);
    return layer;
  }

  private buildLevels(): HTMLElement {
    const layer = el('div', 'layer levels');
    layer.appendChild(el('div', 'dim'));
    const card = el('div', 'card');
    const head = el('div', 'head', 'Levels');
    const x = el('button', 'x', ICONS.x);
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.cb.onTitle();
    head.appendChild(x);
    this.grid = el('div', 'grid');
    const body = el('div', 'body');
    body.appendChild(this.grid);
    card.append(head, body);
    layer.appendChild(card);
    return layer;
  }

  private buildFinish(): HTMLElement {
    const layer = el('div', 'layer finish');
    layer.appendChild(el('div', 'dim'));
    const rib = el('div', 'ribbon', ribbonSvg(false));
    rib.appendChild(el('div', 'txt', '<span>ALL</span><span>CLEARED</span>'));
    layer.appendChild(rib);
    const card = el('div', 'card');
    const body = el('div', 'body');
    this.finishP = el('p');
    const again = el('button', 'btn', 'Play again');
    again.onclick = () => this.cb.onPlay();
    const lv = el('button', 'btn blue small', 'All levels');
    lv.onclick = () => this.cb.onLevels();
    body.append(this.finishP, again, lv);
    card.appendChild(body);
    layer.appendChild(card);
    return layer;
  }

  // ------------------------------------------------------------ state

  private on(layer: HTMLElement, show: boolean): void {
    layer.classList.toggle('on', show);
  }

  showHud(show: boolean): void {
    this.hud.classList.toggle('hidden', !show);
  }

  setLevel(n: number, name: string, hard: boolean): void {
    this.lvEl.textContent = `Level ${n}`;
    this.nameEl.textContent = name;
    (this.lvEl.parentElement as HTMLElement).classList.toggle('isHard', hard);
  }

  setCoins(n: number, animate = false): void {
    cancelAnimationFrame(this.coinAnim);
    if (!animate) {
      this.shownCoins = n;
      this.coinsNum.textContent = String(n);
      return;
    }
    const from = this.shownCoins;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 700);
      const v = Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3)));
      this.shownCoins = v;
      this.coinsNum.textContent = String(v);
      if (k < 1) this.coinAnim = requestAnimationFrame(step);
    };
    this.coinAnim = requestAnimationFrame(step);
    this.coinsBox.classList.remove('bump');
    void this.coinsBox.offsetWidth;
    this.coinsBox.classList.add('bump');
  }

  /** Centre of the coin pill, in viewport pixels. */
  coinTarget(): { x: number; y: number } {
    const r = this.coinsBox.getBoundingClientRect();
    return { x: r.left + r.height * 0.4, y: r.top + r.height / 2 };
  }

  showTitle(show: boolean, level = 1, finished = false): void {
    this.on(this.title, show);
    if (show) {
      this.playBtn.textContent = level > 1 || finished ? 'Continue' : 'Play';
      this.subEl.textContent = level > 1 || finished ? `Level ${level}` : '';
    }
  }

  showPause(show: boolean, s: { sound: boolean; music: boolean; haptics: boolean; colorAssist: boolean }): void {
    this.on(this.pauseL, show);
    for (const [k, b] of this.toggles) b.classList.toggle('on', (s as Record<string, boolean>)[k]);
  }

  setToggles(s: { sound: boolean; music: boolean; haptics: boolean; colorAssist: boolean }): void {
    for (const [k, b] of this.toggles) b.classList.toggle('on', (s as Record<string, boolean>)[k]);
  }

  showWin(show: boolean, reward = 0, bonus = ''): void {
    this.on(this.winL, show);
    if (show) {
      this.rewardBonus.textContent = bonus;
      this.rewardAmt.textContent = 'x0';
      const t0 = performance.now() + 900;
      const step = (now: number) => {
        const k = Math.max(0, Math.min(1, (now - t0) / 700));
        this.rewardAmt.textContent = `x${Math.round(reward * k)}`;
        if (k < 1 && this.winL.classList.contains('on')) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }

  showFail(show: boolean, html = ''): void {
    this.on(this.failL, show);
    if (show) this.whyEl.innerHTML = html;
  }

  showFinish(show: boolean, coins = 0): void {
    this.on(this.finishL, show);
    if (show) this.finishP.textContent = `Every level is cleared. You hold ${coins} coins.`;
  }

  showLevels(show: boolean, cards: LevelCard[] = []): void {
    this.on(this.levelsL, show);
    if (!show) return;
    this.grid.innerHTML = '';
    for (const c of cards) {
      const b = el('button', `lvcard ${c.state === 'locked' ? 'locked' : ''} ${c.current ? 'current' : ''}`);
      const cv = document.createElement('canvas');
      cv.width = cv.height = 32;
      const g = cv.getContext('2d')!;
      const art = ART_SOURCES[c.art];
      for (let y = 0; y < art.h; y++) {
        for (let x = 0; x < art.w; x++) {
          g.fillStyle = SAND_COLORS[parseInt(art.rows[y][x], 36)].hex;
          g.fillRect(x, y, 1, 1);
        }
      }
      const txt = el('div', '', `<div class="n">${c.id}</div><div class="nm">${c.state === 'locked' ? 'Locked' : c.name}</div>`);
      b.append(cv, txt);
      if (c.hard && c.state !== 'locked') b.appendChild(el('span', 'tag', 'HARD'));
      if (c.state === 'done') b.appendChild(el('span', 'done', ICONS.check));
      if (c.state === 'locked') b.appendChild(el('span', 'lock', ICONS.lock));
      if (c.state !== 'locked') b.onclick = () => this.cb.onPick(c.id);
      this.grid.appendChild(b);
    }
  }

  toast(text: string, ms = 1600): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    window.setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }

  /** Coins that fly from a point to the coin pill. */
  flyCoins(from: { x: number; y: number }, n: number, onHit: (i: number) => void): void {
    const to = this.coinTarget();
    for (let i = 0; i < n; i++) {
      const c = el('div', 'flyCoin', COIN_SVG);
      (c.firstElementChild as SVGElement).style.cssText = 'width:100%;height:100%;position:static;transform:none';
      document.body.appendChild(c);
      const dx = (Math.random() - 0.5) * 120;
      const dy = (Math.random() - 0.5) * 80;
      const delay = i * 55;
      const dur = 650;
      c.style.left = `${from.x}px`;
      c.style.top = `${from.y}px`;
      const anim = c.animate(
        [
          { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
          { transform: `translate(${dx}px,${dy}px) translate(-50%,-50%) scale(1.1)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${to.x - from.x}px,${to.y - from.y}px) translate(-50%,-50%) scale(0.7)`, opacity: 1 },
        ],
        { duration: dur, delay, easing: 'cubic-bezier(0.5,0,0.7,1)', fill: 'both' },
      );
      anim.onfinish = () => {
        c.remove();
        onHit(i);
      };
    }
  }
}
