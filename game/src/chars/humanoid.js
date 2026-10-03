// Skinned humanoid: skeleton, body meshes skinned by bone proximity, articulated hands, IK limbs, procedural animation
// (breathing, weight shift, walk, sit, cook, reach, look-at with eyes). Used for Jo and the Searcher (and Mara in the reveal).
import * as THREE from 'three';
import { buildHead, FACE_PRESETS } from './face.js';
import { clamp, damp, lerp, smooth, RNG } from '../core/util.js';
import { pbr, solid } from '../gfx/materials.js';
import { worldUV } from '../gfx/geo.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const DOWN = V(0, -1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();

export const BODY = {
  jo: { height: 1.0, shoulder: 0.2, chest: [0.165, 0.105], waist: [0.14, 0.095], hip: [0.165, 0.105], arm: 0.046, leg: 0.088, armLen: 1.0, neck: 0.05 },
  searcher: { height: 1.17, shoulder: 0.21, chest: [0.15, 0.1], waist: [0.12, 0.085], hip: [0.145, 0.1], arm: 0.04, leg: 0.074, armLen: 1.15, neck: 0.044 },
  mara: { height: 0.96, shoulder: 0.18, chest: [0.145, 0.095], waist: [0.12, 0.085], hip: [0.16, 0.1], arm: 0.04, leg: 0.083, armLen: 0.97, neck: 0.043 },
};

/** a joint = Bone; helper to create the chain */
function bone(name, parent, x, y, z) { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z); if (parent) parent.add(b); return b; }

function ellipseRing(center, tangent, rx, rz, ref, seg, out) {
  // frame: tangent t, x axis = ref projected, z = t x x
  const t = tangent.clone().normalize(); const xAx = ref.clone().addScaledVector(t, -ref.dot(t)).normalize(); const zAx = new THREE.Vector3().crossVectors(xAx, t).normalize();
  for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2; out.push(center.clone().addScaledVector(xAx, Math.cos(a) * rx).addScaledVector(zAx, Math.sin(a) * rz)); }
}

/**
 * Build a tube mesh along `path` with per-point radii [rx, rz]; skin to bones by proximity.
 * bones: [{bone, a:Vector3, b:Vector3}] segments in rest pose (model space)
 */
function skinnedTube({ path, radii, seg = 16, bones, boneIndex, sigma = 0.06, ref = V(1, 0, 0), capEnds = true, uvTile = 0.4, maxInf = 3 }) {
  const verts = [], uvs = [], idx = [];
  const rings = path.length;
  for (let i = 0; i < rings; i++) {
    const tan = i === 0 ? path[1].clone().sub(path[0]) : (i === rings - 1 ? path[i].clone().sub(path[i - 1]) : path[i + 1].clone().sub(path[i - 1]));
    const ring = []; ellipseRing(path[i], tan, radii[i][0], radii[i][1], ref, seg, ring);
    ring.forEach((v, k) => { verts.push(v); uvs.push([(k / seg) * (Math.PI * 2 * radii[i][0]) / uvTile, (i / (rings - 1)) * path[0].distanceTo(path[rings - 1]) / uvTile]); });
  }
  for (let i = 0; i < rings - 1; i++) for (let k = 0; k < seg; k++) {
    const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = (i + 1) * seg + k, d = (i + 1) * seg + ((k + 1) % seg);
    idx.push(a, c, b, b, c, d);
  }
  if (capEnds) for (const [ri, flip] of [[0, true], [rings - 1, false]]) {
    const center = path[ri].clone(); const ci = verts.length; verts.push(center); uvs.push([0, 0]);
    for (let k = 0; k < seg; k++) { const a = ri * seg + k, b = ri * seg + ((k + 1) % seg); flip ? idx.push(ci, b, a) : idx.push(ci, a, b); }
  }
  const n = verts.length; const pos = new Float32Array(n * 3), skinI = new Uint16Array(n * 4), skinW = new Float32Array(n * 4), uv = new Float32Array(n * 2);
  const s2 = sigma * sigma;
  verts.forEach((v, i) => {
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; uv[i * 2] = uvs[i][0]; uv[i * 2 + 1] = uvs[i][1];
    // distance to each bone segment
    const ws = bones.map((sg) => {
      _v.copy(sg.b).sub(sg.a); const l2 = _v.lengthSq() || 1e-6; let t = _v2.copy(v).sub(sg.a).dot(_v) / l2; t = clamp(t); _v2.copy(sg.a).addScaledVector(_v, t); const d2 = v.distanceToSquared(_v2);
      return { i: boneIndex.get(sg.bone), w: Math.exp(-d2 / s2) };
    }).sort((a, b) => b.w - a.w).slice(0, maxInf);
    let sum = ws.reduce((s, x) => s + x.w, 0) || 1;
    ws.forEach((x, k) => { skinI[i * 4 + k] = x.i; skinW[i * 4 + k] = x.w / sum; });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(skinI, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(skinW, 4));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export class Humanoid {
  /**
   * opts: { kind:'jo'|'searcher'|'mara', outfit:'flannel'|'tee'|'parka', shirt, pants, skin, boots, hood:bool, wet:0..1 }
   */
  constructor(opts = {}) {
    this.kind = opts.kind || 'jo'; this.opts = opts;
    const B = this.B = { ...BODY[this.kind], ...(opts.body || {}) };
    this.root = new THREE.Group(); this.root.name = 'humanoid:' + this.kind;
    this.time = Math.random() * 10;
    // ---------------- skeleton (rest pose; A-pose arms) ----------------
    const H = B.height, S = B.shoulder, AL = B.armLen;
    const root = this.bRoot = new THREE.Bone(); root.name = 'root';
    const hips = this.hips = bone('hips', root, 0, 0.98 * H, 0);
    const spine = this.spine = bone('spine', hips, 0, 0.11 * H, 0);
    const chest = this.chest = bone('chest', spine, 0, 0.17 * H, 0);
    const neck = this.neck = bone('neck', chest, 0, 0.24 * H, 0.0);
    const head = this.headBone = bone('head', neck, 0, 0.09 * H, 0.0);
    this.parts = { L: {}, R: {} };
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      const clav = bone('clav' + side, chest, sx * 0.04, 0.2 * H, 0);
      const ua = bone('upperArm' + side, clav, sx * (S - 0.04), 0.0, 0);
      const fa = bone('foreArm' + side, ua, 0, -0.295 * AL, 0);
      const hand = bone('hand' + side, fa, 0, -0.265 * AL, 0);
      const th = bone('thigh' + side, hips, sx * 0.092, -0.03, 0);
      const sh = bone('shin' + side, th, 0, -0.44 * H, 0);
      const ft = bone('foot' + side, sh, 0, -0.43 * H, 0);
      const toe = bone('toe' + side, ft, 0, -0.035, 0.12);
      Object.assign(this.parts[side], { clav, ua, fa, hand, th, sh, ft, toe });
    }
    // coat tails for secondary motion (parka): chain hanging from the hips front/back
    this.bones = []; root.traverse((b) => { if (b.isBone) this.bones.push(b); });
    this.root.add(root);
    this.root.updateMatrixWorld(true);
    // rest-pose world positions of bones (model space, root at origin)
    this.rest = {}; for (const b of this.bones) { this.rest[b.name] = b.getWorldPosition(new THREE.Vector3()); }
    // A-pose: rotate arms outward a little (bake into rest by rotating bones then re-reading)
    for (const side of ['L', 'R']) { const sg = side === 'L' ? 1 : -1; this.parts[side].ua.rotation.z = sg * 0.05; }
    this.root.updateMatrixWorld(true);
    this.rest = {}; for (const b of this.bones) this.rest[b.name] = b.getWorldPosition(new THREE.Vector3());
    this.boneIndex = new Map(this.bones.map((b, i) => [b, i]));
    this.skeleton = new THREE.Skeleton(this.bones);   // inverses computed from current (A-pose) world matrices
    this.restLocal = this.bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));

    // face first (its skin material is shared by neck / forearms / hands)
    this.face = buildHead(this.kind, opts.face || {});
    this.headBone.add(this.face.root); this.face.root.position.set(0, 0.092, 0.012); this.face.root.scale.setScalar(1.13);
    this.buildMeshes();
    if (opts.hood) this.buildHood();
    // hands
    this.buildHands();
    this.pose = { breath: 0, sway: V(), lookTarget: null, lookW: 0 };
    this.walkPhase = 0; this.walkAmt = 0; this.state = 'idle'; this.sit = 0; this.sitT = 0; this.stir = 0; this.carry = 0;
    this.targets = { L: null, R: null }; this.reach = { L: 0, R: 0 }; this.reachT = { L: 0, R: 0 };
    this.headLook = new THREE.Quaternion();
    this.vel = V(); this.lastPos = V(); this.coatSwing = { a: 0, v: 0, b: 0, w: 0 };
    this.reset();
  }

  reset() { this.bones.forEach((b, i) => { b.position.copy(this.restLocal[i].p); b.quaternion.copy(this.restLocal[i].q); }); }

  segs(names) { return names.map(([a, b]) => ({ bone: this[a] || this.parts.L[a] || this.parts.R[a], a: this.rest[this._n(a)].clone(), b: this.rest[this._n(b)].clone() })); }
  _n(k) { return k; }

  buildMeshes() {
    const B = this.B, o = this.opts, H = B.height;
    const R = this.rest; const bi = this.boneIndex;
    const seg = (name, nextName) => ({ bone: this.boneByName(name), a: R[name].clone(), b: R[nextName].clone() });
    const bn = (n) => this.boneByName(n);
    const type = o.outfit || 'flannel';
    // materials
    const shirtMat = this.makeShirt(); const pantsMat = this.makePants();
    // torso: shirt/jacket
    const puff = type === 'parka' ? 1.32 : 1.0;
    const hipsY = R.hips.y, chestY = R.chest.y, neckY = R.neck.y;
    const ring = (y, rx, rz, zo = 0) => ({ p: V(0, y, zo), r: [rx * puff, rz * puff] });
    const sh = B.shoulder;
    const t = [ring(hipsY - 0.08 * H, B.hip[0] * 0.95, B.hip[1] * 0.98), ring(hipsY, B.hip[0], B.hip[1]), ring(hipsY + 0.08 * H, B.waist[0], B.waist[1], 0.003), ring(hipsY + 0.17 * H, B.waist[0] * 1.04, B.waist[1] * 1.02),
      ring(chestY + 0.0, B.chest[0] * 1.0, B.chest[1] * 1.06, 0.006), ring(chestY + 0.08 * H, B.chest[0] * 1.06, B.chest[1] * 1.06, 0.004), ring(neckY - 0.07 * H, sh * 0.98, B.chest[1] * 0.92),
      ring(neckY - 0.035 * H, sh * 0.78, B.chest[1] * 0.78), ring(neckY - 0.005 * H, B.neck * 2.0, B.neck * 1.45), ring(neckY + 0.012, B.neck * 1.3 * puff * 0.92, B.neck * 1.2 * puff * 0.9)];
    const torsoBones = [seg('hips', 'spine'), seg('spine', 'chest'), seg('chest', 'neck'), seg('neck', 'head')];
    const torsoGeo = skinnedTube({ path: t.map((x) => x.p), radii: t.map((x) => x.r), seg: 28, bones: torsoBones, boneIndex: bi, sigma: 0.07, ref: V(1, 0, 0), capEnds: false, uvTile: 0.45 });
    this.torso = this.skinMesh(torsoGeo, shirtMat);
    // neck (skin)
    const nk = [R.neck.clone().add(V(0, -0.02, 0)), R.head.clone().add(V(0, -0.005, 0.0))];
    const neckGeo = skinnedTube({ path: [nk[0], nk[1]], radii: [[B.neck, B.neck * 0.95], [B.neck * 0.92, B.neck * 0.9]], seg: 14, bones: [seg('neck', 'head'), seg('chest', 'neck')], boneIndex: bi, sigma: 0.05, capEnds: false, uvTile: 0.3 });
    this.neckMesh = this.skinMesh(neckGeo, this.getSkinMat());
    // arms & legs
    for (const side of ['L', 'R']) {
      const P = this.parts[side]; const s = side === 'L' ? 1 : -1;
      const sh = R['upperArm' + side], el = R['foreArm' + side], wr = R['hand' + side];
      const clavP = R['clav' + side];
      const aBones = [{ bone: P.clav, a: clavP.clone(), b: sh.clone() }, { bone: P.ua, a: sh.clone(), b: el.clone() }, { bone: P.fa, a: el.clone(), b: wr.clone() }, { bone: this.chest, a: R.chest.clone(), b: R.neck.clone() }];
      const r0 = B.arm * puff * (type === 'parka' ? 1.25 : 1);
      const sleeveEnd = o.sleeveEnd ?? (type === 'tee' ? 0.38 : 1.0);
      const up = (f) => V().lerpVectors(sh, el, f), lo = (f) => V().lerpVectors(el, wr, f);
      const pts = [sh.clone().add(V(-s * 0.075, 0.02, 0)), sh.clone().add(V(-s * 0.02, 0.012, 0)), up(0.12), up(0.5), up(0.92), el.clone(), lo(0.12), lo(0.5), lo(0.9), wr.clone()];
      const rad = [[r0 * 1.2, r0 * 1.2], [r0 * 1.22, r0 * 1.2], [r0 * 1.12, r0 * 1.08], [r0 * 1.02, r0 * 1.0], [r0 * 0.94, r0 * 0.93], [r0 * 0.9, r0 * 0.9], [r0 * 0.9, r0 * 0.88], [r0 * 0.78, r0 * 0.75], [r0 * 0.66, r0 * 0.64], [r0 * 0.6, r0 * 0.58]];
      const cut = Math.max(2, Math.round(pts.length * sleeveEnd));
      const cloth = skinnedTube({ path: pts.slice(0, cut), radii: rad.slice(0, cut), seg: 14, bones: aBones, boneIndex: bi, sigma: 0.05, ref: V(1, 0, 0), capEnds: false, uvTile: 0.4 });
      this.skinMesh(cloth, shirtMat);
      if (cut < pts.length) {
        const sk = skinnedTube({ path: pts.slice(cut - 1), radii: rad.slice(cut - 1).map((r) => [r[0] * 0.9, r[1] * 0.9]), seg: 12, bones: aBones, boneIndex: bi, sigma: 0.05, capEnds: false, uvTile: 0.3 });
        this.skinMesh(sk, this.getSkinMat());
      }
      // cuff ring at wrist for parka/flannel
      // legs
      const hp = R['thigh' + side], kn = R['shin' + side], an = R['foot' + side], toe = R['toe' + side];
      const lBones = [{ bone: this.hips, a: R.hips.clone(), b: R.spine.clone() }, { bone: P.th, a: hp.clone(), b: kn.clone() }, { bone: P.sh, a: kn.clone(), b: an.clone() }, { bone: P.ft, a: an.clone(), b: toe.clone() }];
      const lr = B.leg * (type === 'parka' ? 1.05 : 1);
      const lp = [hp.clone().add(V(0, 0.07, 0)), V().lerpVectors(hp, kn, 0.18), V().lerpVectors(hp, kn, 0.55), V().lerpVectors(hp, kn, 0.9), kn.clone(), V().lerpVectors(kn, an, 0.2), V().lerpVectors(kn, an, 0.6), V().lerpVectors(kn, an, 0.92), an.clone().add(V(0, 0.01, 0))];
      const lrad = [[lr * 1.25, lr * 1.3], [lr * 1.2, lr * 1.25], [lr * 1.05, lr * 1.1], [lr * 0.82, lr * 0.85], [lr * 0.72, lr * 0.76], [lr * 0.76, lr * 0.8], [lr * 0.68, lr * 0.7], [lr * 0.56, lr * 0.58], [lr * 0.58, lr * 0.6]];
      const legGeo = skinnedTube({ path: lp, radii: lrad, seg: 14, bones: lBones, boneIndex: bi, sigma: 0.06, capEnds: false, uvTile: 0.4 });
      this.skinMesh(legGeo, pantsMat);
      // boot: lofted box shape from ankle to toe
      const bootMat = this.makeBoots();
      const bp = [an.clone().add(V(0, 0.09, -0.01)), an.clone().add(V(0, 0.0, 0.0)), an.clone().add(V(0, -0.04, 0.05)), toe.clone().add(V(0, 0.005, 0.0)), toe.clone().add(V(0, 0.0, 0.05))];
      const brad = [[lr * 0.7, lr * 0.74], [lr * 0.8, lr * 0.95], [lr * 0.8, lr * 1.0], [lr * 0.66, lr * 0.75], [lr * 0.4, lr * 0.4]];
      const bootGeo = skinnedTube({ path: bp, radii: brad, seg: 12, bones: [lBones[2], lBones[3]], boneIndex: bi, sigma: 0.05, capEnds: true, ref: V(1, 0, 0), uvTile: 0.3 });
      // sole shape: flatten
      this.skinMesh(bootGeo, bootMat);
    }
  }

  boneByName(n) { return this.bones.find((b) => b.name === n); }
  skinMesh(geo, mat) {
    const m = new THREE.SkinnedMesh(geo, mat); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
    this.root.add(m); m.bind(this.skeleton, new THREE.Matrix4()); return m;
  }
  getSkinMat() { if (!this._bodySkin) { this._bodySkin = this.face.skin.clone(); this._bodySkin.vertexColors = false; this._bodySkin.needsUpdate = true; } return this._bodySkin; }
  makeShirt() {
    const o = this.opts; const type = o.outfit || 'flannel';
    if (type === 'flannel') { const m = pbr('fabric_wool', { key: 'flan' + (o.shirt || ''), tint: o.shirt ?? 0xc27a62, normal: 1.0 }).clone(); m.roughness = 0.92; return m; }
    if (type === 'tee') { const m = solid(o.shirt ?? 0xe8e2d0, { rough: 0.9 }).clone(); return m; }
    if (type === 'parka') { const m = pbr('parka', { key: 'parkaN', tint: 0x55604f, normal: 1.4, wet: 0.7 }).clone(); m.roughness = 0.5; m.color.setRGB(0.9, 0.95, 0.88); return m; }
    return solid(0x666666);
  }
  makePants() { const o = this.opts; const m = solid(o.pants ?? 0x3b4252, { rough: 0.85 }).clone(); if (this.opts.outfit === 'parka') { m.color.set(0x2e332f); m.roughness = 0.6; } return m; }
  makeBoots() { return solid(this.opts.boots ?? 0x3a2c20, { rough: 0.55 }).clone(); }

  buildHood() {
    // deep hood: shell around the head leaving the face in shadow
    const hg = new THREE.SphereGeometry(0.135, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.82);
    const p = hg.attributes.position;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i), y = p.getY(i); p.setZ(i, z * 1.18 - 0.02); p.setY(i, y * 1.12); if (z > 0.06 && y < 0.1) { p.setZ(i, z * 1.25 + 0.03); } }
    hg.computeVertexNormals();
    const mat = this.torso.material.clone(); mat.side = THREE.DoubleSide;
    const hood = new THREE.Mesh(hg, mat); hood.position.set(0, 0.095, -0.01); hood.castShadow = true; this.headBone.add(hood); this.hood = hood;
    // dark void inside so the face reads as "not there"
    const inner = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x030405 })); inner.scale.set(0.9, 1.15, 0.9); inner.position.set(0, 0.095, 0.02); inner.visible = false; this.headBone.add(inner); this.hoodVoid = inner;
    // collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 8, 20), mat); collar.rotation.x = Math.PI / 2; collar.position.set(0, 0.02, 0.0); this.headBone.add(collar);
  }

  buildHands() {
    const glove = this.opts.gloves;      // true: wool gloves with the yellow stitch
    const skinM = this.getSkinMat();
    const gm = glove ? pbr('wool_knit', { key: 'npcglove', tint: 0xaab0a0 }).clone() : skinM;
    const stitch = new THREE.MeshStandardMaterial({ color: 0xe6b422, roughness: 0.8 });
    this.hands = {};
    for (const side of ['L', 'R']) {
      const h = makeNpcHand(side, gm, stitch, glove, this.B.armLen); this.parts[side].hand.add(h.root); this.hands[side] = h;
      h.root.position.set(0, -0.005, 0); h.root.rotation.x = Math.PI; // fingers pointing along bone -Y
    }
  }

  // ------------------------------------------------------------------------------------------------ pose helpers
  worldQ(b) { return b.getWorldQuaternion(new THREE.Quaternion()); }
  /** rotate bone so its local -Y axis points at world target (with optional roll hint) */
  aim(b, target, hintDir) {
    const wp = b.getWorldPosition(_v); const d = _v2.copy(target).sub(wp); if (d.lengthSq() < 1e-8) return; d.normalize();
    _q.setFromUnitVectors(DOWN, d);
    if (hintDir) { // roll so local +Z leans toward the hint
      const zAx = V(0, 0, 1).applyQuaternion(_q); const h = hintDir.clone().addScaledVector(d, -hintDir.dot(d)).normalize(); const zz = zAx.clone().addScaledVector(d, -zAx.dot(d)).normalize();
      const ang = Math.atan2(V().crossVectors(zz, h).dot(d), zz.dot(h)); _q2.setFromAxisAngle(d, ang); _q.premultiply(_q2);
    }
    const pq = b.parent.getWorldQuaternion(new THREE.Quaternion()); b.quaternion.copy(pq.invert().multiply(_q));
    b.updateMatrixWorld(true);
  }
  /** two-bone IK. root bone a (upper), mid b (lower), end c (hand/foot) -> target world, pole world */
  ik(upper, lower, endBone, target, pole, L1, L2) {
    const S = upper.getWorldPosition(V()); const d = target.clone().sub(S); let dist = d.length(); const dd = clamp(dist, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3); d.normalize();
    const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd); const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pv = pole.clone().sub(S).addScaledVector(d, -pole.clone().sub(S).dot(d)); if (pv.lengthSq() < 1e-6) pv.set(0, 0, 1); pv.normalize();
    const E = S.clone().addScaledVector(d, a).addScaledVector(pv, h); const W = S.clone().addScaledVector(d, dd);
    this.aim(upper, E); this.aim(lower, W);
  }

  lookAt(worldPos, w = 1) { this.pose.lookTarget = worldPos ? worldPos.clone() : null; this.pose.lookW = w; }

  /** main per-frame update */
  update(dt, ctx = {}) {
    this.time += dt; const t = this.time;
    // reset to rest then apply layers: idle -> locomotion -> sit -> arms -> head
    this.reset();
    this.root.updateMatrixWorld(true);
    const B = this.B; const H = B.height;
    const wp = this.root.getWorldPosition(_v); this.vel.copy(wp).sub(this.lastPos).divideScalar(Math.max(dt, 1e-4)); this.lastPos.copy(wp);
    const speed = this.vel.length();
    // breathing & weight shift
    const br = Math.sin(t * 1.5) * 0.5 + 0.5;
    this.chest.rotation.x += -0.012 - br * 0.018; this.spine.rotation.x += br * 0.006;
    this.hips.rotation.z += Math.sin(t * 0.35) * 0.012; this.hips.position.x += Math.sin(t * 0.35) * 0.008;
    this.spine.rotation.z += -Math.sin(t * 0.35) * 0.012;
    // slouch for the searcher
    if (this.opts.hunch) { this.spine.rotation.x += this.opts.hunch * 0.9; this.chest.rotation.x += this.opts.hunch * 0.9; this.neck.rotation.x += -this.opts.hunch * 0.5; }
    // locomotion
    const walkTarget = this.walking ? 1 : 0; this.walkAmt = damp(this.walkAmt, walkTarget, 6, dt);
    if (this.walkAmt > 0.01) this.applyWalk(dt);
    else this.legsRest();
    // sit
    this.sit = damp(this.sit, this.sitT, 4, dt);
    if (this.sit > 0.01) this.applySit();
    // arms
    this.applyArms(dt);
    // head/eyes
    this.applyLook(dt);
    this.root.updateMatrixWorld(true);
    this.face.update(dt, t);
    // hands curl
    for (const s of ['L', 'R']) this.hands[s].update(dt);
  }

  applyWalk(dt) {
    const sp = this.walkSpeed || 1.2; this.walkPhase += dt * sp * 3.4; const ph = this.walkPhase, a = this.walkAmt; const k = Math.min(1.35, sp / 1.2);
    for (const [side, off] of [['L', 0], ['R', Math.PI]]) {
      const P = this.parts[side]; const sn = Math.sin(ph + off), cs = Math.cos(ph + off);
      P.th.rotation.x += -sn * 0.52 * a * k;                                   // forward swing is negative X (model faces +Z)
      P.sh.rotation.x += (Math.max(0, cs) * 0.95 + 0.06) * a * (0.6 + 0.4 * k);
      P.ft.rotation.x += -(P.th.rotation.x + P.sh.rotation.x) * 0.7;
      P.ua.rotation.x += sn * 0.42 * a * (this.carry > 0.5 ? 0.15 : 1);
      P.fa.rotation.x += -(0.12 + Math.max(0, -sn) * 0.28) * a;
    }
    this.hips.position.y += -Math.abs(Math.cos(ph)) * 0.03 * a * k + 0.012 * a; this.hips.rotation.y += Math.sin(ph) * 0.09 * a; this.spine.rotation.y += -Math.sin(ph) * 0.07 * a; this.hips.rotation.z += Math.cos(ph) * 0.025 * a;
    this.chest.rotation.x += 0.03 * a;
  }
  legsRest() { /* rest pose already */ }
  applySit() {
    const k = this.sit; const H = this.B.height;
    // lower hips toward seat height; thighs horizontal; shins vertical
    this.hips.position.y -= 0.47 * H * k;
    for (const side of ['L', 'R']) {
      const P = this.parts[side]; P.th.rotation.x += -1.5 * k; P.sh.rotation.x += 1.5 * k; P.ft.rotation.x += 0.0;
      if (this.sitDangle) { P.sh.rotation.x += Math.sin(this.time * 1.3 + (side === 'L' ? 0 : 1.7)) * 0.1 * k; }
    }
    this.spine.rotation.x += 0.0;
  }
  applyArms(dt) {
    const H = this.B.height;
    for (const side of ['L', 'R']) {
      const P = this.parts[side]; const sg = side === 'L' ? 1 : -1;
      // rest hang: slight forward + elbow bend
      P.ua.rotation.x += 0.04; P.fa.rotation.x += -0.2; P.ua.rotation.z += sg * (-0.03);
      this.reach[side] = damp(this.reach[side], this.targets[side] ? 1 : 0, 7, dt);
      if (this.reach[side] > 0.01 && this.targets[side]) {
        // blend by interpolating the target between the current rest hand pos and the goal
        this.root.updateMatrixWorld(true);
        const rest = P.hand.getWorldPosition(V()); const goal = this.targets[side].clone(); const tgt = rest.lerp(goal, this.reach[side]);
        const pole = P.ua.getWorldPosition(V()).add(V(sg * 0.5, -0.4, -0.5).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion())));
        this.ik(P.ua, P.fa, P.hand, tgt, pole, this.rest['foreArm' + side].distanceTo(this.rest['upperArm' + side]), this.rest['hand' + side].distanceTo(this.rest['foreArm' + side]));
        if (this.handDir && this.handDir[side]) this.aim(P.hand, P.hand.getWorldPosition(V()).add(this.handDir[side]));
      }
    }
    // cooking: right hand circles a pan at `stirPos`
    if (this.stir > 0.01 && this.stirPos) {
      const P = this.parts.R; const a = this.time * 5.5; const c = this.stirPos.clone().add(V(Math.cos(a) * 0.05, 0.0, Math.sin(a) * 0.05));
      const rest = P.hand.getWorldPosition(V()); const tgt = rest.lerp(c, this.stir);
      const pole = P.ua.getWorldPosition(V()).add(V(-0.4, -0.5, 0.2).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion())));
      this.ik(P.ua, P.fa, P.hand, tgt, pole, this.rest.foreArmR.distanceTo(this.rest.upperArmR), this.rest.handR.distanceTo(this.rest.foreArmR));
    }
  }
  applyLook(dt) {
    const lt = this.pose.lookTarget; const w = this.pose.lookW;
    if (lt && w > 0) {
      const hp = this.headBone.getWorldPosition(V()); const inv = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
      const d = lt.clone().sub(hp).applyQuaternion(inv).normalize();
      let yaw = Math.atan2(d.x, d.z), pitch = Math.asin(clamp(d.y, -1, 1));
      const yL = clamp(yaw, -1.15, 1.15), pL = clamp(pitch, -0.6, 0.55);
      // distribute: eyes first, then head, then neck/chest
      const head = this.headBone, neck = this.neck;
      this.lookYaw = damp(this.lookYaw || 0, yL * w, 5, dt); this.lookPitch = damp(this.lookPitch || 0, pL * w, 5, dt);
      neck.rotation.y += this.lookYaw * 0.35; head.rotation.y += this.lookYaw * 0.45; this.chest.rotation.y += this.lookYaw * 0.12;
      neck.rotation.x += -this.lookPitch * 0.3; head.rotation.x += -this.lookPitch * 0.45;
      // eyes take the remainder
      this.face.gazeT.set(clamp(yaw - this.lookYaw * 0.92, -0.45, 0.45), clamp(pitch - this.lookPitch * 0.8, -0.3, 0.3));
    } else {
      this.lookYaw = damp(this.lookYaw || 0, 0, 3, dt); this.lookPitch = damp(this.lookPitch || 0, 0, 3, dt);
      this.face.gazeT.set(0, 0);
    }
    // micro head motion
    this.headBone.rotation.y += Math.sin(this.time * 0.7) * 0.015; this.headBone.rotation.x += Math.sin(this.time * 0.5 + 1) * 0.01;
    if (this.opts.headTilt) { this.headBone.rotation.z += this.opts.headTilt; }
  }

  // convenience setters
  setPos(x, y, z) { this.root.position.set(x, y, z); }
  faceYaw(yaw) { this.root.rotation.y = yaw; }
  reachTo(side, world, handDir) { this.targets[side] = world ? world.clone() : null; if (handDir) { this.handDir = this.handDir || {}; this.handDir[side] = handDir.clone().normalize(); } }
  setFeel(o) { this.face.setAll(o); }
  dispose() { this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}


/** compact articulated hand for NPCs (fingers = 3 capsule segments) */
function makeNpcHand(side, mat, stitchMat, glove, armLen) {
  const root = new THREE.Group(); const s = side === 'L' ? 1 : -1;
  const sc = 1.05 * (armLen || 1);
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.075 * sc, 0.085 * sc, 0.03 * sc, 2, 2, 2), mat); palm.position.y = 0.043 * sc; palm.castShadow = true; root.add(palm);
  const fingers = [];
  const defs = [{ x: 0.027, L: [0.036, 0.024, 0.02], r: 0.0095 }, { x: 0.009, L: [0.04, 0.026, 0.021], r: 0.01 }, { x: -0.009, L: [0.037, 0.024, 0.02], r: 0.0095 }, { x: -0.026, L: [0.03, 0.02, 0.017], r: 0.0085 }];
  defs.forEach((d, fi) => {
    const base = new THREE.Group(); base.position.set(d.x * sc, 0.085 * sc, 0); root.add(base); let parent = base; const segs = [];
    d.L.forEach((len, si) => { const piv = new THREE.Group(); parent.add(piv); const m = new THREE.Mesh(new THREE.CapsuleGeometry(d.r * sc * (1 - si * 0.08), len * sc, 3, 6), (glove && fi === 0 && si === 1 && side === 'R') ? stitchMat : mat); m.position.y = len * sc / 2; m.castShadow = true; piv.add(m); const nx = new THREE.Group(); nx.position.y = len * sc; piv.add(nx); parent = nx; segs.push(piv); });
    fingers.push(segs);
  });
  const th = new THREE.Group(); th.position.set(s * 0.036 * sc, 0.02 * sc, 0); root.add(th); const t1 = new THREE.Group(); th.add(t1); const tm = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115 * sc, 0.032 * sc, 3, 6), mat); tm.position.y = 0.02 * sc; tm.castShadow = true; t1.add(tm);
  const t2 = new THREE.Group(); t2.position.y = 0.04 * sc; t1.add(t2); const tm2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.01 * sc, 0.022 * sc, 3, 6), mat); tm2.position.y = 0.013 * sc; t2.add(tm2);
  th.rotation.z = -s * 0.85;
  const api = { root, fingers, curl: [0.25, 0.28, 0.32, 0.36], tgt: [0.25, 0.28, 0.32, 0.36], tcurl: 0.2, ttgt: 0.2,
    pose(p) { api.tgt = [...p.f]; api.ttgt = p.t; },
    update(dt) { const A = [1.3, 1.6, 1.1]; for (let i = 0; i < 4; i++) { api.curl[i] += (api.tgt[i] - api.curl[i]) * Math.min(1, dt * 12); fingers[i].forEach((p, k) => { p.rotation.x = api.curl[i] * A[k]; }); } api.tcurl += (api.ttgt - api.tcurl) * Math.min(1, dt * 12); th.rotation.z = -s * (0.85 - api.tcurl * 0.4); t1.rotation.x = -api.tcurl * 0.4; t2.rotation.x = -api.tcurl * 0.7; } };
  return api;
}
