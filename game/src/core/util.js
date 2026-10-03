// Small shared helpers: math, seeded RNG, noise, tiny event emitter, async timing.
import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a));
export const smooth = (a, b, v) => { const t = invLerp(a, b, v); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
/** frame-rate independent exponential smoothing: damp(current, target, lambda, dt) */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const dampAngle = (a, b, lambda, dt) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * (1 - Math.exp(-lambda * dt));
};
export const rad = (d) => d * Math.PI / 180;
export const deg = (r) => r * 180 / Math.PI;
export const easeInOut = (t) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIn = (t) => t * t * t;
export const wrapAngle = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export class RNG {
  constructor(seed = 1) { this.r = mulberry32(seed); }
  next() { return this.r(); }
  range(a, b) { return a + (b - a) * this.r(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.r() * arr.length)]; }
  chance(p) { return this.r() < p; }
  gauss() { return (this.r() + this.r() + this.r() + this.r() - 2) / 2; }
}

// --- 2D/3D value-gradient noise (deterministic, cheap) ---------------------------------------------------------------
const PERM = (() => { const r = mulberry32(90210); const p = new Uint8Array(512); const b = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  for (let i = 0; i < 512; i++) p[i] = b[i & 255]; return p; })();
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const grad2 = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
export function noise2(x, y) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x), v = fade(y);
  const a = PERM[X] + Y, b = PERM[X + 1] + Y;
  return lerp(lerp(grad2(PERM[a], x, y), grad2(PERM[b], x - 1, y), u),
    lerp(grad2(PERM[a + 1], x, y - 1), grad2(PERM[b + 1], x - 1, y - 1), u), v) * .7; // ~[-1,1]
}
export function fbm2(x, y, oct = 4, gain = .5, lac = 2) {
  let s = 0, a = 1, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= gain; f *= lac; }
  return s / n;
}
export function ridged2(x, y, oct = 4) {
  let s = 0, a = 1, n = 0, f = 1;
  for (let i = 0; i < oct; i++) { s += a * (1 - Math.abs(noise2(x * f, y * f))); n += a; a *= .5; f *= 2; }
  return s / n;
}

export class Emitter {
  constructor() { this._h = new Map(); }
  on(ev, fn) { (this._h.get(ev) || this._h.set(ev, []).get(ev)).push(fn); return () => this.off(ev, fn); }
  off(ev, fn) { const a = this._h.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(ev, ...args) { const a = this._h.get(ev); if (a) for (const fn of [...a]) fn(...args); }
}

// --- timing that respects the game clock (so pause + tests that step manually behave) ---------------------------------
export class Timers {
  constructor() { this.list = []; this.now = 0; }
  /** resolves after `sec` of *game* time */
  wait(sec) { return new Promise((res) => this.list.push({ t: this.now + sec, res })); }
  update(dt) {
    this.now += dt;
    if (!this.list.length) return;
    const due = this.list.filter((x) => x.t <= this.now);
    if (due.length) { this.list = this.list.filter((x) => x.t > this.now); for (const d of due) d.res(); }
  }
  clear() { for (const x of this.list) x.res(); this.list = []; }
}

/** run fn(t01) over `dur` game-seconds; resolves when done */
export function tween(game, dur, fn, ease = (t) => t) {
  return new Promise((res) => {
    let t = 0;
    const h = (dt) => { t += dt; const k = clamp(t / dur); fn(ease(k), k); if (k >= 1) { game.off('update', h); res(); } };
    game.on('update', h);
  });
}

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const hsl = (h, s, l) => new THREE.Color().setHSL(h, s, l);

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of ms) {
        for (const k of Object.keys(m)) { const v = m[k]; if (v && v.isTexture && !v.userData.shared) v.dispose(); }
        if (!m.userData.shared) m.dispose();
      }
    }
  });
}

export const isMobile = () => /Android|iPhone|iPad/i.test(navigator.userAgent);
export const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
