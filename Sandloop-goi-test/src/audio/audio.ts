/**
 * Procedural audio. No samples: every sound is synthesised, so the game ships as code only.
 * Sand ASMR = filtered noise whose level follows how much sand is flowing, plus sparse crackle.
 */
const PENTA = [0, 2, 4, 7, 9];

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private reverb!: ConvolverNode;
  /** Reverb sends are gated per category, so muting Sound/Music also silences the reverb tail. */
  private reverbSend!: GainNode;
  private musicReverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private crackleBuf!: AudioBuffer;
  private pourGain!: GainNode;
  private pourFilter!: BiquadFilterNode;
  private crackleGain!: GainNode;
  private pourTarget = 0;
  private pourLevel = 0;
  private lastComplete = -10;
  private combo = 0;
  sound = true;
  music = true;
  haptics = true;
  private musicTimer: number | null = null;
  private nextBeat = 0;
  private beatIndex = 0;
  private musicOn = false;
  private hidden = false;

  /** Must be called from a user gesture the first time. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !this.hidden) void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 14;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sound ? 0.9 : 0;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.music ? 0.34 : 0;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);

    // Reverb from a decaying noise impulse.
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.7);
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = imp.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb.buffer = imp;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = this.sound ? 0.22 : 0;
    this.reverbSend.connect(this.reverb);
    this.musicReverbSend = ctx.createGain();
    this.musicReverbSend.gain.value = this.music ? 0.22 : 0;
    this.musicReverbSend.connect(this.reverb);
    this.reverb.connect(this.master);

    // Noise buffers.
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.crackleBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const cd = this.crackleBuf.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = Math.random() < 0.012 ? (Math.random() * 2 - 1) * (0.4 + Math.random() * 0.6) : 0;

    // Continuous sand layers.
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    n.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    this.pourFilter = ctx.createBiquadFilter();
    this.pourFilter.type = 'bandpass';
    this.pourFilter.frequency.value = 2400;
    this.pourFilter.Q.value = 0.7;
    this.pourGain = ctx.createGain();
    this.pourGain.gain.value = 0;
    n.connect(hp).connect(this.pourFilter).connect(this.pourGain).connect(this.sfxBus);
    this.pourGain.connect(this.reverbSend);
    n.start();
    const c = ctx.createBufferSource();
    c.buffer = this.crackleBuf;
    c.loop = true;
    const chp = ctx.createBiquadFilter();
    chp.type = 'highpass';
    chp.frequency.value = 2600;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    c.connect(chp).connect(this.crackleGain).connect(this.sfxBus);
    c.start();
    if (this.music) this.startMusic();
  }

  setSound(on: boolean): void {
    this.sound = on;
    if (!this.ctx) return;
    this.sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
    this.reverbSend.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.05);
  }

  setMusic(on: boolean): void {
    this.music = on;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(on ? 0.34 : 0, this.ctx.currentTime, 0.2);
    this.musicReverbSend.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.2);
    // Off really stops the scheduler, so nothing (not even the reverb send) is generated while music is off.
    if (on) this.startMusic();
    else this.stopMusic();
  }

  /** The tab went to the background (or came back): stop all audio output while hidden. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private get t(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Called every frame with how much sand is flowing right now (0 to 1). */
  setPour(intensity: number): void {
    this.pourTarget = intensity;
  }

  tick(dt: number): void {
    if (!this.ctx) return;
    this.pourLevel += (this.pourTarget - this.pourLevel) * (1 - Math.exp(-dt * 10));
    const p = this.pourLevel;
    const t = this.ctx.currentTime;
    this.pourGain.gain.setTargetAtTime(p * 0.2, t, 0.03);
    this.pourFilter.frequency.setTargetAtTime(1500 + p * 2600, t, 0.05);
    this.crackleGain.gain.setTargetAtTime(p * 0.7, t, 0.03);
  }

  // ---------------------------------------------------------------- one shots

  private env(g: GainNode, t0: number, attack: number, peak: number, decay: number): void {
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  private tone(freq: number, type: OscillatorType, t0: number, attack: number, peak: number, decay: number, dest: AudioNode, glideTo?: number, detune = 0): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + attack + decay);
    o.detune.value = detune;
    const g = this.ctx.createGain();
    this.env(g, t0, attack, peak, decay);
    o.connect(g).connect(dest);
    o.start(t0);
    o.stop(t0 + attack + decay + 0.05);
  }

  private noiseBurst(t0: number, dur: number, freq: number, q: number, peak: number, dest: AudioNode): void {
    if (!this.ctx) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t0, 0.004, peak, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t0, Math.random());
    s.stop(t0 + dur + 0.05);
  }

  tap(): void {
    this.vibrate(8); // haptics do not depend on the Sound setting
    if (!this.ctx || !this.sound) return;
    const t = this.t;
    this.tone(720, 'sine', t, 0.004, 0.32, 0.11, this.sfxBus, 300);
    this.noiseBurst(t, 0.04, 3200, 1.2, 0.08, this.sfxBus);
  }

  land(): void {
    if (!this.ctx || !this.sound) return;
    const t = this.t;
    this.tone(170, 'sine', t, 0.004, 0.3, 0.14, this.sfxBus, 70);
    this.noiseBurst(t, 0.07, 700, 0.8, 0.14, this.sfxBus);
  }

  reject(): void {
    this.vibrate([20, 40, 20]); // haptics do not depend on the Sound setting
    if (!this.ctx || !this.sound) return;
    const t = this.t;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.connect(this.sfxBus);
    this.tone(210, 'square', t, 0.004, 0.16, 0.07, lp, 170);
    this.tone(190, 'square', t + 0.09, 0.004, 0.16, 0.08, lp, 150);
  }

  reveal(): void {
    this.vibrate(12); // haptics do not depend on the Sound setting
    if (!this.ctx || !this.sound) return;
    const t = this.t;
    this.noiseBurst(t, 0.14, 2600, 0.9, 0.16, this.sfxBus);
    this.noiseBurst(t + 0.03, 0.1, 5200, 1.4, 0.08, this.reverbSend);
    this.tone(880, 'sine', t + 0.02, 0.004, 0.14, 0.3, this.sfxBus);
    this.tone(1318, 'sine', t + 0.06, 0.004, 0.1, 0.34, this.reverbSend);
  }

  thaw(): void {
    if (!this.ctx || !this.sound) return;
    const t = this.t;
    this.noiseBurst(t, 0.18, 4800, 1.6, 0.14, this.sfxBus);
    this.tone(1560, 'triangle', t, 0.003, 0.08, 0.2, this.reverbSend);
  }

  /** A bucket is full: confetti pop and a rising pentatonic pluck. */
  complete(): void {
    this.vibrate([10, 20, 10]); // haptics do not depend on the Sound setting
    if (!this.ctx || !this.sound) return;
    const t = this.t;
    this.combo = t - this.lastComplete < 4 ? Math.min(this.combo + 1, 9) : 0;
    this.lastComplete = t;
    const root = 72 + PENTA[this.combo % 5] + 12 * Math.floor(this.combo / 5);
    const f = midiToHz(root);
    this.tone(f, 'triangle', t, 0.004, 0.3, 0.5, this.sfxBus);
    this.tone(f * 2, 'sine', t, 0.004, 0.1, 0.4, this.reverbSend);
    this.tone(f * 1.5, 'sine', t + 0.07, 0.004, 0.12, 0.45, this.reverbSend);
    this.noiseBurst(t, 0.16, 3600, 0.7, 0.12, this.sfxBus);
    this.noiseBurst(t + 0.02, 0.4, 7000, 1.5, 0.05, this.reverbSend);
  }

  win(): void {
    this.vibrate([20, 40, 20, 40, 80]); // haptics do not depend on the Sound setting
    if (!this.ctx || !this.sound) return;
    const t = this.t + 0.05;
    const notes = [72, 76, 79, 84, 88, 91];
    notes.forEach((m, i) => {
      const f = midiToHz(m);
      this.tone(f, 'triangle', t + i * 0.09, 0.005, 0.26, 0.9, this.sfxBus);
      this.tone(f * 2.003, 'sine', t + i * 0.09, 0.005, 0.07, 0.9, this.reverbSend);
    });
    [60, 64, 67].forEach((m) => this.tone(midiToHz(m), 'sine', t + 0.45, 0.06, 0.12, 1.6, this.sfxBus));
    this.noiseBurst(t + 0.5, 1.2, 6000, 2, 0.06, this.reverbSend);
  }

  lose(): void {
    this.vibrate([60, 40, 60]); // haptics do not depend on the Sound setting
    if (!this.ctx || !this.sound) return;
    const t = this.t + 0.02;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 1.2);
    lp.connect(this.sfxBus);
    [67, 63, 60, 55].forEach((m, i) => this.tone(midiToHz(m), 'triangle', t + i * 0.2, 0.01, 0.22, 0.6, lp));
  }

  warn(): void {
    if (!this.ctx || !this.sound) return;
    const t = this.t;
    this.tone(330, 'square', t, 0.004, 0.08, 0.08, this.sfxBus);
    this.tone(330, 'square', t + 0.14, 0.004, 0.08, 0.08, this.sfxBus);
  }

  click(): void {
    if (!this.ctx || !this.sound) return;
    this.tone(1250, 'sine', this.t, 0.002, 0.14, 0.05, this.sfxBus);
  }

  coin(i = 0): void {
    if (!this.ctx || !this.sound) return;
    const t = this.t;
    const f = midiToHz(84 + (i % 5) * 2);
    this.tone(f, 'square', t, 0.002, 0.07, 0.12, this.sfxBus);
    this.tone(f * 1.5, 'square', t + 0.05, 0.002, 0.06, 0.2, this.sfxBus);
  }

  private vibrate(p: number | number[]): void {
    if (this.haptics && 'vibrate' in navigator) {
      try {
        navigator.vibrate(p);
      } catch {
        /* not supported */
      }
    }
  }

  // ---------------------------------------------------------------- music

  startMusic(): void {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.nextBeat = this.ctx.currentTime + 0.1;
    this.beatIndex = 0;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 120);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.musicOn) return;
    const bpm = 88;
    const beat = 60 / bpm;
    const chords = [
      [60, 64, 67, 71],
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [55, 59, 62, 65],
    ];
    while (this.nextBeat < this.ctx.currentTime + 0.45) {
      const t = this.nextBeat;
      const bar = Math.floor(this.beatIndex / 4) % 4;
      const inBar = this.beatIndex % 4;
      const chord = chords[bar];
      if (inBar === 0) {
        for (const m of chord) {
          for (const dt of [-6, 6]) this.tone(midiToHz(m), 'triangle', t, 0.5, 0.045, beat * 3.6, this.musicBusLP(), undefined, dt);
        }
        this.tone(midiToHz(chord[0] - 12), 'sine', t, 0.02, 0.1, beat * 1.6, this.musicBus);
      }
      // sparse marimba-like notes
      if (Math.random() < 0.55) {
        const m = 72 + PENTA[Math.floor(Math.random() * 5)] + (Math.random() < 0.25 ? 12 : 0);
        this.tone(midiToHz(m), 'sine', t + (Math.random() < 0.3 ? beat / 2 : 0), 0.003, 0.07, 0.5, this.musicBus);
        this.tone(midiToHz(m) * 2, 'sine', t, 0.003, 0.02, 0.2, this.musicReverbSend);
      }
      this.nextBeat += beat;
      this.beatIndex++;
    }
  }

  private lpNode: BiquadFilterNode | null = null;
  private musicBusLP(): AudioNode {
    if (!this.ctx) return this.musicBus;
    if (!this.lpNode) {
      this.lpNode = this.ctx.createBiquadFilter();
      this.lpNode.type = 'lowpass';
      this.lpNode.frequency.value = 1100;
      this.lpNode.connect(this.musicBus);
      this.lpNode.connect(this.musicReverbSend);
    }
    return this.lpNode;
  }
}
