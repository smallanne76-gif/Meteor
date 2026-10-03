// The island in the north bay: a low snow mound with rocks, a few spruce, a bare birch and a cairn. Where the ice went quiet.
import * as THREE from 'three';
import { snowMaterial, pbr, solid } from '../gfx/materials.js';
import { buildPine, buildBirch, pineMats, birchMats } from './trees.js';
import { worldUV } from '../gfx/geo.js';
import { RNG } from '../core/util.js';
import { LAYOUT } from './halden.js';

export function buildIsland(game, parent, { x, z, r = 12, h = 1.7 }) {
  const rng = new RNG(77); const g = new THREE.Group(); g.position.set(x, LAYOUT.iceY, z); g.name = 'island'; parent.add(g);
  const rad = (a) => r * (1 + 0.16 * Math.sin(a * 3 + 1) + 0.09 * Math.sin(a * 7 + 0.4));
  const height = (px, pz) => { const dx = px - x, dz = pz - z; const d = Math.hypot(dx, dz); const R = rad(Math.atan2(dz, dx)); if (d >= R) return null; const t = d / R; return LAYOUT.iceY + h * (1 - t * t) + 0.06 * Math.sin(dx * 0.9) * Math.cos(dz * 0.8) * (1 - t); };
  // mound
  const sg = new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2); const p = sg.attributes.position;
  for (let i = 0; i < p.count; i++) { const ux = p.getX(i), uz = p.getZ(i); const rho = Math.hypot(ux, uz); const R = rad(Math.atan2(uz, ux)); p.setXYZ(i, ux * R, h * (1 - rho * rho) + (rho < 0.99 ? 0.06 * Math.sin(ux * R * 0.9) * Math.cos(uz * R * 0.8) * (1 - rho) : 0), uz * R); }
  sg.computeVertexNormals(); worldUV(sg, 3);
  const mound = new THREE.Mesh(sg, snowMaterial({ name: 'snow' })); mound.receiveShadow = true; mound.castShadow = true; g.add(mound);
  // rocks around the rim
  const rockMat = pbr('rock', { key: 'islandrock', tint: 0x8a8f94 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rng.next() * 0.4; const rr = rad(a) * (0.82 + rng.next() * 0.18); const s = 0.6 + rng.next() * 0.9;
    const ig = new THREE.IcosahedronGeometry(s, 1); const q = ig.attributes.position; for (let k = 0; k < q.count; k++) { const f = 0.8 + 0.4 * Math.sin(k * 12.9898) ** 2; q.setXYZ(k, q.getX(k) * f * 1.2, q.getY(k) * f * 0.7, q.getZ(k) * f); } ig.computeVertexNormals(); worldUV(ig, 1.5);
    const m = new THREE.Mesh(ig, rockMat); const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr; const py = (height(px, pz) ?? LAYOUT.iceY) - 0.1; m.position.set(Math.cos(a) * rr, py - LAYOUT.iceY, Math.sin(a) * rr); m.rotation.y = rng.next() * 6; m.castShadow = true; m.receiveShadow = true; g.add(m);
    const sn = new THREE.Mesh(new THREE.SphereGeometry(s * 0.8, 10, 6, 0, Math.PI * 2, 0, 1.0), snowMaterial({ name: 'snow' })); sn.scale.set(1.2, 0.5, 1); sn.position.set(m.position.x, m.position.y + s * 0.38, m.position.z); g.add(sn);
    game.collision.addCylinder(px, pz, s * 0.85, py, py + s * 1.2);
  }
  // trees: four spruce and a bare birch
  const trees = [[-3.5, -3.0, 3], [3.8, -2.0, 7], [-2.0, 4.0, 11], [5.5, 3.5, 13]];
  for (const [tx, tz, sd] of trees) { const m = new THREE.Mesh(buildPine(2000 + sd, 0, true), pineMats(true)); const px = x + tx, pz = z + tz; m.position.set(tx, (height(px, pz) ?? LAYOUT.iceY) - LAYOUT.iceY - 0.1, tz); m.scale.setScalar(0.6 + 0.1 * (sd % 3)); m.castShadow = true; g.add(m); game.collision.addCylinder(px, pz, 0.28, 0, 8); }
  { const m = new THREE.Mesh(buildBirch(81, true), birchMats()); const px = x - 1.0, pz = z + 0.2; m.position.set(-1.0, (height(px, pz) ?? LAYOUT.iceY) - LAYOUT.iceY - 0.05, 0.2); m.scale.setScalar(0.7); m.castShadow = true; g.add(m); game.collision.addCylinder(px, pz, 0.25, 0, 7); }
  // a cairn on the crown: five flat stones, the top one pale
  const cairn = new THREE.Group(); const cx = x + 1.2, cz = z - 0.8; cairn.position.set(1.2, (height(cx, cz) ?? LAYOUT.iceY) - LAYOUT.iceY, -0.8); g.add(cairn);
  for (let i = 0; i < 5; i++) { const w = 0.5 - i * 0.07; const st = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.95, w, 0.1 + 0.02 * (i % 2), 9), i === 4 ? solid(0xcfd2d4, { rough: 0.8 }) : rockMat); st.position.set((i % 2 ? 0.02 : -0.02), 0.06 + i * 0.115, 0); st.rotation.y = i * 0.9; st.castShadow = true; cairn.add(st); }
  game.collision.addCylinder(cx, cz, 0.5, 0, 0.8);
  // the place at the foot of the cairn where something was left
  const api = { group: g, pos: new THREE.Vector3(x, LAYOUT.iceY, z), cairnPos: new THREE.Vector3(cx, (height(cx, cz) ?? LAYOUT.iceY) + 0.7, cz), r, height, shore: new THREE.Vector3(x, 0, z - rad(-Math.PI / 2) - 0.5) };
  return api;
}
