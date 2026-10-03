// Formant voice synthesis: hummed melodies (Jo's tune), muffled speech murmur (memories), and the Searcher's call.
// There is no voice acting in this game; voices are shapes and rhythms. Words are carried by captions.
import { rr } from './synth.js';
import { settings } from '../core/settings.js';
const R = Math.random;

const FORMANTS = {
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], u: [300, 870, 2240], m: [250, 1000, 2200], n: [250, 1400, 2400],
};
const BW = [80, 90, 120];
export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Voice {
  constructor(kit) { this.kit = kit; this.ctx = kit.ctx; }

  /** one sung/hummed note; returns end time */
  note(dest, { t, midi, dur = 0.5, vowel = 'o', vowel2, gender = 'm', gain = 0.12, vib = 0.006, breath = 0.2, glideTo, attack = 0.06, release = 0.25, hoarse = 0, bendDown = 0 }) {
    const ctx = this.ctx, kit = this.kit;
    const f0 = midiHz(midi), shift = gender === 'f' ? 1.17 : 1.0;
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueAtTime(f0, t);
    if (glideTo !== undefined) src.frequency.exponentialRampToValueAtTime(midiHz(glideTo), t + dur);
    if (bendDown) src.frequency.exponentialRampToValueAtTime(f0 * (1 - bendDown), t + dur + release);
    // vibrato (delayed onset) + jitter
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = rr(4.8, 5.6); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f0 * vib, t + dur * 0.6); lfo.connect(lg); lg.connect(src.frequency);
    if (hoarse) { const jit = ctx.createOscillator(), jg = ctx.createGain(); jit.type = 'sawtooth'; jit.frequency.value = rr(37, 61); jg.gain.value = f0 * 0.02 * hoarse; jit.connect(jg); jg.connect(src.frequency); jit.start(t); jit.stop(t + dur + release + 0.3); }
    const pre = ctx.createBiquadFilter(); pre.type = 'lowpass'; pre.frequency.value = 3200; pre.Q.value = 0.4;
    const out = ctx.createGain(); out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(gain, t + attack); out.gain.setValueAtTime(gain, t + Math.max(attack, dur - 0.04)); out.gain.setTargetAtTime(0, t + dur, release / 3);
    const fa = FORMANTS[vowel] || FORMANTS.o, fb = vowel2 ? FORMANTS[vowel2] : null;
    src.connect(pre);
    const nz = ctx.createBufferSource(); nz.buffer = kit.pink; nz.loop = true; const ng = ctx.createGain(); ng.gain.value = breath * (0.5 + hoarse); nz.connect(ng);
    for (let k = 0; k < 3; k++) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = fa[k] / BW[k] * 0.9;
      bp.frequency.setValueAtTime(fa[k] * shift, t); if (fb) bp.frequency.linearRampToValueAtTime(fb[k] * shift, t + dur * 0.7);
      const fg = ctx.createGain(); fg.gain.value = k === 0 ? 1 : (k === 1 ? 0.6 : 0.28);
      pre.connect(bp); ng.connect(bp); bp.connect(fg); fg.connect(out);
    }
    if (vowel === 'm' || vowel === 'n') { const body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 700; pre.connect(body); const bgn = ctx.createGain(); bgn.gain.value = 0.7; body.connect(bgn); bgn.connect(out); }
    out.connect(dest);
    src.start(t); lfo.start(t); nz.start(t);
    const end = t + dur + release * 2 + 0.2; src.stop(end); lfo.stop(end); nz.stop(end);
    return t + dur;
  }

  /** hum a sequence: notes = [[semitoneOffset|null, beats], ...] */
  hum(dest, { t, notes, root = 50, tempo = 66, gain = 0.1, gender = 'm', vowel = 'm', legato = 0.96 }) {
    const beat = 60 / tempo; let tt = t;
    for (const [off, beats] of notes) {
      const d = beats * beat;
      if (off !== null) this.note(dest, { t: tt, midi: root + off, dur: d * legato, vowel, vowel2: d > beat * 1.5 ? 'u' : undefined, gender, gain, breath: 0.28, attack: 0.09, release: 0.3, vib: 0.007 });
      tt += d;
    }
    return tt;
  }

  /** speech-like murmur: syllables with vowel formants, prosody from punctuation. Not intelligible on purpose. */
  murmur(dest, { t, text, gender = 'm', f0 = null, gain = 0.1, rate = 1, muffle = true }) {
    if (settings.get('voiceMurmur') === false) return; // accessibility: captions only, no synthesised speech under them
    const ctx = this.ctx, kit = this.kit;
    const base = f0 ?? (gender === 'f' ? 205 : 118);
    const out = ctx.createGain(); out.gain.value = 1;
    let node = out;
    if (muffle) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.5; out.connect(lp); node = lp; }
    node.connect(dest);
    const words = text.replace(/<[^>]+>/g, '').split(/\s+/).filter(Boolean);
    let tt = t; let contour = 1.0;
    words.forEach((w, wi) => {
      const clean = w.toLowerCase().replace(/[^a-z']/g, '');
      const vowels = (clean.match(/[aeiouy]+/g) || ['a']);
      const q = /\?$/.test(w), ex = /!$/.test(w), comma = /[,;—-]$/.test(w), end = /[.!?]$/.test(w);
      vowels.forEach((v, vi) => {
        const ch = v[0] === 'y' ? 'i' : v[0];
        const d = rr(0.085, 0.16) / rate;
        const lastSyl = vi === vowels.length - 1;
        const stress = (wi % 3 === 0 && vi === 0) ? 1.12 : 1;
        let hz = base * contour * stress * rr(0.97, 1.04);
        if (q && lastSyl && wi === words.length - 1) hz *= 1.22;
        const midi = 69 + 12 * Math.log2(hz / 440);
        this.note(out, { t: tt, midi, dur: d, vowel: FORMANTS[ch] ? ch : 'a', gender, gain: gain * (ex ? 1.35 : 1) * rr(0.75, 1.0), breath: 0.1, attack: 0.012, release: 0.04, vib: 0.002 });
        // consonant puff
        if (R() < 0.6) kit.burst(out, { t: tt - 0.012, dur: 0.035, gain: gain * 0.35, hp: 3000, bp: 5200, bq: 1 });
        tt += d + rr(0.0, 0.03);
      });
      contour *= 0.985;
      if (comma) { tt += rr(0.12, 0.22); contour = Math.min(1.05, contour * 1.04); }
      else tt += rr(0.03, 0.08) / rate;
      if (end) { tt += rr(0.3, 0.5); contour = 1.02; }
    });
    return tt;
  }

  /** The Searcher's call — "Jo…" — hoarse, stretched, falling a minor third, a little flat at the end. */
  searcherCall(dest, { t, gain = 0.2, near = 0.5, name = 'jo' }) {
    const hoarse = 0.6 + near * 0.8;
    // "Jo" = a short "j" (breath onset) then a long "o" gliding down
    this.kit.burst(dest, { t, dur: 0.14, attack: 0.05, gain: gain * 0.5, bp: 2400, bq: 0.8, hp: 900 });
    const end = this.note(dest, { t: t + 0.08, midi: 66, dur: 1.9, glideTo: 62.6, vowel: 'o', vowel2: 'u', gender: 'f', gain, hoarse, breath: 0.55, attack: 0.18, release: 0.9, vib: 0.012, bendDown: 0.06 });
    // a second, lower, delayed voice (the "stretching")
    this.note(dest, { t: t + 0.32, midi: 54, dur: 1.9, glideTo: 50.7, vowel: 'o', gender: 'f', gain: gain * 0.5, hoarse: hoarse * 1.3, breath: 0.7, attack: 0.3, release: 1.1, vib: 0.01, bendDown: 0.09 });
    // thin icy overtone
    this.kit.tone(dest, { t: t + 0.2, f0: 1980, f1: 1750, dur: 2.0, gain: gain * 0.06, attack: 0.6, release: 1.2, lp: 4000 });
    return end;
  }
  /** Mara on the search tape: the same voice and contour, raw, higher and desperate */
  maraCall(dest, { t, gain = 0.22, n = 3 }) {
    let tt = t;
    for (let i = 0; i < n; i++) {
      this.kit.burst(dest, { t: tt, dur: 0.1, attack: 0.03, gain: gain * 0.6, bp: 2800, bq: 0.8, hp: 1000 });
      this.note(dest, { t: tt + 0.04, midi: 70 - i * 0.4, dur: 0.9 + i * 0.12, glideTo: 66.6 - i * 0.6, vowel: 'o', vowel2: 'u', gender: 'f', gain, hoarse: 0.3 + i * 0.3, breath: 0.4 + i * 0.1, attack: 0.05, release: 0.35, vib: 0.01 });
      tt += 2.0 + i * 0.4;
    }
    return tt;
  }
}
