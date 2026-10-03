// SUMMER: a playable memory. A canoe, a recorder, a brother who is in no hurry. Where "no rush" came from.
import * as THREE from 'three';
import { Humanoid } from '../chars/humanoid.js';
import { makeCanoe } from '../world/canoe.js';
import { LAYOUT } from '../world/halden.js';
import { clamp, damp, lerp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WATER = -0.39;
const DECK = 0.2;
const DOCK_Z0 = LAYOUT.dock.z, DOCK_END = DOCK_Z0 - 15;
const ROUTE = [[6.6, DOCK_END + 1.0], [9, -96], [12, -124], [6, -152], [-4, -180], [-16, -208], [-24, -232], [-27.5, -249.8]];

function catmull(pts, t) {   // t in [0, n-1]
  const n = pts.length; const i = Math.min(n - 2, Math.floor(t)); const u = t - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
  const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

export class SummerPhase {
  constructor(world) { this.w = world; this.g = world.game; this.disposed = false; this.fired = {}; this.stage = 'meadow'; this.s = 0; this.rec = false; this.recorded = {}; this.srcs = []; this.recT = 0; }

  async start(opts = {}) {
    const w = this.w, g = this.g, P = g.player, S = w.searcher;
    g.flags.chapter = 'summer'; g.flags.phase = 'summer'; g.flashlightAvailable = false;
    w.zones = { lodge: true, yardOnly: false, road: false, trail: false, boathouse: false, lake: true, deck: true };
    w.baseFear = 0; w.outsideAmb = 'summer'; w.snowLevel = 0.6; w.snow.setIntensity(0.6); w.porch.set(false); S.vanish();
    g.setSky('summerEvening'); g.setGrade('summer', true); g.audio.amb.set('summer', { fade: 4 }); g.audio.music.stopAll && g.audio.music.stopAll(1); g.audio.music.setDread(0);
    g.audio.music.summer && g.audio.music.summer({ gain: 0.8 });
    g.hands.hold('R', null); g.hands.setPose('R', 'relaxed'); g.hands.hold('L', 'recorder'); g.hands.setPose('L', 'hold');
    // the cast: Jo at twenty-one, in a tee and old jeans, and Dad's canoe in the shallows beside the dock
    const jo = this.jo = new Humanoid({ kind: 'jo', outfit: 'tee', shirt: 0xd9692b, pants: 0x4b5870, boots: 0x6a5a40 });
    jo.setPos(4.4, DECK, DOCK_END + 3.4); this.joYaw = Math.PI * 0.5; jo.faceYaw(this.joYaw); g.root.add(jo.root); w.cleanup(() => { g.root.remove(jo.root); jo.dispose(); });
    g.on('update', (dt) => { if (!this.disposed) jo.update(dt); });
    const canoe = this.canoe = makeCanoe(); canoe.position.set(6.5, WATER - 0.06, DOCK_END + 0.8); canoe.rotation.y = 0; g.root.add(canoe); w.cleanup(() => g.root.remove(canoe));
    this.canoeYaw = 0;
    P.teleport(2.2, 0.15, -32, 0); P.pitch = 0.02; P.walkMul = 0.9; P.canRun = false;
    this.buildRecorderUI();
    g.ui.chapterCard('V', 'SUMMER', 'Six summers ago', 5);
    g.fadeTo(0, 4, 0xfff6e0);
    await g.wait(4.5);
    g.ui.objective('Meet Jo at the dock.');
    // Jo, from the dock
    g.wait(2).then(() => this.stage === 'meadow' && this.joLine('MAR! You’re late!', { calling: true }));
  }

  // ---- speech ---------------------------------------------------------------------------------------------------------------
  joLine(text, o = {}) {
    const g = this.g, jo = this.jo; const pos = jo.root.position.clone().setY(1.5);
    const src = g.audio.out('voice', pos, { reverb: o.calling ? 0.55 : 0.35, ref: 2.5, occlude: false });
    g.audio.voice.murmur(src.input, { t: g.audio.ctx.currentTime + 0.05, text, gender: 'm', gain: o.calling ? 0.22 : 0.17, rate: 0.95, muffle: false }); src.dispose(7);
    return g.ui.say(text, { speaker: 'JO', style: 'memory', dur: o.dur, crit: true }).then(() => g.wait(o.gap ?? 0.5));
  }
  maraLine(text, o = {}) {
    const g = this.g; const src = g.audio.out('voice', null, { reverb: 0.2 });
    g.audio.voice.murmur(src.input, { t: g.audio.ctx.currentTime + 0.05, text, gender: 'f', gain: 0.1, rate: 0.95, muffle: false }); src.dispose(7);
    return g.ui.say(text, { speaker: 'MARA', dur: o.dur, crit: true }).then(() => g.wait(o.gap ?? 0.5));
  }

  // ---- the dock ---------------------------------------------------------------------------------------------------------------
  async meetOnDock() {
    const w = this.w, g = this.g, P = g.player, jo = this.jo; this.stage = 'dock'; P.frozen = true;
    jo.lookAt(P.pos.clone().setY(1.6), 1); jo.face.set('smile', 0.8);
    this.joYaw = Math.atan2(P.pos.x - jo.root.position.x, P.pos.z - jo.root.position.z); jo.faceYaw(this.joYaw);
    await this.joLine('There she is. Right on time. For next Tuesday.', { dur: 4, gap: 0.6 });
    await this.maraLine('The light isn’t until seven. I need the island at golden hour, Jo. Not “about” golden hour.', { dur: 5.5, gap: 0.6 });
    await this.joLine('I packed snacks. Snacks are a form of love.', { gap: 0.5 });
    const c = await g.ui.choice(['The station wants six minutes of quiet. Unbroken.', 'You always say “snacks” like it’s a person.']);
    if (c === 0) { await this.maraLine('The station wants six minutes of quiet. Unbroken.', { dur: 4.2 }); await this.joLine('Six minutes. Of this lake. Mar — it’s already doing it.', { dur: 4.2, gap: 0.5 }); }
    else { await this.maraLine('You always say “snacks” like it’s a person.', { dur: 3.6 }); await this.joLine('Snacks ARE a person. Snacks have a whole personality.', { dur: 4, gap: 0.5 }); }
    await this.joLine('Get in. I’ll be so quiet. You’ll hear me being quiet.', { dur: 4.4, gap: 0.8 });
    g.ui.objective('Get in the canoe.');
    P.frozen = false;
    this.boardIt = g.interact.add({ object: this.canoe, offset: [0, 0.5, 0], radius: 1.4, maxDist: 4.2, label: 'Get in the canoe', icon: 'hand', onUse: () => { this.boardIt.remove(); this.board(); } });
  }

  async board() {
    const w = this.w, g = this.g, P = g.player, jo = this.jo; this.stage = 'boarding'; P.frozen = true; g.ui.setPrompt(null);
    g.audio.at(this.canoe.position.clone().setY(0), 'splash', { vol: 0.5 }); g.audio.at(this.canoe.position.clone(), 'creak', { vol: 0.4 });
    // step down into the bow; Jo takes the stern
    await g.wait(0.5);
    jo.sitT = 1; jo.sit = 0.2; await g.wait(1.0);
    this.stage = 'ride'; this.s = 0; this.rideT = 0; P.noResolve = true; P.canRun = false; P.eyeOverride = 0.95; P.fovScale = 1;
    P.lookLimit = { yaw0: P.yaw, yawRange: 2.3, pitchMin: -0.95, pitchMax: 0.85 };
    this.prevCanoeYaw = this.canoeYaw;
    g.ui.objective('Record the lake.'); this.setupSources();
    g.wait(2).then(() => g.ui.hint('recorder', 'Raise the recorder — hold it still, point it at the sound', 9));
    this.joLine('Hands in the boat at all times. That’s the only rule.', { gap: 1.0 }).then(() => this.maraLine('That’s two rules.', { gap: 0.5 }));
    g.audio.music.setDread(0);
  }

  // ---- the ride -----------------------------------------------------------------------------------------------------------------
  setupSources() {
    const w = this.w, g = this.g;
    this.srcs = [
      { id: 'loon', name: 'the loon', pos: V(-62, 0.6, -175), range: 190, active: false, acc: 0, done: false },
      { id: 'frog', name: 'the frogs in the reeds', pos: V(-26, 0.3, -96), range: 70, active: false, acc: 0, done: false },
      { id: 'jo', name: 'Jo, humming', pos: this.jo.root.position.clone(), range: 8, active: false, acc: 0, done: false, follow: true },
    ];
    this.loonT = 10; this.frogT = 2; this.humT = 22; this.humOn = 0;
  }

  updateRide(dt) {
    const w = this.w, g = this.g, P = g.player, jo = this.jo, C = this.canoe;
    this.rideT += dt;
    // forward speed with the paddle stroke: surge and glide
    const stroke = (this.rideT % 2.4) / 2.4; const surge = 1.7 + 0.45 * Math.sin(stroke * Math.PI * 2 - 0.6);
    const lastS = this.s; this.s += surge * dt;
    const total = ROUTE.length - 1; const L = this.routeLen || (this.routeLen = this.measureRoute());
    const t = clamp(this.s / L) * total; const pos = catmull(ROUTE, t); const ahead = catmull(ROUTE, Math.min(total, t + 0.06));
    let dx = ahead[0] - pos[0], dz = ahead[1] - pos[1]; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    const yaw = Math.atan2(-dx, -dz); this.canoeYaw = damp(this.canoeYaw, yaw, 2.2, dt);
    const bob = Math.sin(this.rideT * 1.3) * 0.012, roll = Math.sin(this.rideT * 0.9) * 0.012 + Math.sin(stroke * Math.PI * 2) * 0.01;
    C.position.set(pos[0], WATER - 0.06 + bob, pos[1]); C.rotation.set(Math.sin(stroke * Math.PI * 2 + 1) * 0.004, this.canoeYaw, roll);
    // the player is in the bow seat; the view turns with the boat
    const dyaw = this.canoeYaw - this.prevCanoeYaw; this.prevCanoeYaw = this.canoeYaw; P.yaw += dyaw; if (P.lookLimit) P.lookLimit.yaw0 = this.canoeYaw;
    const c = Math.cos(this.canoeYaw), s = Math.sin(this.canoeYaw); const loc = (lx, lz) => [pos[0] + lx * c + lz * s, pos[1] - lx * s + lz * c];
    const bow = loc(0, -0.95); P.pos.set(bow[0], WATER - 0.06 + bob + 0.02 - 0.02, bow[1]); P.vel.set(0, 0, 0);
    // Jo in the stern, paddling: hands travel along a short arc beside the hull
    const st = loc(0, 1.5); jo.setPos(st[0], WATER - 0.06 + bob + 0.05 - 0.51 * jo.B.height + 0.05, st[1]); jo.faceYaw(this.canoeYaw + Math.PI); jo.sitT = 1; jo.sitDangle = false;
    const sw = Math.sin(stroke * Math.PI * 2), sd = Math.cos(stroke * Math.PI * 2);
    const hand = (side, lx, lz, dy) => { const q = loc(lx, lz); return V(q[0], WATER + 0.62 + dy, q[1]); };
    jo.reachTo('R', hand('R', -0.52, 0.85 - sw * 0.4, 0.05 + 0.1 * sd)); jo.reachTo('L', hand('L', -0.2, 0.7 - sw * 0.3, 0.45 + 0.05 * sd));
    // the paddle follows his hands
    const pd = C.userData.paddles[1]; pd.position.set(-0.55, C.userData.dep + 0.2, 1.35 - sw * 0.4); pd.rotation.set(0.25 + 0.4 * sw, 0, 0.18); pd.rotation.z = 0.2;
    if (Math.floor(this.rideT / 2.4) !== Math.floor((this.rideT - dt) / 2.4)) g.audio.at(V(...loc(-0.6, 1.0)).setY(WATER), 'paddle', { vol: 0.5 });
    // the lake, from the water: lodge shrinking behind, the island growing ahead
    P.syncCamera && P.syncCamera();
    this.updateSources(dt, loc);
    if (this.s >= L - 0.5) this.arrive();
    // beats along the way
    if (!this.fired.b1 && this.s > 40) { this.fired.b1 = true; this.joLine('Did you know a loon can hold its breath for five minutes?', { dur: 4 }).then(() => this.maraLine('That is not true.', { gap: 0.4 })).then(() => this.joLine('It is a little bit true.', { gap: 0.3 })); }
    if (!this.fired.b2 && this.s > 95) { this.fired.b2 = true; this.joLine('Look back. You can see the porch light from here.', { dur: 4 }); }
  }
  measureRoute() { let L = 0, last = ROUTE[0]; const total = ROUTE.length - 1; for (let i = 1; i <= 200; i++) { const p = catmull(ROUTE, (i / 200) * total); L += Math.hypot(p[0] - last[0], p[1] - last[1]); last = p; } return L; }

  updateSources(dt, loc) {
    const g = this.g, P = g.player, w = this.w; const t = this.rideT;
    // sound events
    this.loonT -= dt; if (this.loonT <= 0) { this.loonT = 17 + Math.random() * 6; const s = this.srcs[0]; g.audio.at(s.pos, 'loon', { vol: 1, tremolo: Math.random() < 0.3 }); s.active = true; setTimeout(() => (s.active = false), 3800); }
    this.frogT -= dt; if (this.frogT <= 0 && this.s < 150) { this.frogT = 0.7 + Math.random() * 0.8; const s = this.srcs[1]; g.audio.at(V(s.pos.x + (Math.random() - 0.5) * 8, 0.3, s.pos.z + (Math.random() - 0.5) * 12), 'frog', { vol: 1 }); }
    this.srcs[1].active = this.s < 150 && Math.hypot(P.pos.x - this.srcs[1].pos.x, P.pos.z - this.srcs[1].pos.z) < 60;
    this.humT -= dt; if (this.humT <= 0 && !this.humOn) { this.humT = 30; this.humOn = 9.5; const jo = this.jo; const src = g.audio.out('voice', jo.root.position.clone().setY(1.4), { reverb: 0.4, ref: 1.8 }); g.audio.voice.hum(src.input, { t: g.audio.ctx.currentTime + 0.1, notes: [[0, 1], [3, 1], [7, 2], [5, 1], [3, 1], [2, 1], [0, 2]], root: 50, tempo: 62, gain: 0.2, gender: 'm' }); src.dispose(12); this.srcs[2].active = true; }
    if (this.humOn > 0) { this.humOn -= dt; if (this.humOn <= 0) this.srcs[2].active = false; }
    this.srcs[2].pos.copy(this.jo.root.position).setY(1.3);
    // the recorder: raise it, hold it still, point it at the sound
    const fwd = V(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch)); const cam = g.camera.position;
    let lvl = 0, best = null;
    for (const s of this.srcs) {
      if (!s.active || s.done) continue;
      const to = s.pos.clone().sub(cam); const d = to.length(); to.divideScalar(d);
      const a = Math.max(0, fwd.dot(to)); const l = Math.pow(a, 7) * clamp(1 - d / s.range, 0, 1) * (this.rec ? 1 : 0.15) * (P.speed < 0.3 ? 1 : 0.8);
      if (l > lvl) { lvl = l; best = s; }
    }
    this.lvl = damp(this.lvl || 0, lvl, 8, dt); this.drawVU();
    if (best && lvl > 0.34 && this.rec) { best.acc += dt; if (best.acc > 2.0) this.captured(best); } else for (const s of this.srcs) s.acc = Math.max(0, s.acc - dt * 0.8);
    // q toggles the recorder
    if (g.input.wasPressed('recorder')) this.setRec(!this.rec);
  }

  setRec(on) {
    const g = this.g, P = g.player; if (this.rec === on) return; this.rec = on; g.hands.liftTarget = on ? 1 : 0; P.fovScale = on ? 0.8 : 1;
    g.audio.sfx('click', { vol: 0.4 }); this.vu.classList.toggle('on', on); if (on) g.ui.hideHint();
  }

  async captured(s) {
    const g = this.g; s.done = true; this.recorded[s.id] = true; const n = Object.keys(this.recorded).length;
    g.audio.sfx('click', { vol: 0.7 }); g.ui.toast(`Recorded: ${s.name}  (${n}/3)`, 4);
    g.journal.add && 0;
    if (s.id === 'jo') { await g.wait(1.2); this.jo.face.set('smile', 1); await this.joLine('Are you recording me? Mar. Mar, that’s so embarrassing. Keep it.', { dur: 4.4 }); }
    else if (s.id === 'loon') { await g.wait(1.0); await this.joLine('Perfect. That’s a six out of five.', { dur: 3 }); }
    else { await g.wait(0.8); await this.joLine('The frogs would like a royalty.', { dur: 3 }); }
    if (n === 3) { await g.wait(1.0); await this.joLine('That’s the whole lake. In your pocket. Told you.', { dur: 3.6 }); }
  }

  buildRecorderUI() {
    const root = this.g.ui.root; const d = document.createElement('div'); d.id = 'vu';
    d.style.cssText = 'position:absolute;left:50%;bottom:11%;transform:translateX(-50%);width:min(34vw,360px);opacity:0;transition:opacity .5s;pointer-events:none;z-index:15';
    d.innerHTML = '<div style="display:flex;align-items:center;gap:12px;font-size:14px;letter-spacing:.3em;text-transform:uppercase;color:#d9cfb8"><i style="width:10px;height:10px;border-radius:50%;background:#e03a2a;box-shadow:0 0 10px #e03a2a;animation:rb 1s infinite"></i>REC<div style="flex:1;height:6px;background:rgba(255,255,255,.12);position:relative;overflow:hidden"><b style="position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#7fc98a,#e8d36a,#e0623a)"></b></div></div>';
    const st = document.createElement('style'); st.textContent = '@keyframes rb{50%{opacity:.25}} #vu.on{opacity:1 !important}'; d.appendChild(st);
    root.appendChild(d); this.vu = d; this.vuBar = d.querySelector('b'); this.w.cleanup(() => d.remove());
  }
  drawVU() { if (this.vuBar) this.vuBar.style.width = `${Math.round(clamp(this.lvl * 2.2) * 100)}%`; }

  // ---- the island ---------------------------------------------------------------------------------------------------------------
  async arrive() {
    const w = this.w, g = this.g, P = g.player, jo = this.jo, C = this.canoe; if (this.fired.arrive) return; this.fired.arrive = true; this.stage = 'island';
    this.setRec(false); P.fovScale = 1; g.ui.hideHint();
    await g.wait(0.3);
    g.audio.at(C.position.clone(), 'thud', { vol: 0.35, f: 90 });
    // step out onto the shore: Jo first, then her
    const I = w.island; const shore = V(I.pos.x + 1.0, 0, I.pos.z + 10.4);
    P.lookLimit = null; P.noResolve = false; P.eyeOverride = null; P.pos.set(shore.x - 1.3, I.height(shore.x - 1.3, shore.z) ?? 0.3, shore.z + 0.5); P.syncCamera && P.syncCamera(); P.walkMul = 0.9; P.frozen = false;
    jo.sitT = 0; jo.sit = 0; jo.reachTo('R', null); jo.reachTo('L', null); const jp = V(shore.x + 0.6, I.height(shore.x + 0.6, shore.z - 0.5) ?? 0.4, shore.z - 0.5); jo.setPos(jp.x, jp.y, jp.z);
    g.ui.objective('Go up to the cairn.');
    await this.joLine('Land ho. Nobody has ever been here. Except us. And a bird.', { dur: 4.2, gap: 0.6 });
    this.stage = 'toCairn';
  }

  async cairnScene() {
    const w = this.w, g = this.g, P = g.player, jo = this.jo, I = w.island; if (this.fired.cairn) return; this.fired.cairn = true; this.stage = 'talk'; P.frozen = true;
    // golden hour at last
    g.setSky('dawn'); g.setGrade('summer', false, 2); g.audio.amb.set('summer', { fade: 2 });
    jo.setPos(I.cairnPos.x + 1.6, (I.height(I.cairnPos.x + 1.6, I.cairnPos.z + 1.0) ?? 0.5) - 0.09 - 0.5 * jo.B.height + 0.06, I.cairnPos.z + 1.0); jo.sitT = 1; jo.sit = 1; jo.sitDangle = true;
    const toward = Math.atan2(I.pos.x - 60 - jo.root.position.x, -100); jo.faceYaw(Math.PI * 0.2);
    jo.lookAt(P.pos.clone().setY(1.5), 0.9);
    await g.wait(1.0);
    await this.joLine('Okay. Golden hour. Go. Be a professional.', { dur: 3.4, gap: 0.6 });
    this.recordQuiet();
    await g.wait(11);
    await this.maraLine('There’s a motor. Someone’s got a motor on the far shore.', { dur: 4, gap: 0.8 });
    await this.maraLine('There’s always a motor. There’s always a plane. I will never get six minutes.', { dur: 5, gap: 0.8 });
    await this.joLine('Mar.', { gap: 1.2 });
    await this.joLine('You are the only person I know who hears the quietest thing in a place and gets mad at it for not being quieter.', { dur: 6.6, gap: 1.2 });
    await this.maraLine('I’m not mad.', { gap: 0.5 }); await this.joLine('You’re a little mad.', { gap: 0.9 });
    jo.face.set('smile', 0.6); jo.lookAt(V(P.pos.x - 6, 1.2, P.pos.z - 30), 0.6);
    await this.joLine('Hey. There’s no rush.', { gap: 1.0 });
    await this.joLine('The lake isn’t going anywhere. It’s been here ten thousand years. It will do exactly this tomorrow.', { dur: 6, gap: 1.4 });
    await this.joLine('Besides — I’m not in any hurry either.', { dur: 3.6, gap: 2.8 });
    g.audio.music.setDread(0);
    await g.wait(3.0);
    // the song
    await this.joLine('I’m writing you something. For your birthday. Seven notes so far.', { dur: 4.6, gap: 0.5 });
    const src = g.audio.out('voice', jo.root.position.clone().setY(1.3), { reverb: 0.5, ref: 1.8 });
    g.audio.voice.hum(src.input, { t: g.audio.ctx.currentTime + 0.1, notes: [[0, 1], [3, 1], [7, 2], [5, 1], [3, 1], [2, 1], [0, 2]], root: 50, tempo: 58, gain: 0.2, gender: 'm' }); src.dispose(12);
    await g.wait(9.5);
    await this.joLine('And then I don’t know. It won’t end.', { dur: 3.6, gap: 0.8 });
    await this.maraLine('It’ll come.', { gap: 0.8 });
    await this.joLine('No rush.', { dur: 3, gap: 4.0 });
    this.ending();
  }

  /** she records the quiet — six minutes' worth, in her head */
  recordQuiet() { const g = this.g; g.audio.sfx('click', { vol: 0.5 }); g.hands.liftTarget = 1; g.wait(11).then(() => (g.hands.liftTarget = 0)); }

  /** the lake goes still; far, far away, a sound that does not belong to July */
  async ending() {
    const w = this.w, g = this.g, jo = this.jo, P = g.player;
    g.audio.music.stopAll && g.audio.music.stopAll(4); g.audio.amb.set('silence', { fade: 4 });
    await g.wait(5);
    g.audio.sfx('ice_boom', { vol: 0.9 });
    await g.wait(2.6);
    jo.lookAt(V(P.pos.x, 1.6, P.pos.z - 80), 1); jo.face.set('smile', 0.1);
    await this.joLine('…Did you hear that?', { dur: 3, gap: 1.2 });
    await this.maraLine('It’s July.', { dur: 2.6, gap: 0.6 });
    g.audio.sfx('ice_crack', { vol: 1.1 }); g.audio.music.sting('low', 0.8);
    await g.fadeTo(1, 3.2, 0xffffff);
    g.audio.stopAllSfx && g.audio.stopAllSfx();
    g.flags.summerDone = true; g.saveCheckpoint('summer:done');
    await g.wait(1.0);
    if (g.goto) await g.goto('lake');
  }

  skipTo() {}
  dispose() { this.disposed = true; this.g.flashlightAvailable = true; this.g.hands.liftTarget = 0; }

  update(dt) {
    const w = this.w, g = this.g, P = g.player, jo = this.jo;
    if (this.stage === 'meadow') { const d = Math.hypot(P.pos.x - 4, P.pos.z - (DOCK_END + 3.4)); if (d < 6.5) this.meetOnDock(); }
    else if (this.stage === 'ride') this.updateRide(dt);
    else if (this.stage === 'toCairn') { const d = Math.hypot(P.pos.x - w.island.cairnPos.x, P.pos.z - w.island.cairnPos.z); if (d < 5.2) this.cairnScene(); }
    if (this.stage === 'meadow' || this.stage === 'dock' || this.stage === 'boarding') { jo.lookAt(P.pos.clone().setY(1.6), 0.6); }
  }
}
