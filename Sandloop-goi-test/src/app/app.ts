import * as THREE from 'three';
import { AudioEngine } from '../audio/audio';
import { Game } from '../core/game';
import { rewardFor } from '../core/economy';
import { LEVELS } from '../core/levels';
import { Rng } from '../core/rng';
import { createMaterials } from '../render/materials';
import { PlayScene, type SceneEvent } from '../render/scene';
import { Stage } from '../render/stage';
import { glyphAtlas } from '../render/textures';
import { UI, type LevelCard } from '../ui/ui';
import { Save } from './save';

type Mode = 'title' | 'playing' | 'paused' | 'won' | 'lost' | 'levels' | 'finished';

export class App {
  readonly stage: Stage;
  readonly play: PlayScene;
  readonly ui: UI;
  readonly audio = new AudioEngine();
  readonly save = new Save();
  mode: Mode = 'title';
  private level = 1;
  private returnTo: Mode = 'title';
  private attractBot = new Rng(3);
  private attractNext = 1.5;
  private resultTimer = 0;
  private pendingResult: 'win' | 'lose' | null = null;
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
      onRestart: () => this.startLevel(this.level),
      onNext: () => this.next(),
      onRetry: () => this.startLevel(this.level),
      onPick: (n) => this.startLevel(n),
      onToggle: (k) => this.toggle(k),
      onTitle: () => this.closeLevels(),
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
    });

    this.ui.setCoins(this.save.data.coins);
    this.loadAttract();
    this.ui.showTitle(true, this.save.data.current, this.save.data.finished);
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
    if (this.save.data.finished && this.level >= LEVELS.length) this.level = 1;
    this.startLevel(this.save.data.finished ? 1 : this.level);
  }

  startLevel(n: number): void {
    this.audio.unlock();
    n = Math.max(1, Math.min(n, LEVELS.length));
    this.level = n;
    this.save.data.current = n;
    this.save.commit();
    const lv = LEVELS[n - 1];
    const attempt = this.save.record(n).attempts;
    this.play.load(new Game(lv, 1 + attempt * 31));
    this.mode = 'playing';
    this.pendingResult = null;
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
  }

  private setPaused(p: boolean): void {
    if (p && this.mode === 'playing') {
      this.mode = 'paused';
      this.ui.showPause(true, this.save.data.settings);
      this.audio.click();
    } else if (!p && this.mode === 'paused') {
      this.mode = 'playing';
      this.ui.showPause(false, this.save.data.settings);
      this.audio.click();
    }
  }

  private openLevels(): void {
    this.audio.unlock();
    this.audio.click();
    this.returnTo = this.mode === 'paused' ? 'paused' : this.mode === 'lost' ? 'lost' : this.mode === 'finished' ? 'finished' : 'title';
    this.ui.showPause(false, this.save.data.settings);
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
    } else if (this.returnTo === 'lost') {
      this.mode = 'lost';
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
      this.play.tap(id);
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
    const rec = this.save.record(this.level);
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
    this.pendingResult = win ? 'win' : 'lose';
    this.resultTimer = win ? 1.6 : 1.1;
    void rec;
  }

  private showResult(): void {
    if (this.pendingResult === 'win') {
      const rec = this.save.record(this.level);
      const firstClear = rec.wins === 1;
      const reward = rewardFor(firstClear, rec.firstTry && firstClear);
      this.wonLevel = this.level;
      this.mode = 'won';
      if (firstClear) {
        this.save.data.unlocked = Math.max(this.save.data.unlocked, Math.min(this.level + 1, LEVELS.length));
        this.save.data.current = Math.min(this.level + 1, LEVELS.length);
        if (this.level >= LEVELS.length) this.save.data.finished = true;
      }
      this.save.addCoins(reward.total);
      this.ui.showHud(true);
      this.ui.showWin(true, reward.total, reward.label);
      this.audio.win();
      window.setTimeout(() => {
        const r = this.ui.coinTarget();
        void r;
        this.ui.setCoins(this.save.data.coins, true);
      }, 1700);
    } else {
      this.mode = 'lost';
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
    if (this.mode === 'title' || this.mode === 'finished') {
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

    this.play.update(dt, t.time);
    this.audio.setPour(this.mode === 'playing' || this.mode === 'title' ? this.pourLevel() : 0);
    this.audio.tick(t.dt);

    if (this.pendingResult && dt > 0) {
      this.resultTimer -= dt;
      if (this.resultTimer <= 0) this.showResult();
    }
    this.stage.render(t.dt, t.time);
  }

  private pourLevel(): number {
    // Follows the grains that actually moved: silent once the picture has settled, even with buckets on the belt.
    return Math.min(1, Math.sqrt(this.play.game.sand.flow / 1500));
  }
}
