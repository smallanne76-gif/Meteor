// GOODBYE: dawn on the thawing lake. Jo on the dock. The conversation, the hand, the lantern set down, the walk home,
// the tape on the switch, the music box, and the eighth note.
import * as THREE from 'three';
import { Humanoid } from '../chars/humanoid.js';
import { PianoSession } from '../ui/pianoPlay.js';
import { Save } from '../core/save.js';
import { clamp, damp, lerp } from '../core/util.js';
import { VOICEMAIL } from '../ui/endUI.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DECK = 0.2;               // dock deck height
const DOCK_Z0 = -56;
const DOCK_END = DOCK_Z0 - 15;

export class FinalPhase {
  constructor(world) { this.w = world; this.g = world.game; this.disposed = false; this.fired = {}; this.thaw = 0; this.stage = 'arrive'; this.holdP = 0; }

  async start(opts = {}) {
    const w = this.w, g = this.g, P = g.player, S = w.searcher;
    g.flags.chapter = 'final'; g.flags.phase = 'final';
    w.zones = { lodge: true, yardOnly: false, road: false, trail: false, boathouse: false, lake: true, deck: true };
    w.baseFear = 0; w.outsideAmb = 'dawn'; w.snowLevel = 0; w.snow.setIntensity(0);
    g.setSky('dawn'); g.setGrade('dawn', true); g.gfx.fx.dread = 0; g.gfx.fx.cold = 0;
    g.audio.amb.set('dawn', { fade: 6 }); g.audio.music.stopAll && g.audio.music.stopAll(1.5); g.audio.music.setDread(0);
    g.audio.music.finalWait({ gain: 0.7 });
    S.vanish(); S.onCaught = null;
    for (const l of w.lampPosts) if (l.lit) l.set(false);
    this.thawTarget = 1;
    // Jo on the end of the dock, in the yellow raincoat, legs over the water
    const jo = this.jo = new Humanoid({ kind: 'jo', outfit: 'raincoat', pants: 0x3b4560, boots: 0x2a2018 });
    jo.sitT = 1; jo.sit = 1; jo.sitDangle = true; jo.setPos(4.0, DECK + 0.12 - 0.51 * jo.B.height, DOCK_END + 0.55); jo.faceYaw(Math.PI);
    g.root.add(jo.root); w.cleanup(() => { g.root.remove(jo.root); jo.dispose(); });
    this.joYaw = Math.PI; this.joPos = jo.root.position;
    g.on('update', (dt) => { if (!this.disposed) jo.update(dt); });
    P.teleport(4.0, DECK, DOCK_Z0 - 2.5, 0); P.pitch = 0.02; P.walkMul = 0.78; P.canRun = false;
    g.hands.hold('L', null); g.hands.holdFlashlight(); g.lights.flashOn = false;
    g.ui.chapterCard('VII', 'GOODBYE', '', 4);
    g.fadeTo(0, 7, 0xfff3d8);
    const rid = opts.resumeAt && opts.resumeAt.id;
    if (rid === 'final:dock' || rid === 'final:gift') { this.fastForward(rid, opts.resumeAt); return; }
    await g.wait(5);
    g.ui.objective('The end of the dock.');
    this.stage = 'walk';
  }

  /** from a save: Jo has gone, the lantern is out, she is walking home */
  fastForward(rid, at) {
    const w = this.w, g = this.g, P = g.player; this.fired.talk = true; this.jo.root.visible = false; this.stage = 'home'; P.canRun = true; P.walkMul = 0.9; this.setupPorch();
    P.teleport(at.x, at.y ?? 0, at.z, at.yaw ?? 0);
    if (rid === 'final:gift') { w.porch.set(false); this.fired.porch = true; const G = w.ground; [G.lamps.hall, G.lamps.kitchen, G.lamps.livingFloor, G.lamps.livingTable].filter(Boolean).forEach((l) => l.set(true)); this.boxHeard = true; this.setupInside(); g.ui.objective('Dad’s piano.', true); this.giftIt && this.giftIt.remove(); }
    else g.ui.objective('Go up to the house.', true);
  }

  // ------------------------------------------------------------------------------------------------------------------------
  speakJo(text, { dur, gap = 0.5 } = {}) {
    const g = this.g, jo = this.jo; const pos = jo.root.position.clone().setY(DECK + 1.5);
    const src = g.audio.out('voice', pos, { reverb: 0.5, ref: 2.2, occlude: false });
    g.audio.voice.murmur(src.input, { t: g.audio.ctx.currentTime + 0.05, text, gender: 'm', gain: 0.17, rate: 0.9, muffle: false }); src.dispose(8);
    jo.face.set && jo.face.set('open', 0.25); setTimeout(() => jo.face.set && jo.face.set('open', 0), 220 + text.length * 22);
    return g.ui.say(text, { speaker: 'JO', style: 'memory', dur, crit: true }).then(() => g.wait(gap));
  }
  speakMara(text, { dur, gap = 0.5 } = {}) {
    const g = this.g; const src = g.audio.out('voice', null, { reverb: 0.2 });
    g.audio.voice.murmur(src.input, { t: g.audio.ctx.currentTime + 0.05, text, gender: 'f', gain: 0.1, rate: 0.9, muffle: false }); src.dispose(8);
    return g.ui.say(text, { speaker: 'MARA', dur, crit: true }).then(() => g.wait(gap));
  }
  moveJo(pts, speed = 1.0) {
    const g = this.g, jo = this.jo;
    return new Promise((res) => {
      let i = 0; jo.walking = true; jo.walkSpeed = speed;
      const h = (dt) => {
        const p = jo.root.position, goal = pts[i]; if (!goal) { jo.walking = false; g.off('update', h); res(); return; }
        const dx = goal[0] - p.x, dz = goal[1] - p.z, d = Math.hypot(dx, dz);
        if (d < 0.08) { i++; return; }
        this.joYaw = damp(this.joYaw, Math.atan2(dx, dz), 5, dt); jo.faceYaw(this.joYaw);
        const st = Math.min(d, speed * dt); p.x += dx / d * st; p.z += dz / d * st; if (goal[2] !== undefined) p.y = damp(p.y, goal[2], 4, dt);
      };
      g.on('update', h);
    });
  }
  /** turn the player's view smoothly (her own head, not a camera cut) */
  turnPlayer(yaw, pitch = 0.03, dur = 2.4) {
    const g = this.g, P = g.player;
    return new Promise((res) => {
      let t = 0; const a = P.yaw, p0 = P.pitch; const d = ((yaw - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; P.lookMul = 0;
      const h = (dt) => { t += dt; const k = clamp(t / dur); const e = k * k * (3 - 2 * k); P.yaw = a + d * e; P.pitch = lerp(p0, pitch, e); if (k >= 1) { g.off('update', h); P.lookMul = 1; res(); } };
      g.on('update', h);
    });
  }
  turnJo(yaw, dur = 1.2) { const g = this.g, jo = this.jo; return new Promise((res) => { let t = 0; const a = this.joYaw; let d = ((yaw - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; const h = (dt) => { t += dt; const k = clamp(t / dur); this.joYaw = a + d * k * k * (3 - 2 * k); jo.faceYaw(this.joYaw); if (k >= 1) { g.off('update', h); res(); } }; g.on('update', h); }); }

  // ---- the conversation -----------------------------------------------------------------------------------------------------
  async talk() {
    const w = this.w, g = this.g, P = g.player, jo = this.jo; if (this.fired.talk) return; this.fired.talk = true; this.stage = 'talk';
    P.frozen = true; g.ui.objective(''); g.audio.music.setDread(0);
    g.lights.flashOn = false; g.hands.hold('R', null); g.hands.setPose('R', 'relaxed');          // she puts the torch away
    const lookAtJo = () => V(jo.root.position.x, DECK + 1.5, jo.root.position.z);
    // he hears her. he doesn't turn all at once.
    jo.lookAt(P.pos.clone().setY(DECK + 1.6), 0.8); await g.wait(2.4);
    jo.face.set('smile', 0.5);
    jo.sitT = 0; await g.wait(1.8);
    jo.lookAt(P.pos.clone().setY(DECK + 1.6), 1);
    await this.turnJo(0, 1.4);
    // frame the moment: a slow push-in on his face while she looks at him, then back to her eyes
    await g.wait(1.0);
    jo.face.set('smile', 0.85);
    await this.speakJo('Hey. You’re late.', { gap: 1.4 });
    jo.face.set('smile', 1.0); await g.wait(0.6);
    await this.speakJo('Kidding. No rush.', { gap: 1.2 });
    jo.face.set('smile', 0.4);
    let c = await g.ui.choice(['I didn’t pick up.', 'I’m so sorry, Jo.']);
    await this.speakMara(c === 0 ? 'I didn’t pick up.' : 'I’m so sorry, Jo.', { gap: 0.9 });
    await this.speakJo(c === 0 ? 'I know.' : 'I know. You don’t have to say it like that.', { gap: 1.0 });
    await this.speakMara('You called, and I — I turned the phone over. I said, later.', { dur: 4.5, gap: 1.0 });
    jo.face.set('sad', 0.15);
    await this.speakJo('Mar. You picked up every other time.', { gap: 1.4 });
    c = await g.ui.choice(['I was going to call you back.', 'I thought there would be more time.']);
    await this.speakMara(c === 0 ? 'I was going to call you back.' : 'I thought there would be more time.', { gap: 0.9 });
    await this.speakJo(c === 0 ? 'I know. That’s what you do.' : 'Everybody thinks that. It doesn’t mean you didn’t love me.', { dur: 4, gap: 1.4 });
    await this.speakMara('I kept the light on.', { gap: 1.2 });
    jo.face.set('smile', 0.7);
    await this.speakJo('I saw it. Every year.', { gap: 1.6 });
    await this.speakJo('You can turn it off now, Mar. I’m home.', { dur: 4, gap: 3.0 });
    // silence. water. a bird.
    await g.wait(2.5);
    await this.speakJo('Did you ever hear the end of it? The song.', { dur: 4, gap: 0.8 });
    // she hums the seven notes, then the eighth, going up
    g.ui.hint('interact', 'Hum it', 12);
    await new Promise((res) => { const it = g.interact.add({ pos: P.pos.clone().add(V(0, 1.4, 0)), radius: 4, maxDist: 6, label: 'Hum it', icon: 'hand', onUse: () => { it.remove(); res(); } }); it.object = g.camera; it.pos = null; it.offset = [0, 0, -0.5]; });
    g.ui.hideHint();
    const src = g.audio.out('voice', null, { reverb: 0.5 }); const t = g.audio.ctx.currentTime + 0.1;
    g.audio.voice.hum(src.input, { t, notes: [[0, 1], [3, 1], [7, 2], [5, 1], [3, 1], [2, 1], [0, 2]], root: 62, tempo: 58, gain: 0.16, gender: 'f' });
    g.audio.voice.hum(src.input, { t: t + 8.4, notes: [[2, 3]], root: 62, tempo: 50, gain: 0.18, gender: 'f' }); src.dispose(16);
    jo.lookAt(P.pos.clone().setY(DECK + 1.55), 1); await g.wait(11.5);
    jo.face.set('smile', 1); g.audio.sfx('static', { dur: 0.01, vol: 0 });
    // he laughs, quietly: a breath and a short sound
    { const s2 = g.audio.out('voice', jo.root.position.clone().setY(DECK + 1.5), { reverb: 0.4 }); g.audio.kit.breath && g.audio.kit.breath(s2.input, { t: g.audio.ctx.currentTime + 0.05, dur: 0.6, gain: 0.05 }); s2.dispose(3); }
    await g.wait(0.8);
    await this.speakJo('A question. Of course it’s a question.', { dur: 4, gap: 1.6 });
    await this.speakMara('Happy birthday, Jo.', { gap: 1.1 });
    await this.speakJo('I’m still twenty-two. That’s going to be so annoying for you.', { dur: 5, gap: 1.8 });
    jo.face.set('smile', 0.35);
    await this.speakJo('Okay. I should go.', { gap: 1.2 });
    this.letGo();
  }

  /** he offers his hand. she can hold it as long as she needs. */
  async letGo() {
    const w = this.w, g = this.g, P = g.player, jo = this.jo; this.stage = 'letgo';
    const fwd = V(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)), right = V(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    const handPos = P.pos.clone().add(V(0, DECK * 0 + 1.05, 0)).addScaledVector(fwd, 0.62).addScaledVector(right, 0.12);
    this.handPos = handPos;
    jo.reachTo('R', handPos.clone().add(V(0, 0.02, 0))); await g.wait(1.4);
    g.ui.hint('interact', 'Take his hand', 10);
    await new Promise((res) => { const it = g.interact.add({ pos: handPos.clone(), radius: 0.9, maxDist: 2.6, label: 'Take his hand', icon: 'hand', onUse: () => { it.remove(); res(); } }); this.takeIt = it; });
    g.ui.hideHint(); g.audio.sfx('cloth', { vol: 0.5 });
    // her glove closes around his fingers and stays there
    const hold = (dt) => { g.hands.reachTarget.R = this.heldHand.clone(); g.hands._reachDur = 1; g.hands.reachT.R = 0.5; g.hands.reachPose = 'grip'; };
    this.heldHand = handPos.clone(); g.on('update', hold); this.holdOff = () => g.off('update', hold);
    await g.wait(2.5);
    await w.think('He’s warm.'); await g.wait(1.2);
    await w.think('Of course he’s warm. He’s… home.');
    g.ui.hint('interact', 'Hold to let go — there is no rush', 14);
    // hold E to let go: as she holds, his hand slowly draws away
    this.letIt = g.interact.add({ pos: handPos.clone(), radius: 1.2, maxDist: 3, label: 'Let go', icon: 'hand', hold: 6.5,
      onHold: (gm, it, p) => { this.holdP = p; jo.reachTo('R', handPos.clone().add(V(0, 0, 0)).addScaledVector(fwd, 0.1 + p * 0.38).add(V(0, -p * 0.1, 0))); this.heldHand.copy(handPos).addScaledVector(fwd, 0.1 + p * 0.25); g.audio.music.setDread(0); g.player.addShake(0.004); },
      onHoldCancel: () => { this.holdP = 0; jo.reachTo('R', handPos.clone().add(V(0, 0.02, 0))); this.heldHand.copy(handPos); },
      onUse: () => { this.letIt.remove(); this.farewell(); } });
  }

  async farewell() {
    const w = this.w, g = this.g, P = g.player, jo = this.jo, D = g.director, S = w.searcher; this.stage = 'farewell';
    g.ui.hideHint(); this.holdOff && this.holdOff(); jo.reachTo('R', null); g.hands.reachTarget.R = null; g.hands.reachT.R = 0; g.hands.pose.R = 'open';
    await g.wait(1.4);
    await this.speakJo('Call me back sometime.', { dur: 3.4, gap: 1.8 });
    jo.face.set('smile', 0.9);
    await this.speakJo('…No rush.', { dur: 3, gap: 1.0 });
    // the long shot: from behind her shoulder, low, toward the sunrise
    P.frozen = true; g.hands.setVisible(false);
    D.take({ pos: P.pos.clone().add(V(0.9, 1.25, 1.6)), look: V(4, DECK + 1.3, DOCK_END - 18), fov: 38, handheld: 0.12, bars: true, dof: 0.5, hideHands: true });
    D.setFocus(() => D.pos.distanceTo(V(jo.root.position.x, DECK + 1.3, jo.root.position.z)));
    g.audio.music.setDread(0); g.audio.amb.set('silence', { fade: 3 });
    await this.moveJo([[4, DOCK_END + 0.3], [4.0, DOCK_END - 3]], 0.85);
    // he walks out over the open water on the path of the sun
    D.move({ pos: P.pos.clone().add(V(0.7, 1.3, 1.2)), look: V(4, DECK + 3.2, DOCK_END - 40), fov: 34, dur: 14 });
    this.jo.sit = 0;
    const walkOut = this.moveJo([[4, DOCK_END - 14, -0.2], [3.2, DOCK_END - 40, -0.3], [3.0, DOCK_END - 80, -0.3]], 1.0);
    g.tweenFx('flash', 0, 0.01);
    for (let i = 0; i < 8; i++) { await g.wait(1.7); jo.root.visible = i < 6 || Math.random() < 0.5; }
    jo.root.visible = false; await walkOut.catch(() => 0);
    jo.root.visible = false;
    // silence. nothing, for a while.
    await g.wait(7.0);
    g.audio.amb.set('dawn', { fade: 9 });
    await g.wait(5.0);
    D.release(); g.hands.setVisible(true); P.yaw = 0; P.pitch = 0.03; P.syncCamera && P.syncCamera(); P.frozen = false;
    g.audio.music.setDread(0);
    this.afterJo();
  }

  async afterJo() {
    const w = this.w, g = this.g, P = g.player, S = w.searcher;
    await g.wait(1.5);
    await w.think('…'); await g.wait(2.5);
    // footsteps on the planks behind her. wet. slow. it's the Searcher, and she isn't afraid.
    S.setPos(4.0, DECK, DOCK_Z0 - 0.6, 0); S.setLantern(true); S.show(true); S.opts.noHunt = true; S.opts.prints = false; S.state = 'script'; S.callT = 99;
    S.scriptWalk([[4.0, DOCK_Z0 - 8.4]], { speed: 0.6 });
    this.stage = 'lantern';
    g.ui.objective('');
    this.lanternProp = null;
    await new Promise((res) => { const iv = setInterval(() => { if (S.state === 'script' && !S.sPath) { clearInterval(iv); res(); } }, 120); });
    S.yaw = Math.PI; S.syncRoot();
    // she hears it, and turns on her own
    await g.wait(0.6);
    await this.turnPlayer(Math.PI, 0.03, 2.6);
    await g.wait(0.8);
    await w.think('You’re me.'); await g.wait(1.5);
    // it bows, and sets the lantern down on the planks
    S.opts.hunch = 0.85; S.body.opts.hunch = 0.85; await g.wait(2.0);
    const lp = S.lantern.getWorldPosition(V(0, 0, 0)); const dockPos = V(4.0, DECK + 0.09, DOCK_Z0 - 8.7);
    const prop = this.lanternProp = S.lantern.clone(); g.root.add(prop); prop.position.copy(dockPos); prop.rotation.set(0, 0, 0);
    S.lantern.visible = false; S.light.on = false; S.setLantern(false);
    this.propLight = g.lights.add({ pos: [dockPos.x, dockPos.y + 0.15, dockPos.z], color: 0xffb060, intensity: 4, distance: 5, decay: 2, shadow: false, flicker: { amp: 0.15, speed: 8 }, on: true });
    g.audio.at(dockPos, 'lantern', { vol: 0.8 });
    await g.wait(1.4); S.body.opts.hunch = 0.14; S.opts.hunch = 0.14;
    await g.wait(1.0);
    // it walks back the way it came, up the dock, and is not there any more
    await S.scriptWalk([[4.0, DOCK_Z0 - 0.5], [4.0, DOCK_Z0 + 12], [3.0, DOCK_Z0 + 32]], { speed: 0.9 });
    S.vanish();
    await w.think('Thank you. For all of it.'); await g.wait(1.4);
    // blow out the lantern
    g.ui.objective('Put out the lantern. Then go home.');
    this.lanternIt = g.interact.add({ pos: dockPos.clone().add(V(0, 0.15, 0)), radius: 0.5, maxDist: 2.6, label: 'Put out the lantern', icon: 'hand', onUse: () => { this.lanternIt.remove(); this.blowOut(); } });
    P.canRun = true; P.walkMul = 0.9;
    this.stage = 'home'; g.saveCheckpoint('final:dock', { x: P.pos.x, z: P.pos.z });
    // the porch interaction replaces the old tape reading
    this.setupPorch();
  }

  async blowOut() {
    const w = this.w, g = this.g; g.hands.gesture('press', this.lanternProp.position, 'R'); await g.wait(0.5);
    g.audio.sfx('hiss', { vol: 0.4 }); this.propLight.on = false; this.lanternProp.visible = true;
    this.lanternProp.traverse((o) => { if (o.material && o.material.emissiveIntensity !== undefined) o.material.emissiveIntensity = 0; if (o.geometry && o.geometry.type === 'SphereGeometry') o.visible = false; });
    await w.think('There. It doesn’t need to be on anymore.');
    g.ui.objective('Go up to the house.');
  }

  setupPorch() {
    const w = this.w, g = this.g, G = w.ground; const sw = G.switches.porch; this.sw = sw;
    sw.interact.label = 'Peel the tape off'; sw.interact.hold = 2.4; sw.interact.maxDist = 2.2; sw.interact.enabled = true;
    sw.interact.onUse = () => { sw.interact.used = false; this.porchOff(); };
    sw.interact.onHold = (gm, it, p) => { const tape = sw.group.userData.tape; if (tape) { tape.rotation.z = 0.12 + p * 0.9; tape.position.x = p * 0.02; } };
    this.porchHint = false;
    // the front door: open it for her
    w.lodge.doors.front.locked = false;
  }

  async porchOff() {
    const w = this.w, g = this.g; if (this.fired.porch) return; this.fired.porch = true; const sw = this.sw;
    g.audio.at(sw.group.getWorldPosition(V(0, 0, 0)), 'paper', { vol: 0.8 });
    const tape = sw.group.userData.tape; if (tape) tape.visible = false;
    g.mode = 'locked'; await g.wait(1.0);
    await w.think('Six years of tape. Under the tape, older tape.'); await g.wait(1.4);
    await w.think('Under that, a note in Dad’s writing: “LEAVE IT ON FOR THE BOY.”'); await g.wait(2.0);
    sw.interact.label = 'Turn it off';
    g.mode = 'free';
    sw.interact.hold = 0; sw.interact.onHold = null;
    const it = g.interact.add({ object: sw.group, radius: 0.2, maxDist: 2.2, label: 'Turn it off', icon: 'switch', onUse: () => { it.remove(); this.lightsOut(); } });
    sw.interact.enabled = false;
  }

  async lightsOut() {
    const w = this.w, g = this.g, P = g.player;
    g.mode = 'locked'; g.audio.at(this.sw.group.getWorldPosition(V(0, 0, 0)), 'switch', { vol: 1 });
    w.porch.set(false); this.sw.group.children[1] && (this.sw.group.children[1].rotation.x = 0.35);
    await g.wait(1.0);
    g.audio.amb.set('dawn', { fade: 2 });
    await g.wait(3.5);
    await w.think('The hum stopped.'); await g.wait(1.6);
    await w.think('I hadn’t heard it in so long, I didn’t know it was a sound.');
    g.mode = 'free';
    // the house, warm, with the morning in it
    const G = w.ground; [G.lamps.hall, G.lamps.living || G.lamps.livingFloor, G.lamps.kitchen, G.lamps.livingFloor, G.lamps.livingTable].filter(Boolean).forEach((l) => l.set(true));
    w.lodge.doors.front.toggle(true);
    g.ui.objective('Inside. The gift is on the kitchen table.');
    this.stage = 'inside';
    this.setupInside();
  }

  setupInside() {
    const w = this.w, g = this.g, G = w.ground;
    // the gift: wait until tomorrow
    const gi = G.objs.gift; this.giftIt = g.interact.add({ object: gi, radius: 0.34, maxDist: 2.4, label: 'The gift', icon: 'hand', priority: 5, onUse: () => { this.giftIt.remove(); this.openGift(); } });
    // the piano is the last thing
    this.pianoIt = g.interact.add({ pos: G.objs.piano.center.clone().add(V(0.35, 0.1, 0)), radius: 0.9, maxDist: 2.5, label: 'The piano', icon: 'hand', priority: 5, enabled: () => this.boxHeard, onUse: () => { this.pianoIt.used = false; this.playEighth(); } });
  }

  async openGift() {
    const w = this.w, g = this.g; g.mode = 'locked'; g.hands.gesture('grab', w.ground.objs.gift.getWorldPosition(V(0, 0, 0)), 'R'); g.audio.sfx('paper', { vol: 0.9 });
    await g.wait(1.0);
    await w.think('“Don’t open it till tomorrow.”'); await g.wait(1.2);
    await w.think('It’s tomorrow.'); await g.wait(1.0);
    g.mode = 'free';
    await g.ui.read('gift_card');
    g.mode = 'locked'; await g.wait(0.6);
    // a music box, wound with a key. it plays the song, and it stops one note short.
    g.audio.sfx('ceramic', { vol: 0.5 }); await w.think('A music box.'); await g.wait(1.0);
    const box = g.audio; const t0 = box.ctx.currentTime + 0.4; const mid = [62, 65, 69, 67, 65, 64, 62];
    mid.forEach((m, i) => box.music.box(box.out('music', null, { reverb: 0.5 }).input, t0 + i * 0.95, m + 12, 0.7));
    await g.wait(8.6);
    await w.think('It stops there. On the seventh.'); await g.wait(1.6);
    await w.think('The comb has a tooth missing. He had it built that way.');
    await g.wait(2.0); await w.think('“Maybe you’ll find it.”');
    this.boxHeard = true; g.mode = 'free';
    g.ui.objective('Dad’s piano.');
    g.saveCheckpoint('final:gift', { x: g.player.pos.x, z: g.player.pos.z });
  }

  async playEighth() {
    const w = this.w, g = this.g, pn = w.ground.objs.piano; if (this.fired.eighth) return;
    this.piano = new PianoSession(g, pn, { expected: [64], onSolved: () => this.answered(), onExit: () => {} });
    this.piano.start(); g.ui.hint('A S D F G H J K', 'It goes up. Like a question.', 14);
    this.pianoTry = 0; this.pianoHintT = 0;
  }

  async answered() {
    const w = this.w, g = this.g; if (this.fired.eighth) return; this.fired.eighth = true;
    g.ui.hideHint();
    const dur = g.audio.music.finalAnswer();
    await g.wait(1.5);
    this.piano.stop(); g.mode = 'locked';
    // light through every window. nothing else happens, for as long as it takes.
    g.tweenFx('exposure', 1, 1);
    await g.wait(14);
    Save.markFinished(); g.saveCheckpoint('final:end');
    await g.fadeTo(1, 6, 0x000000);
    g.audio.music.stopAll && g.audio.music.stopAll(3);
    await g.wait(2);
    this.credits();
  }

  async credits() {
    const g = this.g, ui = g.ui, a = g.audio;
    ui.hud.style.opacity = 0;
    a.music.credits();
    await ui.playCredits();
    a.music.stopAll && a.music.stopAll(4);
    // the voicemail: the whole message, at last
    const lay = await ui.postCredit((line) => {
      const t = a.ctx.currentTime + 0.05; const src = a.out('voice', null, { reverb: 0.3, occlude: false }); const k = a.kit;
      const ph = k.filt('highpass', 300, 0.7), lp = k.filt('lowpass', 3400, 0.8); ph.connect(lp); lp.connect(src.input);
      if (line.who === 'JO') a.voice.murmur(ph, { t, text: line.text, gender: 'm', gain: 0.14, rate: 0.9 });
      else if (line.text.includes('lake sings')) { [50, 53, 57, 55, 53, 52, 50].forEach((m, i) => k.tone(ph, { t: t + i * 1.3, f0: 440 * Math.pow(2, (m + 12 - 69) / 12) * 1.01, f1: 440 * Math.pow(2, (m + 12 - 69) / 12), dur: 2.4, gain: 0.07, attack: 0.5, release: 1.2, lp: 2400 })); }
      else if (line.text.includes('hums')) { a.voice.hum(ph, { t, notes: [[0, 1], [3, 1], [7, 2], [5, 1], [3, 1], [2, 1], [0, 2]], root: 50, tempo: 58, gain: 0.12 }); }
      else k.hiss(ph, { t, dur: 3, gain: 0.03 });
      src.dispose(14);
    });
    // calling back
    const t = a.ctx.currentTime + 0.2; const src = a.out('voice', null, { reverb: 0.1 }); const kit = a.kit;
    for (let i = 0; i < 2; i++) { kit.tone(src.input, { t: t + i * 3, f0: 440, f1: 440, dur: 1.2, gain: 0.05, attack: 0.02, release: 0.08, lp: 3000 }); kit.tone(src.input, { t: t + i * 3, f0: 480, f1: 480, dur: 1.2, gain: 0.05, attack: 0.02, release: 0.08, lp: 3000 }); }
    src.dispose(8);
    await g.wait(6.5);
    lay.querySelector('.status').textContent = 'Connected';
    // the lake is what answers
    const s2 = a.out('ambience', null, { reverb: 0.8 }); [50, 53, 57, 55, 53, 52, 50, 52].forEach((m, i) => kit.tone(s2.input, { t: a.ctx.currentTime + 0.3 + i * 1.8, f0: 440 * Math.pow(2, (m + 12 - 69) / 12) * 1.01, f1: 440 * Math.pow(2, (m + 12 - 69) / 12), dur: 3.4, gain: i === 7 ? 0.1 : 0.07, attack: 0.7, release: 1.8, lp: 2400 })); s2.dispose(20);
    const vm = lay.querySelector('.vm'); const d = document.createElement('div'); d.className = 'ln show amb'; d.textContent = '(the line is open. someone is breathing, and humming, and in no hurry.)'; vm.appendChild(d);
    await g.wait(15);
    lay.style.transition = 'opacity 4s'; lay.style.opacity = 0; await g.wait(4.5); lay.remove();
    ui.hud.style.opacity = 1; ui.hud.style.display = 'none';
    g.emit('quitToTitle');
  }

  dispose() { this.disposed = true; this.holdOff && this.holdOff(); }

  update(dt) {
    const w = this.w, g = this.g, P = g.player, jo = this.jo;
    // the thaw: ice goes to water over twenty seconds, mist off the lake
    this.thaw = damp(this.thaw, this.thawTarget ?? 0, 0.22, dt); w.lake.setThaw(clamp(this.thaw * 1.02, 0, 1));
    if (this.stage === 'walk' && !this.fired.talk && jo) { const d = Math.hypot(P.pos.x - jo.root.position.x, P.pos.z - jo.root.position.z); if (d < 3.1) this.talk(); }
    if (this.piano && this.piano.active) { this.piano.update(dt); }
  }
}
