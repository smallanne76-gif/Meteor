// Geometry helpers: world-scale (box-projected) UVs, rounded boxes, merging, simple lathe/extrude builders.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Re-project UVs so `tile` metres == one texture repeat, picking the projection axis from the normal. */
export function worldUV(geo, tile = 1, offset = [0, 0]) {
  geo.computeVertexNormals && !geo.attributes.normal && geo.computeVertexNormals();
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u / tile + offset[0]; uv[i * 2 + 1] = v / tile + offset[1];
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function box(w, h, d, tile = 1.2, off) { return worldUV(new THREE.BoxGeometry(w, h, d), tile, off); }
export function rbox(w, h, d, r = 0.02, tile = 1.2, seg = 3) { return worldUV(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)), tile); }
export function cyl(rt, rb, h, seg = 16, tile = 1.2, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  // cylinders: u around circumference (metres), v up
  const pos = g.attributes.position, uv = g.attributes.uv;
  const circ = Math.PI * 2 * Math.max(rt, rb);
  for (let i = 0; i < uv.count; i++) {
    const side = Math.abs(g.attributes.normal.getY(i)) < 0.5;
    if (side) uv.setXY(i, uv.getX(i) * circ / tile, (pos.getY(i) + h / 2) / tile);
    else uv.setXY(i, pos.getX(i) / tile + .5, pos.getZ(i) / tile + .5);
  }
  return g;
}
export function plane(w, h, tile = 1.2, segX = 1, segY = 1) {
  const g = new THREE.PlaneGeometry(w, h, segX, segY);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * h / tile);
  return g;
}
/** horizontal plane facing up, centred */
export function floorPlane(w, d, tile = 1.2) {
  const g = plane(w, d, tile); g.rotateX(-Math.PI / 2); return g;
}

export function merge(geos) { return mergeGeometries(geos, false); }
export function mergeGroups(geos) { return mergeGeometries(geos, true); }
export function translate(g, x = 0, y = 0, z = 0) { g.translate(x, y, z); return g; }

/** lathe from [[radius, y], ...] profile */
export function lathe(profile, seg = 24, tile = 1) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  return g;
}

/** wall segment with rectangular holes: wall lies along X, thickness along Z, base at y=0, centred on x */
export function wallWithHoles(length, height, thick, holes = [], tile = 1.2) {
  const s = new THREE.Shape();
  s.moveTo(-length / 2, 0); s.lineTo(length / 2, 0); s.lineTo(length / 2, height); s.lineTo(-length / 2, height); s.closePath();
  for (const h of holes) {
    const p = new THREE.Path();
    const x0 = h.x - h.w / 2, x1 = h.x + h.w / 2, y0 = h.y, y1 = h.y + h.h;
    p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.closePath();
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -thick / 2);
  g.computeVertexNormals();
  return worldUV(g, tile);
}

export function tag(mesh, name, props = {}) { mesh.name = name; Object.assign(mesh.userData, props); return mesh; }

/** a mesh that casts & receives shadows by default */
export function mesh(geo, mat, { cast = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  if (name) m.name = name;
  return m;
}
