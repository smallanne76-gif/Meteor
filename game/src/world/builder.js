// Level-building toolkit: batched static geometry, walls with openings (+collision), floors, doors, windows.
import * as THREE from 'three';
import { box as boxGeo, rbox, cyl as cylGeo, plane, worldUV, wallWithHoles, mesh as mkMesh } from '../gfx/geo.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { glass, solid, pbr } from '../gfx/materials.js';
import { damp, clamp, lerp, easeInOut } from '../core/util.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

/** reassign ExtrudeGeometry groups: 0 = +Z face, 1 = -Z face, 2 = sides/reveals */
export function splitCaps(g) {
  const idx = g.index ? g.index.array : null; const pos = g.attributes.position, nor = g.attributes.normal;
  const tris = idx ? idx.length / 3 : pos.count / 3;
  const buckets = [[], [], []];
  for (let t = 0; t < tris; t++) {
    const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
    const nz = (nor.getZ(a) + nor.getZ(b) + nor.getZ(c)) / 3;
    (nz > 0.7 ? buckets[0] : nz < -0.7 ? buckets[1] : buckets[2]).push(a, b, c);
  }
  const out = []; g.clearGroups(); let off = 0;
  buckets.forEach((arr, i) => { out.push(...arr); g.addGroup(off, arr.length, i); off += arr.length; });
  g.setIndex(out); return g;
}

export class Builder {
  constructor(game, parent) {
    this.game = game; this.parent = parent || game.root; this.col = game.collision;
    this.batches = new Map(); this.interactMeshes = [];
    this.doors = []; this.lightsOut = [];
  }

  // ---- batching --------------------------------------------------------------------------------------------------
  _batchKey(mat, cast, recv) { return `${mat.uuid}|${cast ? 1 : 0}${recv ? 1 : 0}`; }
  add(geo, mat, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, cast = true, recv = true, batch = true, name } = {}) {
    _e.set(rot[0], rot[1], rot[2], 'YXZ'); _q.setFromEuler(_e);
    const sc = Array.isArray(scale) ? _s.set(...scale) : _s.set(scale, scale, scale);
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, sc);
    if (!batch) {
      const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.quaternion.copy(_q); m.scale.copy(sc); m.castShadow = cast; m.receiveShadow = recv; if (name) m.name = name; this.parent.add(m); return m;
    }
    const g = geo.clone ? geo.clone() : geo; g.applyMatrix4(_m);
    const k = this._batchKey(Array.isArray(mat) ? mat[0] : mat, cast, recv);
    let b = this.batches.get(k); if (!b) { b = { mat, cast, recv, geos: [] }; this.batches.set(k, b); }
    // keep only attributes shared by all geometries
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(n)) g.deleteAttribute(n);
    if (!g.index) { const n = g.attributes.position.count; const a = new Uint32Array(n); for (let i = 0; i < n; i++) a[i] = i; g.setIndex(new THREE.BufferAttribute(a, 1)); }
    b.geos.push(g); return null;
  }
  finish() {
    for (const b of this.batches.values()) {
      if (Array.isArray(b.mat)) { // grouped geometries: merge per group manually (rare): add unmerged
        for (const g of b.geos) { const m = new THREE.Mesh(g, b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv; this.parent.add(m); }
        continue;
      }
      // merge in chunks to stay under index limits
      let chunk = [], verts = 0;
      const flush = () => { if (!chunk.length) return; const mg = mergeGeometries(chunk, false); mg.computeBoundingSphere(); const m = new THREE.Mesh(mg, b.mat); m.castShadow = b.cast; m.receiveShadow = b.recv; m.matrixAutoUpdate = false; this.parent.add(m); chunk = []; verts = 0; };
      for (const g of b.geos) { chunk.push(g); verts += g.attributes.position.count; if (verts > 60000) flush(); }
      flush();
    }
    this.batches.clear();
  }

  // ---- primitives ------------------------------------------------------------------------------------------------
  /** box centred at pos. opts: tile (uv metres), round (bevel), collide, cast, recv, rot, tag */
  box(w, h, d, mat, { pos = [0, 0, 0], rot = [0, 0, 0], tile = 1.2, round = 0, collide = false, cast = true, recv = true, batch = true, name, noMove = false, y0, y1 } = {}) {
    const g = round ? rbox(w, h, d, round, tile) : boxGeo(w, h, d, tile);
    const m = this.add(g, mat, { pos, rot, cast, recv, batch, name });
    if (collide) this.collideBox(pos[0], pos[2], w, d, pos[1] - h / 2, pos[1] + h / 2, rot[1] || 0, { noMove });
    return m;
  }
  cyl(rt, rb, h, mat, { pos = [0, 0, 0], rot = [0, 0, 0], seg = 14, tile = 1.2, collide = false, cast = true, recv = true, batch = true, name } = {}) {
    const m = this.add(cylGeo(rt, rb, h, seg, tile), mat, { pos, rot, cast, recv, batch, name });
    if (collide) this.col.addCylinder(pos[0], pos[2], Math.max(rt, rb), pos[1] - h / 2, pos[1] + h / 2);
    return m;
  }
  collideBox(x, z, w, d, y0, y1, yaw = 0, o = {}) { return this.col.addBox(x, z, w, d, y0, y1, yaw, o); }

  /** horizontal slab (floor/ceiling) from corner (x0,z0) to (x1,z1) at height y (top face), thickness t */
  slab(x0, z0, x1, z1, y, mat, { t = 0.12, tile = 1.2, surf = 'wood', walk = false, cast = true, recv = true, topOnly = false } = {}) {
    const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    if (topOnly) { const g = plane(w, d, tile); g.rotateX(-Math.PI / 2); this.add(g, mat, { pos: [cx, y, cz], cast, recv }); }
    else this.box(w, t, d, mat, { pos: [cx, y - t / 2, cz], tile, cast, recv });
    if (walk) this.col.addFloor(cx, cz, w, d, y, { surf });
  }
  ceiling(x0, z0, x1, z1, y, mat, tile = 1.2) {
    const w = Math.abs(x1 - x0), d = Math.abs(z1 - z0); const g = plane(w, d, tile); g.rotateX(Math.PI / 2);
    this.add(g, mat, { pos: [(x0 + x1) / 2, y, (z0 + z1) / 2], cast: false });
  }

  /**
   * A wall from (x1,z1) to (x2,z2). Side A is the left of the direction of travel (when looking down -Y, i.e. +normal),
   * side B the right. holes: [{u: distance along wall from start to the centre, w, y, h, kind}]
   * mats: [matA, matB, matReveal]
   */
  wall(x1, z1, x2, z2, { h = 2.7, y0 = 0, thick = 0.2, holes = [], mats, tile = 1.2, collide = true, cast = true } = {}) {
    const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz); const ang = Math.atan2(dx, dz) - Math.PI / 2; // geometry along local X, thickness along Z
    const yaw = Math.atan2(-dz, dx);                                                                          // rotation about Y so local +X -> (dx,dz)
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    const hs = holes.map((o) => ({ x: o.u - L / 2, w: o.w, y: o.y, h: o.h }));
    const g = wallWithHoles(L, h, thick, hs, tile); splitCaps(g);
    // groups -> materials: 0 = +Z face, 1 = -Z face, 2 = reveals. Local +Z after yaw points to left of travel? compute below.
    const mArr = mats || [solid(0x888888), solid(0x888888), solid(0x555555)];
    const mesh = new THREE.Mesh(g, mArr); mesh.position.set(cx, y0, cz); mesh.rotation.y = yaw; mesh.castShadow = cast; mesh.receiveShadow = true; this.parent.add(mesh);
    if (collide) this._wallCollide(cx, cz, L, h, thick, y0, yaw, holes);
    return { mesh, L, yaw, cx, cz, thick, start: [x1, z1], dir: [dx / L, dz / L] };
  }
  _wallCollide(cx, cz, L, h, thick, y0, yaw, holes) {
    // split the wall into solid pieces around the holes
    const cuts = [...holes].sort((a, b) => a.u - b.u);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const addPiece = (u0, u1, yy0, yy1) => {
      if (u1 - u0 < 0.02 || yy1 - yy0 < 0.02) return; const um = (u0 + u1) / 2 - L / 2;
      this.col.addBox(cx + um * c, cz - um * s, u1 - u0, thick, y0 + yy0, y0 + yy1, yaw);
    };
    let cursor = 0;
    for (const o of cuts) {
      addPiece(cursor, o.u - o.w / 2, 0, h);              // solid span before the hole
      if (o.y > 0.02) addPiece(o.u - o.w / 2, o.u + o.w / 2, 0, o.y);      // below hole (window sill)
      if (o.y + o.h < h - 0.02) addPiece(o.u - o.w / 2, o.u + o.w / 2, o.y + o.h, h); // above hole (lintel)
      cursor = o.u + o.w / 2;
    }
    addPiece(cursor, L, 0, h);
  }

  /** world position of a point along a wall (u metres from its start) */
  static alongWall(w, u, off = 0) {
    const [dx, dz] = w.dir; return [w.start[0] + dx * u + dz * off * -1, w.start[1] + dz * u + dx * off];
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Doors: hinged panel with swing animation, locking, sounds, collision toggling.
// ---------------------------------------------------------------------------------------------------------------------
export class Door {
  /**
   * def: { x, z, yaw (direction the door faces/normal), w, h, hinge: 'L'|'R', thick, mat, frameMat, y0, locked, lockMsg, key, open, name, swing(rad), onOpen, onClose, creaky, label }
   * The door lies in the wall plane; (x,z) is the centre of the opening. yaw is the wall direction angle about Y (local +X along wall).
   */
  constructor(game, def) {
    this.game = game; this.def = def; this.name = def.name || 'door';
    this.w = def.w ?? 0.95; this.h = def.h ?? 2.1; this.thick = def.thick ?? 0.045;
    this.locked = !!def.locked; this.key = def.key || null; this.isOpen = false; this.angle = 0; this.target = 0; this.swing = def.swing ?? (Math.PI * 0.5 * 0.96);
    this.hingeSign = def.hinge === 'R' ? 1 : -1;
    this.root = new THREE.Group(); this.root.position.set(def.x, def.y0 ?? 0, def.z); this.root.rotation.y = def.yaw ?? 0;
    // pivot at hinge
    this.pivot = new THREE.Group(); this.pivot.position.x = this.hingeSign * this.w / 2; this.root.add(this.pivot);
    const mat = def.mat || pbr('wood_paint', { key: 'door' });
    const panel = new THREE.Mesh(rbox(this.w - 0.02, this.h - 0.02, this.thick, 0.006, 0.9), mat); panel.position.set(-this.hingeSign * this.w / 2, this.h / 2, 0); panel.castShadow = true; panel.receiveShadow = true; this.pivot.add(panel);
    // inset panels for detail
    const inset = pbr('wood_paint', { key: 'doorinset', tint: 0xd8d8d0 });
    for (const [yy, hh] of [[this.h * 0.74, this.h * 0.28], [this.h * 0.3, this.h * 0.36]]) {
      const pn = new THREE.Mesh(rbox(this.w * 0.62, hh, 0.012, 0.004, 0.5), inset); pn.position.set(-this.hingeSign * this.w / 2, yy, this.thick / 2 + 0.002); pn.receiveShadow = true; this.pivot.add(pn);
      const pn2 = pn.clone(); pn2.position.z = -this.thick / 2 - 0.002; this.pivot.add(pn2);
    }
    // handle
    const brass = solid(0x8b6b3a, { rough: 0.35, metal: 1 });
    for (const sz of [1, -1]) {
      const kn = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), brass); kn.position.set(-this.hingeSign * (this.w - 0.1), 1.0, sz * (this.thick / 2 + 0.04)); this.pivot.add(kn);
      const rs = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14), brass); rs.rotation.x = Math.PI / 2; rs.position.set(-this.hingeSign * (this.w - 0.1), 1.0, sz * (this.thick / 2 + 0.006)); this.pivot.add(rs);
    }
    this.handle = new THREE.Object3D(); this.handle.position.set(-this.hingeSign * (this.w - 0.1), 1.0, 0); this.pivot.add(this.handle);
    game.root.add(this.root);
    // collision (rotates with the pivot; approximate with one OBB updated on animation)
    this.col = game.collision.addBox(def.x, def.z, this.w, Math.max(this.thick, 0.1), (def.y0 ?? 0), (def.y0 ?? 0) + this.h, def.yaw ?? 0, { tag: 'door:' + this.name });
    this.col.noInteractBlock = true;
    this.updateCollision();
    // interaction
    this.it = game.interact.add({
      object: this.handle, radius: 0.55, maxDist: 2.3, id: 'door:' + this.name,
      label: () => this.locked ? (this.def.lockLabel || 'Locked') : (this.isOpen ? 'Close' : 'Open'), icon: 'door',
      onUse: () => this.use(), priority: 0.2,
    });
    if (def.open) { this.isOpen = true; this.angle = this.target = this.openAngle(); this.apply(); this.updateCollision(); }
  }
  openAngle() { return this.hingeSign * -1 * this.swing * (this.def.invert ? -1 : 1); }
  use() {
    const g = this.game;
    if (this.locked) {
      if (this.key && g.flags[this.key]) { this.unlock(); g.audio && g.audio.at(this.handle.getWorldPosition(new THREE.Vector3()), 'unlock', { vol: 1 }); return; }
      g.audio && g.audio.at(this.handle.getWorldPosition(new THREE.Vector3()), 'door_locked', { vol: 1 });
      this.def.onLocked && this.def.onLocked(this, g);
      if (this.def.lockMsg) g.ui.say(this.def.lockMsg, { style: 'thought', speaker: 'MARA' });
      return;
    }
    this.toggle();
  }
  unlock() { this.locked = false; this.def.onUnlock && this.def.onUnlock(this, this.game); }
  toggle(force) {
    const open = force ?? !this.isOpen; if (open === this.isOpen) return;
    this.isOpen = open; this.target = open ? this.openAngle() : 0;
    const pos = this.handle.getWorldPosition(new THREE.Vector3());
    this.game.audio && this.game.audio.at(pos, open ? 'door_open' : 'door_close', { vol: 1, creaky: this.def.creaky ?? true });
    if (open) this.def.onOpen && this.def.onOpen(this, this.game); else this.def.onClose && this.def.onClose(this, this.game);
    this.col.enabled = !open || Math.abs(this.angle - this.target) > 0.3;
  }
  slam() { if (!this.isOpen) return; this.isOpen = false; this.target = 0; this.speedMul = 6; const pos = this.handle.getWorldPosition(new THREE.Vector3()); this.game.audio && this.game.audio.at(pos, 'door_slam', { vol: 1.2 }); this.col.enabled = true; }
  apply() { this.pivot.rotation.y = this.angle; }
  updateCollision() {
    // when open, the collider is disabled except while swinging through; keep door-frame side posts via the wall holes
    this.col.enabled = !this.isOpen || Math.abs(this.angle) < 0.35;
  }
  update(dt) {
    if (Math.abs(this.angle - this.target) > 0.001) {
      const spd = (this.speedMul || 1) * 2.2;
      const d = this.target - this.angle; this.angle += Math.sign(d) * Math.min(Math.abs(d), spd * dt * (0.5 + Math.abs(d))); this.apply();
      if (Math.abs(this.angle - this.target) < 0.01) { this.angle = this.target; this.speedMul = 1; this.apply(); }
      this.updateCollision();
    }
  }
}

export function windowGlass(w, h) {
  const g = new THREE.PlaneGeometry(w, h); return g;
}

/** a window frame + glass + sill at a wall opening */
export function buildWindow(B, { x, z, y, w, h, yaw, panes = [2, 2], frame = pbr('wood_paint', { key: 'win', tint: 0xe8e8e0 }), thick = 0.2, curtain = null }) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const t = 0.05;
  const fm = (ww, hh, dd, px, py, pz) => { const m = new THREE.Mesh(boxGeo(ww, hh, dd, 0.5), frame); m.position.set(px, py, pz); m.castShadow = false; m.receiveShadow = true; g.add(m); };
  fm(w + 0.1, t, thick + 0.04, 0, h + t / 2 - 0.0, 0);   // head
  fm(w + 0.1, t, thick + 0.1, 0, -t / 2, 0.02);          // sill
  fm(t, h, thick + 0.02, -w / 2 - t / 2 + 0.0, h / 2, 0); fm(t, h, thick + 0.02, w / 2 + t / 2, h / 2, 0);
  for (let i = 1; i < panes[0]; i++) fm(0.03, h, 0.04, -w / 2 + (w * i) / panes[0], h / 2, 0);
  for (let j = 1; j < panes[1]; j++) fm(w, 0.03, 0.04, 0, (h * j) / panes[1], 0);
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), B.glassMat || (B.glassMat = glass())); gm.position.set(0, h / 2, 0); gm.renderOrder = 5; g.add(gm);
  B.parent.add(g); return g;
}
