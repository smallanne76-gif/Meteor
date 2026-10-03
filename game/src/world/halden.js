// The Halden Lake world layout (shared by every outdoor chapter) and its analytic terrain.
// +X east, +Z south, -Z north (towards the lake). The lodge sits at the origin, its front door facing south.
import * as THREE from 'three';
import { fbm2, smooth, lerp, clamp } from '../core/util.js';

export const LAYOUT = {
  lodge: { x: 0, z: 0, w: 15, d: 11 },
  road: [[8, 175], [3, 150], [-8, 124], [-14, 100], [-8, 78], [5, 58], [10, 40], [5, 24], [0, 10.5]],
  // trail leaves the lodge's back door, curves east through the woods to the boathouse
  trail: [[8, -9], [24, -12], [44, -20], [62, -14], [80, -22], [100, -36], [120, -48], [138, -62], [150, -74]],
  boathouse: { x: 152, z: -80 },
  dock: { x: 4, z: -52 },          // family dock in front of the lodge
  lake: { cx: 0, cz: -300, rx: 260, rz: 240 },
  iceY: -0.35,
};

const seg = (a, b) => ({ ax: a[0], az: a[1], bx: b[0], bz: b[1], dx: b[0] - a[0], dz: b[1] - a[1], len2: (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 });

export class Path {
  constructor(points, smoothIters = 2) {
    // chaikin smoothing so roads and trails curve nicely
    let p = points.map((q) => [q[0], q[1]]);
    for (let it = 0; it < smoothIters; it++) {
      const n = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        n.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
      }
      n.push(p[p.length - 1]); p = n;
    }
    this.pts = p; this.segs = []; this.cum = [0];
    for (let i = 0; i < p.length - 1; i++) { const s = seg(p[i], p[i + 1]); this.segs.push(s); this.cum.push(this.cum[i] + Math.sqrt(s.len2)); }
    this.length = this.cum[this.cum.length - 1];
    this.h = null;
  }
  /** nearest point: {d, t (0..length), x, z, dirx, dirz} */
  nearest(x, z) {
    let best = 1e9, bt = 0, bi = 0, bx = 0, bz = 0;
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      let u = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / (s.len2 || 1); u = clamp(u, 0, 1);
      const px = s.ax + s.dx * u, pz = s.az + s.dz * u;
      const d = Math.hypot(x - px, z - pz);
      if (d < best) { best = d; bi = i; bt = this.cum[i] + u * Math.sqrt(s.len2); bx = px; bz = pz; }
    }
    const s = this.segs[bi]; const l = Math.sqrt(s.len2) || 1;
    return { d: best, t: bt, x: bx, z: bz, dirx: s.dx / l, dirz: s.dz / l };
  }
  at(t) {
    t = clamp(t, 0, this.length);
    let i = 0; while (i < this.segs.length - 1 && this.cum[i + 1] < t) i++;
    const s = this.segs[i]; const l = Math.sqrt(s.len2) || 1; const u = (t - this.cum[i]) / l;
    return { x: s.ax + s.dx * u, z: s.az + s.dz * u, dirx: s.dx / l, dirz: s.dz / l };
  }
}

export class HaldenTerrain {
  constructor(season = 'winter') {
    this.season = season;
    this.road = new Path(LAYOUT.road, 3);
    this.trail = new Path(LAYOUT.trail, 3);
    this.lake = LAYOUT.lake;
    // pre-sample base heights along road/trail and smooth them so they follow the land gently
    for (const p of [this.road, this.trail]) {
      const n = p.pts.length;
      const raw = p.pts.map((q) => this.base(q[0], q[1]));
      p.h = raw.map((_, i) => { let s = 0, c = 0; for (let k = -4; k <= 4; k++) { const j = Math.min(n - 1, Math.max(0, i + k)); s += raw[j]; c++; } return s / c; });
    }
    // road ends at lodge level (0)
    const rn = this.road.pts.length; for (let i = 0; i < 14; i++) { const j = rn - 1 - i; this.road.h[j] = lerp(0.0, this.road.h[j], i / 14); }
    const tn = this.trail.pts.length; for (let i = 0; i < 10; i++) { this.trail.h[i] = lerp(0.0, this.trail.h[i], i / 10); }
    this._cache = new Map();
  }

  base(x, z) {
    // rolling hills, stronger away from the lake/lodge
    let h = fbm2(x * 0.0065 + 11, z * 0.0065 + 3, 4) * 9 + fbm2(x * 0.025, z * 0.025, 3) * 1.6 + fbm2(x * 0.09, z * 0.09, 2) * 0.28;
    // rise toward the south/east/west edges for a sheltered valley feel
    h += smooth(60, 330, Math.abs(x)) * 14 + smooth(120, 330, z) * 10;
    return h;
  }

  lakeDist(x, z) { const L = this.lake; return Math.hypot((x - L.cx) / L.rx, (z - L.cz) / L.rz); }

  height(x, z) {
    let h = this.base(x, z);
    // lodge plateau
    const dl = Math.hypot(x - LAYOUT.lodge.x, z - LAYOUT.lodge.z);
    const pf = 1 - smooth(16, 44, dl);
    h = lerp(h, 0.0 + (z < 0 ? z * 0.012 : 0), pf);
    // gentle slope down to the lake from the lodge
    // road
    const r = this.road.nearest(x, z);
    if (r.d < 14) { const i = this.road.cum.findIndex((c) => c >= r.t); const idx = Math.max(0, i); const rh = this.road.h[Math.min(this.road.h.length - 1, idx)]; h = lerp(h, rh, 1 - smooth(3.2, 12, r.d)); }
    // trail (subtler)
    const tr = this.trail.nearest(x, z);
    if (tr.d < 8) { const i = this.trail.cum.findIndex((c) => c >= tr.t); const idx = Math.max(0, i); const th = this.trail.h[Math.min(this.trail.h.length - 1, idx)]; h = lerp(h, th, 1 - smooth(1.4, 6, tr.d)); }
    // boathouse flat
    const db = Math.hypot(x - LAYOUT.boathouse.x, z - LAYOUT.boathouse.z);
    h = lerp(h, 0.2, 1 - smooth(10, 26, db));
    // dock bank
    // lake basin
    const ld = this.lakeDist(x, z);
    if (ld < 1.12) {
      // shore ramps from land height down below the ice
      const k = smooth(1.0, 0.86, ld);
      h = lerp(h, LAYOUT.iceY - 2.8, k);
      // keep a gentle beach lip
    }
    return h;
  }

  /** ground type for footsteps/materials */
  surface(x, z) {
    const ld = this.lakeDist(x, z);
    if (ld < 0.965) return 'ice';
    const r = this.road.nearest(x, z);
    if (r.d < 2.6) return 'road';
    return 'snow';
  }

  forestMask(x, z) {
    // 1 = dense forest (dark floor), 0 = open
    const dl = Math.hypot(x - LAYOUT.lodge.x, z - LAYOUT.lodge.z);
    let f = smooth(0.35, 0.62, fbm2(x * 0.013 + 40, z * 0.013 - 7, 3) * 0.5 + 0.5);
    f *= smooth(20, 34, dl);
    const r = this.road.nearest(x, z); f *= smooth(3.5, 9, r.d) * 0.85 + 0.15 * (r.d > 12 ? 1 : 0);
    return f;
  }
  normal(x, z, out = new THREE.Vector3()) {
    const e = 0.6;
    const hl = this.height(x - e, z), hr = this.height(x + e, z), hd = this.height(x, z - e), hu = this.height(x, z + e);
    return out.set(hl - hr, 2 * e, hd - hu).normalize();
  }
}
