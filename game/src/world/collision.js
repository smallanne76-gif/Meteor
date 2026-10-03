// Lightweight collision world: oriented boxes + cylinders in XZ with Y ranges, walkable surfaces (floors, ramps/stairs)
// over an analytic terrain, spatial hash, and ray casting for occlusion / line-of-sight tests.
import * as THREE from 'three';

const CELL = 4;
const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;

export class Collision {
  constructor() {
    this.items = [];            // blockers
    this.surfaces = [];         // walkable regions above terrain
    this.grid = new Map();
    this.sgrid = new Map();
    this.terrain = null;        // (x,z)=>height
    this.terrainSurface = () => 'snow';
    this.nextId = 1;
    this.water = null;          // {y} - not walkable below? (unused for now)
    this.bounds = null;         // optional {minx,maxx,minz,maxz} soft world limit
  }

  clear() { this.items.length = 0; this.surfaces.length = 0; this.grid.clear(); this.sgrid.clear(); this.terrain = null; this.nextId = 1; }

  _cells(minx, maxx, minz, maxz, fn) {
    const x0 = Math.floor(minx / CELL), x1 = Math.floor(maxx / CELL), z0 = Math.floor(minz / CELL), z1 = Math.floor(maxz / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) fn(cx, cz);
  }

  /** oriented box blocker. (x,z) centre, size sx/sz, y0..y1 range, yaw about Y */
  addBox(x, z, sx, sz, y0, y1, yaw = 0, o = {}) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const hx = sx / 2, hz = sz / 2;
    const ext = Math.abs(c) * hx + Math.abs(s) * hz, extz = Math.abs(s) * hx + Math.abs(c) * hz;
    const it = { id: this.nextId++, type: 'box', x, z, hx, hz, c, s, y0, y1, enabled: true, tag: o.tag || '', minx: x - ext, maxx: x + ext, minz: z - extz, maxz: z + extz, rayBlock: o.rayBlock ?? true, move: o.move ?? true };
    this.items.push(it);
    this._cells(it.minx, it.maxx, it.minz, it.maxz, (cx, cz) => { const k = key(cx, cz); (this.grid.get(k) || this.grid.set(k, []).get(k)).push(it); });
    return it;
  }
  addCylinder(x, z, r, y0, y1, o = {}) {
    const it = { id: this.nextId++, type: 'cyl', x, z, r, y0, y1, enabled: true, tag: o.tag || '', minx: x - r, maxx: x + r, minz: z - r, maxz: z + r, rayBlock: o.rayBlock ?? true, move: o.move ?? true };
    this.items.push(it);
    this._cells(it.minx, it.maxx, it.minz, it.maxz, (cx, cz) => { const k = key(cx, cz); (this.grid.get(k) || this.grid.set(k, []).get(k)).push(it); });
    return it;
  }
  /** flat walkable floor (axis aligned or rotated): top height y */
  addFloor(x, z, sx, sz, y, o = {}) {
    const yaw = o.yaw || 0; const c = Math.cos(yaw), s = Math.sin(yaw); const hx = sx / 2, hz = sz / 2;
    const ext = Math.abs(c) * hx + Math.abs(s) * hz, extz = Math.abs(s) * hx + Math.abs(c) * hz;
    const sf = { id: this.nextId++, kind: 'floor', x, z, hx, hz, c, s, y, y2: y, surf: o.surf || 'wood', minx: x - ext, maxx: x + ext, minz: z - extz, maxz: z + extz, enabled: true };
    this.surfaces.push(sf);
    this._cells(sf.minx, sf.maxx, sf.minz, sf.maxz, (cx, cz) => { const k = key(cx, cz); (this.sgrid.get(k) || this.sgrid.set(k, []).get(k)).push(sf); });
    return sf;
  }
  /** ramp / stair: height goes from yA at local -z edge... we define along local +X axis of the rotated rect: y rises from yA (at -hx) to yB (at +hx) */
  addRamp(x, z, sx, sz, yA, yB, yaw = 0, o = {}) {
    const sf = this.addFloor(x, z, sx, sz, yA, { ...o, yaw });
    sf.kind = 'ramp'; sf.y = yA; sf.y2 = yB;
    return sf;
  }
  remove(it) { it.enabled = false; }

  groundAt(x, z, feetY, stepUp = 0.45) {
    let best = this.terrain ? this.terrain(x, z) : -1e9;
    let surf = this.terrain ? this.terrainSurface(x, z) : 'wood';
    const sfs = this.sgrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (sfs) for (const sf of sfs) {
      if (!sf.enabled) continue;
      const dx = x - sf.x, dz = z - sf.z;
      const lx = dx * sf.c + dz * sf.s, lz = -dx * sf.s + dz * sf.c;
      if (Math.abs(lx) > sf.hx || Math.abs(lz) > sf.hz) continue;
      let y = sf.y;
      if (sf.kind === 'ramp') { const t = (lx + sf.hx) / (2 * sf.hx); y = sf.y + (sf.y2 - sf.y) * t; }
      if (y <= feetY + stepUp && y > best) { best = y; surf = sf.surf; }
    }
    return { y: best, surf };
  }
  /** hasRoof/indoor query helper: is there a floor surface under x,z (excluding terrain)? */
  floorUnder(x, z) {
    const sfs = this.sgrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!sfs) return null;
    for (const sf of sfs) {
      if (!sf.enabled) continue;
      const dx = x - sf.x, dz = z - sf.z;
      const lx = dx * sf.c + dz * sf.s, lz = -dx * sf.s + dz * sf.c;
      if (Math.abs(lx) <= sf.hx && Math.abs(lz) <= sf.hz) return sf;
    }
    return null;
  }

  /** push a circle (feet position p, radius r, vertical span [y0,y1]) out of blockers. Returns true if moved. */
  resolve(p, r, y0, y1) {
    let moved = false;
    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      const seen = new Set();
      this._cells(p.x - r, p.x + r, p.z - r, p.z + r, (cx, cz) => {
        const arr = this.grid.get(key(cx, cz)); if (!arr) return;
        for (const it of arr) {
          if (!it.enabled || !it.move || seen.has(it.id)) continue; seen.add(it.id);
          if (it.y1 <= y0 + 0.02 || it.y0 >= y1) continue;
          if (p.x + r < it.minx || p.x - r > it.maxx || p.z + r < it.minz || p.z - r > it.maxz) continue;
          if (it.type === 'cyl') {
            const dx = p.x - it.x, dz = p.z - it.z; const d = Math.hypot(dx, dz); const m = it.r + r;
            if (d < m) { const k = d > 1e-5 ? (m - d) / d : 0; if (d > 1e-5) { p.x += dx * k; p.z += dz * k; } else p.x += m; any = true; }
          } else {
            const dx = p.x - it.x, dz = p.z - it.z;
            const lx = dx * it.c + dz * it.s, lz = -dx * it.s + dz * it.c;
            const qx = Math.max(-it.hx, Math.min(it.hx, lx)), qz = Math.max(-it.hz, Math.min(it.hz, lz));
            let nx = lx - qx, nz = lz - qz; const d2 = nx * nx + nz * nz;
            if (d2 < r * r) {
              let px, pz;
              if (d2 > 1e-8) { const d = Math.sqrt(d2); const k = (r - d) / d; px = nx * k; pz = nz * k; }
              else { // centre inside box: push out the shortest way
                const ox = it.hx - Math.abs(lx), oz = it.hz - Math.abs(lz);
                if (ox < oz) { px = Math.sign(lx || 1) * (ox + r); pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * (oz + r); }
              }
              p.x += px * it.c - pz * it.s; p.z += px * it.s + pz * it.c; any = true;
            }
          }
        }
      });
      if (!any) break; moved = true;
    }
    if (this.bounds) {
      const b = this.bounds; p.x = Math.max(b.minx, Math.min(b.maxx, p.x)); p.z = Math.max(b.minz, Math.min(b.maxz, p.z));
    }
    return moved;
  }

  /** ray vs blockers (y-aware). returns {dist, item} or null. */
  raycast(o, d, maxDist = 50, filter) {
    let best = null; const seen = new Set();
    // step through cells along the ray (coarse DDA by sampling)
    const steps = Math.ceil(maxDist / (CELL * 0.5));
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(maxDist, i * CELL * 0.5);
      const cx = Math.floor((o.x + d.x * t) / CELL), cz = Math.floor((o.z + d.z * t) / CELL);
      for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
        const arr = this.grid.get(key(cx + ox, cz + oz)); if (!arr) continue;
        for (const it of arr) {
          if (!it.enabled || !it.rayBlock || seen.has(it.id)) continue; seen.add(it.id);
          if (filter && !filter(it)) continue;
          const h = this._rayItem(it, o, d, maxDist);
          if (h !== null && (!best || h < best.dist)) best = { dist: h, item: it };
        }
      }
    }
    return best;
  }
  _rayItem(it, o, d, maxDist) {
    // slab test in local box space (y: it.y0..it.y1)
    let ox, oz, dx, dz;
    if (it.type === 'cyl') {
      ox = o.x - it.x; oz = o.z - it.z; dx = d.x; dz = d.z;
      const a = dx * dx + dz * dz; if (a < 1e-9) return null;
      const b = 2 * (ox * dx + oz * dz), c = ox * ox + oz * oz - it.r * it.r;
      const disc = b * b - 4 * a * c; if (disc < 0) return null;
      const t = (-b - Math.sqrt(disc)) / (2 * a); if (t < 0 || t > maxDist) return null;
      const y = o.y + d.y * t; if (y < it.y0 || y > it.y1) return null; return t;
    }
    const rx = o.x - it.x, rz = o.z - it.z;
    ox = rx * it.c + rz * it.s; oz = -rx * it.s + rz * it.c;
    dx = d.x * it.c + d.z * it.s; dz = -d.x * it.s + d.z * it.c;
    let tmin = 0, tmax = maxDist;
    const slab = (o1, d1, a, b) => {
      if (Math.abs(d1) < 1e-9) return o1 >= a && o1 <= b;
      let t1 = (a - o1) / d1, t2 = (b - o1) / d1; if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); return tmin <= tmax;
    };
    if (!slab(ox, dx, -it.hx, it.hx)) return null;
    if (!slab(oz, dz, -it.hz, it.hz)) return null;
    if (!slab(o.y, d.y, it.y0, it.y1)) return null;
    return tmin;
  }
  /** is there a clear line between a and b (Vector3s)? */
  los(a, b, filter) {
    const d = new THREE.Vector3().subVectors(b, a); const dist = d.length(); if (dist < 1e-3) return true; d.divideScalar(dist);
    const h = this.raycast(a, d, dist - 0.05, filter); return !h;
  }
}
