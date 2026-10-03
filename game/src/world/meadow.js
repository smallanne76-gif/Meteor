// Summer meadow: streamed grass tufts and wildflowers around the camera. Cosmetic only (no collision).
// Tufts are three crossed cards using the baked grass_card; they sway in the wind and shrink to the ground at the edge of the
// draw radius so nothing pops. Chunks are rebuilt from a seed, so the same field is always in the same place.
import * as THREE from 'three';
import { RNG, smooth, clamp } from '../core/util.js';
import { card } from '../gfx/materials.js';
import { bindAtmo } from '../gfx/atmosphere.js';
import { settings } from '../core/settings.js';

const CH = 24, CELL = 3;
const shared = { uTime: { value: 0 }, uFade: { value: new THREE.Vector2(40, 60) } };

function tuftGeometry() {
  const pos = [], uv = [], nor = [], idx = [];
  const W = 0.9, H = 0.72;
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, cx = Math.cos(a) * W / 2, cz = Math.sin(a) * W / 2;
    const i0 = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx, H, cz, -cx, H, -cz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let n = 0; n < 4; n++) nor.push(0, 1, 0);
    idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function stemGeometry() {
  // two thin crossed strips, 0.34 m tall, leaning slightly
  const pos = [], nor = [], idx = [];
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI / 2, cx = Math.cos(a) * 0.006, cz = Math.sin(a) * 0.006;
    const i0 = pos.length / 3;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx * 0.5 + 0.02, 0.34, cz * 0.5, -cx * 0.5 + 0.02, 0.34, -cz * 0.5);
    for (let n = 0; n < 4; n++) nor.push(0, 1, 0);
    idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

function headGeometry() {
  // a small disc facing up and a little towards the viewer; centred on the top of the stem
  const g = new THREE.PlaneGeometry(0.1, 0.1);
  g.rotateX(-Math.PI / 2 + 0.35); g.translate(0.02, 0.35, 0);
  return g;
}

function patchSway(mat, amp) {
  mat.userData.shared = true;
  mat.onBeforeCompile = (shader) => {
    bindAtmo(shader);
    shader.uniforms.uTime = shared.uTime; shader.uniforms.uFade = shared.uFade;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uFade;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float hgt = clamp(position.y / ${amp.h}, 0.0, 1.0);
  float ph = ip.x * 0.31 + ip.z * 0.23;
  float gust = 0.55 + 0.45 * sin(uTime * 0.35 + ip.x * 0.045 + ip.z * 0.03);
  transformed.x += (sin(uTime * 1.9 + ph) * 0.6 + sin(uTime * 3.1 + ph * 2.3) * 0.25) * ${amp.s} * hgt * hgt * gust;
  transformed.z += cos(uTime * 1.5 + ph * 1.4) * ${amp.s} * 0.7 * hgt * hgt * gust;
  float cd = length(ip.xz - cameraPosition.xz);
  transformed *= 1.0 - smoothstep(uFade.x, uFade.y, cd);
}`);
  };
}

let tuftMat = null, stemMat = null, headMat = null, geos = null;
function assets() {
  if (geos) return;
  geos = { tuft: tuftGeometry(), stem: stemGeometry(), head: headGeometry() };
  tuftMat = new THREE.MeshStandardMaterial({ map: card('grass_card'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, color: 0xffffff });
  stemMat = new THREE.MeshStandardMaterial({ color: 0x4d7a2a, roughness: 0.9, side: THREE.DoubleSide });
  headMat = new THREE.MeshStandardMaterial({ map: card('flower_card'), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, color: 0xffffff });
  patchSway(tuftMat, { h: '0.72', s: '0.09' }); patchSway(stemMat, { h: '0.34', s: '0.05' }); patchSway(headMat, { h: '0.36', s: '0.05' });
}

const FLOWER_TINTS = [0xffffff, 0xffffff, 0xffe27a, 0xf4b6d8, 0xc7b6ff, 0xffd0a0];

export class Meadow {
  /**
   * terrain: HaldenTerrain. opts.keep(x,z) -> false where grass must not grow (buildings, camps, docks).
   * opts.density scales how many tufts there are.
   */
  constructor(terrain, root, opts = {}) {
    this.t = terrain; this.keep = opts.keep || (() => true);
    this.group = new THREE.Group(); this.group.name = 'meadow'; root.add(this.group);
    this.chunks = new Map(); this.timer = 0; this.time = 0;
    assets();
  }
  get radius() { return 62 * Math.min(1.2, settings.preset.drawDistance); }
  get density() { return Math.max(0.2, settings.preset.particles); }

  /** 0 = bare, 1 = lush: grass thins out under trees, near the shore and on worn ground */
  _lush(x, z) {
    const t = this.t;
    const ld = t.lakeDist(x, z); if (ld < 1.0) return 0;
    const r = t.road.nearest(x, z); if (r.d < 3.0) return 0;
    const tr = t.trail.nearest(x, z); if (tr.d < 1.0) return 0;
    if (!this.keep(x, z)) return 0;
    const f = t.forestMask(x, z);
    return clamp(1.05 - f * 1.15, 0, 1) * smooth(1.0, 1.02, ld) * smooth(3.0, 5.0, r.d) * smooth(1.0, 2.0, tr.d);
  }

  buildChunk(i, j) {
    const key = i + ',' + j; if (this.chunks.has(key)) return;
    const rng = new RNG((i * 73856093) ^ (j * 19349663) ^ 91);
    const tufts = [], flowers = [];
    const sp = 0.52 / Math.sqrt(this.density), n = Math.floor(CELL / sp);
    const cells = CH / CELL;
    for (let a = 0; a < cells; a++) for (let b = 0; b < cells; b++) {
      const cx = i * CH + (b + 0.5) * CELL, cz = j * CH + (a + 0.5) * CELL;
      const lush = this._lush(cx, cz); if (lush <= 0.02) continue;
      // flowers drift in patches
      const patch = Math.sin(cx * 0.11 + 1.7) * Math.sin(cz * 0.09 - 0.4) > 0.35 ? 1 : 0;
      for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) {
        if (rng.next() > lush) continue;
        const x = i * CH + b * CELL + (u + rng.next()) * sp, z = j * CH + a * CELL + (v + rng.next()) * sp;
        const y = this.t.height(x, z) - 0.02;
        tufts.push({ x, y, z, s: rng.range(0.7, 1.5), h: rng.range(0.7, 1.4), ry: rng.range(0, Math.PI * 2), tone: rng.next() });
        if (patch && rng.next() < 0.16) flowers.push({ x: x + rng.range(-0.3, 0.3), y, z: z + rng.range(-0.3, 0.3), s: rng.range(0.8, 1.35), ry: rng.range(0, Math.PI * 2), tint: FLOWER_TINTS[rng.int(0, FLOWER_TINTS.length - 1)] });
      }
    }
    const chunk = { i, j, cx: (i + 0.5) * CH, cz: (j + 0.5) * CH, meshes: [] };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const mk = (geo, mat, list, tintFn) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((o, k) => {
        e.set(0, o.ry, 0); q.setFromEuler(e); sc.set(o.s, o.h ?? o.s, o.s); p.set(o.x, o.y, o.z); m4.compose(p, q, sc); im.setMatrixAt(k, m4);
        im.setColorAt(k, tintFn(o, col));
      });
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
      im.castShadow = false; im.receiveShadow = false; im.frustumCulled = true; im.computeBoundingSphere();
      // sway and the edge fade move vertices a little: keep the sphere generous
      im.boundingSphere.radius += 1.5;
      this.group.add(im); chunk.meshes.push(im);
    };
    // lush green to sun-dried yellow, matched to the terrain's own macro variation
    mk(geos.tuft, tuftMat, tufts, (o, c) => c.setRGB(0.62 + 0.4 * o.tone, 0.66 + 0.26 * o.tone, 0.36 + 0.1 * (1 - o.tone)));
    mk(geos.stem, stemMat, flowers, (o, c) => c.setRGB(1, 1, 1));
    mk(geos.head, headMat, flowers, (o, c) => c.set(o.tint));
    this.chunks.set(key, chunk);
  }

  _drop(k, c) { for (const m of c.meshes) { this.group.remove(m); m.dispose(); } this.chunks.delete(k); }

  update(cam, dt, budget = 1) {
    this.time += dt; shared.uTime.value = this.time;
    const R = this.radius; shared.uFade.value.set(R * 0.62, R * 0.95);
    this.timer -= dt; if (this.timer > 0) return; this.timer = 0.15;
    const ci = Math.floor(cam.x / CH), cj = Math.floor(cam.z / CH), r = Math.ceil(R / CH);
    const need = [];
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const d = Math.hypot((i + 0.5) * CH - cam.x, (j + 0.5) * CH - cam.z);
      if (d > R + CH * 0.7) continue;
      if (!this.chunks.has(i + ',' + j)) need.push({ i, j, d });
    }
    need.sort((a, b) => a.d - b.d);
    for (let n = 0; n < Math.min(budget, need.length); n++) this.buildChunk(need[n].i, need[n].j);
    for (const [k, c] of this.chunks) if (Math.hypot(c.cx - cam.x, c.cz - cam.z) > R + CH * 1.7) this._drop(k, c);
  }
  /** build everything in range now (level warm-up) */
  warm(cam) { this.timer = 0; this.update(cam, 0, 0); const R = this.radius, r = Math.ceil(R / CH); const ci = Math.floor(cam.x / CH), cj = Math.floor(cam.z / CH);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) if (Math.hypot((i + 0.5) * CH - cam.x, (j + 0.5) * CH - cam.z) <= R + CH * 0.7) this.buildChunk(i, j); }
  /** the settings may have changed density / draw distance: rebuild lazily */
  refresh() { for (const [k, c] of this.chunks) this._drop(k, c); }
}
