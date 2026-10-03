// First-person arms & hands: IK arms in parka sleeves, knit gloves with articulated fingers, held items.
// The right index finger carries a yellow repair stitch — the same one the Searcher's glove has.
import * as THREE from 'three';
import { pbr, solid } from '../gfx/materials.js';
import { clamp, damp, lerp } from '../core/util.js';
import { worldUV } from '../gfx/geo.js';
import { settings } from '../core/settings.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export const POSES = {
  relaxed: { f: [0.22, 0.3, 0.34, 0.4], t: 0.25 },
  open: { f: [0.04, 0.04, 0.05, 0.06], t: 0.05 },
  grip: { f: [0.82, 0.86, 0.9, 0.9], t: 0.55 },       // around a flashlight
  fist: { f: [1, 1, 1, 1], t: 0.7 },
  point: { f: [0.04, 0.95, 0.95, 0.95], t: 0.45 },
  pinch: { f: [0.5, 0.35, 0.4, 0.45], t: 0.55 },
  reach: { f: [0.1, 0.12, 0.14, 0.16], t: 0.1 },
  hold: { f: [0.55, 0.6, 0.62, 0.62], t: 0.4 },       // holding a flat thing
  cup: { f: [0.35, 0.38, 0.42, 0.45], t: 0.3 },
  press: { f: [0.15, 0.6, 0.6, 0.6], t: 0.25 },
};

function tube(r0, r1, len, seg = 12, cap = true) {
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, !cap); g.translate(0, len / 2, 0); return g;
}

/** one gloved hand. Local axes: +Y fingers, +Z back of hand, +X thumb side (for the LEFT hand; the right is mirrored) */
class Hand {
  constructor(side, gloveMat, stitchMat) {
    this.side = side; this.root = new THREE.Group();
    this.palm = new THREE.Mesh(worldUV(new THREE.BoxGeometry(0.082, 0.092, 0.034, 3, 3, 2), 0.1), gloveMat);
    this.palm.position.set(0, 0.046, 0); this.palm.castShadow = false;
    // round the palm a little by displacing vertices
    const p = this.palm.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const k = 1 - 0.08 * (Math.abs(x) / 0.041) ** 2; p.setZ(i, z * k); }
    this.palm.geometry.computeVertexNormals();
    this.root.add(this.palm);
    this.fingers = [];
    const defs = [ // x offset, length scales [prox, mid, dist], radius, splay
      { x: 0.030, L: [0.040, 0.026, 0.021], r: 0.0108, splay: -0.05 },     // index
      { x: 0.010, L: [0.044, 0.029, 0.022], r: 0.0112, splay: -0.01 },     // middle
      { x: -0.010, L: [0.040, 0.026, 0.021], r: 0.0105, splay: 0.03 },     // ring
      { x: -0.029, L: [0.032, 0.021, 0.018], r: 0.0095, splay: 0.07 },     // pinky
    ];
    defs.forEach((d, fi) => {
      const base = new THREE.Group(); base.position.set(d.x, 0.092, -0.002); base.rotation.z = d.splay; this.root.add(base);
      const segs = []; let parent = base;
      d.L.forEach((len, si) => {
        const pivot = new THREE.Group(); parent.add(pivot);
        const r = d.r * (1 - si * 0.1);
        const m = new THREE.Mesh(tube(r, r * 0.92, len, 8), fi === 0 && this.side === 'R' && si === 1 ? stitchMat : gloveMat); m.castShadow = false;
        pivot.add(m);
        const knuckle = new THREE.Mesh(new THREE.SphereGeometry(r * 0.98, 8, 6), gloveMat); pivot.add(knuckle);
        const next = new THREE.Group(); next.position.y = len; pivot.add(next); parent = next;
        segs.push(pivot);
      });
      this.fingers.push(segs);
    });
    // thumb: 2 segments from the side of the palm
    const tb = new THREE.Group(); tb.position.set(0.04, 0.02, 0.002); tb.rotation.set(0, 0, -0.9); this.root.add(tb);
    const t1 = new THREE.Group(); tb.add(t1); const m1 = new THREE.Mesh(tube(0.0125, 0.0115, 0.04, 8), gloveMat); t1.add(m1); const k1 = new THREE.Mesh(new THREE.SphereGeometry(0.0122, 8, 6), gloveMat); t1.add(k1);
    const t2 = new THREE.Group(); t2.position.y = 0.04; t1.add(t2); const m2 = new THREE.Mesh(tube(0.0112, 0.0095, 0.03, 8), gloveMat); t2.add(m2); const k2 = new THREE.Mesh(new THREE.SphereGeometry(0.0108, 8, 6), gloveMat); t2.add(k2);
    this.thumb = [tb, t1, t2];
    // wrist cuff of the glove
    const cuff = new THREE.Mesh(tube(0.036, 0.036, 0.05, 14), gloveMat); cuff.position.y = -0.045; cuff.castShadow = false; this.root.add(cuff);
    this.curl = [0.2, 0.2, 0.2, 0.2]; this.tcurl = 0.2; this.tgtCurl = [0.2, 0.2, 0.2, 0.2]; this.tgtT = 0.2;
    this.applyCurl();
    if (side === 'R') this.root.scale.x = -1;
  }
  setPose(p) { this.tgtCurl = [...p.f]; this.tgtT = p.t; }
  applyCurl() {
    const A = [1.35, 1.65, 1.1];
    this.fingers.forEach((segs, i) => { const c = this.curl[i]; segs.forEach((s, k) => { s.rotation.x = c * A[k] * (k === 0 ? 0.9 : 1); }); });
    const t = this.tcurl; this.thumb[0].rotation.set(-0.15 - t * 0.5, t * 0.25, -0.9 + t * 0.55); this.thumb[1].rotation.x = -t * 0.55; this.thumb[2].rotation.x = -t * 0.8;
  }
  update(dt) {
    for (let i = 0; i < 4; i++) this.curl[i] = damp(this.curl[i], this.tgtCurl[i], 14, dt);
    this.tcurl = damp(this.tcurl, this.tgtT, 14, dt);
    this.applyCurl();
  }
}

function solveArm(S, T, L1, L2, pole, outE, outW) {
  const d = _v.copy(T).sub(S); let dist = d.length();
  const dd = clamp(dist, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  d.normalize();
  const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd); const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _w.copy(pole).addScaledVector(d, -pole.dot(d)); if (_w.lengthSq() < 1e-6) _w.set(0, -1, 0); _w.normalize();
  outE.copy(S).addScaledVector(d, a).addScaledVector(_w, h);
  outW.copy(S).addScaledVector(d, dd);
}

function orient(mesh, from, to) { _v.copy(to).sub(from); const l = _v.length(); mesh.position.copy(from); mesh.quaternion.setFromUnitVectors(UP, _v.divideScalar(l || 1)); mesh.scale.y = l / mesh.userData.len; }

const cuffMats = new WeakMap();
function glovemat0(sleeve) { let m = cuffMats.get(sleeve); if (!m) { m = pbr('fabric_wool', { key: 'cuff2', normal: 0.6, tint: 0x6a6a5e }).clone(); m.userData.shared = true; cuffMats.set(sleeve, m); } return m; }

class Arm {
  constructor(side, sleeveMat, gloveMat, stitchMat) {
    this.side = side; this.root = new THREE.Group();
    const L1 = this.L1 = 0.285, L2 = this.L2 = 0.265;
    this.upper = new THREE.Mesh(worldUV(tube(0.058, 0.05, L1, 14), 0.5), sleeveMat); this.upper.userData.len = L1;
    this.lower = new THREE.Mesh(worldUV(tube(0.05, 0.043, L2, 14), 0.5), sleeveMat); this.lower.userData.len = L2;
    this.elbow = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 10), sleeveMat);
    this.shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), sleeveMat);
    // fur-ish cuff at the end of the sleeve
    this.cuffMesh = new THREE.Mesh(worldUV(tube(0.053, 0.051, 0.055, 14), 0.4), glovemat0(sleeveMat)); this.cuffMesh.userData.len = 0.05;
    for (const m of [this.upper, this.lower, this.elbow, this.shoulderBall, this.cuffMesh]) { m.castShadow = false; m.receiveShadow = true; this.root.add(m); }
    this.hand = new Hand(side, gloveMat, stitchMat); this.root.add(this.hand.root);
    this.shoulder = new THREE.Vector3(side === 'L' ? -0.2 : 0.2, -0.25, 0.12);
    this.target = new THREE.Vector3(); this.handDir = new THREE.Vector3(0, 0.4, -0.9).normalize(); this.palmN = new THREE.Vector3(side === 'L' ? 1 : -1, 0, 0);
    this.pole = new THREE.Vector3(side === 'L' ? -0.6 : 0.6, -1, 0.2).normalize();
    this.E = new THREE.Vector3(); this.W = new THREE.Vector3();
    // blended pose state
    this.pT = new THREE.Vector3(); this.pDir = this.handDir.clone(); this.pPalm = this.palmN.clone();
  }
  /** set desired wrist target & hand orientation in camera space */
  aim(target, dir, palm, pole) { this.target.copy(target); this.handDir.copy(dir).normalize(); this.palmN.copy(palm).normalize(); if (pole) this.pole.copy(pole).normalize(); }
  update(dt, rate = 12) {
    this.pT.lerp(this.target, 1 - Math.exp(-rate * dt)); this.pDir.lerp(this.handDir, 1 - Math.exp(-rate * dt)).normalize(); this.pPalm.lerp(this.palmN, 1 - Math.exp(-rate * dt)).normalize();
    solveArm(this.shoulder, this.pT, this.L1, this.L2, this.pole, this.E, this.W);
    orient(this.upper, this.shoulder, this.E); orient(this.lower, this.E, this.W);
    this.elbow.position.copy(this.E); this.shoulderBall.position.copy(this.shoulder);
    // forearm direction defines cuff placement
    const fdir = _w.copy(this.W).sub(this.E).normalize();
    this.cuffMesh.position.copy(this.W).addScaledVector(fdir, -0.04); this.cuffMesh.quaternion.setFromUnitVectors(UP, fdir);
    // hand basis: Y = fingers, Z = back-of-hand (opposite palm), X = Y x Z
    const y = this.pDir.clone(); let z = this.pPalm.clone().negate(); z.addScaledVector(y, -z.dot(y)).normalize(); const x = new THREE.Vector3().crossVectors(y, z).normalize();
    _m.makeBasis(x, y, z); this.hand.root.quaternion.setFromRotationMatrix(_m);
    this.hand.root.position.copy(this.W).addScaledVector(y, 0.012);
    this.hand.update(dt);
  }
}

/** Held items (models) ------------------------------------------------------------------------------------------------ */
function makeFlashlight() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(tube(0.021, 0.021, 0.15, 14), solid(0x1b1d20, { rough: 0.35, metal: 0.7 })); body.position.y = -0.09;
  const ring = new THREE.Mesh(tube(0.023, 0.023, 0.012, 14), solid(0x8d8f93, { rough: 0.3, metal: 1 })); ring.position.y = -0.1; ring.userData.noShadow = 1;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.024, 0.05, 18), solid(0x24262a, { rough: 0.3, metal: 0.8 })); head.position.y = -0.005;
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffe9bf, emissiveIntensity: 0, roughness: 0.1 });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.029, 20), lensMat); lens.position.y = 0.0205; lens.rotation.x = -Math.PI / 2;
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.012, 10), solid(0xb33c2a, { rough: 0.5 })); button.position.set(0, -0.06, 0.022); button.rotation.x = Math.PI / 2;
  g.add(body, ring, head, lens, button);
  g.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  g.userData.lensMat = lensMat;
  return g;
}
function makeRecorder() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.13, 0.034), solid(0x2a2c2f, { rough: 0.5, metal: 0.3 })); body.position.y = 0.0;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.034), new THREE.MeshStandardMaterial({ color: 0x0a1410, emissive: 0x38ff88, emissiveIntensity: 0.6, roughness: 0.2 })); screen.position.set(0, 0.026, 0.0175);
  const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 12), solid(0x111213, { rough: 0.9 })); mic.position.set(0, 0.09, 0);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.01, 12), solid(0xb9892c, { rough: 0.4, metal: 0.8 })); knob.position.set(0.0, -0.025, 0.021); knob.rotation.x = Math.PI / 2;
  g.add(body, screen, mic, knob); g.userData.screen = screen;
  g.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  return g;
}
function makeLantern() {
  const g = new THREE.Group();
  const frame = solid(0x2a2118, { rough: 0.5, metal: 0.8 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.02, 10), frame); base.position.y = -0.1;
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.05, 10), frame); top.position.y = 0.06;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.14, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xff9a30, emissiveIntensity: 1.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.2 })); glass.position.y = -0.02;
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a })); flame.scale.set(0.7, 1.4, 0.7); flame.position.y = -0.04;
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.004, 6, 16, Math.PI), frame); bail.position.y = 0.085;
  g.add(base, top, glass, flame, bail); g.userData.flame = flame;
  g.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  return g;
}
function makePhone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.145, 0.009), solid(0x15161a, { rough: 0.3, metal: 0.6 }));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.13), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x7ca7ff, emissiveIntensity: 0.0, roughness: 0.1 })); scr.position.z = 0.0047;
  g.add(body, scr); g.userData.screen = scr; g.traverse((m) => { if (m.isMesh) m.castShadow = false; });
  return g;
}

export class Hands {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group(); this.root.name = 'hands';
    const sleeve = pbr('canvas', { key: 'sleeve2', normal: 0.5, tint: 0x8a9684 }).clone(); sleeve.userData.shared = true; sleeve.color.setRGB(1.25, 1.35, 1.2);
    const glove = pbr('wool_knit', { key: 'glove', normal: 0.8 }).clone(); glove.userData.shared = true; glove.color.setRGB(1.1, 1.15, 1.05);
    const stitch = new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.8 }); stitch.userData.shared = true;
    this.arms = { L: new Arm('L', sleeve, glove, stitch), R: new Arm('R', sleeve, glove, stitch) };
    this.root.add(this.arms.L.root, this.arms.R.root);
    this.items = { flashlight: makeFlashlight(), recorder: makeRecorder(), lantern: makeLantern(), phone: makePhone() };
    for (const it of Object.values(this.items)) { it.visible = false; this.root.add(it); }
    this.held = { L: null, R: 'flashlight' };
    this.pose = { L: 'relaxed', R: 'grip' };
    this.reach = { L: 0, R: 0 }; this.reachTarget = { L: null, R: null }; this.reachT = { L: 0, R: 0 };
    this.sway = new THREE.Vector3(); this.lag = new THREE.Vector2(); this.lastYaw = 0; this.lastPitch = 0;
    this.lift = 0; this.liftTarget = 0;       // raise hands toward chest (hiding, stillness)
    this.lowered = 0; this.loweredTarget = 0; // hide hands entirely (cutscenes, reading)
    this.visible = true;
    this.lanternSwing = { a: 0, v: 0 };
    this.flashHeadCam = new THREE.Vector3(0.16, -0.13, -0.28);
    this.beat = 0;
    game.camera.add(this.root);
    this.root.scale.setScalar(0.82); this.root.position.set(0, -0.01, -0.04);
    // a faint cool bounce so the hands never drop to pure black in moonlight
    this.fill = new THREE.PointLight(0x9fb4d8, 0.9, 1.5, 2); this.fill.position.set(0, 0.12, 0.12); game.camera.add(this.fill);
    this.useAnim = null;
  }
  setVisible(v) { this.visible = v; this.root.visible = v; }
  hold(side, item) { this.held[side] = item; }
  holdFlashlight() { this.held.R = 'flashlight'; this.pose.R = 'grip'; }
  setPose(side, name) { this.pose[side] = name; }
  /** reach one hand toward a world point (used by interactions). dur seconds */
  reachWorld(side, world, dur = 0.5, pose = 'reach') {
    this.reachTarget[side] = world.clone(); this.reachT[side] = dur; this._reachDur = dur; this.reachPose = pose; this.reachSide = side;
  }
  /** play a named gesture: 'push' | 'grab' | 'press' | 'open' */
  gesture(name, world, side = 'R') {
    const dur = name === 'press' ? 0.35 : 0.55;
    this.reachWorld(side, world, dur, name === 'press' ? 'point' : (name === 'grab' ? 'pinch' : 'reach'));
  }

  update(dt) {
    const g = this.game, p = g.player, cam = g.camera;
    if (!this.visible) return;
    this.lift = damp(this.lift, this.liftTarget, 4, dt); this.lowered = damp(this.lowered, this.loweredTarget, 5, dt);
    const spd = clamp(p.speed / 3.1), bob = p.bobPhase;
    const breath = Math.sin(p.breathPhase * Math.PI * 2) * 0.004 * p.breathAmp;
    // inertia: hands lag behind turns
    let dyaw = p.yaw - this.lastYaw; if (dyaw > Math.PI) dyaw -= Math.PI * 2; if (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const dpitch = p.pitch - this.lastPitch; this.lastYaw = p.yaw; this.lastPitch = p.pitch;
    this.lag.x = damp(this.lag.x, clamp(dyaw * 0.9, -0.12, 0.12), 9, dt) ; this.lag.y = damp(this.lag.y, clamp(dpitch * 0.9, -0.1, 0.1), 9, dt);
    const crouch = p.crouching ? 0.06 : 0;
    const lowered = this.lowered * 0.5;
    const bobX = Math.sin(bob) * 0.012 * spd * (settings.get('headBob') ? 1 : 0), bobY = Math.abs(Math.sin(bob)) * -0.014 * spd * (settings.get('headBob') ? 1 : 0);
    const fear = p.fear; const trem = fear * 0.0035 * Math.sin(g.time * 40);
    const lf = this.lift;

    for (const side of ['L', 'R']) {
      const arm = this.arms[side], s = side === 'L' ? -1 : 1;
      let T = _v, dir = new THREE.Vector3(), palm = new THREE.Vector3(), pole = new THREE.Vector3(s * 0.7, -1, 0.1);
      const held = this.held[side];
      let pose = this.pose[side];
      if (side === 'R' && held === 'flashlight') {
        // flashlight hand: right, forward and a little low; points where the lagged beam points
        T = new THREE.Vector3(0.17 + this.lag.x * 0.6 + bobX, -0.17 + bobY + breath - crouch - lowered + lf * 0.1, -0.33 + lf * 0.04);
        dir.set(0.0, 0.2, -0.98); palm.set(-0.95, -0.1, 0.0); pole.set(0.6, -1, 0.2);
        // beam pitches with the lag between camera and flashlight orientation
        dir.x += this.lag.x * 1.2; dir.y += -this.lag.y * 1.2;
        pose = 'grip';
      } else if (side === 'L' && held === 'recorder') {
        T = new THREE.Vector3(-0.15 + bobX * 0.6, -0.13 + bobY + breath - lowered, -0.36); dir.set(0.15, 0.95, -0.25); palm.set(0.8, 0.15, 0.4); pose = 'hold';
      } else if (held === 'lantern') {
        T = new THREE.Vector3(s * 0.2 + this.lag.x * 0.3, -0.2 + bobY - lowered + breath, -0.34); dir.set(0, 0.3, -0.95); palm.set(-s, -0.1, 0); pose = 'grip';
      } else if (held === 'phone') {
        T = new THREE.Vector3(s * 0.11 + bobX * 0.4, -0.12 + breath - lowered, -0.33); dir.set(-s * 0.2, 0.95, -0.15); palm.set(s * 0.6, 0.3, 0.5); pose = 'hold';
      } else {
        // free hand: relaxed at the side, swinging slightly while walking
        const sw = Math.sin(bob + (side === 'L' ? 0 : Math.PI)) * 0.04 * spd;
        T = new THREE.Vector3(s * 0.24 + bobX * 0.3, -0.31 + breath * 0.6 - crouch - lowered + lf * 0.14, -0.28 + sw + lf * 0.08);
        dir.set(-s * 0.15, 0.35, -0.92); palm.set(-s * 0.9, -0.1, -0.2); pose = this.pose[side] || 'relaxed';
      }
      T = T.clone();
      T.x += trem; T.y += Math.sin(g.time * 33 + s) * trem * 0.5;
      // reaching toward a world point
      if (this.reachT[side] > 0) {
        this.reachT[side] -= dt; const k = 1 - Math.max(0, this.reachT[side]) / (this._reachDur || 0.5);
        const e = Math.sin(clamp(k * 1.0) * Math.PI);          // out and back
        const w = this.reachTarget[side];
        if (w) {
          const local = cam.worldToLocal(w.clone());
          // clamp reach distance
          const from = arm.shoulder; const dd = local.clone().sub(from); const mx = 0.52; if (dd.length() > mx) dd.setLength(mx);
          const tgt = from.clone().add(dd);
          T.lerp(tgt, e); const rd = dd.clone().normalize(); dir.lerp(rd, e * 0.9);
          palm.lerp(new THREE.Vector3(-s * 0.3, -0.8, 0.2), e * 0.6); pose = this.reachPose || 'reach';
          if (e > 0.5) this.pose[side] = pose;
        }
        if (this.reachT[side] <= 0) this.reachTarget[side] = null;
      }
      arm.aim(T, dir, palm, pole);
      arm.hand.setPose(POSES[pose] || POSES.relaxed);
      arm.update(dt);
    }
    // place held items in the hand (child of root, positioned at wrist+offset)
    for (const [name, it] of Object.entries(this.items)) it.visible = false;
    for (const side of ['L', 'R']) {
      const name = this.held[side]; if (!name) continue;
      const it = this.items[name]; if (!it) continue; it.visible = true;
      const arm = this.arms[side], hand = arm.hand.root;
      // item sits in the palm: use hand's quaternion
      it.position.copy(hand.position); it.quaternion.copy(hand.quaternion);
      const off = new THREE.Vector3();
      if (name === 'flashlight') {
        // the beam direction (lagged) expressed in camera space; the torch points that way, gripped near its middle
        const rel = cam.quaternion.clone().invert().multiply(p.flashDir);
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(rel);
        it.quaternion.setFromUnitVectors(UP, fwd);
        const palm = new THREE.Vector3(0, 0.05, 0).applyQuaternion(hand.quaternion).add(hand.position);
        it.position.copy(palm).addScaledVector(fwd, 0.085).add(new THREE.Vector3(0.0, 0.006, 0.0));
        this.flashHeadCam.copy(it.position).addScaledVector(fwd, 0.03);
      }
      else if (name === 'recorder') { off.set(0, 0.06, 0.0); it.position.add(off.applyQuaternion(hand.quaternion)); it.quaternion.copy(hand.quaternion); }
      else if (name === 'lantern') {
        // pendulum: hangs from the fingers
        const sw = this.lanternSwing; const accel = (this.lag.x * -40) + Math.sin(p.bobPhase) * spd * 2.2; sw.v += (-sw.a * 28 - sw.v * 2.2 + accel) * dt; sw.a += sw.v * dt;
        it.position.copy(hand.position).add(new THREE.Vector3(0, -0.03, 0.0)); it.quaternion.identity(); it.rotateZ(clamp(sw.a, -0.5, 0.5)); it.rotateX(clamp(-sw.a * 0.3, -0.2, 0.2));
        it.position.y -= 0.0;
        const fl = it.userData.flame; if (fl) fl.scale.set(0.7, 1.3 + Math.sin(g.time * 17) * 0.15, 0.7);
      } else if (name === 'phone') { off.set(0, 0.05, 0.0); it.position.add(off.applyQuaternion(hand.quaternion)); it.quaternion.copy(hand.quaternion); it.rotateX(-Math.PI / 2 * 0.0); }
    }
    // lens glow follows the flashlight state
    const fl = this.items.flashlight.userData.lensMat; if (fl) fl.emissiveIntensity = g.lights.flashLevel * 6;
  }

  /** world position & direction of the flashlight lens (for beam placement); camera-space fallback handled by LightRig */
}

/** Soft visible light cone for the flashlight; strength depends on fog/dust in the area. */
export class FlashBeam {
  constructor(game) {
    this.game = game;
    const L = 14;
    const geo = new THREE.ConeGeometry(Math.tan(0.4) * L, L, 28, 1, true); geo.translate(0, -L / 2, 0); geo.rotateX(-Math.PI / 2);   // apex at origin, opening toward -Z
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uInt: { value: 0 }, uLen: { value: L }, uCol: { value: new THREE.Color(1.0, 0.93, 0.78) } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vT; uniform float uLen; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix * normal; vT = clamp(-position.z / uLen, 0.0, 1.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vV; varying float vT; uniform float uInt; uniform vec3 uCol;
        void main(){ float f = abs(dot(normalize(vN), normalize(vV))); float edge = pow(f, 1.6); float along = (1.0 - vT) * smoothstep(0.0, 0.06, vT); gl_FragColor = vec4(uCol * uInt * 0.55, edge * along * uInt * 0.16); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
    game.scene.add(this.mesh);
    this.vis = 0.5; this.visTarget = 0.5;
  }
  setVisibility(v) { this.visTarget = v; }
  update(dt) {
    const g = this.game, L = g.lights;
    this.vis = damp(this.vis, this.visTarget, 1.5, dt);
    const on = L.flashLevel;
    this.mat.uniforms.uInt.value = on * this.vis * (settings.preset.volumetrics);
    this.mesh.visible = on > 0.02 && this.vis > 0.01;
    if (!this.mesh.visible || !L.flashOrigin) return;
    this.mesh.position.copy(L.flashOrigin); _q.setFromUnitVectors(new THREE.Vector3(0, 0, -1), L.flashDir); this.mesh.quaternion.copy(_q);
  }
  dispose() { this.game.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
