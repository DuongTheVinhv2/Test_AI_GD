import * as THREE from 'three';
import { AudioEngine } from '../audio/audio';
import { Game } from '../core/game';
import { FINAL_STRETCH } from '../core/config';
import { AD_HEARTS, AD_SECONDS, BOOSTER_KEYS, BOOSTERS, DAILY_GIFTS, HEART_MAX, HEART_PRICE, INFINITE_MINUTES, INFINITE_PRICE, rewardFor, type BoosterKey, type GiftReward, type Reward } from '../core/economy';
import { LEVELS } from '../core/levels';
import { createMaterials } from '../render/materials';
import { PlayScene, type SceneEvent } from '../render/scene';
import { Stage } from '../render/stage';
import { glyphAtlas } from '../render/textures';
import { CheatPanel } from '../ui/cheat';
import { COIN_SVG, HEART_SVG, UI, type BoosterItem, type DailyModel, type LevelCard, type ShopModel } from '../ui/ui';
import { formatClock, Hearts } from './hearts';
import { Save } from './save';

const MAX_UNDOS = 3;

type Mode = 'menu' | 'playing' | 'paused' | 'won' | 'lost' | 'levels' | 'finished';

export class App {
  readonly stage: Stage;
  readonly play: PlayScene;
  readonly ui: UI;
  readonly audio = new AudioEngine();
  readonly save = new Save();
  readonly cheat: CheatPanel;
  hearts = new Hearts(this.save.data.hearts);
  mode: Mode = 'menu';
  private level = 1;
  private returnTo: Mode = 'menu';
  /** The shop / hearts window is open over the current screen. */
  private shopOpen = false;
  private shopTitle = 'Shop';
  private dailyOpen = false;
  private settingsOpen = false;
  private adTimer = 0;
  /** The level was lost and its heart has not been spent yet (spent when the player leaves the fail screen without Undo). */
  private unpaidLoss = false;
  private metaClock = 0;
  private resultTimer = 0;
  private pendingResult: 'win' | 'lose' | null = null;
  /** reward already saved for the win that is waiting to be shown */
  private winReward: Reward | null = null;
  /** reward of the win whose result screen is (or was last) shown, so the screen can come back after "All levels" */
  private lastReward: Reward = { base: 0, bonus: 0, total: 0, label: '' };
  /** game states from just before each of the last taps, newest last (for Undo) */
  private snapshots: Game[] = [];
  private undosLeft = MAX_UNDOS;
  private usedUndo = false;
  /** A booster waits for the player to tap its target (the game is frozen meanwhile). */
  private boostTarget: 'handPick' | 'sandPull' | null = null;
  /** The buy-a-booster question is open over the level (frozen too). */
  private boostAsking = false;
  /** 1, or 2 while fast-forward is on */
  private speed = 1;
  /** speed last shown on the HUD button */
  private shownSpeed = 1;
  private attemptStart = 0;
  private lastTap = 0;
  private wonLevel = 0;

  constructor() {
    const canvas = document.getElementById('stage') as HTMLCanvasElement;
    this.stage = new Stage(canvas);
    const mats = createMaterials();
    const atlas = glyphAtlas();

    this.stage.scene.add(new THREE.HemisphereLight('#e6f4ff', '#8aa0d0', 0.55));
    const key = new THREE.DirectionalLight('#fff6e8', 1.35);
    key.position.set(-8, 14, 18);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 16, bottom: -16, near: 1, far: 70 });
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 3;
    this.stage.scene.add(key);
    const fill = new THREE.DirectionalLight('#cfe4ff', 0.3);
    fill.position.set(10, 4, 10);
    this.stage.scene.add(fill);

    this.play = new PlayScene(this.stage, mats, atlas);
    this.stage.scene.add(this.play.group);
    this.play.onEvent = (e) => this.onScene(e);

    this.ui = new UI(document.getElementById('ui')!, {
      onPlay: () => this.startFromMenu(),
      onLevels: () => this.openLevels(),
      onHome: () => this.confirmLeave('Go home?', this.leaveText(), 'Home', () => this.goMenu()),
      onSettings: () => this.toggleSettings(),
      onShop: () => this.openShop('Shop'),
      onShopBuy: (k) => this.shopBuy(k),
      onBooster: (k) => this.useBooster(k),
      onShopClose: () => this.closeShop(),
      onHearts: () => this.openShop(this.hearts.full() ? 'Hearts' : 'Get hearts'),
      onDaily: () => this.openDaily(),
      onDailyClaim: () => this.claimDaily(),
      onDailyClose: () => this.closeDaily(),
      onPause: () => this.setPaused(true),
      onResume: () => this.setPaused(false),
      onRestart: () => this.confirmLeave('Restart level?', this.leaveText(), 'Restart', () => this.startLevel(this.level)),
      onNext: () => this.next(),
      onRetry: () => this.startLevel(this.level),
      onPick: (n) => this.pick(n),
      onToggle: (k) => this.toggle(k),
      onTitle: () => this.closeLevels(),
      onUndo: () => this.undo(),
      onSpeed: () => this.toggleSpeed(),
      onPlayAll: () => this.startLevel(1),
    });
    this.stage.setBoosterDock(this.ui.boostBar);

    const s = this.save.data.settings;
    this.audio.sound = s.sound;
    this.audio.music = s.music;
    this.audio.haptics = s.haptics;
    this.play.colorAssist = s.colorAssist;
    this.level = Math.min(this.save.data.current, LEVELS.length);

    canvas.addEventListener('pointerdown', (e) => this.onPointer(e));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.boostTarget) this.cancelBoost();
        else if (this.mode === 'playing') this.setPaused(true);
        else if (this.mode === 'paused') this.setPaused(false);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.mode === 'playing') this.setPaused(true);
      this.audio.setHidden(document.hidden);
    });

    this.cheat = new CheatPanel({
      state: () => ({
        level: this.level,
        unlocked: this.save.data.unlocked,
        coins: this.save.data.coins,
        maxLevel: LEVELS.length,
        hearts: this.hearts.infinite() ? '∞' : `${this.hearts.count()}/${HEART_MAX}`,
      }),
      setHearts: (n) => {
        const h = this.save.data.hearts;
        h.count = Math.max(0, Math.min(HEART_MAX, n));
        h.since = Date.now();
        h.infiniteUntil = 0;
        this.refreshMeta(true);
      },
      addInfinite: (m) => {
        this.hearts.addInfinite(m);
        this.refreshMeta(true);
      },
      addBoosters: (n) => {
        for (const k of BOOSTER_KEYS) this.save.data.boosters[k] += n;
        this.refreshMeta(true);
      },
      resetDaily: () => {
        this.save.data.daily.last = '';
        this.refreshMeta(true);
      },
      goLevel: (n) => {
        this.save.data.unlocked = Math.max(this.save.data.unlocked, n);
        this.save.commit();
        this.startLevel(n, true);
      },
      unlockAll: () => {
        this.save.data.unlocked = LEVELS.length;
        this.save.commit();
      },
      setCoins: (n) => {
        this.save.data.coins = n;
        this.save.commit();
        this.ui.setCoins(n);
      },
      resetSave: () => this.resetAll(),
      opened: () => this.setPaused(true),
    });

    if (this.save.data.pending > 0) this.recordQuit(this.save.data.pending);
    this.ui.setCoins(this.save.data.coins);
    this.hearts.sync();
    this.goMenu();
  }

  /** Count a level that was started but never finished as an attempt (reload, closed tab, or restart). */
  private recordQuit(level: number, g?: Game): void {
    this.save.data.pending = 0;
    this.save.addAttempt({
      level,
      result: 'quit',
      time: g ? +g.time.toFixed(1) : 0,
      taps: g?.stats.taps ?? 0,
      rejects: g?.stats.rejects ?? 0,
      fullTime: g ? +g.stats.fullTime.toFixed(1) : 0,
      idleTime: g ? +g.stats.idleTime.toFixed(1) : 0,
      laps: g?.stats.laps ?? 0,
      sandLeft: g?.sand.total ?? 0,
      at: Date.now(),
    });
  }

  private toggleSpeed(): void {
    if (this.play.game.finalStretch) {
      this.ui.toast(`Final stretch: the belt runs at x${FINAL_STRETCH.speed}`, 1300);
      return;
    }
    this.speed = this.speed === 1 ? 2 : 1;
    this.ui.setSpeed(this.speed);
    this.audio.click();
  }

  /** Speed multiplier now in force: the player's x1/x2 choice, or the forced final-stretch speed. */
  private speedNow(): number {
    return this.play.game.finalStretch ? Math.max(this.speed, FINAL_STRETCH.speed) : this.speed;
  }

  // ------------------------------------------------------------ flow

  private loadAttract(): void {
    const lv = LEVELS[Math.min(this.level, LEVELS.length) - 1];
    this.play.load(new Game(lv, 11));
    this.ui.showHud(false);
  }

  private startFromMenu(): void {
    this.audio.unlock();
    this.audio.click();
    // "Play" really continues at the current level, also after the whole game has been cleared.
    this.startLevel(this.level);
  }

  /** The main menu: the level path, hearts, coins. The board behind it is only loaded, not drawn. */
  private goMenu(): void {
    this.abandonCurrent();
    this.settleLoss();
    this.pendingResult = null;
    this.winReward = null;
    this.shopOpen = this.dailyOpen = this.settingsOpen = false;
    this.ui.showShop(false);
    this.ui.showDaily(false);
    this.ui.showSettings(false, this.save.data.settings);
    this.ui.hideConfirm();
    this.ui.showPause(false, this.save.data.settings);
    this.ui.showWin(false);
    this.ui.showFail(false);
    this.ui.showLevels(false);
    this.ui.showFinish(false);
    this.loadAttract();
    this.mode = 'menu';
    this.ui.setMap(this.levelCards());
    this.ui.showMenu(true);
    this.refreshMeta(true);
  }

  private levelCards(): LevelCard[] {
    return LEVELS.map((lv) => ({
      id: lv.id,
      name: lv.name,
      art: lv.art,
      state: lv.id > this.save.data.unlocked ? 'locked' : (this.save.data.levels[lv.id]?.wins ?? 0) > 0 && lv.id !== this.level ? 'done' : 'open',
      current: lv.id === this.level,
      hard: !!lv.hard,
    }));
  }

  /** Start a level. `free` skips the heart check (cheat panel). Returns false when the player has no heart to play with. */
  startLevel(n: number, free = false): boolean {
    this.audio.unlock();
    this.abandonCurrent();
    this.settleLoss();
    if (!free && !this.hearts.canPlay()) {
      // Out of hearts: nothing starts. Whatever screen the player was on is left behind for the menu with the shop on top.
      this.goMenu();
      this.openShop('Out of hearts');
      return false;
    }
    n = Math.max(1, Math.min(n, LEVELS.length));
    this.level = n;
    this.save.data.current = n;
    this.save.commit();
    const lv = LEVELS[n - 1];
    const attempt = this.save.record(n).attempts;
    this.play.load(new Game(lv, 1 + attempt * 31));
    this.mode = 'playing';
    this.pendingResult = null;
    this.winReward = null;
    this.snapshots = [];
    this.undosLeft = MAX_UNDOS;
    this.usedUndo = false;
    this.cancelBoost();
    this.boostAsking = false;
    this.ui.hideConfirm();
    this.ui.setUndo(0);
    this.ui.setCoins(this.save.data.coins); // a win's coins are saved before its result screen shows
    this.resultTimer = 0;
    this.attemptStart = performance.now();
    this.ui.setLevel(n, lv.name, !!lv.hard);
    this.ui.showHud(true);
    this.ui.showPause(false, this.save.data.settings);
    this.ui.showWin(false);
    this.ui.showFail(false);
    this.ui.showLevels(false);
    this.ui.showFinish(false);
    this.ui.showMenu(false);
    this.ui.showShop(false);
    this.shopOpen = false;
    this.stage.setTheme('#ffffff');
    this.wonLevel = 0;
    this.giveUnlockGifts(n);
    this.refreshBoosters();
    this.teachMechanics();
    if (n === 1) this.tip('tap', 'Tap a bucket to send it onto the belt. It only picks up sand of its own colour from the bottom edge of the picture.');
    return true;
  }

  // ------------------------------------------------------------ leaving a level / undo

  /** The player is partway through a level (has tapped at least once, no result yet). */
  private hasProgress(): boolean {
    const g = this.play.game;
    const inLevel = this.mode === 'playing' || this.mode === 'paused' || (this.mode === 'levels' && this.returnTo === 'paused');
    return inLevel && g.status === 'playing' && !this.pendingResult && g.stats.taps > 0;
  }

  private abandoned = new WeakSet<Game>();

  /**
   * Leaving a started level counts as an attempt, so restarting cannot be used to farm the first-try bonus, and it costs
   * a heart (as leaving through the Keep-playing popup does in sand-storm-2). Safe to call twice for the same game.
   */
  private abandonCurrent(): void {
    if (!this.hasProgress() || this.abandoned.has(this.play.game)) return;
    this.abandoned.add(this.play.game);
    this.recordQuit(this.level, this.play.game);
    this.hearts.consume();
    this.save.commit();
    this.refreshMeta();
  }

  /** A lost level costs its heart once the player moves on (Retry, Home, another level) rather than when the screen appears, so Undo stays free. */
  private settleLoss(): void {
    if (!this.unpaidLoss) return;
    this.unpaidLoss = false;
    this.hearts.consume();
    this.save.commit();
    this.refreshMeta();
  }

  /** What the confirmation says about leaving a level that was started. */
  private leaveText(): string {
    return this.hearts.infinite() ? 'Your progress on this level will be lost.' : 'Your progress on this level will be lost and it costs 1 heart.';
  }

  /** Run `go` now, or after a confirmation if it would throw away a level in progress. */
  private confirmLeave(title: string, text: string, yes: string, go: () => void): void {
    this.audio.click();
    if (this.hasProgress()) this.ui.confirm(title, text, yes, go);
    else go();
  }

  private pick(n: number): void {
    this.confirmLeave('Leave this level?', this.leaveText(), 'Leave', () => this.startLevel(n));
  }

  private undoLeft(): number {
    return this.snapshots.length ? this.undosLeft : 0;
  }

  /** Go back to just before the last bucket tap (a few times per attempt; disqualifies the first-try bonus). */
  private undo(): void {
    if (!this.snapshots.length || this.undosLeft <= 0) return;
    if (this.mode !== 'playing' && this.mode !== 'paused' && this.mode !== 'lost') return;
    const g = this.snapshots.pop()!;
    this.undosLeft--;
    this.usedUndo = true;
    this.unpaidLoss = false;
    this.audio.click();
    this.play.load(g);
    this.pendingResult = null;
    this.resultTimer = 0;
    this.mode = 'playing';
    this.ui.showPause(false, this.save.data.settings);
    this.ui.showFail(false);
    this.ui.setUndo(this.undoLeft());
  }

  /** Show a hint once, ever. */
  private tip(key: 'tap' | 'blocked' | 'full', text: string, short = ''): void {
    if (this.save.data.tips[key]) {
      if (short) this.ui.toast(short, 1300);
      return;
    }
    this.save.data.tips[key] = true;
    this.save.commit();
    this.ui.toast(text, 6500, true);
  }

  /** First level with each mechanic: say once what it means (there is no tutorial screen). */
  private teachMechanics(): void {
    const b = this.play.game.board;
    const t = this.save.data.tips;
    const lines: Array<['mystery' | 'tunnel' | 'frozen' | 'rod' | 'key', boolean, string]> = [
      ['tunnel', b.tunnels.length > 0, 'A tunnel pushes out its next bucket whenever the tile in front of it is empty. The ring shows the colour that comes next.'],
      ['frozen', b.buckets.some((x) => x.frozen > 0), 'A frozen bucket cannot be tapped. It thaws after the number of buckets shown have filled up and popped.'],
      ['rod', b.rods.length > 0, 'A gate bar blocks the tiles under it. It slides away once the tile in front of its arrow is empty.'],
      ['key', b.buckets.some((x) => x.key > 0), 'A locked bucket opens when the key bucket of the same colour has filled up and popped, not just when it is tapped.'],
      ['mystery', b.buckets.some((x) => x.mystery), 'A "?" bucket hides its colour until a tile next to it is empty.'],
    ];
    for (const [key, present, text] of lines) {
      if (!present || t[key]) continue;
      t[key] = true;
      this.save.commit();
      this.ui.toast(text, 7000, true);
      return; // one lesson per level
    }
  }

  /** Xóa save và về màn hình tiêu đề (dùng cho bảng cheat). */
  private resetAll(): void {
    this.save.reset();
    const s = this.save.data.settings;
    this.audio.setSound(s.sound);
    this.audio.setMusic(s.music);
    this.audio.haptics = s.haptics;
    this.play.colorAssist = s.colorAssist;
    this.level = 1;
    this.wonLevel = 0;
    this.unpaidLoss = false;
    this.hearts = new Hearts(this.save.data.hearts);
    this.ui.setCoins(this.save.data.coins);
    this.goMenu();
  }

  private setPaused(p: boolean): void {
    if (p) this.cancelBoost();
    if (p && this.mode === 'playing') {
      this.mode = 'paused';
      this.ui.setUndo(this.undoLeft());
      this.ui.showPause(true, this.save.data.settings);
      this.audio.click();
    } else if (!p && this.mode === 'paused') {
      this.ui.hideConfirm();
      this.mode = 'playing';
      this.ui.showPause(false, this.save.data.settings);
      this.audio.click();
    }
  }

  private openLevels(): void {
    this.audio.unlock();
    this.audio.click();
    this.returnTo = this.mode === 'paused' ? 'paused' : this.mode === 'lost' ? 'lost' : this.mode === 'won' ? 'won' : this.mode === 'finished' ? 'finished' : 'menu';
    this.ui.showPause(false, this.save.data.settings);
    this.ui.showWin(false);
    this.ui.showFail(false);
    this.ui.showFinish(false);
    this.ui.showMenu(false);
    const cards: LevelCard[] = LEVELS.map((lv) => ({
      id: lv.id,
      name: lv.name,
      art: lv.art,
      state: lv.id > this.save.data.unlocked ? 'locked' : (this.save.data.levels[lv.id]?.wins ?? 0) > 0 ? 'done' : 'open',
      current: lv.id === this.level,
      hard: !!lv.hard,
    }));
    this.ui.showLevels(true, cards);
    this.mode = 'levels';
  }

  private closeLevels(): void {
    this.audio.click();
    this.ui.showLevels(false);
    if (this.returnTo === 'paused') {
      this.mode = 'paused';
      this.ui.showPause(true, this.save.data.settings);
    } else if (this.returnTo === 'won') {
      this.mode = 'won';
      this.ui.showWin(true, this.lastReward.total, this.lastReward.label);
    } else if (this.returnTo === 'lost') {
      this.mode = 'lost';
      this.ui.setUndo(this.undoLeft());
      this.ui.showFail(true, this.failText());
    } else if (this.returnTo === 'finished') {
      this.mode = 'finished';
      this.ui.showFinish(true, this.save.data.coins);
    } else {
      this.mode = 'menu';
      this.ui.showMenu(true);
    }
  }

  private toggle(k: 'sound' | 'music' | 'haptics' | 'colorAssist'): void {
    const s = this.save.data.settings;
    s[k] = !s[k];
    this.save.commit();
    if (k === 'sound') this.audio.setSound(s.sound);
    if (k === 'music') this.audio.setMusic(s.music);
    if (k === 'haptics') this.audio.haptics = s.haptics;
    if (k === 'colorAssist') this.play.colorAssist = s.colorAssist;
    this.ui.setToggles(s);
    this.audio.click();
  }

  private next(): void {
    this.audio.click();
    if (this.wonLevel >= LEVELS.length) {
      this.mode = 'finished';
      this.ui.showWin(false);
      this.ui.showFinish(true, this.save.data.coins);
      return;
    }
    this.startLevel(this.wonLevel + 1);
  }

  private failText(): string {
    const g = this.play.game;
    const pct = Math.floor(g.cleared * 100);
    const cost = this.hearts.infinite() ? '' : ` <i class="cost">${HEART_SVG} -1 when you leave without Undo</i>`;
    return `<b>${pct}%</b> of the picture is cleared. ` + this.failReason() + cost;
  }

  private failReason(): string {
    const g = this.play.game;
    if (g.slotsUsed >= g.slots) return `The belt is <b>full</b> and none of its buckets match the sand along the bottom edge.`;
    if (!g.openBuckets().length) return `<b>No bucket</b> can get out and nothing on the belt matches the sand along the bottom edge.`;
    return `Nothing on the belt matches the sand along the bottom edge.`;
  }


  // ------------------------------------------------------------ hearts, shop, daily gift, settings

  /** Keep the hearts pill, the daily-gift dot and an open shop in step with the clock. */
  private refreshMeta(force = false): void {
    const h = this.hearts;
    const now = Date.now();
    const count = h.count(now);
    const left = h.secondsLeft(now);
    const infinite = h.infinite(now);
    const text = infinite ? formatClock(left) : count >= HEART_MAX ? 'Full' : formatClock(left);
    const key = `${count}|${text}|${infinite}|${this.dailyReady()}|${this.save.data.coins}|${BOOSTER_KEYS.map((k) => this.save.data.boosters[k]).join(',')}`;
    if (!force && key === this.metaKey) return;
    this.metaKey = key;
    this.ui.setHearts(count, text, infinite);
    this.ui.setGiftReady(this.dailyReady());
    this.ui.setCoins(this.save.data.coins);
    this.refreshBoosters();
    if (this.shopOpen) this.ui.showShop(true, this.shopModel());
    if (this.dailyOpen) this.ui.showDaily(true, this.dailyModel());
    this.save.commit();
  }

  private metaKey = '';

  private shopModel(): ShopModel {
    const h = this.hearts;
    const now = Date.now();
    const count = h.count(now);
    const missing = HEART_MAX - count;
    const infinite = h.infinite(now);
    const coins = this.save.data.coins;
    const refillPrice = missing * HEART_PRICE;
    const left = h.secondsLeft(now);
    return {
      boosters: this.boosterItems(),
      tab: this.shopTabNow ?? undefined,
      title: this.shopTitle,
      heartsLine: infinite ? `Infinite hearts` : `${count} / ${HEART_MAX} hearts`,
      nextLine: infinite ? `${formatClock(left)} left` : count >= HEART_MAX ? 'Full' : `Next heart in ${formatClock(left)}`,
      coins,
      refillSub: infinite ? 'Not needed right now' : missing > 0 ? `Fill ${missing} missing (${HEART_PRICE} each)` : 'Hearts are full',
      refillPrice,
      refillOk: !infinite && missing > 0,
      infiniteSub: `${INFINITE_MINUTES} minutes, stacks if bought again`,
      infinitePrice: INFINITE_PRICE,
      infiniteOk: true,
      adSub: infinite || missing <= 0 ? 'Hearts are full' : `Watch a short ad: +${AD_HEARTS} heart (demo)`,
      adOk: !infinite && missing > 0 && !this.adTimer,
    };
  }

  /** Tab to open the shop on, consumed by the next draw. */
  private shopTabNow: 'hearts' | 'boosters' | null = null;

  private openShop(title: string, tab: 'hearts' | 'boosters' = 'hearts'): void {
    this.audio.unlock();
    this.audio.click();
    this.shopTitle = title;
    this.shopOpen = true;
    this.shopTabNow = tab;
    this.ui.showShop(true, this.shopModel());
    this.shopTabNow = null;
  }

  private closeShop(): void {
    this.audio.click();
    this.shopOpen = false;
    this.ui.showShop(false);
  }

  private shopBuy(kind: 'refill' | 'infinite' | 'ad' | BoosterKey): void {
    const h = this.hearts;
    const d = this.save.data;
    if (kind === 'handPick' || kind === 'sandPull' || kind === 'shuffle') {
      this.buyBooster(kind);
      return;
    }
    if (kind === 'ad') {
      if (this.adTimer || h.full() || h.infinite()) return;
      this.audio.click();
      let left = AD_SECONDS;
      this.ui.showAd(true, `Ad playing... ${Math.ceil(left)}`);
      this.adTimer = window.setInterval(() => {
        left -= 0.25;
        if (left > 0) return this.ui.showAd(true, `Ad playing... ${Math.ceil(left)}`);
        window.clearInterval(this.adTimer);
        this.adTimer = 0;
        this.ui.showAd(false);
        h.add(AD_HEARTS);
        this.audio.coin(0);
        this.refreshMeta(true);
      }, 250);
      return;
    }
    const price = kind === 'refill' ? (HEART_MAX - h.count()) * HEART_PRICE : INFINITE_PRICE;
    if (kind === 'refill' && (h.infinite() || h.full())) return;
    if (d.coins < price) {
      this.audio.reject();
      this.ui.toast(`Not enough coins: you need ${price - d.coins} more`, 1800);
      return;
    }
    d.coins -= price;
    if (kind === 'refill') h.add(Infinity);
    else h.addInfinite(INFINITE_MINUTES);
    this.audio.coin(0);
    this.refreshMeta(true);
  }

  // ---- daily gift

  private today(): string {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }

  private dailyReady(): boolean {
    return this.save.data.daily.last !== this.today();
  }

  private giftHtml(g: GiftReward): string {
    const out: string[] = [];
    if (g.coins) out.push(`<span>${COIN_SVG}${g.coins}</span>`);
    if (g.hearts) out.push(`<span>${HEART_SVG}x${g.hearts}</span>`);
    if (g.infiniteMinutes) out.push(`<span class="inf">&infin; ${g.infiniteMinutes}m</span>`);
    for (const k of BOOSTER_KEYS) if (g.boosters?.[k]) out.push(`<span class="bst">${BOOSTERS[k].name} x${g.boosters[k]}</span>`);
    return out.join('');
  }

  private dailyModel(): DailyModel {
    const d = this.save.data.daily;
    const ready = this.dailyReady();
    return {
      days: DAILY_GIFTS.map((g) => this.giftHtml(g)),
      next: d.next,
      ready,
      note: ready ? 'Your gift for today is waiting.' : "Today's gift is claimed. A new one comes tomorrow.",
    };
  }

  private openDaily(): void {
    this.audio.unlock();
    this.audio.click();
    this.dailyOpen = true;
    this.ui.showDaily(true, this.dailyModel());
  }

  private closeDaily(): void {
    this.audio.click();
    this.dailyOpen = false;
    this.ui.showDaily(false);
  }

  private claimDaily(): void {
    if (!this.dailyReady()) return;
    const d = this.save.data;
    const g = DAILY_GIFTS[d.daily.next];
    if (g.coins) d.coins += g.coins;
    if (g.hearts) this.hearts.add(g.hearts);
    if (g.infiniteMinutes) this.hearts.addInfinite(g.infiniteMinutes);
    for (const k of BOOSTER_KEYS) if (g.boosters?.[k]) d.boosters[k] += g.boosters[k]!;
    d.daily = { next: (d.daily.next + 1) % DAILY_GIFTS.length, last: this.today() };
    this.audio.coin(0);
    this.audio.win();
    this.refreshMeta(true);
    this.ui.showDaily(true, this.dailyModel());
  }

  private toggleSettings(): void {
    this.audio.click();
    this.settingsOpen = !this.settingsOpen;
    this.ui.showSettings(this.settingsOpen, this.save.data.settings);
  }


  // ------------------------------------------------------------ boosters

  private boosterItems(): BoosterItem[] {
    return BOOSTER_KEYS.map((k) => ({
      key: k,
      name: BOOSTERS[k].name,
      desc: BOOSTERS[k].desc,
      owned: this.save.data.boosters[k],
      price: BOOSTERS[k].price,
      lockedAt: this.save.data.unlocked >= BOOSTERS[k].unlock ? 0 : BOOSTERS[k].unlock,
      active: this.boostTarget === k,
    }));
  }

  private refreshBoosters(): void {
    this.ui.setBoosters(this.boosterItems());
  }

  /** Free boosters the first time the level that unlocks them is reached (sand-storm-2 hands out 2 at its tutorial). */
  private giveUnlockGifts(level: number): void {
    const d = this.save.data;
    for (const k of BOOSTER_KEYS) {
      const def = BOOSTERS[k];
      if (d.unlocked < def.unlock || level < def.unlock || d.boosterGift[k]) continue;
      d.boosterGift[k] = true;
      if (def.gift > 0) {
        d.boosters[k] += def.gift;
        this.ui.toast(`New booster: ${def.name}. ${def.gift} free, ${def.desc.toLowerCase()}.`, 6500, true);
      } else this.ui.toast(`New booster: ${def.name}: ${def.desc.toLowerCase()}.`, 6500, true);
    }
    this.save.commit();
  }

  private cancelBoost(): void {
    if (!this.boostTarget) return;
    this.boostTarget = null;
    this.play.boostMode = 'none';
    this.ui.hideToast();
    this.refreshBoosters();
  }

  /** The in-game booster button: use one, buy one, or leave the targeting mode. */
  private useBooster(key: BoosterKey): void {
    this.audio.unlock();
    if (this.mode !== 'playing' || this.boostAsking) return;
    const g = this.play.game;
    if (g.status !== 'playing' || this.pendingResult) return;
    if (this.boostTarget === key) {
      this.audio.click();
      this.cancelBoost();
      return;
    }
    const def = BOOSTERS[key];
    if (this.save.data.unlocked < def.unlock) {
      this.audio.reject();
      this.ui.toast(`${def.name} unlocks at level ${def.unlock}`, 1600);
      return;
    }
    this.cancelBoost();
    if (this.save.data.boosters[key] > 0) {
      this.startBooster(key);
      return;
    }
    // None left: offer to buy one (the level waits for the answer)
    const coins = this.save.data.coins;
    this.audio.click();
    if (coins < def.price) {
      this.audio.reject();
      this.ui.toast(`${def.name} costs ${def.price} coins, you have ${coins}`, 2200);
      return;
    }
    this.boostAsking = true;
    this.ui.confirm(
      `Buy ${def.name}?`,
      `${def.desc}. It costs ${def.price} coins (you have ${coins}) and uses up the first-try bonus.`,
      'Buy',
      () => {
        this.boostAsking = false;
        this.save.data.coins -= def.price;
        this.save.data.boosters[key]++;
        this.save.commit();
        this.ui.setCoins(this.save.data.coins);
        this.audio.coin(0);
        this.refreshBoosters();
        this.startBooster(key);
      },
      () => (this.boostAsking = false),
      'Cancel',
    );
  }

  /** Spend one and apply it (Shuffle at once) or wait for a target (Hand Pick, Sand Pull). */
  private startBooster(key: BoosterKey): void {
    const g = this.play.game;
    if (key === 'shuffle') {
      if (!g.shuffleBoard()) {
        this.audio.reject();
        this.ui.toast('Nothing to shuffle: need two colours of plain buckets on the board', 2000);
        return;
      }
      this.spendBooster(key);
      this.play.load(g); // redraw the board with the new colours (the belt and the sand carry on as they were)
      this.audio.reveal();
      this.ui.toast('Shuffled', 1200);
      return;
    }
    if (key === 'handPick') {
      if (g.slotsUsed >= g.slots) {
        this.audio.reject();
        this.ui.toast(`The belt is full (${g.slots}/${g.slots}): wait for a bucket to fill first`, 2000);
        return;
      }
      if (!g.board.buckets.some((b) => !b.gone && !b.queued && b.frozen === 0 && !b.locked)) {
        this.audio.reject();
        this.ui.toast('No bucket on the board can be picked', 1800);
        return;
      }
      this.boostTarget = 'handPick';
      this.play.boostMode = 'pick';
      this.ui.toast('Hand Pick: tap any bucket on the board (tap the button again to cancel)', 60000, true);
    } else {
      if (!g.pullTargets().length) {
        this.audio.reject();
        this.ui.toast('Sand Pull needs a bucket on the belt that still has room', 2200);
        return;
      }
      this.boostTarget = 'sandPull';
      this.play.boostMode = 'pull';
      this.ui.toast('Sand Pull: tap a bucket on the belt (tap the button again to cancel)', 60000, true);
    }
    this.audio.click();
    this.refreshBoosters();
  }

  /** One used up. Like Undo, any booster rules out the first-try bonus, and the Undo history starts over. */
  private spendBooster(key: BoosterKey): void {
    const d = this.save.data;
    d.boosters[key] = Math.max(0, d.boosters[key] - 1);
    this.usedUndo = true;
    this.snapshots = [];
    this.ui.setUndo(0);
    if (d.pending !== this.level) d.pending = this.level;
    this.save.commit();
    this.refreshBoosters();
  }

  private onBoostPointer(e: PointerEvent): void {
    const g = this.play.game;
    const key = this.boostTarget!;
    if (key === 'handPick') {
      const id = this.play.pick(e.clientX, e.clientY);
      if (id === null) return;
      const r = g.handPick(id);
      if (r === 'ok') {
        this.cancelBoost();
        this.spendBooster(key);
      } else if (r === 'frozen' || r === 'locked') {
        this.audio.reject();
        this.ui.toast(r === 'frozen' ? 'Frozen buckets cannot be picked' : 'Locked buckets cannot be picked', 1400);
      } else if (r === 'full') {
        this.audio.reject();
        this.ui.toast('The belt is full', 1400);
      }
      return;
    }
    const id = this.play.pickBelt(e.clientX, e.clientY);
    if (id === null) return;
    if (g.sandPull(id) > 0) {
      this.cancelBoost();
      this.spendBooster(key);
    } else this.audio.reject();
  }

  private buyBooster(key: BoosterKey): void {
    const d = this.save.data;
    const def = BOOSTERS[key];
    if (d.unlocked < def.unlock) {
      this.audio.reject();
      this.ui.toast(`${def.name} unlocks at level ${def.unlock}`, 1600);
      return;
    }
    if (d.coins < def.price) {
      this.audio.reject();
      this.ui.toast(`Not enough coins: you need ${def.price - d.coins} more`, 1800);
      return;
    }
    d.coins -= def.price;
    d.boosters[key]++;
    this.audio.coin(0);
    this.refreshMeta(true);
  }

  // ------------------------------------------------------------ input

  private onPointer(e: PointerEvent): void {
    this.audio.unlock();
    if (this.mode !== 'playing' || this.boostAsking) return;
    if (this.boostTarget) {
      this.onBoostPointer(e);
      return;
    }
    const id = this.play.pick(e.clientX, e.clientY);
    if (id !== null) {
      this.lastTap = performance.now();
      const before = this.play.game.clone();
      if (this.play.game.tap(id) === 'ok') {
        if (this.save.data.pending !== this.level) {
          this.save.data.pending = this.level;
          this.save.commit();
        }
        this.snapshots.push(before);
        if (this.snapshots.length > MAX_UNDOS) this.snapshots.shift();
      }
    }
  }

  // ------------------------------------------------------------ events

  private onScene(e: SceneEvent): void {
    const a = this.audio;
    switch (e.type) {
      case 'tap':
        a.tap();
        break;
      case 'reject':
        a.reject();
        if (e.reason === 'blocked') this.tip('blocked', 'A bucket can only leave when it has a clear path up to the top row. Move the ones in front of it first.', 'Blocked: move the buckets in front of it first');
        else if (e.reason === 'frozen') this.ui.toast('Frozen: it thaws when more buckets fill up and pop', 1500);
        else if (e.reason === 'locked') this.ui.toast('Locked: fill the key bucket first', 1500);
        else this.tip('full', `The belt holds ${this.play.game.slots} buckets. Wait for one to fill up and pop, then tap again.`, `Belt full (${this.play.game.slots}/${this.play.game.slots}): wait for a bucket to fill`);
        break;
      case 'reveal':
      case 'spawn':
      case 'unlock':
        a.reveal();
        break;
      case 'thaw':
      case 'rod':
        a.land();
        break;
      case 'land':
        a.land();
        break;
      case 'complete':
        a.complete();
        break;
      case 'warn':
        a.warn();
        break;
      case 'win':
        if (this.mode === 'playing') this.finishLevel(true);
        break;
      case 'lose':
        if (this.mode === 'playing') this.finishLevel(false);
        break;
      case 'pick':
        break;
    }
  }

  private finishLevel(win: boolean): void {
    const g = this.play.game;
    this.save.data.pending = 0; // the attempt is logged below
    this.save.addAttempt({
      level: this.level,
      result: win ? 'win' : 'lose',
      time: +g.time.toFixed(1),
      taps: g.stats.taps,
      rejects: g.stats.rejects,
      fullTime: +g.stats.fullTime.toFixed(1),
      idleTime: +g.stats.idleTime.toFixed(1),
      laps: g.stats.laps,
      sandLeft: g.sand.total,
      at: Date.now(),
    });
    const rec = this.save.record(this.level);
    this.pendingResult = win ? 'win' : 'lose';
    this.resultTimer = win ? 1.6 : 1.1;
    if (win) {
      // Win, reward and unlock are saved in the same tick, so closing or reloading during the
      // wait for the result screen cannot lose them. showResult only displays what is stored here.
      const firstClear = rec.wins === 1;
      const reward = rewardFor(firstClear, rec.firstTry && firstClear && !this.usedUndo, !!g.level.hard);
      if (firstClear) {
        this.save.data.unlocked = Math.max(this.save.data.unlocked, Math.min(this.level + 1, LEVELS.length));
        this.save.data.current = Math.min(this.level + 1, LEVELS.length);
        if (this.level >= LEVELS.length) this.save.data.finished = true;
      }
      this.winReward = reward;
      this.save.addCoins(reward.total); // also commits the unlock above
    }
  }

  private showResult(): void {
    if (this.pendingResult === 'win') {
      const reward = this.winReward ?? { base: 0, bonus: 0, total: 0, label: '' };
      this.winReward = null;
      this.lastReward = reward;
      this.wonLevel = this.level;
      this.mode = 'won';
      this.ui.showHud(true);
      this.ui.showWin(true, reward.total, reward.label);
      this.audio.win();
      const coins = this.save.data.coins;
      window.setTimeout(() => {
        if (this.mode !== 'won') return;
        const n = Math.min(10, Math.max(3, Math.round(reward.total / 5)));
        this.ui.flyCoins(this.ui.rewardPoint(), n, (i) => this.audio.coin(i));
        window.setTimeout(() => this.ui.setCoins(coins, true), 650 + n * 55);
      }, 1700);
    } else {
      this.mode = 'lost';
      this.unpaidLoss = true;
      this.ui.setUndo(this.undoLeft());
      this.ui.showFail(true, this.failText());
      this.audio.lose();
    }
    this.pendingResult = null;
  }

  // ------------------------------------------------------------ frame

  frame(): void {
    const t = this.stage.tick();
    let dt = t.dt;
    if (this.mode === 'paused' || this.mode === 'levels' || this.boostTarget || this.boostAsking) dt = 0;
    const g = this.play.game;

    // Main menu: a full-screen DOM page. Nothing behind it needs simulating or drawing.
    this.metaClock -= t.dt;
    if (this.metaClock <= 0) {
      this.metaClock = 0.25;
      this.refreshMeta();
    }
    if (this.mode === 'menu') {
      this.ui.placeSpeedButton(0, 0, false);
      this.audio.setPour(0);
      this.audio.tick(t.dt);
      return;
    }

    this.ui.showBoosters(this.mode === 'playing' && g.status === 'playing' && !this.pendingResult);
    this.ui.setPauseEnabled(this.mode === 'playing' && g.status === 'playing' && !this.pendingResult);
    const mult = this.mode === 'playing' ? this.speedNow() : this.speed;
    if (mult !== this.shownSpeed) {
      this.shownSpeed = mult;
      this.ui.setSpeed(mult, g.finalStretch);
    }
    this.play.update(this.mode === 'playing' ? dt * mult : dt, t.time);
    this.audio.setPour(this.mode === 'playing' ? this.pourLevel() : 0);
    this.audio.tick(t.dt);

    if (this.pendingResult && dt > 0) {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) this.showResult();
    }
    this.stage.render(t.dt, t.time);
    const speedAnchor = this.play.projectSpeedAnchor();
    this.ui.placeSpeedButton(
      (speedAnchor.x + 1) * window.innerWidth / 2,
      (1 - speedAnchor.y) * window.innerHeight / 2,
      this.mode === 'playing' && g.status === 'playing' && !this.pendingResult,
    );
  }

  private pourLevel(): number {
    // Follows the grains that actually moved: silent once the picture has settled, even with buckets on the belt.
    return Math.min(1, Math.sqrt(this.play.game.sand.flow / 1500));
  }
}
