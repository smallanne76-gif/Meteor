// Dad's cedar canoe, for the summer memory: lofted hull, thwarts, a pair of paddles. Bow at -Z.
import * as THREE from 'three';
import { pbr, solid } from '../gfx/materials.js';
import { worldUV } from '../gfx/geo.js';

export function makeCanoe({ len = 4.6, beam = 0.9, dep = 0.42 } = {}) {
  const g = new THREE.Group(); g.name = 'canoe';
  const sg = new THREE.SphereGeometry(1, 36, 14, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); const p = sg.attributes.position;
  for (let i = 0; i < p.count; i++) { const px = p.getX(i), py = p.getY(i), pz = p.getZ(i); const taper = Math.pow(Math.max(0, 1 - Math.abs(pz)), 0.5); p.setXYZ(i, px * beam / 2 * taper, py * dep + Math.pow(Math.abs(pz), 3) * 0.2, pz * len / 2); }
  sg.computeVertexNormals(); worldUV(sg, 1.2);
  const outer = pbr('wood_paint', { key: 'canoeS', tint: 0x35624c }).clone(); outer.side = THREE.DoubleSide; outer.userData.shared = true; outer.roughness = 0.5;
  const hull = new THREE.Mesh(sg, outer); hull.castShadow = true; hull.receiveShadow = true; hull.position.y = dep; g.add(hull);
  const wood = pbr('wood_pale', { key: 'canoeW', tint: 0xd8b888 });
  const bx = (w, h, d, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = true; g.add(m); return m; };
  // gunwales, thwarts, seats
  for (const sx of [-1, 1]) { const rail = bx(0.04, 0.035, len * 0.78, sx * beam * 0.48, dep + 0.18, 0); rail.scale.z = 1; }
  for (const z of [-0.5, 0.35, 1.2]) bx(beam * 0.98, 0.04, 0.09, 0, dep + 0.2, z);
  bx(0.34, 0.03, 0.26, 0, dep + 0.05, -1.05); bx(0.34, 0.03, 0.26, 0, dep + 0.05, 1.45);          // bow seat, stern seat
  // paddles
  const paddles = [];
  for (let i = 0; i < 2; i++) {
    const pd = new THREE.Group(); const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.35, 8), wood); pd.add(shaft);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.5, 0.02), wood); blade.position.y = -0.8; pd.add(blade);
    const grip = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), wood); grip.position.y = 0.68; pd.add(grip);
    pd.position.set(i ? 0.55 : -0.5, dep + 0.55, i ? 1.5 : -0.3); pd.rotation.z = i ? -0.35 : 0.3; pd.rotation.x = 0.4; g.add(pd); paddles.push(pd);
  }
  g.userData.paddles = paddles; g.userData.dep = dep;
  return g;
}
