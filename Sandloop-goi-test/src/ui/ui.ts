import { BOOSTER_ICONS } from './booster-icons';
import { ART_SOURCES } from '../core/art-data';
import { BOOSTER_KEYS, type BoosterKey } from '../core/economy';
import { SAND_COLORS } from '../core/palette';

export interface UICallbacks {
  onPlay(): void;
  onLevels(): void;
  /** Pause menu: back to the main menu. */
  onHome(): void;
  onSettings(): void;
  onShop(): void;
  onShopBuy(kind: 'refill' | 'infinite' | 'ad' | BoosterKey): void;
  /** In-game booster button. */
  onBooster(key: BoosterKey): void;
  onShopClose(): void;
  onHearts(): void;
  onDaily(): void;
  onDailyClaim(): void;
  onDailyClose(): void;
  onPause(): void;
  onResume(): void;
  onRestart(): void;
  onNext(): void;
  onRetry(): void;
  onPick(level: number): void;
  onToggle(key: 'sound' | 'music' | 'haptics' | 'colorAssist'): void;
  onTitle(): void;
  onUndo(): void;
  onSpeed(): void;
  /** All-cleared screen: start over from level 1. */
  onPlayAll(): void;
}

export interface BoosterItem {
  key: BoosterKey;
  name: string;
  desc: string;
  owned: number;
  price: number;
  /** Level that unlocks it; 0 when it is already usable. */
  lockedAt: number;
  /** Waiting for the player to tap a target. */
  active: boolean;
}

export interface ShopModel {
  boosters: BoosterItem[];
  /** Open on the boosters tab. */
  tab?: 'hearts' | 'boosters';
  title: string;
  heartsLine: string;
  nextLine: string;
  coins: number;
  refillSub: string;
  refillPrice: number;
  refillOk: boolean;
  infiniteSub: string;
  infinitePrice: number;
  infiniteOk: boolean;
  adSub: string;
  adOk: boolean;
}

export interface DailyModel {
  /** Reward markup of each of the 7 days. */
  days: string[];
  next: number;
  ready: boolean;
  note: string;
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
  gear: '<svg viewBox="0 0 24 24"><path d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6zm9 5.3v-3l-2.4-.5a6.9 6.9 0 0 0-.8-1.9l1.4-2-2.1-2.1-2 1.4a6.9 6.9 0 0 0-1.9-.8L13 2.5h-3l-.5 2.4a6.9 6.9 0 0 0-1.9.8l-2-1.4-2.1 2.1 1.4 2a6.9 6.9 0 0 0-.8 1.9L3 10.5v3l2.4.5c.2.7.5 1.3.8 1.9l-1.4 2 2.1 2.1 2-1.4c.6.4 1.2.6 1.9.8l.5 2.4h3l.5-2.4c.7-.2 1.3-.5 1.9-.8l2 1.4 2.1-2.1-1.4-2c.4-.6.6-1.2.8-1.9z"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M12 3.2 2.6 11.4l1.3 1.5L5 12v8h5v-5h4v5h5v-8l1.1.9 1.3-1.5z"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><path d="M2 3h3l.6 2H21l-2.2 8H8.2l.4 1.6H19V16H7.2L4 5H2z"/><circle cx="9" cy="19.2" r="1.8"/><circle cx="17" cy="19.2" r="1.8"/></svg>',
  gift: '<svg viewBox="0 0 24 24"><path d="M3 9h18v4H3zM4.5 14h15v7h-15z"/><path d="M12 9v12" stroke="#fff" stroke-width="2" fill="none"/><path d="M12 9C9 9 6.5 8 6.5 6S9 3.5 12 9zM12 9c3 0 5.5-1 5.5-3S15 3.5 12 9z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#47c92a" stroke="#fff" stroke-width="2"/><path d="M6.5 12.5l3.8 3.8 7.2-7.6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export const COIN_SVG = `<svg class="coinIcon" viewBox="0 0 64 64"><defs>
<radialGradient id="cg" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#fff2a0"/><stop offset="0.45" stop-color="#ffc928"/><stop offset="1" stop-color="#e58a05"/></radialGradient></defs>
<circle cx="32" cy="32" r="29" fill="#c46a00"/><circle cx="32" cy="31" r="27" fill="url(#cg)" stroke="#fff3b8" stroke-width="2"/>
<circle cx="32" cy="31" r="19" fill="none" stroke="#d98a0a" stroke-width="2.4"/>
<path d="M32 15.5l4.2 8.9 9.7 1.2-7.1 6.7 1.8 9.6L32 37l-8.6 4.9 1.8-9.6-7.1-6.7 9.7-1.2z" fill="#fff5c4" stroke="#b86e00" stroke-width="2.2" stroke-linejoin="round"/>
<path d="M14 22a20 20 0 0 1 12-9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity="0.8"/></svg>`;

export const HEART_SVG = `<svg class="heartIcon" viewBox="0 0 64 64"><defs>
<radialGradient id="hg" cx="35%" cy="28%" r="85%"><stop offset="0" stop-color="#ff9a8a"/><stop offset="0.5" stop-color="#f0343a"/><stop offset="1" stop-color="#b8101f"/></radialGradient></defs>
<path d="M32 58C10 42 4 30 4 20 4 11 11 5 19 5c6 0 10 3 13 8 3-5 7-8 13-8 8 0 15 6 15 15 0 10-6 22-28 38z" fill="#8f0f1c"/>
<path d="M32 55C12 40 7 29 7 20 7 12.5 13 8 19 8c6 0 10 3 13 9 3-6 7-9 13-9 6 0 12 4.5 12 12 0 9-5 20-25 35z" fill="url(#hg)" stroke="#ffd1c9" stroke-width="1.6"/>
<path d="M14 18a8 8 0 0 1 7-6" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" opacity="0.85"/></svg>`;

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
  private menu: HTMLElement;
  private settingsL: HTMLElement;
  private mapEl!: HTMLElement;
  readonly boostBar: HTMLElement;
  private boostBtns = new Map<BoosterKey, HTMLButtonElement>();
  private shopTab: 'hearts' | 'boosters' = 'hearts';
  private shopModelNow: ShopModel | null = null;
  private confirmNo: (() => void) | null = null;
  private heartPill!: HTMLElement;
  private heartNum!: HTMLElement;
  private heartTime!: HTMLElement;
  private shopL: HTMLElement;
  private shopHead!: HTMLElement;
  private shopBody!: HTMLElement;
  private dailyL: HTMLElement;
  private dailyGrid!: HTMLElement;
  private dailyBtn!: HTMLButtonElement;
  private dailyNote!: HTMLElement;
  private adL: HTMLElement;
  private adText!: HTMLElement;
  private coinNums: HTMLElement[] = [];
  private giftDot!: HTMLElement;
  private pauseL: HTMLElement;
  private winL: HTMLElement;
  private failL: HTMLElement;
  private levelsL: HTMLElement;
  private finishL: HTMLElement;
  private toastEl: HTMLElement;
  private toastTimer = 0;
  private toggles = new Map<string, HTMLElement[]>();
  private rewardAmt!: HTMLElement;
  private rewardBonus!: HTMLElement;
  private whyEl!: HTMLElement;
  private grid!: HTMLElement;
  private finishP!: HTMLElement;
  private pauseBtn!: HTMLButtonElement;
  private speedBtn!: HTMLButtonElement;
  private pauseOk = true;
  private confirmL!: HTMLElement;
  private confirmTitle!: HTMLElement;
  private confirmText!: HTMLElement;
  private confirmYes!: HTMLButtonElement;
  private confirmAction: (() => void) | null = null;
  private confirmKeep!: HTMLButtonElement;
  private undoBtns: HTMLButtonElement[] = [];
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
    this.pauseBtn = pauseBtn;
    this.speedBtn = el('button', 'round speed belt-speed', 'x1');
    this.speedBtn.hidden = true;
    this.speedBtn.setAttribute('aria-label', 'Game speed');
    this.speedBtn.setAttribute('aria-pressed', 'false');
    this.speedBtn.onclick = () => cb.onSpeed();
    left.append(pauseBtn);
    root.appendChild(this.speedBtn);
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
    // Anchor the dock to the viewport so its measured top can guide the camera.
    this.boostBar = this.buildBoostBar();
    root.appendChild(this.boostBar);

    this.menu = this.buildMenu();
    this.settingsL = this.buildSettings();
    this.shopL = this.buildShop();
    this.dailyL = this.buildDaily();
    this.adL = this.buildAd();
    this.pauseL = this.buildPause();
    this.winL = this.buildWin();
    this.failL = this.buildFail();
    this.levelsL = this.buildLevels();
    this.finishL = this.buildFinish();
    this.confirmL = this.buildConfirm();
    this.toastEl = el('div', 'toast');
    this.frame.append(this.menu, this.pauseL, this.settingsL, this.winL, this.failL, this.levelsL, this.finishL, this.shopL, this.dailyL, this.confirmL, this.adL, this.toastEl);

    this.fit();
    window.addEventListener('resize', () => this.fit());
  }

  private fit(): void {
    const u = Math.min(window.innerWidth / 9, window.innerHeight / 16);
    this.root.style.setProperty('--u', `${u}px`);
  }

  // ------------------------------------------------------------ builders

  /** The main menu: top bar (hearts, coins, settings), the level path, Play, and the bottom tabs. */
  private buildMenu(): HTMLElement {
    const layer = el('div', 'layer menu');
    layer.appendChild(el('div', 'menuBg'));

    const top = el('div', 'menuTop');
    const avatar = el('div', 'avatar', BUCKET_LOGO);
    const heart = el('button', 'pill heartPill', `${HEART_SVG}<span class="num">5</span><span class="tm">Full</span><i class="plusBadge">${ICONS.plus}</i>`);
    heart.setAttribute('aria-label', 'Hearts');
    heart.onclick = () => this.cb.onHearts();
    this.heartPill = heart;
    this.heartNum = heart.querySelector('.num') as HTMLElement;
    this.heartTime = heart.querySelector('.tm') as HTMLElement;
    const coin = el('button', 'pill coinPill', `${COIN_SVG}<span class="num">0</span><i class="plusBadge">${ICONS.plus}</i>`);
    coin.setAttribute('aria-label', 'Coins: open the shop');
    coin.onclick = () => this.cb.onShop();
    this.coinNums.push(coin.querySelector('.num') as HTMLElement);
    const gear = el('button', 'round gear', ICONS.gear);
    gear.setAttribute('aria-label', 'Settings');
    gear.onclick = () => this.cb.onSettings();
    top.append(avatar, heart, coin, gear);

    const gift = el('button', 'giftBtn', `<span class="box">${ICONS.gift}</span><span class="rib">Daily gift</span>`);
    this.giftDot = el('i', 'dot');
    gift.appendChild(this.giftDot);
    gift.onclick = () => this.cb.onDaily();

    this.mapEl = el('div', 'map');
    const mapWrap = el('div', 'mapWrap');
    mapWrap.appendChild(this.mapEl);

    const play = el('button', 'btn playBig pulse', 'PLAY');
    play.onclick = () => this.cb.onPlay();

    const nav = el('div', 'nav');
    const tab = (cls: string, icon: string, label: string, fn: () => void) => {
      const t = el('button', `tab ${cls}`, `<span class="ico">${icon}</span>`);
      t.setAttribute('aria-label', label);
      t.onclick = fn;
      return t;
    };
    nav.append(
      tab('shop', ICONS.cart, 'Shop', () => this.cb.onShop()),
      tab('home on', ICONS.home, 'Home', () => undefined),
      tab('locked', ICONS.lock, 'Coming soon', () => this.toast('Coming soon', 1400)),
    );
    layer.append(top, gift, mapWrap, play, nav);
    return layer;
  }

  /** Settings from the main menu (the same four switches as the pause menu). */
  private buildSettings(): HTMLElement {
    const layer = el('div', 'layer settings');
    layer.appendChild(el('div', 'dim'));
    const card = el('div', 'card');
    const head = el('div', 'head', 'Settings');
    const x = el('button', 'x', ICONS.x);
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.cb.onSettings();
    head.appendChild(x);
    const body = el('div', 'body');
    body.appendChild(this.makeToggles());
    card.append(head, body);
    layer.appendChild(card);
    return layer;
  }

  /** Sound / Music / Haptics / Marks switches. Every set is kept in sync by setToggles. */
  private makeToggles(): HTMLElement {
    const tg = el('div', 'toggles');
    const mk = (key: 'sound' | 'music' | 'haptics' | 'colorAssist', label: string, icon: string) => {
      // The state is also spelled out (On / Off) and exposed through aria-pressed, so it does not rest on colour alone.
      const b = el('button', 'toggle', `<span class="ico">${icon}</span><span>${label}</span><span class="st">On</span>`);
      b.setAttribute('aria-pressed', 'true');
      b.onclick = () => this.cb.onToggle(key);
      const list = this.toggles.get(key) ?? [];
      list.push(b);
      this.toggles.set(key, list);
      tg.appendChild(b);
    };
    mk('sound', 'Sound', ICONS.sound);
    mk('music', 'Music', ICONS.music);
    mk('haptics', 'Haptics', ICONS.vibrate);
    mk('colorAssist', 'Marks', ICONS.eye);
    return tg;
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
    const tg = this.makeToggles();
    const resume = el('button', 'btn', 'Resume');
    resume.onclick = () => this.cb.onResume();
    const undo = this.makeUndo('btn blue');
    const restart = el('button', 'btn blue', 'Restart level');
    restart.onclick = () => this.cb.onRestart();
    const levels = el('button', 'btn blue', 'All levels');
    levels.onclick = () => this.cb.onLevels();
    const home = el('button', 'btn blue', 'Home');
    home.onclick = () => this.cb.onHome();
    body.append(tg, resume, undo, restart, levels, home);
    card.append(head, body);
    layer.appendChild(card);
    return layer;
  }

  private buildWin(): HTMLElement {
    const layer = el('div', 'layer win');
    layer.appendChild(el('div', 'dim'));
    const rib = el('div', 'ribbon', ribbonSvg(false));
    rib.appendChild(el('div', 'txt', 'YOU WIN'));
    layer.appendChild(rib);
    const reward = el('div', 'reward', STACK_SVG);
    this.rewardAmt = el('div', 'amount', 'x0');
    this.rewardBonus = el('div', 'bonus');
    reward.append(this.rewardAmt, this.rewardBonus);
    layer.appendChild(reward);
    const next = el('div', 'next');
    const nb = el('button', 'btn pulse', 'Next');
    nb.onclick = () => this.cb.onNext();
    const row = el('div', 'row');
    const again = el('button', 'btn blue small', 'Replay');
    again.onclick = () => this.cb.onRetry();
    const lv = el('button', 'btn blue small', 'All levels');
    lv.onclick = () => this.cb.onLevels();
    const home = el('button', 'btn blue small', 'Home');
    home.onclick = () => this.cb.onHome();
    row.append(again, lv, home);
    next.append(nb, row);
    layer.appendChild(next);
    return layer;
  }

  /** "Undo last move (n left)" button; every undo button is kept in sync by setUndo. */
  private makeUndo(cls: string): HTMLButtonElement {
    const b = el('button', cls, 'Undo move');
    b.onclick = () => this.cb.onUndo();
    this.undoBtns.push(b);
    return b;
  }

  private buildConfirm(): HTMLElement {
    const layer = el('div', 'layer confirm');
    layer.appendChild(el('div', 'dim'));
    const card = el('div', 'card');
    this.confirmTitle = el('div', 'head', '');
    const body = el('div', 'body');
    this.confirmText = el('p');
    this.confirmYes = el('button', 'btn blue', 'Leave');
    this.confirmYes.onclick = () => {
      const f = this.confirmAction;
      this.hideConfirm();
      f?.();
    };
    const keep = el('button', 'btn', 'Keep playing');
    this.confirmKeep = keep;
    keep.onclick = () => {
      const no = this.confirmNo;
      this.hideConfirm();
      no?.();
    };
    body.append(this.confirmText, keep, this.confirmYes);
    card.append(this.confirmTitle, body);
    layer.appendChild(card);
    return layer;
  }

  /** Ask before throwing away a level in progress. */
  confirm(title: string, text: string, yesLabel: string, onYes: () => void, onNo: (() => void) | null = null, noLabel = 'Keep playing'): void {
    this.confirmNo = onNo;
    this.confirmKeep.textContent = noLabel;
    this.confirmTitle.textContent = title;
    this.confirmText.textContent = text;
    this.confirmYes.textContent = yesLabel;
    this.confirmAction = onYes;
    this.on(this.confirmL, true);
  }

  hideConfirm(): void {
    this.confirmAction = null;
    this.confirmNo = null;
    this.on(this.confirmL, false);
  }

  /** Dim the pause button when pausing is not possible (result screens, finished game). */
  setPauseEnabled(ok: boolean): void {
    if (ok === this.pauseOk) return;
    this.pauseOk = ok;
    this.pauseBtn.disabled = !ok;
    this.pauseBtn.classList.toggle('off', !ok);
  }

  /** Show the current game speed (1 or 2) on the HUD button. */
  setSpeed(x: number, final = false): void {
    this.speedBtn.textContent = `x${x}`;
    this.speedBtn.classList.toggle('on', x > 1);
    this.speedBtn.classList.toggle('final', final);
    this.speedBtn.setAttribute('aria-pressed', String(x > 1));
  }

  /** Centre of the reward amount on the win screen, in viewport pixels (where the flying coins start). */
  rewardPoint(): { x: number; y: number } {
    const r = this.rewardAmt.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** `left` undo steps remain; 0 hides nothing but disables the buttons. */
  setUndo(left: number): void {
    for (const b of this.undoBtns) {
      b.disabled = left <= 0;
      b.classList.toggle('off', left <= 0);
      b.textContent = left > 0 ? `Undo move (${left})` : 'Undo move';
    }
  }

  private buildFail(): HTMLElement {
    const layer = el('div', 'layer fail');
    layer.appendChild(el('div', 'dim'));
    // Everything sits over the picture at the top, so the belt and the board stay visible to show why it jammed.
    const top = el('div', 'failTop');
    const rib = el('div', 'ribbon fail', ribbonSvg(true));
    rib.appendChild(el('div', 'txt', '<span>BELT</span><span>JAMMED</span>'));
    this.whyEl = el('div', 'why');
    const next = el('div', 'next');
    const retry = el('button', 'btn pulse', 'Try again');
    retry.onclick = () => this.cb.onRetry();
    const row = el('div', 'row');
    const undo = this.makeUndo('btn blue small');
    const lv = el('button', 'btn blue small', 'All levels');
    lv.onclick = () => this.cb.onLevels();
    const home = el('button', 'btn blue small', 'Home');
    home.onclick = () => this.cb.onHome();
    row.append(undo, lv, home);
    next.append(retry, row);
    top.append(rib, this.whyEl, next);
    layer.appendChild(top);
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
    const again = el('button', 'btn', 'Play from level 1');
    again.onclick = () => this.cb.onPlayAll();
    const lv = el('button', 'btn blue small', 'All levels');
    lv.onclick = () => this.cb.onLevels();
    body.append(this.finishP, again, lv);
    card.appendChild(body);
    layer.appendChild(card);
    return layer;
  }

  // ------------------------------------------------------------ boosters

  private buildBoostBar(): HTMLElement {
    const bar = el('div', 'boostBar hidden');
    for (const k of BOOSTER_KEYS) {
      const b = el('button', 'boost', `<span class="bi">${BOOSTER_ICONS[k]}</span><span class="bc"></span>`);
      b.onclick = () => this.cb.onBooster(k);
      this.boostBtns.set(k, b);
      bar.appendChild(b);
    }
    return bar;
  }

  /** Redraw the three booster buttons: count when owned, price when not, level when locked. */
  setBoosters(items: BoosterItem[]): void {
    for (const it of items) {
      const b = this.boostBtns.get(it.key)!;
      const c = b.querySelector('.bc') as HTMLElement;
      b.classList.toggle('locked', it.lockedAt > 0);
      b.classList.toggle('empty', it.lockedAt === 0 && it.owned === 0);
      b.classList.toggle('active', it.active);
      b.setAttribute('aria-pressed', String(it.active));
      b.setAttribute('aria-label', `${it.name}: ${it.lockedAt ? `unlocks at level ${it.lockedAt}` : it.owned ? `${it.owned} left` : `buy for ${it.price} coins`}`);
      c.innerHTML = it.lockedAt ? `Lv ${it.lockedAt}` : it.owned ? String(it.owned) : `${COIN_SVG}${it.price}`;
    }
  }

  showBoosters(show: boolean): void {
    this.boostBar.classList.toggle('hidden', !show);
  }

  // ------------------------------------------------------------ shop, daily gift, ad placeholder

  private buildShop(): HTMLElement {
    const layer = el('div', 'layer shop');
    layer.appendChild(el('div', 'dim'));
    const card = el('div', 'card');
    this.shopHead = el('div', 'head', 'Shop');
    const x = el('button', 'x', ICONS.x);
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.cb.onShopClose();
    this.shopHead.appendChild(x);
    this.shopBody = el('div', 'body');
    card.append(this.shopHead, this.shopBody);
    layer.appendChild(card);
    return layer;
  }

  /** Draw (or redraw) the shop: two tabs, hearts and boosters. */
  showShop(show: boolean, m?: ShopModel): void {
    this.on(this.shopL, show);
    if (!show || !m) return;
    if (m.tab) this.shopTab = m.tab;
    this.shopModelNow = m;
    this.shopHead.firstChild!.textContent = m.title;
    const b = this.shopBody;
    b.innerHTML = '';
    const tabs = el('div', 'tabs');
    for (const [id, label] of [['hearts', 'Hearts'], ['boosters', 'Boosters']] as const) {
      const t = el('button', `t ${this.shopTab === id ? 'on' : ''}`, label);
      t.onclick = () => {
        this.shopTab = id;
        this.showShop(true, this.shopModelNow ?? m);
      };
      tabs.appendChild(t);
    }
    b.appendChild(tabs);
    const row = (icon: string, title: string, sub: string, price: string, enabled: boolean, kind: 'refill' | 'infinite' | 'ad' | BoosterKey, free = false) => {
      const r = el('div', 'item');
      r.appendChild(el('div', 'ico', icon));
      r.appendChild(el('div', 'txt', `<b>${title}</b><span>${sub}</span>`));
      const btn = el('button', `btn small ${free ? '' : 'blue'}`, free ? price : `${COIN_SVG}${price}`);
      btn.disabled = !enabled;
      btn.classList.toggle('off', !enabled);
      btn.onclick = () => this.cb.onShopBuy(kind);
      r.appendChild(btn);
      b.appendChild(r);
    };
    if (this.shopTab === 'hearts') {
      b.appendChild(el('div', 'status', `${HEART_SVG}<div><b>${m.heartsLine}</b><span>${m.nextLine}</span></div>`));
      row(HEART_SVG, 'Refill hearts', m.refillSub, m.refillOk ? String(m.refillPrice) : 'Full', m.refillOk, 'refill', !m.refillOk);
      row(`<span class="inf">&infin;</span>`, `Infinite hearts`, m.infiniteSub, String(m.infinitePrice), m.infiniteOk, 'infinite');
      row(`<span class="ad">AD</span>`, 'Free heart', m.adSub, 'Watch', m.adOk, 'ad', true);
    } else {
      for (const it of m.boosters) {
        const sub = it.lockedAt ? `Unlocks at level ${it.lockedAt}` : `${it.desc} (you have ${it.owned})`;
        row(`<span class="bico">${BOOSTER_ICONS[it.key]}</span>`, it.name, sub, String(it.price), it.lockedAt === 0, it.key);
      }
    }
    b.appendChild(el('div', 'wallet', `You have ${COIN_SVG}<b>${m.coins}</b>`));
  }

  private buildDaily(): HTMLElement {
    const layer = el('div', 'layer daily');
    layer.appendChild(el('div', 'dim'));
    const card = el('div', 'card');
    const head = el('div', 'head', 'Daily gift');
    const x = el('button', 'x', ICONS.x);
    x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.cb.onDailyClose();
    head.appendChild(x);
    this.dailyGrid = el('div', 'dgrid');
    this.dailyBtn = el('button', 'btn', 'Claim');
    this.dailyBtn.onclick = () => this.cb.onDailyClaim();
    this.dailyNote = el('div', 'note');
    const body = el('div', 'body');
    body.append(this.dailyGrid, this.dailyBtn, this.dailyNote);
    card.append(head, body);
    layer.appendChild(card);
    return layer;
  }

  showDaily(show: boolean, m?: DailyModel): void {
    this.on(this.dailyL, show);
    if (!show || !m) return;
    this.dailyGrid.innerHTML = '';
    m.days.forEach((d, i) => {
      const t = el('div', `day ${i === m.next ? 'now' : ''} ${i < m.next ? 'past' : ''}`, `<i>Day ${i + 1}</i><div class="gifts">${d}</div>`);
      this.dailyGrid.appendChild(t);
    });
    this.dailyBtn.disabled = !m.ready;
    this.dailyBtn.classList.toggle('off', !m.ready);
    this.dailyBtn.textContent = m.ready ? 'Claim' : 'Come back tomorrow';
    this.dailyNote.textContent = m.note;
  }

  setGiftReady(ready: boolean): void {
    this.giftDot.classList.toggle('on', ready);
  }

  private buildAd(): HTMLElement {
    const layer = el('div', 'layer ad');
    layer.appendChild(el('div', 'dim'));
    const card = el('div', 'card');
    this.adText = el('div', 'adText', 'Ad');
    card.append(el('div', 'head', 'Ad (demo)'), this.adText);
    layer.appendChild(card);
    return layer;
  }

  showAd(show: boolean, text = ''): void {
    this.on(this.adL, show);
    if (show) this.adText.textContent = text;
  }

  // ------------------------------------------------------------ main menu content

  /** Hearts pill: `count` hearts, and below it a clock to the next heart, "Full", or the infinite time left. */
  setHearts(count: number, text: string, infinite: boolean): void {
    this.heartNum.textContent = infinite ? '∞' : String(count);
    this.heartTime.textContent = text;
    this.heartPill.classList.toggle('infinite', infinite);
    this.heartPill.classList.toggle('empty', !infinite && count <= 0);
  }

  /** The level path: the highest level on top, every level a node, locks on the links into locked levels. */
  setMap(cards: LevelCard[]): void {
    const map = this.mapEl;
    map.innerHTML = '';
    map.appendChild(el('div', 'pad'));
    const list = [...cards].reverse();
    let cur: HTMLElement | null = null;
    list.forEach((c, i) => {
      const node = el('button', `node ${c.state} ${c.current ? 'current' : ''} ${c.hard ? 'hard' : ''}`, `<span class="num">${c.id}</span>`);
      node.setAttribute('aria-label', c.state === 'locked' ? `Level ${c.id}, locked` : `Level ${c.id}, ${c.name}`);
      if (c.state === 'done') node.appendChild(el('span', 'tick', ICONS.check));
      if (c.hard && c.state !== 'locked') node.appendChild(el('span', 'hardTag', 'HARD'));
      if (c.current) {
        cur = node;
        const bubble = el('div', 'bubble');
        bubble.appendChild(this.artCanvas(c.art));
        node.appendChild(bubble);
      }
      if (c.state === 'locked') {
        node.onclick = () => {
          this.toast(`Clear level ${c.id - 1} first to unlock level ${c.id}`, 1800);
          node.classList.remove('nope');
          void node.offsetWidth;
          node.classList.add('nope');
        };
      } else node.onclick = () => this.cb.onPick(c.id);
      map.appendChild(node);
      if (i < list.length - 1) {
        // The link into the first locked level is blue (it is the one to open next); the ones above it are brown.
        const link = el('div', `link ${c.state !== 'locked' ? 'open' : list[i + 1].state !== 'locked' ? 'next' : 'locked'}`);
        if (c.state === 'locked') link.appendChild(el('span', 'padlock', ICONS.lock));
        map.appendChild(link);
      }
    });
    map.appendChild(el('div', 'pad small'));
    const target = cur as HTMLElement | null;
    // Put the current level near the bottom of the path, with the locked levels above it.
    requestAnimationFrame(() => {
      if (target) map.scrollTop = target.offsetTop - map.clientHeight * 0.58 + target.offsetHeight / 2;
    });
  }

  private artCanvas(art: number): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const g = cv.getContext('2d')!;
    const a = ART_SOURCES[art];
    for (let y = 0; y < a.h; y++) {
      for (let x = 0; x < a.w; x++) {
        g.fillStyle = SAND_COLORS[parseInt(a.rows[y][x], 36)].hex;
        g.fillRect(x, y, 1, 1);
      }
    }
    return cv;
  }

  // ------------------------------------------------------------ state

  private on(layer: HTMLElement, show: boolean): void {
    layer.classList.toggle('on', show);
    if (show) this.hideToast(); // a hint must not sit on top of a menu or result screen
  }

  hideToast(): void {
    window.clearTimeout(this.toastTimer);
    this.toastEl.classList.remove('on');
  }

  showHud(show: boolean): void {
    this.hud.classList.toggle('hidden', !show);
  }

  placeSpeedButton(x: number, y: number, visible: boolean): void {
    this.speedBtn.hidden = !visible;
    if (!visible) return;
    this.speedBtn.style.left = `${x}px`;
    this.speedBtn.style.top = `${y}px`;
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
      this.writeCoins(n);
      return;
    }
    const from = this.shownCoins;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 700);
      const v = Math.round(from + (n - from) * (1 - Math.pow(1 - k, 3)));
      this.shownCoins = v;
      this.writeCoins(v);
      if (k < 1) this.coinAnim = requestAnimationFrame(step);
    };
    this.coinAnim = requestAnimationFrame(step);
    this.coinsBox.classList.remove('bump');
    void this.coinsBox.offsetWidth;
    this.coinsBox.classList.add('bump');
  }

  private writeCoins(n: number): void {
    this.coinsNum.textContent = String(n);
    for (const e of this.coinNums) e.textContent = String(n);
  }

  /** Centre of the coin pill, in viewport pixels. */
  coinTarget(): { x: number; y: number } {
    const r = this.coinsBox.getBoundingClientRect();
    return { x: r.left + r.height * 0.4, y: r.top + r.height / 2 };
  }

  showMenu(show: boolean): void {
    this.on(this.menu, show);
  }

  showSettings(show: boolean, s: { sound: boolean; music: boolean; haptics: boolean; colorAssist: boolean }): void {
    this.on(this.settingsL, show);
    this.setToggles(s);
  }

  showPause(show: boolean, s: { sound: boolean; music: boolean; haptics: boolean; colorAssist: boolean }): void {
    this.on(this.pauseL, show);
    this.setToggles(s);
  }

  setToggles(s: { sound: boolean; music: boolean; haptics: boolean; colorAssist: boolean }): void {
    for (const [k, list] of this.toggles) {
      const on = (s as Record<string, boolean>)[k];
      for (const b of list) {
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
        (b.querySelector('.st') as HTMLElement).textContent = on ? 'On' : 'Off';
        if (k === 'sound') (b.querySelector('.ico') as HTMLElement).innerHTML = on ? ICONS.sound : ICONS.soundOff;
      }
    }
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
      else {
        b.setAttribute('aria-disabled', 'true');
        b.onclick = () => {
          this.toast(`Clear level ${c.id - 1} first to unlock level ${c.id}`, 1800);
          b.classList.remove('nope');
          void b.offsetWidth;
          b.classList.add('nope');
        };
      }
      this.grid.appendChild(b);
    }
  }

  toast(text: string, ms = 1600, wide = false): void {
    window.clearTimeout(this.toastTimer);
    this.toastEl.textContent = text;
    this.toastEl.classList.toggle('wide', wide);
    this.toastEl.classList.add('on');
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('on'), ms);
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
