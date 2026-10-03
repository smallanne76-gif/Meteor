// Audio engine: buses, procedural reverb spaces, HRTF positional sources with occlusion, SFX dispatch, ambience, music.
import * as THREE from 'three';
import { SynthKit, rr } from './synth.js';
import { Voice } from './voice.js';
import { Music } from './music.js';
import { Ambience } from './ambience.js';
import { settings } from '../core/settings.js';
import { clamp, damp } from '../core/util.js';

const R = Math.random;

function makeIR(ctx, { seconds = 1.5, decay = 4, pre = 0.01, damp = 0.35, density = 1, bright = 1 }) {
  const sr = ctx.sampleRate, len = Math.floor(seconds * sr);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let y = 0;
    const preS = Math.floor(pre * sr * (c ? 1.13 : 1));
    for (let i = preS; i < len; i++) {
      const t = (i - preS) / sr;
      const amp = Math.exp(-t * decay);
      const k = Math.max(0.04, bright * (1 - t * damp * 1.2));       // one-pole lowpass that darkens over time
      const n = (R() * 2 - 1);
      y += (n - y) * k;
      d[i] = y * amp * (R() < density ? 1 : 0.2);
    }
    // early reflections
    for (let e = 0; e < 8; e++) { const at = preS + Math.floor((0.004 + R() * 0.05) * sr); if (at < len) d[at] += (R() > 0.5 ? 1 : -1) * (0.5 - e * 0.05); }
    // fade the tail end
    const f = Math.min(len >> 3, 4000); for (let i = 0; i < f; i++) d[len - 1 - i] *= i / f;
  }
  return buf;
}

export const SPACES = {
  outdoor: { seconds: 1.4, decay: 4.6, pre: 0.02, damp: 0.9, wet: 0.16, bright: 0.8 },
  forest: { seconds: 2.0, decay: 3.0, pre: 0.03, damp: 0.8, wet: 0.2, bright: 0.7, density: 0.6 },
  cabin: { seconds: 0.7, decay: 8.5, pre: 0.005, damp: 0.5, wet: 0.2, bright: 0.9 },
  room: { seconds: 0.9, decay: 6.5, pre: 0.006, damp: 0.55, wet: 0.22, bright: 0.9 },
  hall: { seconds: 1.8, decay: 3.6, pre: 0.01, damp: 0.5, wet: 0.26, bright: 0.9 },
  cellar: { seconds: 3.4, decay: 2.1, pre: 0.012, damp: 0.7, wet: 0.38, bright: 0.7 },
  ice: { seconds: 3.6, decay: 1.8, pre: 0.02, damp: 0.25, wet: 0.34, bright: 1.0 },
  dream: { seconds: 4.2, decay: 1.5, pre: 0.03, damp: 0.4, wet: 0.5, bright: 0.9 },
  summer: { seconds: 1.0, decay: 6.0, pre: 0.02, damp: 0.8, wet: 0.12, bright: 0.9 },
};

export class AudioEngine {
  /** ctx may be any BaseAudioContext (an OfflineAudioContext in tests) */
  constructor(game, ctx) {
    this.game = game;
    this.ctx = ctx || new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.kit = new SynthKit(c);
    this.voice = new Voice(this.kit);

    // ---- graph ----
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -9; this.comp.knee.value = 12; this.comp.ratio.value = 6; this.comp.attack.value = 0.004; this.comp.release.value = 0.25;
    this.limiter = c.createDynamicsCompressor(); this.limiter.threshold.value = -1.5; this.limiter.knee.value = 0; this.limiter.ratio.value = 20; this.limiter.attack.value = 0.001; this.limiter.release.value = 0.08;
    this.master.connect(this.comp); this.comp.connect(this.limiter); this.limiter.connect(c.destination);
    this.buses = {};
    for (const n of ['music', 'sfx', 'ambience', 'voice']) { const g = c.createGain(); g.connect(this.master); this.buses[n] = g; }
    // pause/duck stage between buses and master for muffling (breath-hold, hiding, closed eyes)
    this.muffle = c.createBiquadFilter(); this.muffle.type = 'lowpass'; this.muffle.frequency.value = 22000; this.muffle.Q.value = 0.5;
    this.master.disconnect(); this.master.connect(this.muffle); this.muffle.connect(this.comp);
    this.duck = { music: 1, amb: 1, sfx: 1 };

    // reverb (two convolvers for crossfading spaces)
    this.reverbIn = c.createGain(); this.reverbIn.gain.value = 1;
    this.convs = [c.createConvolver(), c.createConvolver()]; this.convGain = [c.createGain(), c.createGain()]; this.convGain[0].gain.value = 0; this.convGain[1].gain.value = 0;
    this.reverbOut = c.createGain(); this.reverbOut.gain.value = 1;
    this.convs.forEach((cv, i) => { this.reverbIn.connect(cv); cv.connect(this.convGain[i]); this.convGain[i].connect(this.reverbOut); });
    this.reverbOut.connect(this.master);
    this.irCache = {}; this.activeConv = 0; this.space = null; this.spaceName = '';
    this.setSpace('outdoor', 0);

    this.music = new Music(this);
    this.amb = new Ambience(this);
    this.sources = new Set();
    this.lis = { pos: new THREE.Vector3(), fwd: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0) };
    this.paused = false; this.clock = 0;
    this.breathMuffle = 0; this.muffleTarget = 22000;
    this.applyVolumes();
    this._bind();
  }

  _bind() {
    const g = this.game;
    g.on('step', (e) => this.footstep(e));
    g.on('breath', (b) => { if (this.breathOn !== false) this.breath(b); });
    g.on('gasp', () => this.sfx('gasp', { vol: 0.8 }));
    g.on('breathHold', (on) => { this.muffleTarget = on ? 1800 : 22000; });
    g.on('land', (s) => this.sfx('thud', { vol: clamp(s / 8, 0.2, 0.7), f: 60 }));
    this.heartT = 0;
  }

  async resume() { if (this.ctx.state === 'suspended' && this.ctx.resume) { try { await this.ctx.resume(); } catch (e) { /* ignore */ } } }
  setPaused(p) { this.paused = p; if (this.ctx.suspend && this.ctx.state !== 'closed') { p ? this.ctx.suspend() : this.ctx.resume(); } }

  applyVolumes() {
    const t = this.ctx.currentTime, s = settings;
    this.master.gain.setTargetAtTime(s.get('volMaster') * 0.9, t, 0.05);
    this.buses.music.gain.setTargetAtTime(s.get('volMusic') * this.duck.music, t, 0.1);
    this.buses.sfx.gain.setTargetAtTime(s.get('volSfx') * this.duck.sfx, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(s.get('volAmbience') * this.duck.amb, t, 0.1);
    this.buses.voice.gain.setTargetAtTime(s.get('volVoice'), t, 0.05);
  }
  setDuck(o) { Object.assign(this.duck, o); this.applyVolumes(); }

  // ---- reverb spaces --------------------------------------------------------------------------------------------
  setSpace(name, fade = 1.2) {
    if (this.spaceName === name) return; const sp = SPACES[name] || SPACES.room; this.spaceName = name;
    const c = this.ctx; if (!this.irCache[name]) this.irCache[name] = makeIR(c, sp);
    const next = 1 - this.activeConv; const t = c.currentTime;
    this.convs[next].buffer = this.irCache[name];
    this.convGain[next].gain.cancelScheduledValues(t); this.convGain[next].gain.setValueAtTime(this.convGain[next].gain.value, t); this.convGain[next].gain.linearRampToValueAtTime(sp.wet, t + Math.max(0.01, fade));
    this.convGain[this.activeConv].gain.cancelScheduledValues(t); this.convGain[this.activeConv].gain.setValueAtTime(this.convGain[this.activeConv].gain.value, t); this.convGain[this.activeConv].gain.linearRampToValueAtTime(0, t + Math.max(0.01, fade));
    this.activeConv = next; this.space = sp;
  }

  // ---- positional sources ---------------------------------------------------------------------------------------
  /** returns {input, panner, dispose}; pos is Vector3|[x,y,z]|null (null -> centred, non-positional) */
  out(bus = 'sfx', pos = null, { reverb = 0.5, occlude = true, ref = 1.6, rolloff = 1.25 } = {}) {
    const c = this.ctx, input = c.createGain();
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.3;
    input.connect(lp);
    let node = lp, panner = null;
    const src = { input, lp, panner: null, pos: null, occ: 1, bus, dead: false, send: null };
    if (pos) {
      panner = c.createPanner(); panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'; panner.refDistance = ref; panner.maxDistance = 220; panner.rolloffFactor = rolloff;
      src.pos = new THREE.Vector3(...(Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z]));
      this._setPanner(panner, src.pos);
      lp.connect(panner); node = panner; src.panner = panner;
    }
    node.connect(this.buses[bus]);
    if (reverb > 0) { const send = c.createGain(); send.gain.value = reverb; node.connect(send); send.connect(this.reverbIn); src.send = send; }
    src.dispose = (after = 0.2) => { src.dead = true; setTimeout(() => { try { input.disconnect(); lp.disconnect(); panner && panner.disconnect(); src.send && src.send.disconnect(); } catch (e) { /* ok */ } this.sources.delete(src); }, after * 1000); };
    src.occlude = occlude;
    this._occlude(src, true);
    if (pos) this.sources.add(src);
    return src;
  }
  _setPanner(p, v) { if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z); }
  setSourcePos(src, v) { if (!src.pos) return; src.pos.copy(v); this._setPanner(src.panner, v); }
  _occlude(src, instant = false) {
    if (!src.pos || !src.occlude) return;
    const g = this.game, ear = this.lis.pos;
    const dist = ear.distanceTo(src.pos);
    let blocked = false;
    if (g.collision && dist > 0.8) blocked = !g.collision.los(ear, src.pos, (it) => it.rayBlock);
    const target = blocked ? 650 : clamp(18000 / (1 + dist * 0.05), 1500, 20000);
    const t = this.ctx.currentTime;
    if (instant) src.lp.frequency.value = target; else src.lp.frequency.setTargetAtTime(target, t, 0.12);
    src.occ = blocked ? 0.55 : 1; src.input.gain.setTargetAtTime(src.occ, t, 0.1);
  }

  // ---- generic one-shots ----------------------------------------------------------------------------------------
  /** play a recipe: sfx('door_open', {pos, vol}) */
  sfx(name, o = {}) {
    if (this.ctx.state === 'closed') return;
    const bus = o.bus || 'sfx'; const src = this.out(bus, o.pos || null, { reverb: o.reverb ?? 0.5, occlude: o.occlude ?? true });
    const t = this.ctx.currentTime + (o.delay || 0) + 0.005; const d = src.input; const v = o.vol ?? 1; const k = this.kit;
    let dur = 1.5;
    switch (name) {
      case 'click': k.click(d, { t, gain: 0.3 * v }); dur = 0.3; break;
      case 'switch': k.switchClick(d, { t, gain: 0.45 * v }); dur = 0.4; break;
      case 'paper': k.paper(d, { t, gain: v }); dur = 0.8; break;
      case 'photo': k.paper(d, { t, gain: 0.7 * v }); dur = 0.8; break;
      case 'pickup': k.pickup(d, { t, gain: v }); dur = 0.4; break;
      case 'door_open': k.doorOpen(d, { t, gain: v, creaky: o.creaky ?? true }); dur = 2.4; break;
      case 'door_close': k.doorClose(d, { t, gain: v, slam: o.slam }); dur = 1.2; break;
      case 'door_slam': k.doorClose(d, { t, gain: v * 1.2, slam: true }); dur = 1.5; break;
      case 'door_locked': k.rattle(d, { t, gain: 0.5 * v }); k.click(d, { t: t + 0.4, gain: 0.3 * v, f: 1200 }); dur = 1; break;
      case 'drawer': k.drawer(d, { t, gain: v }); dur = 1; break;
      case 'keys': k.keyJingle(d, { t, gain: 0.4 * v }); dur = 0.8; break;
      case 'unlock': k.unlock(d, { t, gain: 0.6 * v }); dur = 0.8; break;
      case 'thud': k.thud(d, { t, gain: 0.6 * v, f: o.f || 70 }); dur = 1.0; break;
      case 'knock': k.knock(d, { t, gain: v, n: o.n || 3 }); dur = 1.2; break;
      case 'glass': k.glassClink(d, { t, gain: 0.4 * v }); dur = 1.2; break;
      case 'ceramic': k.ceramic(d, { t, gain: 0.4 * v }); dur = 0.6; break;
      case 'chair': k.chairScrape(d, { t, gain: v }); dur = 1; break;
      case 'tape': k.tapeClunk(d, { t, gain: v }); dur = 0.5; break;
      case 'match': k.matchStrike(d, { t, gain: v }); dur = 1; break;
      case 'lantern': k.lanternClink(d, { t, gain: v }); dur = 0.8; break;
      case 'creak': k.creak(d, { t, gain: 0.25 * v, dur: o.dur || rr(0.5, 1.2) }); dur = 1.6; break;
      case 'rattle': k.rattle(d, { t, gain: v }); dur = 0.8; break;
      case 'cloth': k.cloth(d, { t, gain: v, dur: o.dur || 0.4 }); dur = 0.8; break;
      case 'ice_pew': k.icePew(d, { t, gain: 0.2 * v, f0: o.f0, dur: o.dur, warm: o.warm }); dur = 3; break;
      case 'ice_boom': k.iceBoom(d, { t, gain: 0.5 * v }); dur = 4; break;
      case 'ice_crack': k.iceCrack(d, { t, gain: 0.7 * v, dur: o.dur || 0.5 }); dur = 3; break;
      case 'wood_crack': k.woodCrack(d, { t, gain: 0.55 * v }); dur = 1.2; break;
      case 'snow_whump': k.snowWhump(d, { t, gain: v }); dur = 1; break;
      case 'splash': k.splash(d, { t, gain: v, big: o.big }); dur = 2; break;
      case 'drip': k.drip(d, { t, gain: 0.2 * v }); dur = 0.5; break;
      case 'owl': k.owl(d, { t, gain: 0.3 * v }); dur = 7; break;
      case 'loon': (o.tremolo ? k.loonTremolo : k.loonWail).call(k, d, { t, gain: 0.25 * v }); dur = 3; break;
      case 'cricket': k.cricket(d, { t, gain: 0.05 * v, n: 3 }); dur = 0.6; break;
      case 'frog': k.frog(d, { t, gain: 0.12 * v }); dur = 0.8; break;
      case 'bird': k.songbird(d, { t, gain: 0.1 * v }); dur = 1.2; break;
      case 'woodpecker': k.woodpecker(d, { t, gain: 0.35 * v }); dur = 0.8; break;
      case 'phone_ring': k.phoneRing(d, { t, gain: 0.45 * v, rings: o.rings || 3 }); dur = (o.rings || 3) * 3.2 + 1; break;
      case 'handset': k.phoneHandset(d, { t, gain: v, up: o.up ?? true }); dur = 0.5; break;
      case 'dialtone': k.dialTone(d, { t, dur: o.dur || 3, gain: 0.08 * v }); dur = (o.dur || 3) + 0.5; break;
      case 'static': k.staticNoise(d, { t, dur: o.dur || 1, gain: 0.2 * v, bright: o.bright || 1 }); dur = (o.dur || 1) + 0.6; break;
      case 'gasp': k.gasp(d, { t, gain: v }); dur = 1.6; break;
      case 'heartbeat': k.heartbeat(d, { t, gain: 0.6 * v }); dur = 0.6; break;
      case 'sob': k.sob(d, { t, gain: v }); dur = 1.4; break;
      case 'wet_step': k.wetStep(d, { t, gain: v }); dur = 0.6; break;
      case 'reel': k.reelSpin(d, { t, dur: o.dur || 1.2, gain: 0.1 * v }); dur = (o.dur || 1.2) + 0.5; break;
      case 'hiss': k.hiss(d, { t, dur: o.dur || 3, gain: 0.03 * v }); dur = (o.dur || 3) + 0.5; break;
      case 'drop': k.drip(d, { t, gain: 0.25 * v }); k.thud(d, { t: t + 0.03, gain: 0.2 * v, f: 140 }); dur = 0.6; break;
      case 'step': k.step(d, o.surface || 'wood', { t, loud: o.loud ?? 0.5 }); dur = 0.7; break;
      case 'match_light': k.matchStrike(d, { t, gain: v }); dur = 1; break;
      default: console.warn('[audio] unknown sfx', name);
    }
    src.dispose(dur + 1.5);
    return src;
  }

  /** a sound that comes from a place in the world */
  at(pos, name, o = {}) { return this.sfx(name, { ...o, pos }); }

  // ---- body & movement -------------------------------------------------------------------------------------------
  footstep(e) {
    if (this.ctx.state === 'closed') return;
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    const src = this.out('sfx', null, { reverb: this.space ? 0.5 : 0.3, occlude: false });
    if (pan) { pan.pan.value = e.side * 0.12; src.lp.disconnect(); src.lp.connect(pan); pan.connect(this.buses.sfx); if (src.send) pan.connect(src.send); }
    const t = this.ctx.currentTime + 0.002;
    this.kit.step(src.input, e.surface, { t, loud: e.loud * (this.game.player.holdingBreath ? 0 : 1), run: e.running });
    src.dispose(1.2);
  }
  breath(b) {
    const src = this.out('sfx', null, { reverb: 0.1, occlude: false }); const t = this.ctx.currentTime;
    const g = this.game.player; this.kit.breath(src.input, { t, fear: b.fear, exert: b.exert, gain: 1.1 });
    src.dispose(2);
  }
  heartbeatLoop(dt, fear) {
    if (fear < 0.35) return; this.heartT -= dt;
    if (this.heartT <= 0) { this.heartT = 1.15 - fear * 0.55; this.sfx('heartbeat', { vol: 0.35 + fear * 0.7 }); }
  }

  /** play a single piano note (for the player at a piano) */
  playNote(midi, vel = 0.7) {
    const c = this.ctx; const node = c.createGain(); node.gain.value = 1.4; node.connect(this.buses.music);
    const rv = c.createGain(); rv.gain.value = 0.4; node.connect(rv); rv.connect(this.reverbIn);
    this.music.piano(node, c.currentTime + 0.01, midi, 2.5, vel); setTimeout(() => { try { node.disconnect(); rv.disconnect(); } catch (e) { /* ok */ } }, 6000);
  }

  // ---- note/recording playback (journal & story) -------------------------------------------------------------------
  playNoteAudio(name) {
    const c = this.ctx, t = c.currentTime + 0.05, src = this.out('voice', null, { reverb: 0.15, occlude: false }), d = src.input;
    const k = this.kit, v = this.voice;
    const phoneBand = () => { const hp = k.filt('highpass', 320, 0.7), lp = k.filt('lowpass', 3200, 0.8); hp.connect(lp); lp.connect(d); return hp; };
    if (name === 'voicemail_corrupt') {
      const ph = phoneBand();
      k.hiss(ph, { t, dur: 12, gain: 0.05 });
      for (let i = 0; i < 6; i++) k.icePew(ph, { t: t + 0.4 + i * rr(0.5, 1.6), gain: 0.06, f0: rr(1500, 3000), dur: rr(0.3, 0.8) });
      v.murmur(ph, { t: t + 4, text: 'Mar. You\'re gonna hate that I\'m calling at', gender: 'm', gain: 0.1, rate: 0.9 });
      k.staticNoise(ph, { t: t + 8, dur: 1.2, gain: 0.35 });
      v.murmur(ph, { t: t + 9.2, text: 'no, listen. Just listen to', gender: 'm', gain: 0.08, rate: 0.9 });
      k.staticNoise(ph, { t: t + 11.6, dur: 1.8, gain: 0.5, bright: 1.6 });
      src.dispose(16);
    } else if (name === 'search_tape') {
      const tp = k.filt('highpass', 230, 0.7), lp = k.filt('lowpass', 4300, 0.7); tp.connect(lp); lp.connect(d);
      k.hiss(tp, { t, dur: 24, gain: 0.045 });
      v.maraCall(tp, { t: t + 1.0, gain: 0.2, n: 4 });
      v.murmur(tp, { t: t + 14.5, text: 'Jo. Please. It\'s me. I\'m still here.', gender: 'f', gain: 0.12, rate: 0.82 });
      k.staticNoise(tp, { t: t + 21.5, dur: 0.6, gain: 0.25 });
      src.dispose(26);
    } else src.dispose(1);
  }

  // ---- per-frame ------------------------------------------------------------------------------------------------
  update(dt) {
    if (this.paused) return;
    const g = this.game, cam = g.camera, c = this.ctx; this.clock += dt;
    // listener
    cam.getWorldPosition(this.lis.pos); cam.getWorldDirection(this.lis.fwd); this.lis.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const L = c.listener, p = this.lis.pos, f = this.lis.fwd, u = this.lis.up;
    if (L.positionX) { const t = c.currentTime; L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t); L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t); L.upX.setValueAtTime(u.x, t); L.upY.setValueAtTime(u.y, t); L.upZ.setValueAtTime(u.z, t); }
    else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    // breath-hold / closed-eyes muffle
    const tgt = g.player.eyesClosed ? 2600 : this.muffleTarget;
    this.muffle.frequency.setTargetAtTime(tgt, c.currentTime, 0.2);
    // occlusion refresh
    this.occT = (this.occT || 0) - dt; if (this.occT <= 0) { this.occT = 0.25; for (const s of this.sources) if (!s.dead) this._occlude(s); }
    this.heartbeatLoop(dt, g.player.holdingBreath ? Math.max(g.player.fear, 0.5) : g.player.fear);
    this.music.update(dt);
    this.amb.update(dt);
  }
  clearChapter() { this.amb.clear(); this.music.stopAll(1.5); this.music.setDread(0); }
}
