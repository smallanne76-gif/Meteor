// Keyboard + mouse (pointer-lock) input with action mapping. Also an injection API for automated tests.
import { settings } from './settings.js';

export const ACTIONS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'], crouch: ['KeyC', 'ControlLeft'], interact: ['KeyE', 'Enter'], flashlight: ['KeyF'],
  still: ['Space'], journal: ['Tab', 'KeyJ'], pause: ['Escape', 'KeyP'], recorder: ['KeyQ'], skip: ['Space', 'Enter', 'Escape'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set(); this.pressed = new Set(); this.released = new Set();
    this.mdx = 0; this.mdy = 0; this.buttons = new Set(); this.mpressed = new Set();
    this.locked = false; this.enabled = true;
    this.virtual = new Set();          // injected key codes (tests)
    this.onLockChange = null; this.wheel = 0;

    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      if (e.repeat) { if (this._prevent(e)) e.preventDefault(); return; }
      this.down.add(e.code); this.pressed.add(e.code);
      if (this._prevent(e)) e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.down.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.down.clear(); this.buttons.clear(); });
    addEventListener('mousemove', (e) => { if (this.locked) { this.mdx += e.movementX || 0; this.mdy += e.movementY || 0; } });
    addEventListener('mousedown', (e) => { this.buttons.add(e.button); this.mpressed.add(e.button); });
    addEventListener('mouseup', (e) => { this.buttons.delete(e.button); });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange && this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });
  }
  _prevent(e) { return ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code); }

  lock() { try { const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* headless */ } }
  unlock() { try { document.exitPointerLock && document.exitPointerLock(); } catch (e) { /* ignore */ } }

  isDown(action) { const ks = ACTIONS[action]; return ks.some((k) => this.down.has(k) || this.virtual.has(k)); }
  wasPressed(action) { const ks = ACTIONS[action]; return ks.some((k) => this.pressed.has(k)); }
  wasReleased(action) { const ks = ACTIONS[action]; return ks.some((k) => this.released.has(k)); }
  mouseDown(b = 0) { return this.buttons.has(b); }
  mouseClicked(b = 0) { return this.mpressed.has(b); }

  /** axis [-1,1] */
  axis() {
    let x = 0, y = 0;
    if (this.isDown('forward')) y += 1; if (this.isDown('back')) y -= 1;
    if (this.isDown('right')) x += 1; if (this.isDown('left')) x -= 1;
    return { x, y };
  }
  /** consume look delta (radians scaled by sensitivity) */
  look() {
    const s = 0.0022 * settings.get('mouseSens');
    const out = { x: this.mdx * s, y: this.mdy * s * (settings.get('invertY') ? -1 : 1) };
    this.mdx = 0; this.mdy = 0; return out;
  }
  endFrame() { this.pressed.clear(); this.released.clear(); this.mpressed.clear(); this.wheel = 0; }

  // test helpers
  press(code) { this.down.add(code); this.pressed.add(code); }
  release(code) { this.down.delete(code); this.released.add(code); }
  tap(code) { this.press(code); this.release(code); }
  addLook(dx, dy) { this.mdx += dx; this.mdy += dy; }
}
