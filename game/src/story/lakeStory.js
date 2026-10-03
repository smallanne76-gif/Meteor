// THIN ICE: across the frozen lake, under the aurora, to the island in the north bay. Listen: low is thick, high is thin.
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/util.js';
import { LAYOUT } from '../world/halden.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ROUTE = [[4, -74], [14, -120], [2, -165], [-22, -205], [-28, -248]];

export class LakePhase {
  constructor(world) { this.w = world; this.g = world.game; this.disposed = false; this.fired = {}; this.risk = 0; this.lastSafe = { x: 4, z: -63 }; this.safeT = 0; this.probeT = 0; this.listenT = 0; this.arrived = false; this.deaths = 0; }

  async start(opts = {}) {
    const w = this.w, g = this.g, S = w.searcher, P = g.player, L = w.lake;
    g.flags.chapter = 'lake'; g.flags.phase = 'lake';
    w.zones = { lodge: true, yardOnly: false, road: false, trail: false, boathouse: false, lake: true, deck: true };
    w.baseFear = 0.18; w.outsideAmb = 'lakeNight'; w.snowLevel = 0.18; g.setSky('auroraNight'); g.setGrade('nightSnow', false, 1);
    g.audio.amb.set('lakeNight', { fade: 4 }); g.audio.music.stopAll && g.audio.music.stopAll(1); g.audio.music.setDread(0.05);
    // thin ice: five patches across the route (walk around them) and some decoys off the line
    [[10, -96, 7.5], [8, -143, 8.5], [-9, -186, 8.5], [-26, -228, 7.5], [34, -150, 9], [-34, -128, 9], [22, -212, 7], [-6, -112, 6]].forEach(([x, z, r]) => L.addPatch(x, z, r));
    this.patches = L.patches;
    // it waits on the island with its lantern, a warm star across the ice
    S.opts.noHunt = true; S.setPos(LAYOUT.bay.x + 4.5, 0, LAYOUT.bay.z + 8.5, Math.PI); S.setLantern(true); S.show(true); S.state = 'script'; S.sPath = null; S.callT = 12; S.opts.prints = false;
    this.beacon = true;
    if (opts.skipTo === 'island') { P.teleport(LAYOUT.bay.x, LAYOUT.iceY, LAYOUT.bay.z + 16, 0); this.lastSafe = { x: P.pos.x, z: P.pos.z }; }
    else if (!opts.resumeAt) P.teleport(4, 0.2, -63, 0);
    g.hands.hold('L', 'recorder'); g.hands.setPose('L', 'hold');
    g.ui.chapterCard('VI', 'THIN ICE', '', 4.5);
    await g.fadeTo(0, 3);
    g.ui.objective('Cross the ice to the north bay.');
    await g.wait(1.5);
    await w.think('Forty-one centimetres, Dad measured. “Thick enough to land a plane.”'); await g.wait(0.6);
    await w.think('That was the other lake. In the other year.');
    g.ui.hint('still', 'Hold still and listen to the ice', 8);
    g.saveCheckpoint('lake:dock', { x: 4, z: -63 });
  }

  /** the lake answers: three tones ahead, left / centre / right. low = thick, high = thin */
  probe() {
    const g = this.g, P = g.player, w = this.w; const yaw = P.yaw; const out = [];
    const dirs = [Math.PI / 4, 0, -Math.PI / 4]; const t0 = g.audio.ctx.currentTime + 0.05;
    dirs.forEach((da, i) => {
      const a = yaw + da; const px = P.pos.x - Math.sin(a) * 9, pz = P.pos.z - Math.cos(a) * 9; const thin = w.lake.thinAt(px, pz) + w.lake.thinAt(P.pos.x - Math.sin(a) * 5, P.pos.z - Math.cos(a) * 5) * 0.7;
      const pos = V(px, 0.2, pz); const f0 = thin > 0.25 ? 520 + thin * 180 : 98 + i * 3;
      const src = g.audio.out('sfx', pos, { reverb: 0.6, ref: 4 }); const k = g.audio.kit;
      k.tone(src.input, { t: t0 + i * 0.9, f0: f0 * 1.04, f1: f0, dur: 1.2, gain: thin > 0.25 ? 0.12 : 0.18, attack: 0.15, release: 0.7, type: thin > 0.25 ? 'sawtooth' : 'sine', lp: thin > 0.25 ? 1800 : 600, vibRate: thin > 0.25 ? 9 : 3, vibDepth: thin > 0.25 ? 12 : 2 });
      src.dispose(4); out.push(thin);
    });
    return out;
  }

  update(dt) {
    const w = this.w, g = this.g, P = g.player, S = w.searcher, L = w.lake;
    if (this.disposed || this.arrived) return;
    const onIce = L.thinAt(P.pos.x, P.pos.z);
    // listening: holding still for a moment makes the lake answer
    if (P.holdingBreath && g.mode === 'free') { this.listenT += dt; if (this.listenT > 1.1 && this.probeT <= 0) { this.probeT = 6; this.probe(); P.addShake(0.04); } } else this.listenT = 0;
    this.probeT -= dt;
    // thin ice: creaks, then cracks, then the lake takes you
    if (onIce > 0.15) {
      this.risk += dt * onIce * (P.crouching ? 0.28 : (P.running ? 0.9 : 0.5));
      if (!this.fired.warn) { this.fired.warn = true; g.ui.hint('crouch', 'It’s thin. Back away — slowly.', 5); }
      if (Math.random() < dt * (1 + onIce * 5)) g.audio.at(P.pos.clone().add(V(0, 0, 0)), 'ice_crack', { vol: 0.5 + onIce * 0.5 });
      P.addShake(0.02 + onIce * 0.05); P.setFear(clamp(0.4 + onIce * 0.6));
      g.gfx.fx.dread = Math.max(g.gfx.fx.dread, onIce * 0.5);
      if (this.risk > 1) { this.breakThrough(); return; }
    } else {
      this.risk = Math.max(0, this.risk - dt * 0.6);
      g.gfx.fx.dread = damp(g.gfx.fx.dread, 0, 2, dt);
      this.safeT -= dt; if (this.safeT <= 0 && onIce < 0.02) { this.safeT = 2; this.lastSafe = { x: P.pos.x, z: P.pos.z }; }
    }
    // the passive tone: the ice pitch rises as thin ice nears in front of you
    // the beacon: its call travels across the whole lake
    // arrival
    const d = Math.hypot(P.pos.x - LAYOUT.bay.x, P.pos.z - LAYOUT.bay.z);
    if (!this.fired.half && P.pos.z < -160) { this.fired.half = true; this.mid(); }
    if (d < 15 && !this.arrived) { this.arrived = true; this.arrive(); }
  }

  async mid() {
    const w = this.w, g = this.g;
    g.audio.music.thinIce && g.audio.music.thinIce({ gain: 0.8 });
    await w.think('Listen. It isn’t groaning anymore.'); await g.wait(1.2);
    await w.think('It’s… tuning itself.'); await g.wait(1.0);
    await w.think('Seven notes. The same seven.');
    g.saveCheckpoint('lake:mid', { x: this.lastSafe.x, z: this.lastSafe.z });
  }

  async breakThrough() {
    const w = this.w, g = this.g, P = g.player; if (this.fired.fell) return; this.fired.fell = true; this.deaths++;
    g.mode = 'locked'; g.audio.at(P.pos.clone(), 'ice_crack', { vol: 1.2 }); P.addShake(0.8); g.audio.music.sting('fall', 1);
    await g.wait(0.45); g.audio.sfx('splash', { vol: 1, big: true }); g.tweenFx('cold', 1, 0.5); await g.fadeTo(1, 0.6, 0x02080e);
    g.audio.setDuck({ amb: 0.15 }); g.audio.muffleTarget = 500; await g.wait(1.6);
    P.teleport(this.lastSafe.x, P.pos.y, this.lastSafe.z, P.yaw); P.pitch = 0; this.risk = 0; g.tweenFx('cold', 0, 3); g.audio.setDuck({ amb: 1 }); g.audio.muffleTarget = 22000; g.gfx.fx.dread = 0;
    await g.fadeTo(0, 2.2); g.mode = 'free'; this.fired.fell = false;
    await w.think(this.deaths === 1 ? 'Ice talks before it breaks. I have to listen.' : 'Slow. Low tones. Go where it’s low.');
  }

  // ---- the island -------------------------------------------------------------------------------------------------------
  async arrive() {
    const w = this.w, g = this.g, P = g.player, S = w.searcher, I = w.island, D = g.director;
    g.audio.music.setDread(0.2); g.saveCheckpoint('lake:island', { x: P.pos.x, z: P.pos.z });
    g.ui.objective('The cairn.');
    await w.think('The north bay.'); await g.wait(1.0);
    await w.think('It’s standing by the rocks. Waiting.');
    S.stand(0); S.faceTarget = V(I.cairnPos.x, 0, I.cairnPos.z); S.state = 'standing'; S.body.opts.headTilt = 0.1;
    // the cairn: a recorder left at its foot
    const rec = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.16), new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.5 })); rec.position.set(I.cairnPos.x - 0.1, I.cairnPos.y - 0.62, I.cairnPos.z + 0.55); rec.rotation.y = 0.5; g.root.add(rec);
    this.recMesh = rec;
    // a pale glove frozen to the ice? no — only the recorder and a scatter of snow
    this.cairnIt = g.interact.add({ object: rec, radius: 0.5, maxDist: 3.0, label: 'The recorder', icon: 'hand', onUse: () => { this.cairnIt.used = false; this.findRecorder(); } });
  }

  async findRecorder() {
    const w = this.w, g = this.g, P = g.player, S = w.searcher; if (this.fired.rec) return; this.fired.rec = true;
    g.mode = 'locked'; g.ui.setPrompt(null); g.hands.gesture('grab', this.recMesh.position, 'R'); g.audio.sfx('pickup', { vol: 0.8 });
    await g.wait(0.6); this.recMesh.visible = false; g.journal.add('jo_recorder');
    await w.think('It’s his.'); await g.wait(0.7);
    await w.think('The same scratch on the lid. The sticker, “PROPERTY OF CAPTAIN OWL.”'); await g.wait(1.0);
    await w.think('Press play.');
    g.mode = 'free'; g.ui.hint('interact', 'Press play  [E]', 6);
    this.playIt = g.interact.add({ pos: P.pos.clone().add(V(0, 1.3, 0)), radius: 3, maxDist: 5, label: 'Press play', icon: 'hand', onUse: () => { this.playIt.remove(); this.playRecording(); } });
    // keep the prompt on the recorder in her hand: any look direction works
    this.playIt.pos = null; this.playIt.object = g.camera; this.playIt.offset = [0, 0, -0.45];
  }

  async playRecording() {
    const w = this.w, g = this.g, P = g.player, S = w.searcher; g.mode = 'locked'; g.ui.hideHint();
    g.hands.hold('L', 'recorder'); g.hands.setPose('L', 'hold'); g.audio.sfx('tape', { vol: 1 }); await g.wait(0.8);
    // the lake, as it sounded that night: the seven notes in the ice, and under them, someone humming along, a little flat
    g.audio.music.setDread(0); g.audio.amb.set('silence', { fade: 3 });
    const src = g.audio.out('voice', null, { reverb: 0.55, occlude: false }); const k = g.audio.kit; const t = g.audio.ctx.currentTime + 0.1;
    const lp = k.filt('lowpass', 5200, 0.7); lp.connect(src.input); k.hiss(lp, { t, dur: 24, gain: 0.03 });
    const notes = [[0, 1], [3, 1], [7, 2], [5, 1], [3, 1], [2, 1], [0, 2]];
    g.audio.voice.hum(lp, { t: t + 4.0, notes, root: 50, tempo: 58, gain: 0.14, gender: 'm' });
    // the ice answers with glissandi on the same pitches
    [50, 53, 57, 55, 53, 52, 50].forEach((m, i) => k.tone(lp, { t: t + 1.5 + i * 1.45, f0: 440 * Math.pow(2, (m + 12 - 69) / 12) * 1.012, f1: 440 * Math.pow(2, (m + 12 - 69) / 12), dur: 2.4, gain: 0.07, attack: 0.5, release: 1.3, lp: 2400 }));
    k.icePew && k.icePew(lp, { t: t + 15, gain: 0.08, f0: 1700, dur: 1 });
    src.dispose(30);
    await g.wait(5);
    await w.think('That’s the lake.'); await g.wait(5.5);
    await w.think('That’s him. Humming.'); await g.wait(6);
    await w.think('He stops there. Every time he stops there.'); await g.wait(5);
    g.audio.sfx('static', { dur: 0.3, vol: 0.15 }); await g.wait(2.4);
    await w.think('There’s no fear on this tape.'); await g.wait(1.4);
    await w.think('Not a second of it.');
    await g.wait(2.0);
    // the Searcher comes. it walks across the snow, not toward her — toward the place beside her.
    S.faceTarget = null; S.opts.noHunt = true;
    g.audio.amb.set('lakeNight', { fade: 4 }); g.audio.music.setDread(0.12);
    await S.scriptWalk([[P.pos.x + 3.2, P.pos.z - 1.8], [P.pos.x + 2.1, P.pos.z - 0.9]], { speed: 0.55 });
    S.state = 'script'; S.sPath = null; S.body.walking = false; S.yaw = Math.atan2(P.pos.x - S.pos.x, P.pos.z - S.pos.z);
    g.mode = 'free'; P.frozen = true;
    this.confront();
  }

  /** the figure puts back its hood: it is her own face, tired. it says what she has been unable to say. */
  async confront() {
    const w = this.w, g = this.g, P = g.player, S = w.searcher, D = g.director;
    D.take({ pos: P.pos.clone().add(V(-1.2, 1.55, 2.4)), look: S.pos.clone().add(V(0, 1.55, 0)), fov: 42, handheld: 0.08, bars: true, dof: 0.6, hideHands: true });
    await g.wait(1.5);
    S.body.lookAt(P.pos.clone().add(V(0, 1.5, 0)), 1);
    await g.wait(2.0);
    // quiet: no voice but the one it has always had
    const callOnce = (text) => { const src = g.audio.out('voice', S.pos.clone().setY(1.6), { reverb: 0.5, ref: 2 }); g.audio.voice.murmur(src.input, { t: g.audio.ctx.currentTime + 0.05, text, gender: 'f', gain: 0.15, rate: 0.7 }); src.dispose(6); };
    callOnce('Say it.'); await g.ui.say('Say it.', { speaker: 'THE SEARCHER', style: 'memory', dur: 3.2, crit: true });
    await g.wait(1.0);
    await g.ui.say('I don’t know how.', { speaker: 'MARA', style: 'thought', dur: 3.2, crit: true });
    await g.wait(0.8);
    callOnce('You do. You always did.'); await g.ui.say('You do. You always did.', { speaker: 'THE SEARCHER', style: 'memory', dur: 3.4, crit: true });
    await g.wait(1.4);
    g.audio.music.finalWait && g.audio.music.finalWait({ gain: 0.8 });
    await g.ui.say('…I’m not ready.', { speaker: 'MARA', style: 'thought', dur: 3.2, crit: true });
    await g.wait(0.8);
    callOnce('No rush.'); await g.ui.say('No rush.', { speaker: 'THE SEARCHER', style: 'memory', dur: 3.6, crit: true });
    await g.wait(2.2);
    g.flags.lakeDone = true; g.saveCheckpoint('lake:done');
    // the aurora fades out; the ice begins to sing in a way it never has
    g.audio.sfx('ice_boom', { vol: 0.8 });
    await g.fadeTo(1, 4, 0xfff3d8);
    D.release(); P.frozen = false;
    w.setPhase('final');
  }

  skipTo() {}
  dispose() { this.disposed = true; }
}
