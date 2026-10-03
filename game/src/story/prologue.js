// PROLOGUE — "FEB 11". Wake in the car on the dead-end road; walk to the porch light.
import * as THREE from 'three';
import { clamp, damp, lerp, RNG } from '../core/util.js';
import { LAYOUT } from '../world/halden.js';

export class ProloguePhase {
  constructor(world, opts = {}) { this.w = world; this.g = world.game; this.fired = {}; this.lookT = 0; this.glimpse = null; this.disposed = false; }

  async start(opts = {}) {
    const w = this.w, g = this.g, T = w.terrain, car = w.car;
    g.flags.chapter = 'prologue';
    w.zones = { lodge: true, road: true, trail: false, boathouse: false, lake: false, deck: false };
    w.snowLevel = 1; w.baseFear = 0.1; w.outsideAmb = 'winterNight';
    this.makeTracks();
    g.ui.objective('');
    if (opts.skipIntro) { this.exitCar(true); return; }
    // ---- seated in the car --------------------------------------------------------------------------------------
    w.inCar = true; car.updateMatrixWorld(true);
    const eyeW = car.userData.eye.clone().applyMatrix4(car.matrixWorld);
    const P = g.player; P.noclip = true; P.frozen = true; P.eye = 1.2; P.eyeOverride = 1.2;
    P.teleport(eyeW.x, eyeW.y - 1.2, eyeW.z, car.rotation.y); P.pitch = -0.75;
    P.lookLimit = { yaw0: car.rotation.y, yawRange: 1.9, pitchMin: -1.0, pitchMax: 0.75 };
    g.hands.setVisible(false); g.mode = 'locked'; g.audio.muffleTarget = 1400;
    g.gfx.fx.fade = 1; g.gfx.fx.eyes = 1; g.gfx.fx.dof = 1; g.gfx.fx.focus = 0.4;
    g.audio.amb.set('winterNight', { fade: 0.1 }); g.audio.amb.setBed('wind', 0.35);
    // dash clock etc.
    this.dashPulse = 0;
    await g.wait(0.8);
    g.fadeTo(0, 3.0);
    // the lake sings, very far away: the very first sound of the game after the wind
    g.wait(1.4).then(() => g.audio.amb.iceSong(new THREE.Vector3(10, 1.5, -170), 0.75));
    await g.wait(1.2);
    // eyes open: slow, heavy
    g.tweenFx('eyes', 0, 5.5); g.tweenFx('dof', 0, 8); g.tweenFx('focus', 3, 8);
    g.audio.heartbeatMute = true;
    // the head lifts slowly (game-clock driven; the player can still look around)
    this.liftT = 0;
    g.mode = 'free';
    await g.wait(3.2);
    await w.think('…Jo?');
    await g.wait(0.6);
    this.armPhone();
  }

  armPhone() {
    const w = this.w, g = this.g, car = w.car;
    const pw = car.userData.phone.getWorldPosition(new THREE.Vector3());
    this.phoneIt = g.interact.add({ pos: pw, radius: 0.55, maxDist: 3.0, label: 'Pick up the phone', icon: 'hand', onUse: () => this.takePhone() });
    this.phoneGlow = true; this.armT = g.time; this.nagT = g.time;
    g.ui.hint('interact', 'Your phone is glowing on the seat beside you. Look at it and press E.', 9);
  }

  async takePhone() {
    const w = this.w, g = this.g, car = w.car; if (this.phoneTaken) return; this.phoneTaken = true; this.phoneGlow = false;
    this.phoneIt.remove(); g.ui.hideHint();
    g.mode = 'locked';
    g.hands.setVisible(true); g.hands.held.R = 'phone'; g.hands.held.L = null; g.hands.gesture('grab', car.userData.phone.getWorldPosition(new THREE.Vector3()), 'R');
    g.audio.sfx('pickup', { vol: 0.8 });
    await g.wait(0.9); car.userData.phone.visible = false; car.userData.phoneScreen.visible = false;
    const sc = g.hands.items.phone.userData.screen; if (sc) sc.material.emissiveIntensity = 1.2;
    await g.ui.say('NO SERVICE', { style: 'phone', dur: 2, crit: true });
    await g.ui.say('1 NEW VOICEMAIL — JO — Mon Feb 11 · 3:12 AM · 4:07', { style: 'phone', dur: 3.6, crit: true });
    g.journal.add('voicemail_jo');
    g.audio.playNoteAudio('voicemail_corrupt');
    await g.wait(1.0);
    g.audio.music.setDread(0.12);
    await g.wait(11.5);
    await g.ui.say('FILE DAMAGED', { style: 'phone', dur: 2.2, crit: true });
    if (sc) sc.material.emissiveIntensity = 0;
    await g.wait(0.5);
    await w.think('Four minutes. He never leaves less than four.');
    await w.think('…He’s out on the lake. He said he’d be out on the lake.');
    g.ui.objective('Get to the lodge. Jo will be on the lake.');
    g.journal.add('voicemail_jo');
    g.hands.held.R = 'flashlight'; g.mode = 'free';
    g.flags.flashlightHint = true;
    // door
    const door = new THREE.Vector3(-1.0, 1.05, -0.35).applyMatrix4(car.matrixWorld);
    this.doorIt = g.interact.add({ pos: door, radius: 0.7, maxDist: 3.0, label: 'Get out', icon: 'door', onUse: () => this.exitCar(false) });
    this.armT = g.time; this.nagT = g.time;
    g.ui.hint('interact', 'Look left at the door and press E to get out.', 8);
  }

  async exitCar(instant) {
    const w = this.w, g = this.g, car = w.car, P = g.player; if (this.exiting) return; this.exiting = true;
    if (this.doorIt) this.doorIt.remove(); g.ui.hideHint();
    if (!instant) { g.mode = 'locked'; g.audio.sfx('door_open', { pos: car.position.clone().add(new THREE.Vector3(0, 1, 0)), vol: 1 }); await g.fadeTo(1, 0.7); }
    const out = new THREE.Vector3(-1.9, 0, -0.5).applyMatrix4(car.matrixWorld);
    P.noclip = false; P.frozen = false; P.lookLimit = null; P.eyeOverride = null; P.eye = 1.62; w.inCar = false;
    P.teleport(out.x, w.terrain.height(out.x, out.z), out.z, car.rotation.y + 0.9); P.pitch = 0;
    g.hands.setVisible(true); g.hands.held.R = 'flashlight'; g.hands.setPose('R', 'grip');
    g.audio.muffleTarget = 22000; g.audio.amb.setBed('wind', 0.55);
    g.audio.sfx('door_close', { pos: car.position.clone().add(new THREE.Vector3(0, 1, 0)), vol: 1 });
    g.gfx.fx.eyes = 0; g.gfx.fx.dof = 0;
    g.mode = 'free';
    await g.fadeTo(0, instant ? 0.1 : 1.2);
    g.saveCheckpoint('prologue:start', { x: out.x, z: out.z });
    g.ui.hint('flashlight', 'Flashlight', 6);
    await g.wait(1.4);
    if (!instant) { await w.think('The tracks.'); }
    this.fired.exit = true;
  }

  /** wet dark prints along the road: from the lodge to the car, around the driver's door, and back */
  makeTracks() {
    const w = this.w, g = this.g, T = w.terrain, road = T.road;
    const geo = new THREE.PlaneGeometry(0.15, 0.34).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x06080c, transparent: true, opacity: 0.6, depthWrite: false });
    const list = [];
    const car = w.carBase;
    let idx = 0;
    for (let t = 8; t < road.length - 10; t += 0.78) {
      const p = road.at(t); const side = (idx++ % 2 ? 1 : -1) * 0.12; const off = 1.15 + (t > 40 ? Math.sin(t * 0.07) * 0.35 : 0);
      const nx = -p.dirz, nz = p.dirx;               // left of the direction of travel
      list.push({ x: p.x + nx * (off + side), z: p.z + nz * (off + side), yaw: Math.atan2(-p.dirx, -p.dirz) });
    }
    // around the car: a ring of prints stopping at the driver's door
    for (let a = 0; a < 9; a++) { const ang = a / 9 * Math.PI * 1.4 - 0.4; const x = car.x + Math.cos(ang) * 2.2, z = car.z + Math.sin(ang) * 3.3; list.push({ x, z, yaw: -ang + Math.PI / 2 }); }
    const im = new THREE.InstancedMesh(geo, mat, list.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach((p, i) => { e.set(0, p.yaw, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, T.height(p.x, p.z) + 0.03, p.z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); });
    im.frustumCulled = false; im.renderOrder = 2; g.root.add(im); this.tracks = im; w.cleanup(() => { g.root.remove(im); });
  }

  dispose() { this.disposed = true; }

  update(dt) {
    const w = this.w, g = this.g, T = w.terrain, P = g.player, p = P.pos;
    // gentle pitch lift while waking
    if (this.liftT !== undefined && this.liftT < 5 && w.inCar) { this.liftT += dt; P.pitch = damp(P.pitch, 0.03, 1.1, dt); }
    // engine ticking / dash glow while in the car
    if (w.inCar) {
      this.tickT = (this.tickT ?? 2) - dt; if (this.tickT <= 0) { this.tickT = 2.2 + Math.random() * 2.2; g.audio.sfx('click', { vol: 0.2 }); }
      const sc = w.car.userData.phoneScreen; if (sc && this.phoneGlow) sc.material.emissiveIntensity = 0.6 + Math.sin(g.time * 3) * 0.4;
      // never get stuck in the car: repeat the hint, and after a while E works without aiming
      const waiting = g.mode === 'free' && ((this.phoneIt && !this.phoneTaken) || (this.doorIt && !this.exiting));
      if (waiting) {
        if (g.time - this.nagT > 14) { this.nagT = g.time; g.ui.hint('interact', this.phoneTaken ? 'Press E to get out of the car.' : 'Press E to pick up the phone.', 8); }
        if (g.time - this.armT > 12 && g.input.wasPressed('interact')) { if (!this.phoneTaken) this.takePhone(); else this.exitCar(false); }
      }
    }
    if (!this.fired.exit) return;
    const near = T.road.nearest(p.x, p.z); const rt = near.t; const L = T.road.length;
    const once = (k, cond, fn) => { if (!this.fired[k] && cond) { this.fired[k] = true; fn(); } };
    // headlights die when far away
    const dCar = Math.hypot(p.x - w.carBase.x, p.z - w.carBase.z);
    // tracks reaction
    once('tracks', dCar > 6 && rt > 30, async () => { await w.think('They’re not filling in. Someone walked here tonight.'); });
    once('glimpse', rt > 62 && rt < L - 60, () => this.startGlimpse());
    if (this.glimpse) this.updateGlimpse(dt);
    once('lakeSong', rt > L * 0.62, async () => { g.audio.amb.iceSong(new THREE.Vector3(p.x + 14, 1.5, p.z - 120), 1); await g.wait(2.5); await w.think('The lake.'); await g.wait(1.0); await w.think('Dad used to say it isn’t breaking. It’s stretching.'); });
    once('lodgeSight', rt > L - 55, async () => { g.audio.music.boxPhrase({ root: 74, tempo: 52, vel: 0.5 }); await g.wait(1.5); await w.think('The porch light’s on.'); await w.think('He’s here.'); g.ui.objective('Find Jo.'); g.saveCheckpoint('prologue:yard', { x: p.x, z: p.z }); });
    // arriving at the porch → the lodge phase begins when she crosses the threshold
    if (!this.fired.enter && p.z < 5.2 && Math.abs(p.x) < 3 && !w.inCar) { this.fired.enter = true; w.setPhase('lodge'); }
  }

  // ---- the first glimpse ---------------------------------------------------------------------------------------------
  startGlimpse() {
    const w = this.w, g = this.g, T = w.terrain, S = w.searcher, P = g.player;
    const n = T.road.nearest(P.pos.x, P.pos.z); const side = 1;
    const ahead = T.road.at(n.t + 30);
    const x = ahead.x - ahead.dirz * 30 * side, z = ahead.z + ahead.dirx * 30 * side;
    const y = T.height(x, z);
    S.setPos(x, y, z, Math.atan2(P.pos.x - x, P.pos.z - z)); S.show(true); S.body.walking = false; S.state = 'script'; S.setLantern(true);
    S.opts.prints = false;
    this.glimpse = { t: 0, lookT: 0, gone: false, x, z };
    g.audio.music.setDread(0.3);
    g.audio.sfx('lantern', { pos: new THREE.Vector3(x, y + 1, z), vol: 0.6 });
  }
  updateGlimpse(dt) {
    const g = this.g, w = this.w, S = w.searcher, P = g.player, G = this.glimpse; if (G.gone) return;
    G.t += dt;
    const to = new THREE.Vector3(S.pos.x - P.pos.x, S.pos.y + 1.5 - (P.pos.y + P.eye), S.pos.z - P.pos.z); const d = to.length(); to.normalize();
    const looking = to.dot(P.forward) > 0.93;
    if (looking) G.lookT += dt; else G.lookT = Math.max(0, G.lookT - dt * 0.5);
    S.yaw = Math.atan2(P.pos.x - S.pos.x, P.pos.z - S.pos.z);
    S.syncRoot();
    // it watches; the lantern gutters; when looked at long enough (or approached) it is simply not there
    if ((G.lookT > 1.7 || d < 20 || G.t > 40) && !G.gone) {
      G.gone = true; S.setLantern(false);
      g.wait(0.35).then(() => { S.vanish(); S.state = 'absent'; S.opts.prints = true; });
      g.audio.sfx('lantern', { pos: S.pos.clone().setY(S.pos.y + 1), vol: 0.5 });
      g.player.addKick(0.02, 0.01);
      w.think('…Hello?').then(() => g.wait(1.4)).then(() => w.think('Jo?'));
      g.audio.music.setDread(0.18);
    }
  }
  onMailbox() { const w = this.w, g = this.g; g.ui.read('mailbox').then(() => w.think('He never did pick up the mail.')); }
  onTruck() { const w = this.w; w.think('Jo’s truck. Snow to the door handles.').then(() => this.g.wait(0.8)).then(() => w.think('He must have driven up last night.')); }
}
