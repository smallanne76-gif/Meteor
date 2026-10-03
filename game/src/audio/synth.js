// Procedural sound recipes. Every function schedules nodes on `ctx` at time `t` into `dest`; nothing is sampled.
// Conventions: gains are linear, frequencies Hz, times seconds.

const R = Math.random;
export const rr = (a, b) => a + (b - a) * R();
const MIN = 0.0001;

export function makeNoise(ctx, kind = 'white', seconds = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    if (kind === 'white') for (let i = 0; i < len; i++) d[i] = R() * 2 - 1;
    else if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) { const w = R() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
    } else { // brown
      let last = 0; for (let i = 0; i < len; i++) { const w = R() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    }
    // crossfade loop seam
    const f = Math.min(2000, len >> 3); for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[len - f + i] * (1 - k) * 0; }
  }
  return buf;
}

export class SynthKit {
  constructor(ctx) {
    this.ctx = ctx;
    this.white = makeNoise(ctx, 'white', 2.5); this.pink = makeNoise(ctx, 'pink', 4); this.brown = makeNoise(ctx, 'brown', 4);
  }
  nbuf(kind) { return this[kind || 'white']; }

  gain(v = 1) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  filt(type, f, q = 1, gain) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (gain !== undefined) b.gain.value = gain; return b; }

  /** noise burst through optional filters with an AD envelope */
  burst(dest, { t, dur = 0.1, attack = 0.003, gain = 0.3, kind = 'white', bp, bq = 1, lp, hp, curve = 2.2, rate = 1 }) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.nbuf(kind); s.playbackRate.value = rate; s.loop = true;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.setTargetAtTime(0, t + attack, dur / (curve + 1));
    let node = s;
    const chain = [];
    if (hp) chain.push(this.filt('highpass', hp, 0.7)); if (bp) chain.push(this.filt('bandpass', bp, bq)); if (lp) chain.push(this.filt('lowpass', lp, 0.7));
    for (const f of chain) { node.connect(f); node = f; }
    node.connect(g); g.connect(dest);
    s.start(t, R() * 2); s.stop(t + dur * 2.2 + attack + 0.1);
    return g;
  }

  /** oscillator with pitch glide and envelope */
  tone(dest, { t, type = 'sine', f0 = 440, f1, dur = 0.3, attack = 0.005, gain = 0.2, release, glide = 'exp', detune = 0, lp, bp, bq = 1, vibRate = 0, vibDepth = 0, hold = 0 }) {
    const ctx = this.ctx, o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(Math.max(1, f0), t);
    if (f1 !== undefined) { if (glide === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur); else o.frequency.linearRampToValueAtTime(f1, t + dur); }
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack);
    const rel = release ?? dur * 0.6;
    if (hold) g.gain.setValueAtTime(gain, t + attack + hold);
    g.gain.setTargetAtTime(0, t + attack + hold, rel / 3);
    let node = o;
    if (vibRate) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = vibRate; lg.gain.value = vibDepth; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + attack + rel * 2); }
    if (bp) { const f = this.filt('bandpass', bp, bq); node.connect(f); node = f; }
    if (lp) { const f = this.filt('lowpass', lp, 0.7); node.connect(f); node = f; }
    node.connect(g); g.connect(dest);
    o.start(t); o.stop(t + attack + hold + dur + rel * 2 + 0.2);
    return { osc: o, gain: g };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // footsteps
  // ---------------------------------------------------------------------------------------------------------------
  step(dest, surface, { t, loud = 0.5, run = false } = {}) {
    const g = 0.28 + loud * 0.75; const v = rr(0.85, 1.15);
    const S = surface;
    if (S === 'snow' || S === 'road' || S === 'snow_deep') {
      const c = S === 'road' ? 0.8 : 1;
      this.burst(dest, { t, dur: 0.16, attack: 0.004, gain: 0.5 * g * c, bp: 1900 * v, bq: 0.7, kind: 'pink' });
      for (let i = 0; i < 7; i++) this.burst(dest, { t: t + 0.01 + R() * 0.12, dur: 0.02, attack: 0.001, gain: (0.16 + R() * 0.1) * g, hp: 3800, bp: 5200 * rr(0.8, 1.2), bq: 1.2 });
      this.tone(dest, { t, f0: 85 * v, f1: 48, dur: 0.12, gain: 0.3 * g, attack: 0.004 });
      if (R() < 0.4) this.burst(dest, { t: t + 0.02, dur: 0.07, attack: 0.008, gain: 0.07 * g, bp: rr(2600, 3600), bq: 9 });
    } else if (S === 'wood' || S === 'dock') {
      this.tone(dest, { t, f0: 120 * v, f1: 62, dur: 0.14, gain: 0.5 * g, attack: 0.003 });
      this.burst(dest, { t, dur: 0.17, gain: 0.34 * g, bp: 240 * v, bq: 1.6, lp: 900, kind: 'pink' });
      this.burst(dest, { t, dur: 0.02, gain: 0.2 * g, bp: 1800, bq: 1 });
      if (S === 'dock') this.tone(dest, { t: t + 0.01, f0: 210 * v, f1: 180, dur: 0.35, gain: 0.07 * g, type: 'triangle', attack: 0.01 });
      if (R() < (loud > 0.4 ? 0.22 : 0.08)) this.creak(dest, { t: t + 0.03, gain: 0.1 * g, dur: rr(0.25, 0.5) });
    } else if (S === 'concrete' || S === 'stone' || S === 'tile') {
      this.burst(dest, { t, dur: 0.05, gain: 0.5 * g, bp: 3200 * v, bq: 0.8 });
      this.tone(dest, { t, f0: 150, f1: 70, dur: 0.1, gain: 0.35 * g });
      this.burst(dest, { t: t + 0.003, dur: 0.14, gain: 0.18 * g, bp: 700, bq: 1.2, lp: 2000 });
      if (S === 'tile') this.tone(dest, { t, f0: 1100 * v, dur: 0.12, gain: 0.04 * g });
    } else if (S === 'gravel') {
      for (let i = 0; i < 12; i++) this.burst(dest, { t: t + R() * 0.14, dur: 0.025, attack: 0.001, gain: (0.2 + R() * 0.2) * g, bp: rr(1500, 4500), bq: 1.1 });
      this.tone(dest, { t, f0: 80, f1: 50, dur: 0.1, gain: 0.2 * g });
    } else if (S === 'ice') {
      this.tone(dest, { t, f0: 95 * v, f1: 55, dur: 0.18, gain: 0.45 * g });
      this.burst(dest, { t, dur: 0.05, gain: 0.35 * g, bp: 3400, bq: 1 });
      this.tone(dest, { t: t + 0.005, f0: rr(1400, 2600), f1: rr(500, 900), dur: 0.35, gain: 0.04 * g, attack: 0.002 });
    } else if (S === 'grass' || S === 'dirt') {
      this.burst(dest, { t, dur: 0.15, gain: 0.22 * g, bp: 1300 * v, bq: 0.5, kind: 'pink' });
      this.tone(dest, { t, f0: 80, f1: 52, dur: 0.1, gain: 0.2 * g });
    } else if (S === 'water') {
      this.burst(dest, { t, dur: 0.3, gain: 0.35 * g, bp: 900, bq: 0.6, lp: 3000 });
      this.tone(dest, { t: t + 0.03, f0: rr(300, 500), f1: rr(700, 1100), dur: 0.12, gain: 0.05 * g });
    } else { // carpet / default
      this.burst(dest, { t, dur: 0.12, gain: 0.2 * g, bp: 500, bq: 0.5, lp: 1200 });
      this.tone(dest, { t, f0: 80, f1: 50, dur: 0.1, gain: 0.25 * g });
    }
    // clothing rustle with the step
    if (loud > 0.25) this.burst(dest, { t: t + 0.01, dur: 0.12, gain: 0.025 * loud, bp: 2400, bq: 0.4, hp: 800 });
  }

  /** wet footprints of the Searcher */
  wetStep(dest, { t, gain = 1 }) {
    this.burst(dest, { t, dur: 0.22, gain: 0.35 * gain, bp: 700, bq: 0.8, lp: 2200, kind: 'pink' });
    this.burst(dest, { t: t + 0.05, dur: 0.1, gain: 0.18 * gain, bp: 1800, bq: 2 });
    this.tone(dest, { t, f0: 90, f1: 50, dur: 0.16, gain: 0.35 * gain });
    this.tone(dest, { t: t + 0.04, f0: rr(380, 520), f1: rr(180, 260), dur: 0.09, gain: 0.04 * gain });   // drip plop
  }

  creak(dest, { t, gain = 0.15, dur = 0.5, f = rr(130, 330), glideTo }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = rr(18, 46); lg.gain.value = f * 0.06; lfo.connect(lg); lg.connect(o.frequency);
    o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(glideTo ?? f * rr(0.7, 1.4), t + dur);
    const bp = this.filt('bandpass', rr(420, 900), 9);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(bp); bp.connect(g); g.connect(dest); o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // doors, objects
  // ---------------------------------------------------------------------------------------------------------------
  doorOpen(dest, { t, creaky = true, heavy = false, gain = 1 }) {
    this.burst(dest, { t, dur: 0.04, gain: 0.35 * gain, bp: 2600, bq: 1.5 });                 // latch
    this.tone(dest, { t: t + 0.03, f0: 160, f1: 120, dur: 0.1, gain: 0.2 * gain });
    if (creaky) { this.creak(dest, { t: t + 0.08, gain: 0.24 * gain, dur: rr(0.7, 1.3), f: rr(110, 190), glideTo: rr(200, 330) }); this.creak(dest, { t: t + 0.12, gain: 0.12 * gain, dur: rr(0.5, 1.0), f: rr(300, 420) }); }
    this.burst(dest, { t: t + 0.05, dur: 0.9, gain: 0.05 * gain, bp: 600, bq: 0.5, kind: 'pink', lp: 1500 });
  }
  doorClose(dest, { t, gain = 1, slam = false }) {
    const k = slam ? 1.6 : 1;
    this.tone(dest, { t, f0: 85, f1: 38, dur: 0.35, gain: 0.7 * gain * k });
    this.burst(dest, { t, dur: 0.22, gain: 0.45 * gain * k, bp: 380, bq: 0.8, lp: 1400, kind: 'pink' });
    this.burst(dest, { t: t + 0.01, dur: 0.03, gain: 0.3 * gain, bp: 2600, bq: 1.5 });
    this.burst(dest, { t: t + 0.06, dur: 0.05, gain: 0.15 * gain, bp: 3000, bq: 3 });         // latch rattle
  }
  click(dest, { t, gain = 0.3, f = 2400 }) { this.burst(dest, { t, dur: 0.012, attack: 0.0005, gain, bp: f, bq: 2 }); this.tone(dest, { t, f0: f * 0.6, dur: 0.02, gain: gain * 0.2, attack: 0.0005 }); }
  switchClick(dest, { t, gain = 0.4 }) { this.click(dest, { t, gain, f: 1800 }); this.click(dest, { t: t + 0.035, gain: gain * 0.7, f: 3200 }); this.tone(dest, { t: t + 0.01, f0: 220, f1: 120, dur: 0.06, gain: gain * 0.25 }); }
  keyJingle(dest, { t, gain = 0.3 }) { for (let i = 0; i < 6; i++) this.tone(dest, { t: t + i * rr(0.025, 0.06), f0: rr(2400, 5200), dur: 0.14, gain: gain * rr(0.25, 0.5), attack: 0.001 }); }
  unlock(dest, { t, gain = 0.5 }) { this.click(dest, { t, gain, f: 1500 }); this.click(dest, { t: t + 0.09, gain: gain * 0.8, f: 2100 }); this.tone(dest, { t: t + 0.1, f0: 420, f1: 300, dur: 0.12, gain: gain * 0.2 }); this.burst(dest, { t: t + 0.12, dur: 0.12, gain: 0.07, bp: 3500, bq: 3 }); }
  paper(dest, { t, gain = 0.4 }) { this.burst(dest, { t, dur: 0.35, attack: 0.04, gain: 0.3 * gain, bp: 3600, bq: 0.6, hp: 1500, kind: 'pink' }); for (let i = 0; i < 6; i++) this.burst(dest, { t: t + R() * 0.3, dur: 0.02, gain: 0.12 * gain, hp: 4500, bp: 6000, bq: 1 }); }
  drawer(dest, { t, gain = 0.6, open = true }) { this.burst(dest, { t, dur: 0.45, attack: 0.05, gain: 0.3 * gain, bp: 340, bq: 0.9, lp: 900, kind: 'pink' }); this.creak(dest, { t, gain: 0.05 * gain, dur: 0.4, f: rr(180, 260) }); this.tone(dest, { t: t + 0.45, f0: 100, f1: 60, dur: 0.1, gain: 0.35 * gain }); }
  thud(dest, { t, gain = 0.6, f = 70 }) { this.tone(dest, { t, f0: f * 1.7, f1: f * 0.5, dur: 0.3, gain }); this.burst(dest, { t, dur: 0.2, gain: gain * 0.5, bp: 300, bq: 0.6, lp: 900, kind: 'pink' }); }
  glassClink(dest, { t, gain = 0.3 }) { const f = rr(2200, 3600); this.tone(dest, { t, f0: f, dur: 0.9, gain: gain * 0.5, attack: 0.0008 }); this.tone(dest, { t, f0: f * 2.31, dur: 0.5, gain: gain * 0.22, attack: 0.0008 }); this.tone(dest, { t, f0: f * 3.9, dur: 0.25, gain: gain * 0.1, attack: 0.0008 }); }
  ceramic(dest, { t, gain = 0.3 }) { const f = rr(1400, 2200); this.tone(dest, { t, f0: f, dur: 0.35, gain: gain * 0.45, attack: 0.0008 }); this.tone(dest, { t, f0: f * 2.7, dur: 0.18, gain: gain * 0.2 }); this.burst(dest, { t, dur: 0.02, gain: gain * 0.3, bp: 3000, bq: 1 }); }
  chairScrape(dest, { t, gain = 0.5 }) { this.burst(dest, { t, dur: 0.6, attack: 0.05, gain: 0.25 * gain, bp: 700, bq: 2.5, kind: 'pink' }); this.creak(dest, { t, gain: 0.08 * gain, dur: 0.5, f: 230 }); }
  knock(dest, { t, gain = 0.8, n = 3 }) { for (let i = 0; i < n; i++) { this.tone(dest, { t: t + i * 0.19, f0: 190, f1: 90, dur: 0.12, gain: 0.6 * gain }); this.burst(dest, { t: t + i * 0.19, dur: 0.05, gain: 0.3 * gain, bp: 900, bq: 1 }); } }
  rattle(dest, { t, gain = 0.4 }) { for (let i = 0; i < 9; i++) this.burst(dest, { t: t + i * 0.045 + R() * 0.02, dur: 0.05, gain: gain * rr(0.2, 0.5), bp: rr(500, 1400), bq: 2 }); }
  cloth(dest, { t, gain = 0.2, dur = 0.4 }) { this.burst(dest, { t, dur, attack: dur * 0.3, gain: 0.2 * gain, bp: 1800, bq: 0.4, hp: 500, kind: 'pink' }); }
  pickup(dest, { t, gain = 0.3 }) { this.cloth(dest, { t, gain, dur: 0.15 }); this.burst(dest, { t: t + 0.04, dur: 0.05, gain: 0.1 * gain, bp: 2200 }); }
  woodSlide(dest, { t, gain = 0.4 }) { this.burst(dest, { t, dur: 0.4, attack: 0.1, gain: 0.3 * gain, bp: 500, bq: 3, kind: 'pink' }); }
  tapeClunk(dest, { t, gain = 0.5 }) { this.thud(dest, { t, gain: 0.5 * gain, f: 110 }); this.click(dest, { t: t + 0.02, gain: 0.3 * gain, f: 1200 }); this.burst(dest, { t: t + 0.04, dur: 0.2, gain: 0.1 * gain, bp: 4000, bq: 2 }); }
  matchStrike(dest, { t, gain = 0.3 }) { this.burst(dest, { t, dur: 0.3, attack: 0.01, gain: 0.35 * gain, hp: 2500, bp: 5000, bq: 0.6 }); this.burst(dest, { t: t + 0.25, dur: 0.6, attack: 0.1, gain: 0.1 * gain, bp: 1800, bq: 0.4, hp: 800 }); }
  lanternClink(dest, { t, gain = 0.3 }) { this.tone(dest, { t, f0: rr(1100, 1500), dur: 0.5, gain: gain * 0.3, attack: 0.001 }); this.tone(dest, { t, f0: rr(2400, 3200), dur: 0.25, gain: gain * 0.15, attack: 0.001 }); this.creak(dest, { t: t + 0.02, gain: gain * 0.12, dur: 0.18, f: 700, glideTo: 520 }); }

  // ---------------------------------------------------------------------------------------------------------------
  // body
  // ---------------------------------------------------------------------------------------------------------------
  breath(dest, { t, fear = 0, exert = 0, cold = 1, gain = 1 }) {
    const f = 700 + fear * 500 + exert * 500; const dur = 1.0 - fear * 0.35 - exert * 0.25;
    const a = 0.05 + fear * 0.08 + exert * 0.14;
    // inhale
    this.burst(dest, { t, dur: dur * 0.4, attack: dur * 0.28, gain: a * gain * 0.7, bp: f, bq: 0.7, kind: 'pink', hp: 300 });
    // exhale
    this.burst(dest, { t: t + dur * 0.5, dur: dur * 0.55, attack: dur * 0.1, gain: a * gain, bp: f * 0.8, bq: 0.6, kind: 'pink', hp: 250 });
  }
  gasp(dest, { t, gain = 1 }) { this.burst(dest, { t, dur: 0.45, attack: 0.15, gain: 0.35 * gain, bp: 1100, bq: 0.6, kind: 'pink', hp: 300 }); this.burst(dest, { t: t + 0.5, dur: 0.7, attack: 0.05, gain: 0.25 * gain, bp: 800, bq: 0.6, kind: 'pink' }); }
  heartbeat(dest, { t, gain = 0.5 }) { this.tone(dest, { t, f0: 62, f1: 40, dur: 0.18, gain: 0.8 * gain, attack: 0.008 }); this.tone(dest, { t: t + 0.17, f0: 55, f1: 36, dur: 0.16, gain: 0.55 * gain, attack: 0.008 }); }
  sob(dest, { t, gain = 0.4 }) { for (let i = 0; i < 3; i++) this.burst(dest, { t: t + i * 0.28, dur: 0.22, attack: 0.04, gain: 0.2 * gain, bp: 900 + i * 60, bq: 1.5, kind: 'pink' }); }

  // ---------------------------------------------------------------------------------------------------------------
  // ice, lake, weather
  // ---------------------------------------------------------------------------------------------------------------
  /** the lake singing: falling "laser" chirps with echo — the most frightening sound in the game, then the most beautiful */
  icePew(dest, { t, gain = 0.2, f0 = rr(1500, 3400), dur = rr(0.25, 0.9), echo = 3, warm = 0 }) {
    const ctx = this.ctx;
    const mix = ctx.createGain(); mix.gain.value = 1;
    const f1 = f0 * rr(0.06, 0.2);
    this.tone(mix, { t, f0, f1, dur, gain, attack: 0.004, release: dur * 0.5 });
    this.tone(mix, { t, f0: f0 * (1.5 + warm * 0.5), f1: f1 * 1.5, dur: dur * 0.8, gain: gain * 0.35, attack: 0.004, release: dur * 0.4 });
    this.tone(mix, { t, f0: f0 * 2.01, f1: f1 * 2.01, dur: dur * 0.5, gain: gain * 0.12, attack: 0.002, release: dur * 0.3 });
    // echo network
    const d = ctx.createDelay(1.0); d.delayTime.value = rr(0.09, 0.19); const fb = ctx.createGain(); fb.gain.value = 0.46; const lpf = this.filt('lowpass', 3600, 0.5);
    mix.connect(d); d.connect(lpf); lpf.connect(fb); fb.connect(d); const wet = ctx.createGain(); wet.gain.value = 0.6; lpf.connect(wet); wet.connect(dest); mix.connect(dest);
    // tail cleanup
    const end = t + dur + 0.5 + echo * 0.35;
    setTimeout(() => { try { mix.disconnect(); d.disconnect(); lpf.disconnect(); fb.disconnect(); wet.disconnect(); } catch (e) { /* ok */ } }, Math.max(100, (end - ctx.currentTime) * 1000 + 200));
  }
  iceBoom(dest, { t, gain = 0.5 }) { this.tone(dest, { t, f0: rr(52, 74), f1: rr(26, 38), dur: rr(1.5, 2.8), gain, attack: 0.03, release: 2 }); this.burst(dest, { t, dur: 1.2, attack: 0.02, gain: 0.12 * gain, bp: 140, bq: 0.8, lp: 400, kind: 'brown' }); }
  iceCrack(dest, { t, gain = 0.7, dur = 0.5 }) {
    const ctx = this.ctx;
    // sharp tearing: noise through a quickly falling bandpass
    const s = ctx.createBufferSource(); s.buffer = this.white; s.loop = true;
    const bp = this.filt('bandpass', 7000, 2.2); bp.frequency.setValueAtTime(7000, t); bp.frequency.exponentialRampToValueAtTime(260, t + dur * 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.003); g.gain.setTargetAtTime(0, t + 0.004, dur * 0.18);
    s.connect(bp); bp.connect(g); g.connect(dest); s.start(t); s.stop(t + dur * 1.5);
    this.tone(dest, { t, f0: 90, f1: 34, dur: dur * 1.4, gain: gain * 0.9, attack: 0.004 });
    for (let i = 0; i < 4; i++) this.burst(dest, { t: t + 0.04 + i * rr(0.04, 0.12), dur: 0.05, gain: gain * rr(0.2, 0.5), bp: rr(1500, 5000), bq: 2 });
    this.icePew(dest, { t: t + 0.05, gain: gain * 0.2, f0: rr(2400, 4200), dur: 0.5 });
  }
  woodCrack(dest, { t, gain = 0.5 }) { this.burst(dest, { t, dur: 0.07, attack: 0.0008, gain, bp: 1800, bq: 0.7 }); this.tone(dest, { t, f0: 180, f1: 70, dur: 0.18, gain: gain * 0.7 }); this.burst(dest, { t: t + 0.05, dur: 0.5, gain: gain * 0.15, bp: 900, bq: 1, lp: 2500, kind: 'pink' }); }
  snowWhump(dest, { t, gain = 0.4 }) { this.tone(dest, { t, f0: 70, f1: 38, dur: 0.5, gain: 0.5 * gain, attack: 0.02 }); this.burst(dest, { t, dur: 0.5, attack: 0.03, gain: 0.3 * gain, bp: 400, bq: 0.6, lp: 900, kind: 'pink' }); }
  splash(dest, { t, gain = 0.6, big = false }) { this.burst(dest, { t, dur: big ? 1.4 : 0.5, attack: 0.01, gain: 0.6 * gain, bp: 1400, bq: 0.4, kind: 'pink' }); this.tone(dest, { t, f0: 160, f1: 50, dur: big ? 1 : 0.3, gain: 0.5 * gain }); for (let i = 0; i < 8; i++) this.tone(dest, { t: t + 0.05 + R() * 0.7, f0: rr(500, 1400), f1: rr(900, 2400), dur: 0.08, gain: 0.04 * gain }); }
  drip(dest, { t, gain = 0.2 }) { const f = rr(500, 1100); this.tone(dest, { t, f0: f, f1: f * 1.8, dur: 0.07, gain, attack: 0.001 }); this.tone(dest, { t, f0: f * 2.6, f1: f * 3.4, dur: 0.04, gain: gain * 0.2, attack: 0.001 }); }

  // ---------------------------------------------------------------------------------------------------------------
  // creatures (real ones) – owls, loons, crickets, frogs, birds
  // ---------------------------------------------------------------------------------------------------------------
  owl(dest, { t, gain = 0.25, f = rr(360, 430) }) {
    // barred owl: "who cooks for you, who cooks for you-all"
    const pat = [[0, 0.16], [0.3, 0.16], [0.82, 0.14], [1.1, 0.14], [1.4, 0.14], [1.75, 0.5]];
    const pat2 = [[2.6, 0.16], [2.9, 0.16], [3.4, 0.14], [3.7, 0.14], [4.0, 0.14], [4.35, 0.8]];
    [...pat, ...pat2].forEach(([dt, d], i) => {
      const last = i === pat.length - 1 || i === pat.length + pat2.length - 1;
      this.tone(dest, { t: t + dt, f0: f * (last ? 1.15 : 1), f1: f * (last ? 0.62 : 0.92), dur: d, gain: gain * (last ? 1.1 : 0.9), attack: 0.02, release: d * 0.7, vibRate: last ? 7 : 0, vibDepth: last ? 12 : 0, lp: 1400 });
      this.tone(dest, { t: t + dt, f0: f * 2.02, f1: f * 1.8, dur: d, gain: gain * 0.22, attack: 0.02, release: d * 0.6 });
    });
  }
  loonWail(dest, { t, gain = 0.2 }) {
    const f = rr(560, 680);
    this.tone(dest, { t, f0: f, f1: f * 1.55, dur: 1.5, gain, attack: 0.25, release: 1.2, glide: 'lin', vibRate: 5.5, vibDepth: 8 });
    this.tone(dest, { t, f0: f * 2, f1: f * 3.1, dur: 1.5, gain: gain * 0.5, attack: 0.3, release: 1.0, glide: 'lin' });
    this.tone(dest, { t, f0: f * 3, f1: f * 4.7, dur: 1.4, gain: gain * 0.2, attack: 0.3, release: 1.0, glide: 'lin' });
  }
  loonTremolo(dest, { t, gain = 0.2 }) { for (let i = 0; i < 9; i++) { const f = 760 + Math.sin(i * 0.7) * 120; this.tone(dest, { t: t + i * 0.13, f0: f, f1: f * 1.2, dur: 0.12, gain, attack: 0.01, release: 0.07 }); this.tone(dest, { t: t + i * 0.13, f0: f * 2.1, dur: 0.1, gain: gain * 0.35, attack: 0.01 }); } }
  cricket(dest, { t, gain = 0.05, f = rr(3900, 4700), n = 3 }) {
    for (let i = 0; i < n; i++) {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = this.ctx.createGain(); g.gain.value = 0;
      const t0 = t + i * 0.085;
      for (let k = 0; k < 4; k++) { g.gain.setValueAtTime(0, t0 + k * 0.016); g.gain.linearRampToValueAtTime(gain, t0 + k * 0.016 + 0.004); g.gain.linearRampToValueAtTime(0, t0 + k * 0.016 + 0.013); }
      o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + 0.1);
    }
  }
  frog(dest, { t, gain = 0.1 }) { const f = rr(220, 300); for (let i = 0; i < 6; i++) this.tone(dest, { t: t + i * 0.07, f0: f, f1: f * 0.9, dur: 0.05, gain, type: 'sawtooth', attack: 0.004, bp: 500, bq: 3 }); }
  songbird(dest, { t, gain = 0.07, f = rr(2800, 4600) }) {
    const n = 3 + Math.floor(R() * 5); let tt = t;
    for (let i = 0; i < n; i++) { const a = f * rr(0.8, 1.3), b = a * rr(0.7, 1.5); this.tone(dest, { t: tt, f0: a, f1: b, dur: rr(0.05, 0.12), gain: gain * rr(0.6, 1), attack: 0.006, release: 0.06 }); tt += rr(0.07, 0.17); }
  }
  woodpecker(dest, { t, gain = 0.3 }) { for (let i = 0; i < 10; i++) this.burst(dest, { t: t + i * 0.055, dur: 0.02, gain: gain * (1 - i * 0.03), bp: 1700, bq: 3 }); }

  // ---------------------------------------------------------------------------------------------------------------
  // electrical / devices
  // ---------------------------------------------------------------------------------------------------------------
  /** continuous hum (returns nodes so the caller can stop) */
  hum(dest, { f = 60, gain = 0.03, buzz = 0.4, t = this.ctx.currentTime }) {
    const ctx = this.ctx; const out = ctx.createGain(); out.gain.value = gain; const oscs = [];
    [1, 2, 3, 4, 6].forEach((h, i) => { const o = ctx.createOscillator(); o.type = h < 3 ? 'sine' : 'sawtooth'; o.frequency.value = f * h; const g = ctx.createGain(); g.gain.value = (1 / (h * 1.1)) * (h > 2 ? buzz : 1); o.connect(g); g.connect(out); o.start(t); oscs.push(o); });
    const lp = this.filt('lowpass', 900, 0.5); out.connect(lp); lp.connect(dest);
    return { stop: (when = ctx.currentTime) => { try { out.gain.setTargetAtTime(0, when, 0.1); oscs.forEach((o) => o.stop(when + 0.6)); } catch (e) { /* ok */ } }, out, oscs };
  }
  phoneRing(dest, { t, gain = 0.4, rings = 3 }) {
    // electromechanical bell: partials ~1.86k / 2.18k / 3.72k amplitude-modulated at ~21 Hz, ~2 s per ring, 3.2 s apart
    const ctx = this.ctx;
    for (let r = 0; r < rings; r++) {
      const t0 = t + r * 3.2;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.02); g.gain.setValueAtTime(gain, t0 + 1.9); g.gain.linearRampToValueAtTime(0, t0 + 2.05);
      const lp = this.filt('lowpass', 4500, 0.7); g.connect(lp); lp.connect(dest);
      [1862, 2175, 3720].forEach((f, i) => {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const am = ctx.createGain(); am.gain.value = 0.5;
        const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 21 + i * 0.7;
        const lg = ctx.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(am.gain);
        const sc = ctx.createGain(); sc.gain.value = i === 2 ? 0.25 : 0.5;
        o.connect(am); am.connect(sc); sc.connect(g);
        lfo.start(t0); o.start(t0); lfo.stop(t0 + 2.2); o.stop(t0 + 2.2);
      });
    }
  }
  phoneHandset(dest, { t, gain = 0.5, up = true }) { this.thud(dest, { t, gain: 0.35 * gain, f: 140 }); this.click(dest, { t: t + 0.02, gain: 0.3 * gain, f: 1600 }); if (up) this.burst(dest, { t: t + 0.05, dur: 0.15, gain: 0.08 * gain, bp: 3000, bq: 1 }); }
  dialTone(dest, { t, dur = 3, gain = 0.1 }) { [350, 440].forEach((f) => this.tone(dest, { t, f0: f, dur, gain, attack: 0.03, release: 0.2, hold: dur - 0.3 })); }
  staticNoise(dest, { t, dur = 1, gain = 0.2, bright = 1 }) { this.burst(dest, { t, dur, attack: 0.02, gain, bp: 2200 * bright, bq: 0.4, hp: 300, curve: 0.2 }); }

  /** soft tape hiss / room tone */
  hiss(dest, { t, dur = 4, gain = 0.03 }) { this.burst(dest, { t, dur, attack: 0.2, gain, hp: 3500, curve: 0.1 }); }
  reelSpin(dest, { t, dur = 1.2, gain = 0.1 }) { this.burst(dest, { t, dur, attack: 0.15, gain, bp: 220, bq: 4, kind: 'brown', curve: 0.2 }); this.burst(dest, { t, dur, attack: 0.15, gain: gain * 0.5, bp: 2600, bq: 2, curve: 0.3 }); }
}
