// Procedural music. One motif ("Jo's tune") threads the whole game:
//   D F A G F E D …  — seven notes in D Dorian, and a missing eighth: the rising note that goes up like a question.
// It never resolves until the ending, where the eighth note arrives and the harmony turns to D major.
import { rr } from './synth.js';
import { midiHz } from './voice.js';

export const MOTIF = { minor: [0, 3, 7, 5, 3, 2, 0], major: [0, 4, 7, 5, 4, 2, 0], beats: [1, 1, 2, 1, 1, 1, 3], answer: 7 };
const R = Math.random;
const pick = (a) => a[Math.floor(R() * a.length)];

export class Music {
  constructor(engine) {
    this.eng = engine; this.ctx = engine.ctx; this.kit = engine.kit;
    this.bus = engine.buses.music;
    this.playing = {};
    this.dread = 0; this.dreadTarget = 0; this.dreadNodes = null;
  }
  get now() { return this.ctx.currentTime; }

  /** a gain node for a cue so the whole thing can be faded */
  cueNode(name, gain = 1) {
    this.stop(name, 0.4);
    const g = this.ctx.createGain(); g.gain.value = gain; g.connect(this.bus);
    const rv = this.ctx.createGain(); rv.gain.value = 0.55; g.connect(rv); rv.connect(this.eng.reverbIn);
    const h = { node: g, name, timers: [], stopped: false, stop: (fade = 2) => this._stopHandle(h, fade) };
    this.playing[name] = h; return h;
  }
  _stopHandle(h, fade) {
    if (h.stopped) return; h.stopped = true; h.timers.forEach(clearTimeout);
    const t = this.now; try { h.node.gain.cancelScheduledValues(t); h.node.gain.setValueAtTime(h.node.gain.value, t); h.node.gain.linearRampToValueAtTime(0, t + Math.max(0.05, fade)); } catch (e) { /* ok */ }
    setTimeout(() => { try { h.node.disconnect(); } catch (e) { /* ok */ } }, (fade + 1) * 1000);
    if (this.playing[h.name] === h) delete this.playing[h.name];
  }
  stop(name, fade = 2) { const h = this.playing[name]; if (h) h.stop(fade); }
  stopAll(fade = 2) { Object.values(this.playing).forEach((h) => h.stop(fade)); }
  isPlaying(name) { return !!this.playing[name]; }
  fadeTo(name, v, dur = 2) { const h = this.playing[name]; if (!h) return; const t = this.now; h.node.gain.cancelScheduledValues(t); h.node.gain.setValueAtTime(h.node.gain.value, t); h.node.gain.linearRampToValueAtTime(v, t + dur); }

  // ---- instruments ----------------------------------------------------------------------------------------------
  box(dest, t, midi, vel = 0.7) {
    const f = midiHz(midi), ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 1; const lp = this.kit.filt('lowpass', 8500, 0.5); out.connect(lp); lp.connect(dest);
    [[1, 1, 2.2], [2.756, 0.38, 1.0], [5.404, 0.14, 0.45], [8.93, 0.05, 0.2]].forEach(([r, a, d]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r * (1 + (R() - 0.5) * 0.0008);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * vel * 0.18, t + 0.002); g.gain.setTargetAtTime(0, t + 0.003, d / 4.5);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d * 2 + 0.3);
    });
    this.kit.burst(out, { t, dur: 0.012, gain: 0.05 * vel, bp: 6000, bq: 1.5 });
  }
  piano(dest, t, midi, dur = 1.5, vel = 0.6) {
    const f = midiHz(midi), ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 1; const lp = this.kit.filt('lowpass', 1400 + vel * 2600, 0.4); out.connect(lp); lp.connect(dest);
    const decay = 3.2 - (midi - 36) * 0.03;
    [1, 0.52, 0.3, 0.17, 0.09, 0.05].forEach((a, i) => {
      for (const dt of [-2.2, 2.2]) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * (i + 1) * (1 + i * i * 0.00028); o.detune.value = dt;
        const g = ctx.createGain(); const peak = a * vel * 0.16; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.setTargetAtTime(0, t + 0.005, Math.max(0.1, decay / (1 + i * 0.7)) / 3);
        // release when note ends
        g.gain.setTargetAtTime(0, t + dur, 0.12);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + decay + 1.2);
      }
    });
    this.kit.burst(out, { t, dur: 0.05, gain: 0.07 * vel, bp: 900, bq: 0.8, lp: 1800 });
  }
  pluck(dest, t, midi, dur = 1.6, vel = 0.6) {
    const f = midiHz(midi), ctx = this.ctx;
    const out = ctx.createGain(); out.gain.value = 1; const lp = this.kit.filt('lowpass', 3200, 0.5); out.connect(lp); lp.connect(dest);
    const body = this.kit.filt('peaking', 220, 1.2, 4); lp.disconnect(); lp.connect(body); body.connect(dest);
    [[1, 1, 1.4], [2, 0.5, 0.9], [3, 0.34, 0.6], [4, 0.2, 0.4], [5, 0.12, 0.3], [6, 0.08, 0.2]].forEach(([h, a, d]) => {
      const o = ctx.createOscillator(); o.type = h === 1 ? 'triangle' : 'sine'; o.frequency.value = f * h * (1 + h * 0.0003);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * vel * 0.15, t + 0.003); g.gain.setTargetAtTime(0, t + 0.004, d * Math.min(1.3, 2.4 * (80 / f + 0.45)) / 3.5);
      o.connect(g); g.connect(out); o.start(t); o.stop(t + d * 2.5);
    });
    this.kit.burst(out, { t, dur: 0.03, gain: 0.05 * vel, bp: 2200, bq: 1 });
  }
  pad(dest, t, midis, dur = 8, vel = 0.5, bright = 900) {
    const ctx = this.ctx;
    for (const m of midis) {
      for (const [dt, pan] of [[-9, -0.5], [0, 0], [9, 0.5]]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(m); o.detune.value = dt + (R() - 0.5) * 3;
        const lp = this.kit.filt('lowpass', bright, 0.4); const g = ctx.createGain(); const pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pn) pn.pan.value = pan;
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = rr(0.08, 0.2); lg.gain.value = bright * 0.25; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t); lfo.stop(t + dur + 4);
        const a = Math.min(3, dur * 0.35);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.028, t + a); g.gain.setValueAtTime(vel * 0.028, t + Math.max(a, dur - 2)); g.gain.linearRampToValueAtTime(0, t + dur + 1.5);
        o.connect(lp); lp.connect(g); if (pn) { g.connect(pn); pn.connect(dest); } else g.connect(dest);
        o.start(t); o.stop(t + dur + 2);
      }
    }
  }
  strings(dest, t, midis, dur = 6, vel = 0.5, bright = 2400) {
    const ctx = this.ctx;
    for (const m of midis) {
      for (const dt of [-13, -4, 5, 14]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(m); o.detune.value = dt;
        const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = rr(5.0, 5.6); vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(7, t + 1.0); vib.connect(vg); vg.connect(o.detune); vib.start(t); vib.stop(t + dur + 2.5);
        const lp = this.kit.filt('lowpass', bright, 0.5); const pk = this.kit.filt('peaking', 1100, 1.0, 3);
        const g = ctx.createGain(); const a = Math.min(1.6, dur * 0.4);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.02, t + a); g.gain.setValueAtTime(vel * 0.02, t + Math.max(a, dur - 1.2)); g.gain.linearRampToValueAtTime(0, t + dur + 1.4);
        o.connect(lp); lp.connect(pk); pk.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 2);
      }
    }
  }
  cello(dest, t, midi, dur = 4, vel = 0.5) {
    const ctx = this.ctx; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(midi);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = midiHz(midi - 12);
    const vib = ctx.createOscillator(), vg = ctx.createGain(); vib.frequency.value = 5.1; vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(6, t + 0.8); vib.connect(vg); vg.connect(o.detune);
    const lp = this.kit.filt('lowpass', 780, 0.7); const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.07, t + 0.7); g.gain.setValueAtTime(vel * 0.07, t + dur - 0.8); g.gain.linearRampToValueAtTime(0, t + dur + 1);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o2.start(t); vib.start(t); o.stop(t + dur + 1.5); o2.stop(t + dur + 1.5); vib.stop(t + dur + 1.5);
  }
  bell(dest, t, midi, vel = 0.5, long = 5) {
    const f = midiHz(midi), ctx = this.ctx;
    [[1, 1, long], [2.41, 0.5, long * 0.6], [3.77, 0.28, long * 0.4], [5.93, 0.12, long * 0.25]].forEach(([r, a, d]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r; const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * vel * 0.1, t + 0.006); g.gain.setTargetAtTime(0, t + 0.01, d / 4);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + d * 1.8);
    });
  }
  sub(dest, t, midi, dur = 6, vel = 0.5) {
    const ctx = this.ctx; const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = midiHz(midi);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.2, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.2);
  }

  // ---- phrase helpers ---------------------------------------------------------------------------------------------
  /** schedule the motif with an instrument fn(dest,t,midi,dur,vel). returns end time */
  phrase(dest, t, inst, { root = 62, tempo = 60, mode = 'minor', vel = 0.6, winddown = false, answer = false, answerVel = 0.8, swing = 0 }) {
    const beat = 60 / tempo; let tt = t;
    const notes = MOTIF[mode];
    notes.forEach((n, i) => {
      let d = MOTIF.beats[i] * beat;
      if (winddown) { d *= 1 + i * 0.12; }
      inst(dest, tt + (i % 2 ? swing : 0), root + n, d * 1.1, vel * (0.9 + R() * 0.2));
      tt += d;
    });
    if (answer) inst(dest, tt + beat * 0.3, root + MOTIF.answer, beat * 6, answerVel);
    return tt;
  }

  // ---- cues -------------------------------------------------------------------------------------------------------
  /** title / generic music-box loop. Never answers the question: the box winds down before the eighth note. */
  titleBox(opts = {}) {
    const h = this.cueNode('title', opts.gain ?? 0.9); const ctx = this.ctx;
    const loop = () => {
      if (h.stopped) return; const t = this.now + 0.3;
      const box = (d, tt, m, dur, v) => this.box(d, tt, m, v);
      const end = this.phrase(h.node, t, box, { root: 74, tempo: 54, winddown: true, vel: 0.62 });
      // the ghost of the eighth note: a click and a falling half-note, never reached
      this.box(h.node, end + 0.6, 81, 0.12); this.kit.burst(h.node, { t: end + 1.2, dur: 0.02, gain: 0.03, bp: 5000, bq: 2 });
      this.pad(h.node, t, [50, 57, 64, 65], 20, 0.5, 700);
      h.timers.push(setTimeout(loop, 30000));
    }; loop(); return h;
  }
  /** warm memory underscore: felt piano + pad in D (Dorian→ major colour) */
  memory(opts = {}) {
    const h = this.cueNode('memory', opts.gain ?? 1);
    const loop = () => {
      if (h.stopped) return; const t = this.now + 0.2;
      this.pad(h.node, t, [50, 57, 62, 66], 18, 0.55, 1100); this.pad(h.node, t + 9, [47, 54, 59, 62], 10, 0.5, 1000);
      const p = (d, tt, m, dur, v) => this.piano(d, tt, m, dur, v);
      this.phrase(h.node, t + 1.2, p, { root: 62, tempo: 52, mode: opts.major === false ? 'minor' : 'major', vel: 0.5 });
      h.timers.push(setTimeout(loop, 20000));
    }; loop(); return h;
  }
  /** the music box alone (a few notes) used for scares & clues */
  boxPhrase(opts = {}) { const h = this.cueNode(opts.name || 'boxphrase', 1); const box = (d, tt, m, dur, v) => this.box(d, tt, m, v); const end = this.phrase(h.node, this.now + 0.1, box, { root: opts.root ?? 74, tempo: opts.tempo ?? 58, winddown: opts.winddown ?? true, vel: opts.vel ?? 0.6 }); h.timers.push(setTimeout(() => h.stop(0.5), (end - this.now + 6) * 1000)); return end - this.now; }
  pianoPhrase(opts = {}) { const h = this.cueNode(opts.name || 'pianophrase', 1); const p = (d, tt, m, dur, v) => this.piano(d, tt, m, dur, v); const end = this.phrase(h.node, this.now + 0.1, p, { root: opts.root ?? 62, tempo: opts.tempo ?? 54, mode: opts.mode || 'minor', vel: opts.vel ?? 0.55, answer: !!opts.answer }); h.timers.push(setTimeout(() => h.stop(1), (end - this.now + 8) * 1000)); return end - this.now; }

  /** summer: plucked guitar + light pad, major, unhurried */
  summer(opts = {}) {
    const h = this.cueNode('summer', opts.gain ?? 0.9);
    const chords = [[50, 54, 57, 62], [55, 59, 62, 67], [57, 61, 64, 69], [47, 54, 59, 62]];
    let bar = 0;
    const loop = () => {
      if (h.stopped) return; const t0 = this.now + 0.2; const beat = 0.62;
      for (let b = 0; b < 4; b++) {
        const ch = chords[(bar + b) % 4]; const tb = t0 + b * beat * 6;
        [0, 1, 2, 3, 2, 1].forEach((k, i) => this.pluck(h.node, tb + i * beat, ch[k] + (k === 3 ? 12 : 0) + (i > 2 ? 12 : 0), 1.2, 0.5 + R() * 0.15));
        this.pad(h.node, tb, ch.map((m) => m - 12), beat * 6, 0.35, 800);
      }
      // the tune in the top voice, major, once per cycle
      const pl = (d, tt, m, dur, v) => this.pluck(d, tt, m + 12, dur, v);
      if (bar % 4 === 0) this.phrase(h.node, t0 + 2, pl, { root: 62, tempo: 56, mode: 'major', vel: 0.55 });
      bar += 4;
      h.timers.push(setTimeout(loop, beat * 24 * 1000 - 200));
    }; loop(); return h;
  }
  /** thin ice: sparse bells and a bowed low D, microtonal unease */
  thinIce(opts = {}) {
    const h = this.cueNode('thinice', opts.gain ?? 0.85);
    const loop = () => {
      if (h.stopped) return; const t = this.now + 0.2;
      this.cello(h.node, t, 38, 12, 0.5); this.cello(h.node, t + 1, 38.3, 12, 0.35);
      for (let i = 0; i < 5; i++) this.bell(h.node, t + 2 + i * rr(2.2, 4.0), pick([74, 77, 81, 86, 79]) + (R() < 0.3 ? 0.18 : 0), 0.5, 6);
      this.pad(h.node, t, [50, 53, 57, 60], 14, 0.45, 600);
      h.timers.push(setTimeout(loop, 14000));
    }; loop(); return h;
  }
  /** sustained dread bed — level 0..1 is smoothly controlled with setDread() */
  startDread() {
    if (this.dreadNodes) return; const ctx = this.ctx, t = this.now;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(this.bus);
    const rv = ctx.createGain(); rv.gain.value = 0.4; out.connect(rv); rv.connect(this.eng.reverbIn);
    const mk = (type, f, det, lpf, g) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det; const lp = this.kit.filt('lowpass', lpf, 0.6); const gg = ctx.createGain(); gg.gain.value = g; o.connect(lp); lp.connect(gg); gg.connect(out); o.start(t); return { o, gg }; };
    const a = mk('sawtooth', 36.7, 0, 140, 0.5), b = mk('sawtooth', 38.9, 0, 140, 0.4), c = mk('sine', 73.4, 5, 200, 0.35);
    // slow beating + a thin metallic shimmer (ice) fading with level
    const sh1 = mk('sine', 1760, 0, 3000, 0.0), sh2 = mk('sine', 1773, 0, 3000, 0.0);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 3; lfo.connect(lg); lg.connect(a.o.detune); lfo.start(t);
    this.dreadNodes = { out, a, b, c, sh1, sh2 };
  }
  setDread(v) { this.dreadTarget = Math.max(0, Math.min(1, v)); if (v > 0.01) this.startDread(); }
  update(dt) {
    this.dread += (this.dreadTarget - this.dread) * (1 - Math.exp(-0.9 * dt));
    if (this.dreadNodes) {
      const n = this.dreadNodes, t = this.now;
      n.out.gain.setTargetAtTime(this.dread * 0.5, t, 0.2);
      n.sh1.gg.gain.setTargetAtTime(Math.max(0, this.dread - 0.45) * 0.012, t, 0.3); n.sh2.gg.gain.setTargetAtTime(Math.max(0, this.dread - 0.45) * 0.012, t, 0.3);
    }
  }
  /** short, quiet stingers (never loud for the sake of it) */
  sting(kind = 'low', gain = 1) {
    const t = this.now, d = this.bus;
    if (kind === 'low') { this.sub(d, t, 26, 4, 0.9 * gain); this.cello(d, t, 38, 3.5, 0.5 * gain); this.cello(d, t + 0.1, 38.45, 3.5, 0.4 * gain); }
    else if (kind === 'high') { for (let i = 0; i < 3; i++) this.bell(d, t + i * 0.05, 93 + i * 0.4, 0.4 * gain, 3); }
    else if (kind === 'fall') { this.kit.tone(d, { t, f0: 520, f1: 55, dur: 2.4, gain: 0.12 * gain, attack: 0.02, release: 1.2, type: 'sawtooth', lp: 1200 }); this.sub(d, t, 28, 3, 0.8 * gain); }
    else if (kind === 'reveal') { this.pad(d, t, [50, 57, 62, 65], 8, 0.5 * gain, 700); this.bell(d, t + 0.4, 86, 0.4 * gain, 5); }
  }

  // ---- THE ENDING -------------------------------------------------------------------------------------------------
  /** waiting section: soft D minor pad + the seven notes, sparse and slow, looping until the answer arrives */
  finalWait(opts = {}) {
    const h = this.cueNode('final', opts.gain ?? 1);
    const loop = () => {
      if (h.stopped) return; const t = this.now + 0.3;
      this.pad(h.node, t, [50, 57, 60, 64], 16, 0.55, 800);
      const p = (d, tt, m, dur, v) => this.piano(d, tt, m, dur, v);
      this.phrase(h.node, t + 2, p, { root: 62, tempo: 46, mode: 'minor', vel: 0.45 });
      this.sub(h.node, t, 38, 10, 0.4);
      h.timers.push(setTimeout(loop, 17000));
    }; loop(); return h;
  }
  /** the eighth note arrives and everything turns to D major */
  finalAnswer() {
    const old = this.playing.final; if (old) old.stop(3.5);
    const h = this.cueNode('final2', 1); const t = this.now + 0.05; const d = h.node;
    // the answering note (rising A) — piano + strings + bell, then the harmony opens to D major
    this.piano(d, t, 69 + 12, 8, 0.75); this.piano(d, t, 69, 8, 0.6); this.strings(d, t + 0.2, [74, 78, 81], 11, 0.6, 2800); this.bell(d, t + 0.1, 93, 0.5, 8);
    this.pad(d, t + 0.4, [50, 57, 62, 66], 20, 0.7, 1200); this.sub(d, t + 0.4, 38, 16, 0.5);
    this.cello(d, t + 1.2, 50, 10, 0.6);
    // second beat: the full theme in major, strings carrying it, piano beneath
    const t2 = t + 8.5; const beat = 60 / 50;
    const prog = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 55, 59, 62], [45, 52, 57, 61]];
    prog.forEach((ch, i) => { this.pad(d, t2 + i * beat * 4, ch, beat * 4.4, 0.55, 1300); this.cello(d, t2 + i * beat * 4, ch[0] - 0, beat * 4.2, 0.45); });
    const str = (dd, tt, m, dur, v) => this.strings(dd, tt, [m], dur, v, 2600);
    const p = (dd, tt, m, dur, v) => this.piano(dd, tt, m, dur, v);
    const end = this.phrase(d, t2, str, { root: 74, tempo: 50, mode: 'major', vel: 0.7, answer: true, answerVel: 0.8 });
    this.phrase(d, t2, p, { root: 62, tempo: 50, mode: 'major', vel: 0.5 });
    // quiet landing: bare piano, D major chord, long ring
    const t3 = t2 + beat * 17;
    this.piano(d, t3, 62, 8, 0.45); this.piano(d, t3 + 0.2, 66, 8, 0.4); this.piano(d, t3 + 0.4, 69, 9, 0.4); this.piano(d, t3 + 0.6, 74, 10, 0.42);
    this.pad(d, t3, [50, 57, 62, 66], 18, 0.5, 1000); this.bell(d, t3 + 2, 90, 0.4, 8);
    h.timers.push(setTimeout(() => this.finalAmbientLoop(), (t3 - this.now + 12) * 1000));
    return t3 - this.now + 14;
  }
  finalAmbientLoop() {
    const h = this.cueNode('final3', 0.8);
    const loop = () => {
      if (h.stopped) return; const t = this.now + 0.2;
      this.pad(h.node, t, [50, 57, 62, 66], 20, 0.45, 1000);
      const p = (d, tt, m, dur, v) => this.piano(d, tt, m, dur, v);
      this.phrase(h.node, t + 3, p, { root: 62, tempo: 44, mode: 'major', vel: 0.38, answer: true, answerVel: 0.45 });
      h.timers.push(setTimeout(loop, 21000));
    }; loop(); return h;
  }
  /** credits: the whole theme once, gently, plus echoes of earlier sounds */
  credits() {
    const h = this.cueNode('credits', 1); const d = h.node; const t = this.now + 0.5;
    const beat = 60 / 52;
    const prog = [[50, 57, 62, 66], [47, 54, 59, 62], [43, 55, 59, 62], [45, 52, 57, 61], [50, 57, 62, 66], [43, 55, 59, 62], [45, 52, 57, 61], [50, 57, 62, 66]];
    for (let r = 0; r < 3; r++) prog.forEach((ch, i) => { const tt = t + (r * 8 + i) * beat * 4; this.pad(d, tt, ch, beat * 4.5, 0.5, 1100); if (r > 0) this.cello(d, tt, ch[0], beat * 4.3, 0.4); });
    const p = (dd, tt, m, dur, v) => this.piano(dd, tt, m, dur, v);
    const bx = (dd, tt, m, dur, v) => this.box(dd, tt, m, v);
    const str = (dd, tt, m, dur, v) => this.strings(dd, tt, [m], dur, v, 2400);
    for (let r = 0; r < 3; r++) {
      const tr = t + r * beat * 32;
      this.phrase(d, tr + beat * 1, p, { root: 62, tempo: 52, mode: 'major', vel: 0.48, answer: true });
      this.phrase(d, tr + beat * 16, r === 0 ? bx : p, { root: r === 0 ? 74 : 62, tempo: 52, mode: 'major', vel: 0.5, answer: true });
      if (r === 2) this.phrase(d, tr + beat * 1, str, { root: 74, tempo: 52, mode: 'major', vel: 0.55, answer: true });
    }
    // ice singing, gently, as harmony: slow bell glissandi
    for (let i = 0; i < 6; i++) this.bell(d, t + 8 + i * 17, [86, 90, 93, 81, 88, 78][i], 0.3, 8);
    return beat * 32 * 3;
  }
}
