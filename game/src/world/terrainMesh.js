// Streamed terrain chunks with a 3-layer splat material (snow/grass, forest floor/dirt, road) driven by vertex weights.
import * as THREE from 'three';
import { pbr } from '../gfx/materials.js';
import { bindAtmo } from '../gfx/atmosphere.js';
import { smooth, clamp, fbm2 } from '../core/util.js';

const CHUNK = 48, RES = 40;   // 1.2 m grid
const BASE = './assets/tex/';

function layerTex(name) {
  const m = pbr(name, { key: 'terrain' });
  return { c: m.map, n: m.normalMap };
}

export function makeTerrainMaterial(season = 'winter') {
  const L = season === 'winter'
    ? [layerTex('snow'), layerTex('forest_floor'), layerTex('snow_packed')]
    : [layerTex('grass'), layerTex('forest_floor'), layerTex('gravel')];
  const scale = season === 'winter' ? [4.2, 3.2, 3.6] : [3.0, 3.2, 2.4];
  const rough = season === 'winter' ? [0.78, 0.95, 0.8] : [0.9, 0.95, 0.9];
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
  mat.userData.shared = true;
  mat.onBeforeCompile = (shader) => {
    bindAtmo(shader);
    Object.assign(shader.uniforms, {
      c0: { value: L[0].c }, c1: { value: L[1].c }, c2: { value: L[2].c },
      n0: { value: L[0].n }, n1: { value: L[1].n }, n2: { value: L[2].n },
      uScale: { value: new THREE.Vector3(...scale) }, uRough: { value: new THREE.Vector3(...rough) }, uSnow: { value: season === 'winter' ? 1 : 0 },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aW; varying vec3 vW; varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = aW; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vW; varying vec3 vWP;
uniform sampler2D c0, c1, c2, n0, n1, n2; uniform vec3 uScale, uRough; uniform float uSnow;
float th(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y); }
vec3 splat3(vec3 a, vec3 b, vec3 c, vec3 w){ return a * w.x + b * w.y + c * w.z; }
// anti-tiling: blend two samples at different scales/rotations
vec4 sTex(sampler2D t, vec2 p, float s){ vec4 a = texture2D(t, p / s); vec4 b = texture2D(t, (mat2(0.8,0.6,-0.6,0.8) * p) / (s * 2.7) + 0.37); return mix(a, b, 0.35); }
`)
      .replace('#include <map_fragment>', `
vec2 wp = vWP.xz;
float wF = clamp(vW.x, 0.0, 1.0), wR = clamp(vW.y, 0.0, 1.0);
vec3 wt = vec3(max(0.0, 1.0 - wF - wR), wF * (1.0 - wR), wR);
wt /= (wt.x + wt.y + wt.z + 1e-4);
vec3 col0 = sTex(c0, wp, uScale.x).rgb, col1 = sTex(c1, wp, uScale.y).rgb, col2 = sTex(c2, wp, uScale.z).rgb;
vec3 tcol = splat3(col0, col1, col2, wt);
// large-scale variation breaks the tiling up: lush / sun-dried patches in summer, faint drifts in winter
float macro = vn(wp / 41.0) * 0.55 + vn(wp / 13.0) * 0.3 + vn(wp / 4.3) * 0.15;
vec3 macroTint = uSnow > 0.5 ? vec3(mix(0.95, 1.04, macro)) : mix(vec3(0.80, 0.90, 0.66), vec3(1.16, 1.08, 0.86), macro);
tcol *= mix(vec3(1.0), macroTint, wt.x);
// far away the fine texture only shimmers: fade towards each layer's average colour
float camD = length(vWP - cameraPosition);
vec3 avgCol = splat3(textureLod(c0, vec2(0.5), 9.0).rgb, textureLod(c1, vec2(0.5), 9.0).rgb, textureLod(c2, vec2(0.5), 9.0).rgb, wt) * mix(vec3(1.0), macroTint, wt.x);
tcol = mix(tcol, avgCol, smoothstep(26.0, 80.0, camD) * 0.75);
// summer: the tufts carry the detail, so the ground under them is calmer and darker (as if in the shade of the blades)
if (uSnow < 0.5) tcol = mix(tcol, avgCol * 0.8, 0.55 * wt.x) * mix(vec3(1.0), vec3(0.66, 0.86, 0.55), wt.x);
// slope: steep ground loses snow
float steep = smoothstep(0.78, 0.55, normalize(vNormalLocal).y);
tcol = mix(tcol, col1 * 0.8, steep * 0.7 * uSnow);
diffuseColor.rgb *= tcol;
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = dot(wt, uRough) * roughness;
`)
      .replace('#include <normal_fragment_maps>', `
{
  vec3 nm = splat3(sTex(n0, wp, uScale.x).xyz, sTex(n1, wp, uScale.y).xyz, sTex(n2, wp, uScale.z).xyz, wt) * 2.0 - 1.0;
  nm.xy *= 1.15 * (1.0 - 0.8 * smoothstep(24.0, 70.0, length(vWP - cameraPosition)));
  vec3 q0 = dFdx( - vViewPosition ), q1 = dFdy( - vViewPosition );
  vec2 st0 = dFdx( wp ), st1 = dFdy( wp );
  vec3 N = normal;
  vec3 q1perp = cross( q1, N ), q0perp = cross( N, q0 );
  vec3 T = q1perp * st0.x + q0perp * st1.x; vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max( dot( T, T ), dot( B, B ) ); float sc = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
  normal = normalize( mat3( T * sc, B * sc, N ) * normalize(nm) );
  nm = nm;
}
`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (uSnow > 0.5) {
  vec3 cell = floor(vWP * 34.0);
  float g = th(cell);
  float tw = step(0.987, g);
  vec3 V = normalize(vViewPosition);
  float ph = th(cell + 17.0) * 6.2831;
  float flick = pow(max(0.0, sin(ph + dot(V, vec3(5.0, 3.0, 4.0)) * 6.0)), 24.0);
  float dist = length(vViewPosition);
  totalEmissiveRadiance += vec3(0.85, 0.92, 1.0) * tw * flick * 0.5 * wt.x * smoothstep(40.0, 4.0, dist);
}`);
    // local normal for slope test
    shader.vertexShader = shader.vertexShader.replace('varying vec3 vWP;', 'varying vec3 vWP; varying vec3 vNormalLocal;').replace('vW = aW;', 'vW = aW; vNormalLocal = normal;');
    shader.fragmentShader = shader.fragmentShader.replace('varying vec3 vWP;', 'varying vec3 vWP; varying vec3 vNormalLocal;');
  };
  return mat;
}

/** Streams terrain chunks around the camera. */
export class TerrainStreamer {
  constructor(terrain, root, opts = {}) {
    this.t = terrain; this.root = root; this.chunks = new Map();
    this.mat = makeTerrainMaterial(terrain.season);
    this.radius = opts.radius ?? 330;
    this.bounds = opts.bounds || { minx: -330, maxx: 330, minz: -330, maxz: 360 };
    this.queue = [];
    this.group = new THREE.Group(); this.group.name = 'terrain'; root.add(this.group);
    this.treeMask = opts.treeMask || null;
  }
  key(i, j) { return i + ',' + j; }
  update(cam, budget = 2) {
    const ci = Math.floor(cam.x / CHUNK), cj = Math.floor(cam.z / CHUNK);
    const r = Math.ceil(this.radius / CHUNK);
    const need = [];
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      const cx = (i + 0.5) * CHUNK, cz = (j + 0.5) * CHUNK;
      if (cx + CHUNK / 2 < this.bounds.minx || cx - CHUNK / 2 > this.bounds.maxx || cz + CHUNK / 2 < this.bounds.minz || cz - CHUNK / 2 > this.bounds.maxz) continue;
      const d = Math.hypot(cx - cam.x, cz - cam.z);
      if (d > this.radius + CHUNK) continue;
      const k = this.key(i, j);
      if (!this.chunks.has(k)) need.push({ i, j, d, k });
    }
    need.sort((a, b) => a.d - b.d);
    for (let n = 0; n < Math.min(budget, need.length); n++) this.build(need[n].i, need[n].j);
    // unload far
    for (const [k, c] of this.chunks) {
      const d = Math.hypot(c.cx - cam.x, c.cz - cam.z);
      if (d > this.radius + CHUNK * 2.5) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); this.chunks.delete(k); }
    }
  }
  buildAllNear(cam, count = 999) { this.update(cam, count); }

  build(i, j) {
    const t = this.t;
    const x0 = i * CHUNK, z0 = j * CHUNK, step = CHUNK / RES;
    const N = RES + 1, E = N + 2; // with border for normals
    const hs = new Float32Array(E * E);
    for (let a = 0; a < E; a++) for (let b = 0; b < E; b++) hs[a * E + b] = t.height(x0 + (b - 1) * step, z0 + (a - 1) * step);
    const pos = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3), w = new Float32Array(N * N * 3);
    const idx = [];
    for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) {
      const k = a * N + b;
      const x = x0 + b * step, z = z0 + a * step;
      const h = hs[(a + 1) * E + (b + 1)];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const hl = hs[(a + 1) * E + b], hr = hs[(a + 1) * E + b + 2], hu = hs[a * E + (b + 1)], hd = hs[(a + 2) * E + (b + 1)];
      const nx = (hl - hr), ny = 2 * step, nz = (hu - hd); const l = Math.hypot(nx, ny, nz);
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
      // weights
      const rd = t.road.nearest(x, z).d;
      let wr = 1 - smooth(1.9, 3.5, rd);
      const tr = t.trail.nearest(x, z).d; const wt = (1 - smooth(0.7, 1.9, tr)) * 0.55;
      let wf = t.forestMask(x, z);
      // lake bed / shore
      w[k * 3] = clamp(wf + 0.0); w[k * 3 + 1] = clamp(Math.max(wr, wt)); w[k * 3 + 2] = 0;
    }
    for (let a = 0; a < RES; a++) for (let b = 0; b < RES; b++) {
      const k = a * N + b;
      idx.push(k, k + N, k + 1, k + 1, k + N, k + N + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aW', new THREE.BufferAttribute(w, 3));
    g.setIndex(idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, this.mat);
    m.receiveShadow = true; m.castShadow = false;
    m.frustumCulled = true;
    this.group.add(m);
    this.chunks.set(this.key(i, j), { mesh: m, cx: x0 + CHUNK / 2, cz: z0 + CHUNK / 2 });
  }
}
