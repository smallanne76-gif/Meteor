// THE LOOP: hide and seek with the brother you lost. Close your eyes and follow the hum; "warmer" is the only map.
import * as THREE from 'three';
import { clamp, damp, RNG } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const NAMES = ['w0', 'w1', 'w2', 'e0', 'e1', 'e2'];

export class LoopPhase {
  constructor(ch) { this.c = ch; this.g = ch.game; this.fired = {}; this.lap = 0; this.tries = 0; this.busy = false; this.correct = 'w1'; this.final = false; this.humTok = 0; this.humLevel = 0.08; this.rng = new RNG(Date.now() % 9973); this.stage = 0; }

  think(t, o = {}) { return this.g.ui.say(t, { speaker: 'MARA', style: 'thought', ...o }); }
  jo(t, o = {}) { const g = this.g; const src = g.audio.out('voice', this.doorPos(this.correct), { reverb: 0.6, ref: 1.6, occlude: false }); g.audio.voice.murmur(src.input, { t: g.audio.ctx.currentTime + 0.05, text: t, gender: 'm', gain: 0.17, rate: 0.8, muffle: true }); src.dispose(6); return g.ui.say(t, { speaker: 'JO', style: 'memory', dur: o.dur ?? 2.4, crit: true }).then(() => this.g.wait(o.gap ?? 0.3)); }
  doorPos(n) { const d = this.c.doors[n] || this.c.finalDoor; return V(d.def.x, 1.35, d.def.z); }

  start(opts = {}) {
    const g = this.g, c = this.c, P = g.player;
    g.flags.chapter = 'loop'; g.flags.phase = 'loop'; g.allowEyesClosed = true;
    g.audio.music.stopAll && g.audio.music.stopAll(1); g.audio.music.setDread(0.1); g.audio.music.memory && g.audio.music.memory({ gain: 0.5 });
    P.teleport(0, 0, 11.0, 0); P.pitch = 0.02; P.walkMul = 0.95; P.canRun = false;
    g.fadeTo(0, 3.5, 0xffffff);
    g.ui.chapterCard('IV', 'THE LOOP', '', 4.5);
    this.pickCorrect(true); this.runHum();
    this.intro();
  }

  async intro() {
    const g = this.g;
    await g.wait(5);
    g.ui.objective('');
    await this.think('The hall. The party. Everything’s exactly as it was.'); await g.wait(0.8);
    await this.think('Except there are too many doors.');
    await g.wait(1.5);
    g.ui.hint('still', 'Hold Space — close your eyes, and listen', 9);
    g.saveCheckpoint('loop:start', { x: 0, z: 11 });
  }

  // ---- the game ------------------------------------------------------------------------------------------------------------------
  pickCorrect(first) {
    const prev = this.correct; let n; do { n = NAMES[Math.floor(this.rng.next() * NAMES.length)]; } while (n === prev && !first);
    this.correct = this.lap >= 3 ? 'n' : n; this.final = this.lap >= 3;
  }

  /** Jo hums the seven notes from behind the right door. you can hear him properly only with your eyes shut. */
  async runHum() {
    const g = this.g, a = g.audio; const tok = ++this.humTok;
    const pos = this.doorPos(this.correct); const src = a.out('voice', pos, { reverb: 0.55, ref: 1.3, rolloff: 1.1, occlude: false }); const gn = a.ctx.createGain(); gn.gain.value = 0.08; gn.connect(src.input); this.humNode = gn; this.humSrc = src;
    while (this.humTok === tok && !this.c.disposed) {
      a.voice.hum(gn, { t: a.ctx.currentTime + 0.1, notes: [[0, 1], [3, 1], [7, 2], [5, 1], [3, 1], [2, 1], [0, 2]], root: 50, tempo: 60, gain: 0.3, gender: 'm' });
      await g.wait(10.8);
    }
    try { gn.disconnect(); src.dispose(1); } catch (e) { /* ok */ }
  }

  async doorOpened(name) {
    const g = this.g, c = this.c, P = g.player; if (this.busy) return; if (this.stage === 'booth') return; this.busy = true;
    g.ui.hideHint();
    const ok = name === this.correct;
    if (ok && this.final) { this.booth(); return; }
    // nothing is behind it but the sound of the hall.
    if (ok) {
      this.lap++;
      await this.jo(this.lap === 1 ? 'Warm…' : (this.lap === 2 ? 'Warmer. Warmer…' : 'Hot. Hot hot hot —'), { dur: 2.4, gap: 0.2 });
      g.audio.music.sting('reveal', 0.3);
      if (this.lap === 3) await this.jo('Last one. The big door, at the end.', { dur: 3.2, gap: 0.3 });
    } else {
      g.audio.at(this.doorPos(name), 'thud', { vol: 0.5, f: 80 });
      await this.jo(['Colder.', 'Colder…', 'Not here. Colder.'][this.tries % 3], { dur: 1.8, gap: 0.2 });
    }
    this.tries++; this.stage = Math.min(3, this.tries);
    c.stage = Math.min(3, Math.floor(this.tries / 1.2));
    await g.fadeTo(1, 0.7, 0x000000);
    // back to the start of the same hall: a little worse every time
    for (const d of Object.values(c.doors)) { d.toggle(false); }
    P.teleport(0, 0, 11.0, 0); P.pitch = 0.02; P.vel.set(0, 0, 0);
    this.pickCorrect(false); this.runHum();
    g.audio.setDuck({ amb: 1 }); g.audio.music.setDread(0.1 + c.stage * 0.18);
    await g.fadeTo(0, 1.2); this.busy = false;
    if (ok) g.saveCheckpoint('loop:lap', { x: 0, z: 11 });
    if (this.tries === 2) g.ui.hint('still', 'Eyes shut: you hear him. Eyes open: you only hear the party', 8);
  }

  // ---- the booth ------------------------------------------------------------------------------------------------------------------
  async booth() {
    const g = this.g, c = this.c, P = g.player; this.stage = 'booth'; this.humTok++;
    g.ui.hideHint(); g.allowEyesClosed = false; g.gfx.fx.eyes = 0;
    g.audio.amb.set('silence', { fade: 3 }); g.audio.setDuck({ amb: 0.2 }); g.audio.music.stopAll && g.audio.music.stopAll(3);
    await this.jo('Found me.', { dur: 2.4, gap: 1.6 });
    c.boothLight.on = true; c.boothDesk.on = true; c.recLamp.visible = true;
    await g.wait(1.0);
    await this.think('A booth. The little recording room.'); await g.wait(1.0);
    await this.think('Three-twelve in the morning. I remember the light on the wall. “RECORDING.”');
    g.ui.objective('The phone.');
    this.buzzOn = true; this.buzzT = 0;
    c.phone.userData.t = 0;
    this.phoneIt = g.interact.add({ object: c.phone, radius: 0.35, maxDist: 2.2, label: 'The phone', icon: 'hand', onUse: () => this.reach() });
    this.tries2 = 0;
  }

  async reach() {
    const g = this.g, c = this.c, P = g.player; this.phoneIt.used = false; if (this.reaching) return; this.reaching = true; this.tries2++;
    g.mode = 'locked'; g.ui.setPrompt(null);
    const pw = V(0, 0, 0); c.phone.getWorldPosition(pw); g.hands.reachWorld('R', pw, 1.6, 'reach');
    await g.wait(0.8);
    g.audio.sfx('static', { dur: 0.35, vol: 0.18 }); g.gfx.fx.cold = 0.5; await g.wait(0.4); g.gfx.fx.cold = 0;
    await g.wait(0.8);
    const L = [['It slips. It — goes right through.', 'The phone is right there.'], ['Again.', 'My hand is just… a hand. It’s not here. I’m not here.'], ['Please. Let me pick it up. Just this once.']][Math.min(2, this.tries2 - 1)];
    for (const l of L) { await this.think(l); await g.wait(0.7); }
    g.mode = 'free'; this.reaching = false;
    if (this.tries2 >= 3) this.finishBooth();
  }

  async finishBooth() {
    const g = this.g, c = this.c; this.buzzOn = false; if (this.phoneIt) this.phoneIt.remove();
    g.mode = 'locked';
    await g.wait(1.4);
    await this.think('I watched it ring. I watched his name on the screen.'); await g.wait(1.4);
    await this.think('I turned it over. I said: later.'); await g.wait(2.0);
    c.phoneGlowMat.opacity = 0; c.recLamp.visible = false; c.boothLight.on = false;
    await g.wait(1.2);
    await this.think('“I’m here, Jo.”', { dur: 3.6 }); await g.wait(1.4);
    await this.think('“I’m here. I’m sorry. I’m here.”', { dur: 4 });
    await g.wait(2.5);
    g.ui.say('Missed call — Jo — 3:12 AM', { speaker: '', style: 'memory', dur: 4, crit: true });
    await g.wait(5.0);
    g.flags.loopDone = true; g.saveCheckpoint('loop:done');
    await g.fadeTo(1, 4, 0xffffff);
    if (g.goto) await g.goto('summer'); else g.mode = 'free';
  }

  dispose() { this.humTok++; this.g.allowEyesClosed = false; this.g.gfx.fx.eyes = 0; }

  update(dt) {
    const g = this.g, c = this.c, P = g.player;
    // eyes shut: the hum comes up, the party goes away
    if (this.humNode) { const target = P.eyesClosed ? 1.0 : 0.07; this.humLevel = damp(this.humLevel, target, 4, dt); this.humNode.gain.value = this.humLevel; }
    if (this.buzzOn) {
      this.buzzT -= dt; const ph = c.phone;
      if (this.buzzT <= 0) { this.buzzT = 1.5; const a = g.audio, k = a.kit; const t = a.ctx.currentTime + 0.02; const wp = V(0, 0, 0); ph.getWorldPosition(wp); const src = a.out('sfx', wp, { reverb: 0.2, ref: 1.0 }); k.tone(src.input, { t, f0: 190, f1: 175, dur: 0.55, gain: 0.07, attack: 0.01, release: 0.1, type: 'square', lp: 700, vibRate: 38, vibDepth: 40 }); src.dispose(2); c.phoneGlowMat.opacity = 0.7; }
      c.phoneGlowMat.opacity = damp(c.phoneGlowMat.opacity, 0.12, 3, dt);
      ph.position.x = 0.35 + (this.buzzT > 0.95 ? Math.sin(g.time * 90) * 0.0012 : 0);
    }
  }
}
