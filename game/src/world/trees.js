// Procedural conifers (and birches for summer): branch-card whorls with snow caps, 3 LODs, instanced per streamed chunk.
import * as THREE from 'three';
import { RNG, smooth, clamp, fbm2 } from '../core/util.js';
import { pbr, foliageMaterial, card, solid } from '../gfx/materials.js';
import { mergeGroups, merge, worldUV } from '../gfx/geo.js';
import { settings } from '../core/settings.js';

const UP = new THREE.Vector3(0, 1, 0);

/** one drooping branch as a 2-segment card strip; returns {pos, uv, nor, idx} appended into arrays */
function addBranch(out, base, az, len, wid, pitch, droop, lift = 0, trunkAxis = 0) {
  const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const pts = [];
  for (let s = 0; s <= 2; s++) {
    const t = s / 2;
    const p = base.clone().addScaledVector(dir, len * t * Math.cos(pitch)).addScaledVector(UP, -len * t * Math.sin(pitch) - droop * t * t * len + lift);
    pts.push(p);
  }
  const widths = [wid * 0.22, wid * 0.5, wid * 0.28];
  const i0 = out.pos.length / 3;
  for (let s = 0; s <= 2; s++) {
    for (const sgn of [-1, 1]) {
      const p = pts[s].clone().addScaledVector(side, sgn * widths[s]);
      out.pos.push(p.x, p.y, p.z);
      out.uv.push(s / 2, sgn < 0 ? 0 : 1);
      const n = new THREE.Vector3(dir.x * 0.55, 0.85, dir.z * 0.55).normalize();
      out.nor.push(n.x, n.y, n.z);
    }
  }
  for (let s = 0; s < 2; s++) { const a = i0 + s * 2; out.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
}
const newOut = () => ({ pos: [], uv: [], nor: [], idx: [] });
function toGeo(o, offset = 0) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(o.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(o.uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(o.nor, 3));
  g.setIndex(o.idx); return g;
}

/** returns { geo, mats } - geo has groups [trunk, needles, snow] */
export function buildPine(seed, lod = 0, winter = true) {
  const r = new RNG(seed);
  const H = r.range(8.5, 14), baseR = r.range(0.16, 0.26);
  const whorls = lod === 0 ? 13 : 8;
  const per = lod === 0 ? 8 : 5;
  // trunk
  const tg = new THREE.CylinderGeometry(baseR * 0.18, baseR, H, lod === 0 ? 8 : 5, 1); tg.translate(0, H / 2, 0);
  { const uv = tg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.2, uv.getY(i) * H / 3.2); }
  const needles = newOut(), snow = newOut();
  for (let w = 0; w < whorls; w++) {
    const t = w / (whorls - 1);
    const y = H * (0.16 + 0.82 * t);
    const taper = Math.pow(1 - t, 0.82) * 0.9 + 0.1;
    const len = (H * 0.2) * taper * r.range(0.9, 1.15) + 0.4;
    const wid = len * 0.62;
    const n = Math.max(3, Math.round(per * (0.55 + taper * 0.6)));
    const az0 = r.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const az = az0 + (k / n) * Math.PI * 2 + r.range(-0.25, 0.25) + w * 0.7;
      const pitch = r.range(0.28, 0.55) + t * 0.15;
      const droop = r.range(0.12, 0.3);
      const base = new THREE.Vector3(0, y + r.range(-0.25, 0.25), 0);
      addBranch(needles, base, az, len, wid, pitch, droop);
      if (winter) addBranch(snow, base.clone().add(new THREE.Vector3(0, 0.035, 0)), az, len * 0.96, wid * 0.82, pitch - 0.04, droop * 0.9, 0.02);
    }
  }
  // crown
  for (let k = 0; k < 6; k++) addBranch(needles, new THREE.Vector3(0, H * 0.93, 0), k / 6 * Math.PI * 2, H * 0.06, H * 0.035, -0.5, 0, 0);
  const geos = [tg, toGeo(needles)];
  if (winter) geos.push(toGeo(snow));
  const g = mergeGroups(geos);
  return g;
}

/** very cheap far tree: 3 stacked cones with vertex colour (dark green, snowy tops) */
export function buildPineFar(seed, winter = true) {
  const r = new RNG(seed + 99);
  const H = r.range(8.5, 14);
  const geos = [];
  const cones = 4;
  for (let i = 0; i < cones; i++) {
    const t = i / cones;
    const rad = (1 - t * 0.78) * H * 0.2 + 0.4, h = H * (0.42 - t * 0.12);
    const g = new THREE.ConeGeometry(rad, h, 6, 1, true); g.translate(0, H * (0.14 + t * 0.74) + h * 0.35, 0);
    const col = [], p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const k = clamp((p.getY(v) - (H * (0.14 + t * 0.74))) / h);
      const c = winter ? new THREE.Color().setRGB(0.05 + k * 0.03, 0.12 + k * 0.05, 0.08 + k * 0.03).lerp(new THREE.Color(0.75, 0.82, 0.9), (1 - k) * 0.28 + 0.1) : new THREE.Color(0.08, 0.2 + t * 0.05, 0.08);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geos.push(g);
  }
  const trunk = new THREE.CylinderGeometry(0.1, 0.22, H * 0.35, 4); trunk.translate(0, H * 0.17, 0);
  const col = []; for (let v = 0; v < trunk.attributes.position.count; v++) col.push(0.12, 0.09, 0.07);
  trunk.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geos.push(trunk);
  // normalise attribute sets (cone has uv/normal; both do)
  return merge(geos.map((g) => { g.deleteAttribute('uv'); return g; }));
}

export function buildBirch(seed, winter = false) {
  const r = new RNG(seed);
  const H = r.range(7, 11), br = r.range(0.07, 0.11);
  const tg = new THREE.CylinderGeometry(br * 0.5, br, H, 6, 4); tg.translate(0, H / 2, 0);
  // slight lean by bending vertices
  const lean = r.range(-0.4, 0.4), lean2 = r.range(-0.4, 0.4);
  const p = tg.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = p.getY(i) / H; p.setX(i, p.getX(i) + lean * k * k); p.setZ(i, p.getZ(i) + lean2 * k * k); }
  const leaves = newOut();
  const n = 26;
  for (let i = 0; i < n; i++) {
    const t = 0.38 + 0.6 * r.next();
    const az = r.range(0, Math.PI * 2);
    const rad = (1 - Math.abs(t - 0.62) * 1.5) * H * 0.2 + 0.4;
    const base = new THREE.Vector3(lean * t * t, H * t, lean2 * t * t);
    // each cluster is a small crossed pair of cards
    for (let k = 0; k < 2; k++) addBranch(leaves, base, az + k * 1.4, rad * 1.1, rad * 0.9, r.range(-0.1, 0.35), 0.1);
  }
  return mergeGroups([tg, toGeo(leaves)]);
}

const matCache = {};
function pineMats(winter) {
  const k = 'pine' + winter;
  if (matCache[k]) return matCache[k];
  const bark = pbr('bark', { key: 'trunk' });
  const needles = new THREE.MeshStandardMaterial({ map: card('pine_card'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, color: 0xffffff });
  const snow = new THREE.MeshStandardMaterial({ map: card('pine_snow_card'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, color: 0xffffff });
  for (const m of [needles, snow]) m.userData.shared = true;
  matCache[k] = winter ? [bark, needles, snow] : [bark, needles];
  return matCache[k];
}
function birchMats() {
  if (matCache.birch) return matCache.birch;
  const trunk = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.85 });
  const leaf = new THREE.MeshStandardMaterial({ map: card('leaf_card'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, color: 0xdfffd0 });
  trunk.userData.shared = leaf.userData.shared = true;
  return (matCache.birch = [trunk, leaf]);
}
let farMat = null;
const getFarMat = () => farMat || (farMat = Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), { userData: { shared: true } }));

const CH = 64;

/** Streams trees around the camera, in chunks, with 3 levels of detail. */
export class Forest {
  constructor(terrain, root, collision, opts = {}) {
    this.t = terrain; this.root = root; this.col = collision;
    this.winter = (opts.season ?? terrain.season) === 'winter';
    this.chunks = new Map();
    this.group = new THREE.Group(); this.group.name = 'forest'; root.add(this.group);
    this.exclusions = opts.exclusions || [];      // fn(x,z)=>bool (true = keep clear)
    this.collideNear = opts.collideNear || (() => false);
    this.density = opts.density ?? 1;
    this.variants = [];
    this.nVar = 3;
    for (let v = 0; v < this.nVar; v++) {
      if (this.winter) this.variants.push({ l0: buildPine(1000 + v * 17, 0, true), l1: buildPine(1000 + v * 17, 1, true), l2: buildPineFar(1000 + v * 17, true) });
      else this.variants.push({ l0: v === 2 ? buildBirch(70 + v) : buildPine(1000 + v * 17, 0, false), l1: v === 2 ? buildBirch(70 + v) : buildPine(1000 + v * 17, 1, false), l2: buildPineFar(1000 + v * 17, false) });
    }
    this.radius = opts.radius ?? 380; this.timer = 0;
    this.near = 42; this.mid = 140;
  }
  _mat(v, lod) {
    if (lod === 2) return getFarMat();
    if (this.winter) return pineMats(true);
    return v === 2 ? birchMats() : pineMats(false);
  }
  keep(x, z) {
    const t = this.t;
    if (t.lakeDist(x, z) < 1.04) return false;
    const r = t.road.nearest(x, z); if (r.d < 4.6) return false;
    const tr = t.trail.nearest(x, z); if (tr.d < 2.3) return false;
    if (Math.hypot(x, z) < 19) return false;
    for (const f of this.exclusions) if (f(x, z)) return false;
    return true;
  }
  buildChunk(i, j) {
    const key = i + ',' + j; if (this.chunks.has(key)) return;
    const r = new RNG(i * 73856093 ^ j * 19349663 ^ 5);
    const spacing = 6.2 / Math.sqrt(this.density);
    const lists = Array.from({ length: this.nVar }, () => []);
    for (let gx = 0; gx < CH / spacing; gx++) for (let gz = 0; gz < CH / spacing; gz++) {
      const x = i * CH + (gx + r.next()) * spacing, z = j * CH + (gz + r.next()) * spacing;
      const f = this.t.forestMask(x, z);
      const dens = 0.08 + 0.92 * f;
      if (r.next() > dens) continue;
      if (!this.keep(x, z)) continue;
      const y = this.t.height(x, z);
      const s = r.range(0.75, 1.3) * (0.75 + f * 0.4);
      lists[r.int(0, this.nVar - 1)].push({ x, y: y - 0.1, z, s, ry: r.range(0, Math.PI * 2), tilt: r.range(-0.03, 0.03) });
      if (this.collideNear(x, z)) this.col.addCylinder(x, z, 0.22 * s, y - 0.2, y + 6, { tag: 'tree' });
    }
    const chunk = { i, j, cx: (i + .5) * CH, cz: (j + .5) * CH, lods: [new THREE.Group(), new THREE.Group(), new THREE.Group()], cur: -1 };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let total = 0;
    for (let v = 0; v < this.nVar; v++) {
      const L = lists[v]; if (!L.length) continue; total += L.length;
      for (let lod = 0; lod < 3; lod++) {
        const geo = this.variants[v]['l' + lod];
        const im = new THREE.InstancedMesh(geo, this._mat(v, lod), L.length);
        for (let n = 0; n < L.length; n++) {
          const t = L[n];
          e.set(t.tilt, t.ry, t.tilt * 0.7); q.setFromEuler(e); sc.set(t.s, t.s * r.range(0.92, 1.08), t.s); p.set(t.x, t.y, t.z);
          m4.compose(p, q, sc); im.setMatrixAt(n, m4);
          col.setRGB(1, 1, 1).multiplyScalar(0.82 + 0.3 * ((n * 7919 + v) % 13) / 13); im.setColorAt(n, col);
        }
        im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.castShadow = lod === 0 && (settings.preset.foliageShadows || false);
        im.receiveShadow = lod === 0;
        im.frustumCulled = true;
        im.computeBoundingSphere();
        chunk.lods[lod].add(im);
      }
    }
    for (let lod = 0; lod < 3; lod++) { chunk.lods[lod].visible = false; this.group.add(chunk.lods[lod]); }
    chunk.count = total;
    this.chunks.set(key, chunk);
  }
  update(cam, dt, budget = 1) {
    this.timer -= dt;
    const r = Math.ceil(this.radius / CH);
    const ci = Math.floor(cam.x / CH), cj = Math.floor(cam.z / CH);
    if (this.timer <= 0) {
      this.timer = 0.2;
      const need = [];
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        const cx = (i + .5) * CH, cz = (j + .5) * CH; const d = Math.hypot(cx - cam.x, cz - cam.z);
        if (d > this.radius + CH) continue;
        if (!this.chunks.has(i + ',' + j)) need.push({ i, j, d });
      }
      need.sort((a, b) => a.d - b.d);
      for (let n = 0; n < Math.min(budget, need.length); n++) this.buildChunk(need[n].i, need[n].j);
      // LOD select
      const dn = this.near, dm = this.mid;
      const q = settings.preset.treeDensity;
      for (const c of this.chunks.values()) {
        const d = Math.hypot(c.cx - cam.x, c.cz - cam.z) - CH * 0.7;
        const lod = d < dn ? 0 : (d < dm ? 1 : (d < this.radius ? 2 : -1));
        if (lod !== c.cur) { c.lods.forEach((g, k) => { g.visible = k === lod; }); c.cur = lod; }
      }
    }
  }
  /** build every chunk within radius immediately (used for warm-up/screenshots) */
  warm(cam, radius = 200) {
    const r = Math.ceil(radius / CH); const ci = Math.floor(cam.x / CH), cj = Math.floor(cam.z / CH);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const cx = (i + .5) * CH, cz = (j + .5) * CH; if (Math.hypot(cx - cam.x, cz - cam.z) <= radius + CH) this.buildChunk(i, j);
    }
    this.timer = 0; this.update(cam, 0.3, 0);
  }
}
