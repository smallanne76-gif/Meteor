// Ambience beds (continuous, noise-based) + randomised positional events per environment.
import * as THREE from 'three';
import { rr } from './synth.js';
import { clamp } from '../core/util.js';

const R = Math.random;

export const AMBIENCE = {
  winterNight: {
    space: 'outdoor', beds: { wind: 0.55, snowhush: 0.35 },
    events: [
      { name: 'owl', every: [50, 130], radius: [40, 110], vol: [0.5, 0.9] },
      { name: 'wood_crack', every: [18, 55], radius: [25, 90], vol: [0.4, 0.9] },
      { name: 'snow_whump', every: [30, 80], radius: [10, 45], vol: [0.3, 0.7] },
      { name: 'icesong', every: [22, 60], radius: [90, 200], vol: [0.5, 1], towards: [0, -160] },
    ],
  },
  forestNight: {
    space: 'forest', beds: { wind: 0.5, snowhush: 0.4 },
    events: [
      { name: 'owl', every: [40, 100], radius: [30, 90], vol: [0.6, 1] },
      { name: 'wood_crack', every: [10, 35], radius: [12, 70], vol: [0.5, 1] },
      { name: 'snow_whump', every: [14, 40], radius: [6, 30], vol: [0.4, 0.9] },
      { name: 'icesong', every: [15, 40], radius: [80, 200], vol: [0.5, 1], towards: [60, -200] },
      { name: 'wet_step', every: [40, 120], radius: [10, 22], vol: [0.5, 0.9], rare: true },
    ],
  },
  lakeNight: {
    space: 'ice', beds: { wind: 0.4, snowhush: 0.2, lakehum: 0.6 },
    events: [
      { name: 'icesong', every: [4, 11], radius: [20, 140], vol: [0.6, 1], here: true },
      { name: 'ice_boom', every: [14, 40], radius: [30, 120], vol: [0.5, 1] },
      { name: 'wood_crack', every: [30, 70], radius: [40, 100], vol: [0.3, 0.6] },
    ],
  },
  house: {
    space: 'cabin', beds: { room: 0.8, wind: 0.5 },
    events: [
      { name: 'creak', every: [6, 18], radius: [2.5, 9], vol: [0.4, 0.9], y: 1.2 },
      { name: 'wood_crack', every: [20, 60], radius: [3, 10], vol: [0.25, 0.5], y: 1.5 },
      { name: 'icesong', every: [30, 80], radius: [40, 80], vol: [0.25, 0.5], towards: [0, -100] },
      { name: 'thud', every: [40, 120], radius: [5, 12], vol: [0.25, 0.5], y: 1.0, rare: true },
    ],
  },
  cellar: {
    space: 'cellar', beds: { drone: 0.7, room: 0.5, water: 0.2 },
    events: [
      { name: 'drip', every: [1.6, 5], radius: [2, 10], vol: [0.5, 1], y: 1.5 },
      { name: 'thud', every: [20, 60], radius: [8, 20], vol: [0.4, 0.8], y: 1 },
      { name: 'creak', every: [12, 30], radius: [6, 16], vol: [0.4, 0.8], y: 1.5 },
      { name: 'icesong', every: [18, 50], radius: [18, 40], vol: [0.25, 0.5], y: 1.5 },
    ],
  },
  loop: {
    space: 'dream', beds: { room: 0.3, hush: 0.5 },
    events: [{ name: 'icesong', every: [6, 16], radius: [8, 25], vol: [0.25, 0.5], here: true }, { name: 'drip', every: [5, 12], radius: [3, 9], vol: [0.3, 0.6] }],
  },
  summer: {
    space: 'summer', beds: { leaves: 0.4, water: 0.35 },
    events: [
      { name: 'bird', every: [1.4, 4.5], radius: [10, 50], vol: [0.5, 1], y: 8 },
      { name: 'loon', every: [35, 80], radius: [60, 140], vol: [0.6, 1], y: 1.5 },
      { name: 'cricket', every: [0.4, 1.4], radius: [4, 25], vol: [0.4, 1], y: 0.3 },
      { name: 'frog', every: [5, 14], radius: [8, 26], vol: [0.4, 1], y: 0.2 },
      { name: 'woodpecker', every: [25, 70], radius: [20, 50], vol: [0.5, 1], y: 6 },
    ],
  },
  dawn: {
    space: 'outdoor', beds: { leaves: 0.2, water: 0.25 },
    events: [
      { name: 'bird', every: [1.8, 5], radius: [10, 50], vol: [0.4, 0.9], y: 8 },
      { name: 'loon', every: [40, 90], radius: [70, 150], vol: [0.5, 0.9], y: 1.5 },
    ],
  },
  silence: { space: 'room', beds: {}, events: [] },
};

export class Ambience {
  constructor(eng) { this.eng = eng; this.ctx = eng.ctx; this.layers = {}; this.cfg = null; this.timers = []; this.name = ''; this.levels = {}; this.gustT = 0; this.gust = 0; this.mute = 1; }

  /** switch environment: crossfades beds, restarts event timers */
  set(name, { fade = 2.5, space = true } = {}) {
    if (this.name === name) return;
    const cfg = typeof name === 'string' ? AMBIENCE[name] : name; if (!cfg) return;
    this.name = typeof name === 'string' ? name : 'custom'; this.cfg = cfg;
    if (space !== false && cfg.space) this.eng.setSpace(cfg.space, fade * 0.6);
    const want = cfg.beds || {};
    for (const k of Object.keys(this.layers)) if (!(k in want)) this._fadeLayer(k, 0, fade);
    for (const [k, v] of Object.entries(want)) { this._ensureLayer(k); this.levels[k] = v; this._fadeLayer(k, v, fade); }
    this.timers = (cfg.events || []).map((e) => ({ e, t: rr(e.every[0], e.every[1]) * (e.first ?? R()) }));
  }
  setBed(k, v, fade = 1.5) { this._ensureLayer(k); this.levels[k] = v; this._fadeLayer(k, v, fade); }
  clear() { for (const k of Object.keys(this.layers)) this._kill(k); this.layers = {}; this.timers = []; this.name = ''; this.cfg = null; }
  _kill(k) { const L = this.layers[k]; if (!L) return; try { L.stopFns.forEach((f) => f()); L.out.disconnect(); } catch (e) { /* ok */ } }

  _fadeLayer(k, v, fade) { const L = this.layers[k]; if (!L) return; L.target = v; L.out.gain.cancelScheduledValues(this.ctx.currentTime); L.out.gain.setTargetAtTime(v * L.scale, this.ctx.currentTime, Math.max(0.05, fade / 3)); }

  _ensureLayer(k) {
    if (this.layers[k]) return; const ctx = this.ctx, kit = this.eng.kit;
    const out = ctx.createGain(); out.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; out.connect(lp); lp.connect(this.eng.buses.ambience);
    const send = ctx.createGain(); send.gain.value = 0.25; lp.connect(send); send.connect(this.eng.reverbIn);
    const L = { out, lp, scale: 1, stopFns: [], nodes: {} };
    const noise = (buf, loop = true) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = loop; s.loopStart = 0; s.start(ctx.currentTime, R() * 2); L.stopFns.push(() => { try { s.stop(); } catch (e) { /* ok */ } }); return s; };
    const chain = (src, nodes) => { let n = src; for (const x of nodes) { n.connect(x); n = x; } return n; };
    if (k === 'wind') {
      L.scale = 0.34;
      const a = noise(kit.pink), b = noise(kit.white), c = noise(kit.brown);
      const bpA = kit.filt('bandpass', 420, 0.6), bpB = kit.filt('bandpass', 1500, 1.4), bpC = kit.filt('bandpass', 160, 2.2);
      const gA = ctx.createGain(), gB = ctx.createGain(), gC = ctx.createGain(); gA.gain.value = 0.7; gB.gain.value = 0.2; gC.gain.value = 0.9;
      const pA = ctx.createStereoPanner(), pB = ctx.createStereoPanner(); pA.pan.value = -0.4; pB.pan.value = 0.45;
      chain(a, [bpA, gA, pA]).connect(out); chain(b, [bpB, gB, pB]).connect(out); chain(c, [bpC, gC]).connect(out);
      L.nodes = { bpA, bpB, bpC, gA, gB, gC, pA, pB };
    } else if (k === 'snowhush') {
      L.scale = 0.07; const a = noise(kit.white); chain(a, [kit.filt('highpass', 5000, 0.5)]).connect(out);
    } else if (k === 'room') {
      L.scale = 0.22; const a = noise(kit.brown); const b = noise(kit.pink); chain(a, [kit.filt('lowpass', 170, 0.5)]).connect(out); const g = ctx.createGain(); g.gain.value = 0.05; chain(b, [kit.filt('bandpass', 900, 0.4), g]).connect(out);
    } else if (k === 'hush') {
      L.scale = 0.1; const a = noise(kit.pink); chain(a, [kit.filt('bandpass', 2400, 0.3)]).connect(out);
    } else if (k === 'water') {
      L.scale = 0.2; const a = noise(kit.pink); const bp = kit.filt('bandpass', 560, 0.7); const am = ctx.createGain(); am.gain.value = 0.55; const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.28; lg.gain.value = 0.35; lfo.connect(lg); lg.connect(am.gain); lfo.start(); L.stopFns.push(() => lfo.stop());
      chain(a, [bp, am]).connect(out);
      const b = noise(kit.white); const am2 = ctx.createGain(); am2.gain.value = 0.2; const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain(); lfo2.frequency.value = 0.19; lg2.gain.value = 0.18; lfo2.connect(lg2); lg2.connect(am2.gain); lfo2.start(); L.stopFns.push(() => lfo2.stop());
      chain(b, [kit.filt('bandpass', 2600, 0.8), am2]).connect(out);
    } else if (k === 'leaves') {
      L.scale = 0.12; const a = noise(kit.pink); const bp = kit.filt('bandpass', 3000, 0.45); const am = ctx.createGain(); am.gain.value = 0.5; const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.35; lfo.connect(lg); lg.connect(am.gain); lfo.start(); L.stopFns.push(() => lfo.stop());
      chain(a, [bp, am]).connect(out);
    } else if (k === 'drone') {
      L.scale = 0.3; const a = noise(kit.brown); chain(a, [kit.filt('lowpass', 95, 0.6)]).connect(out);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 54.5; const og = ctx.createGain(); og.gain.value = 0.18; o.connect(og); og.connect(out); o.start(); L.stopFns.push(() => o.stop());
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 55.6; const og2 = ctx.createGain(); og2.gain.value = 0.12; o2.connect(og2); og2.connect(out); o2.start(); L.stopFns.push(() => o2.stop());
    } else if (k === 'lakehum') {
      L.scale = 0.25; const a = noise(kit.brown); chain(a, [kit.filt('lowpass', 130, 0.6)]).connect(out);
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 36.7; const og = ctx.createGain(); og.gain.value = 0.22; o.connect(og); og.connect(out); o.start(); L.stopFns.push(() => o.stop());
      const b = noise(kit.pink); const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 120; const bp = kit.filt('bandpass', 380, 3); lfo.connect(lg); lg.connect(bp.frequency); lfo.start(); L.stopFns.push(() => lfo.stop()); const bg = ctx.createGain(); bg.gain.value = 0.12; chain(b, [bp, bg]).connect(out);
    }
    this.layers[k] = L;
  }

  /** fridge/lamp/clock hum at a world position (positional, persistent) */
  addHum(pos, { f = 60, gain = 0.02, name = 'hum', clock = false } = {}) {
    const src = this.eng.out('ambience', pos, { reverb: 0.2, ref: 1.2 });
    let h = null; const eng = this.eng;
    if (clock) {
      let n = 0; const tick = () => { if (src.dead) return; eng.kit.click(src.input, { t: eng.ctx.currentTime + 0.01, gain: 0.07, f: n++ % 2 ? 1900 : 2300 }); this._clockT = setTimeout(tick, 1000); }; tick();
    } else h = eng.kit.hum(src.input, { f, gain });
    const rec = { src, stop: () => { h && h.stop(); clearTimeout(this._clockT); src.dispose(0.8); } };
    (this.humList = this.humList || []).push(rec); return rec;
  }
  clearHums() { (this.humList || []).forEach((h) => h.stop()); this.humList = []; }

  update(dt) {
    const g = this.eng.game; if (!this.cfg || this.eng.paused) return;
    const ind = g.indoor || 0;
    // indoors: wind is muffled & quieter
    const w = this.layers.wind;
    if (w) {
      w.lp.frequency.setTargetAtTime(20000 - ind * 19300, this.ctx.currentTime, 0.5);
      this.gustT -= dt;
      if (this.gustT <= 0) {
        this.gustT = rr(2.5, 6); const gust = Math.pow(R(), 1.5); const n = w.nodes, t = this.ctx.currentTime;
        n.gA.gain.setTargetAtTime(0.35 + gust * 0.9, t, 1.2); n.gB.gain.setTargetAtTime(0.05 + gust * 0.5, t, 1.0); n.gC.gain.setTargetAtTime(0.5 + gust * 1.2, t, 1.4);
        n.bpA.frequency.setTargetAtTime(300 + gust * 500, t, 1.5); n.bpB.frequency.setTargetAtTime(1000 + gust * 1400, t, 1.2);
        n.pA.pan.setTargetAtTime(rr(-0.7, 0.2), t, 2); n.pB.pan.setTargetAtTime(rr(-0.2, 0.7), t, 2);
      }
      w.out.gain.setTargetAtTime(this.levels.wind * w.scale * (1 - ind * 0.55), this.ctx.currentTime, 0.4);
    }
    // events
    for (const T of this.timers) {
      T.t -= dt; if (T.t > 0) continue;
      T.t = rr(T.e.every[0], T.e.every[1]);
      if (T.e.rare && R() < 0.4) continue;
      this._fire(T.e);
    }
  }

  _fire(e) {
    const g = this.eng.game, p = g.camera.position;
    const ang = R() * Math.PI * 2; let r = rr(e.radius[0], e.radius[1]);
    let x = p.x + Math.cos(ang) * r, z = p.z + Math.sin(ang) * r;
    if (e.towards) { // bias the source toward a world location (e.g. the lake)
      const k = 0.7; x = x * (1 - k) + (e.towards[0] + (R() - 0.5) * 120) * k; z = z * (1 - k) + (e.towards[1] + (R() - 0.5) * 120) * k;
    }
    const y = (e.y ?? 1.5) + (g.collision.terrain ? 0 : 0);
    const pos = new THREE.Vector3(x, (g.player.pos.y || 0) + y, z);
    const vol = rr(e.vol[0], e.vol[1]);
    if (e.name === 'icesong') return this.iceSong(pos, vol, e.here);
    this.eng.sfx(e.name, { pos, vol, reverb: 0.6 });
  }

  /** a phrase of the lake singing: clustered falling chirps, sometimes a deep boom */
  iceSong(pos, vol = 1, here = false) {
    const n = 2 + Math.floor(R() * 6); const base = rr(1700, 3300);
    for (let i = 0; i < n; i++) {
      const p = pos.clone().add(new THREE.Vector3((R() - 0.5) * 14, 0, (R() - 0.5) * 14));
      this.eng.sfx('ice_pew', { pos: p, vol: vol * rr(0.6, 1), delay: i * rr(0.08, 0.35) + (R() < 0.3 ? 0.6 : 0), f0: base * rr(0.7, 1.4), dur: rr(0.3, 1.0), reverb: 0.8 });
    }
    if (R() < 0.35) this.eng.sfx('ice_boom', { pos, vol: vol * 0.7, delay: rr(0.1, 1.2), reverb: 0.7 });
  }
}
