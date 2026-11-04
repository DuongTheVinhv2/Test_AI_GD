import * as THREE from 'three';
import { AudioEngine } from '../audio/audio';
import { Game } from '../core/game';
import { rewardFor, type Reward } from '../core/economy';
import { LEVELS } from '../core/levels';
import { Rng } from '../core/rng';
import { createMaterials } from '../render/materials';
import { PlayScene, type SceneEvent } from '../render/scene';
import { Stage } from '../render/stage';
import { glyphAtlas } from '../render/textures';
import { CheatPanel } from '../ui/cheat';
import { UI, type LevelCard } from '../ui/ui';
import { Save } from './save';

const MAX_UNDOS = 3;

type Mode = 'title' | 'playing' | 'paused' | 'won' | 'lost' | 'levels' | 'finished';

export class App {
  readonly stage: Stage;
  readonly play: PlayScene;
  readonly ui: UI;
  readonly audio = new AudioEngine();
  readonly save = new Save();
  readonly cheat: CheatPanel;
  mode: Mode = 'title';
  private level = 1;
  private returnTo: Mode = 'title';
  private attractBot = new Rng(3);
  private attractNext = 1.5;
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
  /** 1, or 2 while fast-forward is on */
  private speed = 1;
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
      onPlay: () => this.startFromTitle(),
      onLevels: () => this.openLevels(),
      onPause: () => this.setPaused(true),
      onResume: () => this.setPaused(false),
      onRestart: () => this.confirmLeave('Restart level?', 'Your progress on this level will be lost.', 'Restart', () => this.startLevel(this.level)),
      onNext: () => this.next(),
      onRetry: () => this.startLevel(this.level),
      onPick: (n) => this.pick(n),
      onToggle: (k) => this.toggle(k),
      onTitle: () => this.closeLevels(),
      onUndo: () => this.undo(),
      onSpeed: () => this.toggleSpeed(),
      onPlayAll: () => this.startLevel(1),
    });

    const s = this.save.data.settings;
    this.audio.sound = s.sound;
    this.audio.music = s.music;
    this.audio.haptics = s.haptics;
    this.play.colorAssist = s.colorAssist;
    this.level = Math.min(this.save.data.current, LEVELS.length);

    canvas.addEventListener('pointerdown', (e) => this.onPointer(e));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.mode === 'playing') this.setPaused(true);
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
      }),
      goLevel: (n) => {
        this.save.data.unlocked = Math.max(this.save.data.unlocked, n);
        this.save.commit();
        this.startLevel(n);
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
    this.loadAttract();
    this.ui.showTitle(true, this.save.data.current, this.save.data.finished);
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
    this.speed = this.speed === 1 ? 2 : 1;
    this.ui.setSpeed(this.speed);
    this.audio.click();
  }

  // ------------------------------------------------------------ flow

  private loadAttract(): void {
    const lv = LEVELS[Math.min(this.level, LEVELS.length) - 1];
    this.play.load(new Game(lv, 11));
    this.attractNext = 1.5;
    this.ui.showHud(false);
  }

  private startFromTitle(): void {
    this.audio.unlock();
    this.audio.click();
    // "Continue / Level N" really continues at level N, also after the whole game has been cleared.
    this.startLevel(this.level);
  }

  startLevel(n: number): void {
    this.audio.unlock();
    this.abandonCurrent();
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
    this.ui.hideConfirm();
    this.ui.setUndo(0);
    this.ui.setCoins(this.save.data.coins); // a win's coins are saved before its result screen shows
    this.resultTimer = 0;
    this.attemptStart = performance.now();
    this.ui.setLevel(n, lv.name, !!lv.hard);
    this.ui.showHud(true);
    this.ui.showTitle(false);
    this.ui.showPause(false, this.save.data.settings);
    this.ui.showWin(false);
    this.ui.showFail(false);
    this.ui.showLevels(false);
    this.ui.showFinish(false);
    this.stage.setTheme('#ffffff');
    this.wonLevel = 0;
    this.teachMystery();
    if (n === 1) this.tip('tap', 'Tap a bucket to send it onto the belt. It only picks up sand of its own colour from the bottom edge of the picture.');
  }

  // ------------------------------------------------------------ leaving a level / undo

  /** The player is partway through a level (has tapped at least once, no result yet). */
  private hasProgress(): boolean {
    const g = this.play.game;
    const inLevel = this.mode === 'playing' || this.mode === 'paused' || (this.mode === 'levels' && this.returnTo === 'paused');
    return inLevel && g.status === 'playing' && !this.pendingResult && g.stats.taps > 0;
  }

  /** Leaving a started level counts as an attempt, so restarting cannot be used to farm the first-try bonus. */
  private abandonCurrent(): void {
    if (!this.hasProgress()) return;
    this.recordQuit(this.level, this.play.game);
  }

  /** Run `go` now, or after a confirmation if it would throw away a level in progress. */
  private confirmLeave(title: string, text: string, yes: string, go: () => void): void {
    this.audio.click();
    if (this.hasProgress()) this.ui.confirm(title, text, yes, go);
    else go();
  }

  private pick(n: number): void {
    this.confirmLeave('Leave this level?', 'Your progress on it will be lost.', 'Leave', () => this.startLevel(n));
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

  /** First level with a '?' bucket: say once what it means (there is no tutorial screen). */
  private teachMystery(): void {
    if (this.save.data.tips.mystery || !this.play.game.board.buckets.some((b) => b.mystery)) return;
    this.save.data.tips.mystery = true;
    this.save.commit();
    this.ui.toast('A "?" bucket hides its colour until a tile next to it is empty.', 6000, true);
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
    this.pendingResult = null;
    this.wonLevel = 0;
    this.ui.showPause(false, this.save.data.settings);
    this.ui.showWin(false);
    this.ui.showFail(false);
    this.ui.showLevels(false);
    this.ui.showFinish(false);
    this.ui.setCoins(this.save.data.coins);
    this.loadAttract();
    this.mode = 'title';
    this.ui.showTitle(true, this.save.data.current, this.save.data.finished);
  }

  private setPaused(p: boolean): void {
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
    this.returnTo = this.mode === 'paused' ? 'paused' : this.mode === 'lost' ? 'lost' : this.mode === 'won' ? 'won' : this.mode === 'finished' ? 'finished' : 'title';
    this.ui.showPause(false, this.save.data.settings);
    this.ui.showWin(false);
    this.ui.showFail(false);
    this.ui.showFinish(false);
    this.ui.showTitle(false);
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
      this.mode = 'title';
      this.ui.showTitle(true, this.save.data.current, this.save.data.finished);
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
    return `<b>${pct}%</b> of the picture is cleared. ` + this.failReason();
  }

  private failReason(): string {
    const g = this.play.game;
    if (g.slotsUsed >= g.slots) return `The belt is <b>full</b> and none of its buckets match the sand along the bottom edge.`;
    if (!g.openBuckets().length) return `<b>No bucket</b> can get out and nothing on the belt matches the sand along the bottom edge.`;
    return `Nothing on the belt matches the sand along the bottom edge.`;
  }

  // ------------------------------------------------------------ input

  private onPointer(e: PointerEvent): void {
    this.audio.unlock();
    if (this.mode !== 'playing') return;
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
        else this.tip('full', `The belt holds ${this.play.game.slots} buckets. Wait for one to fill up and pop, then tap again.`, `Belt full (${this.play.game.slots}/${this.play.game.slots}): wait for a bucket to fill`);
        break;
      case 'reveal':
        a.reveal();
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
      const reward = rewardFor(firstClear, rec.firstTry && firstClear && !this.usedUndo);
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
    if (this.mode === 'paused' || this.mode === 'levels') dt = 0;
    const g = this.play.game;

    // Title screen: let the board play itself so the first thing you see is moving sand.
    if (this.mode === 'title') {
      this.attractNext -= t.dt;
      if (this.attractNext <= 0 && g.status === 'playing') {
        this.attractNext = 0.8 + this.attractBot.next() * 0.6;
        const open = g.openBuckets();
        if (open.length && g.slotsUsed < g.slots) {
          const ex = g.exposure();
          const good = open.filter((b) => ex[b.color] > 0);
          const pool = good.length ? good : open;
          g.tap(pool[this.attractBot.int(pool.length)].id);
        }
      }
      if (g.status !== 'playing') this.loadAttract();
    }

    this.ui.setPauseEnabled(this.mode === 'playing' && g.status === 'playing' && !this.pendingResult);
    this.play.update(this.mode === 'playing' ? dt * this.speed : dt, t.time);
    this.audio.setPour(this.mode === 'playing' || this.mode === 'title' ? this.pourLevel() : 0);
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
