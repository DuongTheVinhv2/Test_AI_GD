/**
 * Bảng "Account Tool" để chỉnh level / xu khi test.
 * Mở bằng cách bấm lần lượt các phím trong HOTKEY (mặc định J rồi K rồi L); đóng bằng chuỗi đó hoặc Esc.
 */

/** Chuỗi phím mở bảng, bấm lần lượt (không cần giữ cùng lúc). */
export const HOTKEY = 'jkl';
/** Nếu ngừng bấm quá lâu (ms) thì chuỗi phím bị hủy, phải bấm lại từ đầu. */
const HOTKEY_GAP_MS = 1500;

export interface CheatState {
  level: number;
  unlocked: number;
  coins: number;
  maxLevel: number;
}

export interface CheatApi {
  state(): CheatState;
  goLevel(n: number): void;
  unlockAll(): void;
  setCoins(n: number): void;
  resetSave(): void;
  /** Gọi khi bảng vừa mở (để game tự tạm dừng). */
  opened(): void;
}

const CSS = `
.cheat{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:1000;box-sizing:border-box;
  width:min(360px,calc(100vw - 16px));max-height:calc(100vh - 24px);overflow:auto;padding:8px 10px 10px;
  background:#808080;border:2px solid #4d4d4d;border-radius:4px;box-shadow:0 8px 30px rgba(0,0,0,.55);
  font:600 15px/1.2 system-ui,Segoe UI,Arial,sans-serif;color:#fff;user-select:none;-webkit-user-select:none;touch-action:auto}
.cheat[hidden]{display:none}
.cheat *{box-sizing:border-box;font-family:inherit}
.cheat .bar{display:flex;align-items:center;gap:8px;cursor:grab;margin-bottom:8px}
.cheat .bar:active{cursor:grabbing}
.cheat .ttl{flex:1;text-align:center;font-size:24px;font-weight:800;letter-spacing:.3px;color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.35)}
.cheat .bar .gap{width:36px}
.cheat .x{width:36px;height:24px;border:2px solid #fff;border-radius:3px;background:#e0131c;position:relative;cursor:pointer;padding:0}
.cheat .x::after{content:"";position:absolute;left:7px;right:7px;top:9px;height:4px;border-radius:2px;background:#fff}
.cheat .info{font-size:13px;font-weight:600;color:#f4f4f4;background:rgba(0,0,0,.22);border-radius:3px;padding:6px 8px;margin-bottom:8px;text-align:center}
.cheat .row{display:flex;gap:6px;margin-bottom:8px}
.cheat input{flex:1;min-width:0;height:36px;padding:0 8px;border:2px solid #cfcfcf;border-radius:3px;background:#fff;color:#222;
  font-size:15px;font-weight:700;text-align:center;user-select:text;-webkit-user-select:text;outline:none}
.cheat input::placeholder{color:#aaa;font-style:italic;font-weight:600}
.cheat input:focus{border-color:#ffd23a}
.cheat button.b{flex:1;height:36px;padding:0 8px;border:2px solid #e8e8e8;border-radius:3px;background:#f4f4f4;color:#111;font-size:15px;font-weight:800;cursor:pointer}
.cheat button.b:hover{background:#fff}
.cheat button.b:active{background:#ddd}
.cheat button.b.go{flex:0 0 76px;background:#c9e9ff}
.cheat button.b.warn{background:#ffd0cc}
.cheat .hint{margin-top:2px;font-size:12px;font-weight:600;color:#e9e9e9;text-align:center;opacity:.85}
.cheat .msg{min-height:16px;margin:-2px 0 6px;font-size:13px;font-weight:700;text-align:center;color:#ffe680}
`;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export class CheatPanel {
  private root: HTMLElement;
  private info: HTMLElement;
  private msg: HTMLElement;
  private levelIn: HTMLInputElement;
  private coinsIn: HTMLInputElement;
  private buffer = '';
  private lastKey = 0;
  private msgTimer = 0;

  constructor(private api: CheatApi) {
    const style = make('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = make('div', 'cheat');
    this.root.hidden = true;
    // Không để chuột/chạm trên bảng lọt xuống màn chơi.
    for (const t of ['pointerdown', 'pointerup', 'click', 'wheel']) {
      this.root.addEventListener(t, (e) => e.stopPropagation());
    }

    const bar = make('div', 'bar');
    const title = make('div', 'ttl', 'Account Tool');
    const close = make('button', 'x');
    close.setAttribute('aria-label', 'Close');
    close.onclick = () => this.close();
    bar.append(make('div', 'gap'), title, close);
    this.makeDraggable(bar);

    this.info = make('div', 'info');
    this.msg = make('div', 'msg');

    // Hàng 1: nhập level + Go
    this.levelIn = this.numberInput('Enter Level...');
    const go = make('button', 'b go', 'Go');
    go.onclick = () => this.doGoLevel();
    this.levelIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.doGoLevel();
    });
    const rowLevel = make('div', 'row');
    rowLevel.append(this.levelIn, go);

    // Hàng 2: Prev / Next
    const prev = make('button', 'b', '< Prev level');
    prev.onclick = () => this.step(-1);
    const next = make('button', 'b', 'Next level >');
    next.onclick = () => this.step(1);
    const rowStep = make('div', 'row');
    rowStep.append(prev, next);

    // Hàng 3: nhập xu + Set
    this.coinsIn = this.numberInput('Enter Coins...');
    const setCoins = make('button', 'b go', 'Set');
    setCoins.onclick = () => this.doSetCoins();
    this.coinsIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.doSetCoins();
    });
    const rowCoins = make('div', 'row');
    rowCoins.append(this.coinsIn, setCoins);

    // Hàng 4: mở khóa / xóa save
    const unlock = make('button', 'b', 'Unlock All');
    unlock.onclick = () => {
      this.api.unlockAll();
      this.say('Đã mở khóa tất cả level');
      this.refresh();
    };
    const reset = make('button', 'b warn', 'Reset Save');
    reset.onclick = () => {
      if (!window.confirm('Xóa toàn bộ tiến trình (level, xu, thống kê)?')) return;
      this.api.resetSave();
      this.say('Đã xóa save');
      this.refresh();
    };
    const rowMisc = make('div', 'row');
    rowMisc.append(unlock, reset);

    const hint = make('div', 'hint', `Phím tắt: ${[...HOTKEY].map((c) => c.toUpperCase()).join(' → ')}  (bấm lần lượt để mở/đóng), hoặc Esc để đóng`);

    this.root.append(bar, this.info, rowLevel, rowStep, rowCoins, rowMisc, this.msg, hint);
    document.body.appendChild(this.root);

    // Pha capture để Esc đóng bảng trước, không lọt xuống phần tạm dừng/tiếp tục của game.
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    this.root.hidden = false;
    this.api.opened();
    this.refresh();
  }

  close(): void {
    this.root.hidden = true;
    (document.activeElement as HTMLElement | null)?.blur();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  // ------------------------------------------------------------ nội bộ

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.isOpen) {
      e.stopImmediatePropagation();
      this.close();
      return;
    }
    if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
      this.buffer = '';
      return;
    }
    if (e.key.length !== 1) return;
    const now = performance.now();
    if (now - this.lastKey > HOTKEY_GAP_MS) this.buffer = '';
    this.lastKey = now;
    this.buffer = (this.buffer + e.key.toLowerCase()).slice(-HOTKEY.length);
    if (this.buffer === HOTKEY) {
      this.buffer = '';
      this.toggle();
    }
  }

  private numberInput(placeholder: string): HTMLInputElement {
    const i = make('input');
    i.type = 'number';
    i.inputMode = 'numeric';
    i.min = '0';
    i.placeholder = placeholder;
    return i;
  }

  private readInt(input: HTMLInputElement): number | null {
    const v = input.value.trim();
    if (v === '') return null;
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : null;
  }

  private doGoLevel(): void {
    const s = this.api.state();
    const n = this.readInt(this.levelIn);
    if (n === null) return this.say('Nhập số level trước');
    if (n < 1 || n > s.maxLevel) return this.say(`Level phải từ 1 đến ${s.maxLevel}`);
    this.api.goLevel(n);
    this.levelIn.value = '';
    this.say(`Đã chuyển sang level ${n}`);
    this.refresh();
  }

  private step(d: number): void {
    const s = this.api.state();
    const n = Math.max(1, Math.min(s.maxLevel, s.level + d));
    if (n === s.level) return this.say(d < 0 ? 'Đang ở level đầu' : 'Đang ở level cuối');
    this.api.goLevel(n);
    this.say(`Đã chuyển sang level ${n}`);
    this.refresh();
  }

  private doSetCoins(): void {
    const n = this.readInt(this.coinsIn);
    if (n === null) return this.say('Nhập số xu trước');
    if (n < 0) return this.say('Số xu không được âm');
    this.api.setCoins(n);
    this.coinsIn.value = '';
    this.say(`Đã đặt xu = ${n}`);
    this.refresh();
  }

  private refresh(): void {
    const s = this.api.state();
    this.info.textContent = `Level ${s.level}/${s.maxLevel}  ·  Mở khóa tới ${s.unlocked}  ·  Xu ${s.coins}`;
  }

  private say(text: string): void {
    this.msg.textContent = text;
    window.clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => (this.msg.textContent = ''), 2200);
  }

  /** Kéo thanh tiêu đề để dời bảng. */
  private makeDraggable(handle: HTMLElement): void {
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.x')) return;
      const r = this.root.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      handle.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const x = Math.max(0, Math.min(window.innerWidth - 40, ev.clientX - dx));
        const y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy));
        this.root.style.left = `${x}px`;
        this.root.style.top = `${y}px`;
        this.root.style.transform = 'none';
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }
}
