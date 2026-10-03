// Furniture & props. Each helper adds static geometry into a Builder (batched) and returns handles for the interactive bits.
import * as THREE from 'three';
import { pbr, solid, glass, booksTex, card } from '../gfx/materials.js';
import { box as boxGeo, rbox, cyl as cylGeo, lathe, plane, worldUV } from '../gfx/geo.js';
import { RNG } from '../core/util.js';

const P = {};   // shared materials
function mats() {
  if (P.ready) return P;
  Object.assign(P, {
    ready: true,
    woodDark: pbr('wood_dark', { key: 'pd', tint: 0xb8a090 }), woodMid: pbr('wood_floor', { key: 'pm', tint: 0xd8b898 }), woodPale: pbr('wood_pale', { key: 'pp', tint: 0xe0c8a0 }),
    woodPaint: pbr('wood_paint', { key: 'ppn', tint: 0xdfe6dc }), woodCream: pbr('wood_paint', { key: 'ppc', tint: 0xf3ecd6 }),
    fabricRed: pbr('fabric_wool', { key: 'fr', tint: 0xc0a8a0 }), fabricGreen: pbr('fabric_green', { key: 'fg', tint: 0xb0c0b0 }), canvas: pbr('canvas', { key: 'cv' }),
    stone: pbr('rock', { key: 'st', tint: 0xb8b0a4 }), brick: pbr('brick', { key: 'br', tint: 0xb8a090 }), metal: pbr('metal_rust', { key: 'mt', tint: 0xc0c0c0, metal: 1 }),
    tile: pbr('tile', { key: 'tl' }), paper: pbr('paper', { key: 'pa' }), concrete: pbr('concrete', { key: 'cc' }),
    ceramic: solid(0xe8e4da, { rough: 0.2 }), ceramicBlue: solid(0x4a6a8a, { rough: 0.25 }), brass: solid(0x9a7a3c, { rough: 0.35, metal: 1 }), iron: solid(0x1c1c1e, { rough: 0.5, metal: 0.8 }),
    chrome: solid(0xcfcfd2, { rough: 0.15, metal: 1 }), rubber: solid(0x161616, { rough: 0.9 }), whiteEnamel: solid(0xe6e3da, { rough: 0.3 }), blackWood: solid(0x1d1510, { rough: 0.45 }),
    glassClear: glass({ opacity: 0.22 }), leather: solid(0x4a2f20, { rough: 0.55 }), yellowCoat: solid(0xe8b81c, { rough: 0.45 }), grey: solid(0x6a6a68, { rough: 0.8 }),
  });
  return P;
}
export const PM = mats;

const rng = new RNG(31337);

/** soft fake contact shadow under an object (multiplicative dark blob) */
export function contactShadow(B, x, z, w, d, y = 0.012, strength = 0.5, yaw = 0) {
  B.__cs = B.__cs || {}; const key = strength.toFixed(2);
  let mat = B.__cs[key];
  if (!mat) { mat = B.__cs[key] = new THREE.MeshBasicMaterial({ map: card('soft_dot'), color: 0x000000, transparent: true, opacity: strength, depthWrite: false, fog: true }); mat.userData.shared = true; }
  const g = new THREE.PlaneGeometry(w * 1.3, d * 1.3); g.rotateX(-Math.PI / 2);
  const mesh = B.add(g, mat, { pos: [x, y, z], rot: [0, yaw, 0], cast: false, recv: false, batch: false }); if (mesh) { mesh.renderOrder = 1; mesh.frustumCulled = true; }
  return mesh;
}

// -------------------------------------------------------------------------------------------------------------------
export function table(B, x, z, { w = 1.6, d = 0.9, h = 0.76, y = 0, mat = mats().woodMid, yaw = 0, legs = 'square', top = 0.045 } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  B.box(w, top, d, mat, { pos: [x, y + h - top / 2, z], rot: [0, yaw, 0], round: 0.012, tile: 0.9, collide: false });
  B.col.addBox(x, z, w, d, y, y + h, yaw, {});
  const lw = 0.07;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lx = sx * (w / 2 - 0.09), lz = sz * (d / 2 - 0.09);
    B.box(lw, h - top, lw, mat, { pos: [x + lx * c + lz * s, y + (h - top) / 2, z - lx * s + lz * c], rot: [0, yaw, 0], tile: 0.5, cast: true });
  }
  B.box(w - 0.2, 0.08, 0.04, mat, { pos: [x, y + h - top - 0.05, z], rot: [0, yaw, 0], tile: 0.5, cast: false });
  contactShadow(B, x, z, w + 0.2, d + 0.2, y + 0.01, 0.35, yaw);
}
export function chair(B, x, z, yaw = 0, { y = 0, mat = mats().woodMid, seat = 0.46, h = 0.9, cushion = null, collide = true } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw); const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  B.box(0.42, 0.04, 0.42, mat, { pos: [...L(0, 0).slice(0, 1), y + seat, L(0, 0)[1]], rot: [0, yaw, 0], round: 0.008, tile: 0.5 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = L(sx * 0.18, sz * 0.18); B.box(0.04, seat, 0.04, mat, { pos: [p[0], y + seat / 2, p[1]], rot: [0, yaw, 0], tile: 0.4, cast: false }); }
  const bp = L(0, -0.2); B.box(0.42, h - seat - 0.05, 0.035, mat, { pos: [bp[0], y + seat + (h - seat) / 2, bp[1]], rot: [0, yaw, 0], round: 0.006, tile: 0.5 });
  for (const sx of [-0.15, 0, 0.15]) { const p = L(sx, -0.2); B.box(0.03, h - seat - 0.2, 0.03, mat, { pos: [p[0], y + seat + (h - seat) / 2 - 0.05, p[1]], rot: [0, yaw, 0], tile: 0.4, cast: false }); }
  if (cushion) { const p = L(0, 0); B.box(0.4, 0.05, 0.4, cushion, { pos: [p[0], y + seat + 0.045, p[1]], rot: [0, yaw, 0], round: 0.02, tile: 0.4 }); }
  if (collide) B.col.addBox(x, z, 0.45, 0.45, y, y + seat + 0.05, yaw, {});
}
export function stool(B, x, z, { y = 0, h = 0.62, mat = mats().woodMid } = {}) { B.cyl(0.17, 0.17, 0.04, mat, { pos: [x, y + h, z], tile: 0.5 }); for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; B.box(0.04, h, 0.04, mat, { pos: [x + Math.cos(a) * 0.12, y + h / 2, z + Math.sin(a) * 0.12], tile: 0.4, cast: false }); } B.col.addCylinder(x, z, 0.2, y, y + h); }

export function sofa(B, x, z, yaw = 0, { w = 2.0, y = 0, mat = mats().fabricRed } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw); const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const p0 = L(0, 0); B.box(w, 0.3, 0.9, mats().woodDark, { pos: [p0[0], y + 0.25, p0[1]], rot: [0, yaw, 0], tile: 0.8 });
  const pb = L(0, -0.38); B.box(w, 0.55, 0.2, mat, { pos: [pb[0], y + 0.7, pb[1]], rot: [0, yaw, 0], round: 0.07, tile: 0.5 });
  for (const sx of [-w / 2 + 0.12, w / 2 - 0.12]) { const p = L(sx, 0); B.box(0.24, 0.5, 0.92, mat, { pos: [p[0], y + 0.5, p[1]], rot: [0, yaw, 0], round: 0.07, tile: 0.5 }); }
  const n = Math.max(2, Math.round((w - 0.5) / 0.6)); for (let i = 0; i < n; i++) { const lx = -((w - 0.5) / 2) + ((i + 0.5) * (w - 0.5)) / n; const p = L(lx, 0.04); B.box((w - 0.5) / n - 0.02, 0.18, 0.7, mat, { pos: [p[0], y + 0.5, p[1]], rot: [0, yaw, 0], round: 0.06, tile: 0.5 }); const pbk = L(lx, -0.2); B.box((w - 0.5) / n - 0.04, 0.4, 0.16, mat, { pos: [pbk[0], y + 0.76, pbk[1]], rot: [0, yaw + 0, -0.12], round: 0.06, tile: 0.5 }); }
  B.col.addBox(x, z, Math.abs(c) * w + Math.abs(s) * 0.95, Math.abs(s) * w + Math.abs(c) * 0.95, y, y + 0.9, 0, {});
  contactShadow(B, x, z, w + 0.2, 1.1, y + 0.01, 0.4, yaw);
}
export function armchair(B, x, z, yaw = 0, { y = 0, mat = mats().fabricGreen } = {}) { sofa(B, x, z, yaw, { w: 0.95, y, mat }); }

export function rug(B, x, z, w, d, { mat = mats().fabricRed, y = 0.012, yaw = 0, tile = 0.9 } = {}) {
  const g = plane(w, d, tile); g.rotateX(-Math.PI / 2); B.add(g, mat, { pos: [x, y, z], rot: [0, yaw, 0], cast: false });
}

export function bookshelf(B, x, z, yaw = 0, { w = 1.1, h = 2.0, d = 0.3, y = 0, mat = mats().woodDark, rows = 5, filled = 0.8, seed = 1 } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw); const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const r = new RNG(seed + Math.floor(x * 10 + z * 7));
  const side = (sx) => { const p = L(sx, 0); B.box(0.03, h, d, mat, { pos: [p[0], y + h / 2, p[1]], rot: [0, yaw, 0], tile: 0.6 }); };
  side(-w / 2 + 0.015); side(w / 2 - 0.015);
  const pb = L(0, -d / 2 + 0.01); B.box(w, h, 0.02, mat, { pos: [pb[0], y + h / 2, pb[1]], rot: [0, yaw, 0], tile: 0.6, cast: false });
  const bookCols = [0x5a2a22, 0x2f4a3a, 0x1f2f4a, 0x6b5a2a, 0x3a2a4a, 0x7a3a2a, 0x2a3a3a, 0x8a7a5a, 0x4a2a2a, 0x23232a, 0x9a8a68];
  for (let i = 0; i <= rows; i++) {
    const yy = y + 0.04 + (i * (h - 0.06)) / rows; const p = L(0, 0); B.box(w - 0.03, 0.03, d, mat, { pos: [p[0], yy, p[1]], rot: [0, yaw, 0], tile: 0.6, cast: i === rows });
    if (i < rows && r.next() < filled) {
      let lx = -w / 2 + 0.06; const rowH = (h - 0.06) / rows;
      while (lx < w / 2 - 0.1) {
        const bw = r.range(0.02, 0.05), bh = r.range(rowH * 0.55, rowH * 0.88), lean = r.next() < 0.06 ? r.range(-0.3, 0.3) : 0;
        const col = bookCols[r.int(0, bookCols.length - 1)]; const bp = L(lx + bw / 2, 0.01);
        B.box(bw, bh, d * 0.78, solid(col, { rough: 0.7 }), { pos: [bp[0], yy + 0.015 + bh / 2, bp[1]], rot: [0, yaw, lean], tile: 0.3, cast: false });
        lx += bw + 0.002; if (r.next() < 0.05) lx += r.range(0.05, 0.2);
      }
    }
  }
  B.col.addBox(x, z, Math.abs(c) * w + Math.abs(s) * d, Math.abs(s) * w + Math.abs(c) * d, y, y + h, 0, {});
}

export function fireplace(B, game, x, z, yaw = 0, { y = 0, w = 2.2, h = 1.2 } = {}) {
  // faces +x (into the room) by default when yaw=0 at the west wall; pieces built in local space (u along wall, v out)
  const c = Math.cos(yaw), s = Math.sin(yaw); const L = (lu, lv) => [x + lv * c + lu * s * -1, z + lv * s + lu * c];
  const st = mats().stone, dark = mats().blackWood;
  // breast of stone
  const bp = L(0, 0.45); B.box(0.9, 2.7, w + 0.6, st, { pos: [bp[0], y + 1.35, bp[1]], rot: [0, yaw + Math.PI / 2, 0], tile: 0.8 });
  // opening: black firebox
  const fb = L(0, 0.58); B.box(0.5, h * 0.62, w * 0.62, mats().iron, { pos: [fb[0], y + h * 0.31 + 0.18, fb[1]], rot: [0, yaw + Math.PI / 2, 0], tile: 1, cast: false });
  // hearth slab
  const hp = L(0, 0.9); B.box(0.9, 0.12, w + 1.0, st, { pos: [hp[0], y + 0.06, hp[1]], rot: [0, yaw + Math.PI / 2, 0], tile: 0.8 });
  // mantel
  const mp = L(0, 0.72); B.box(0.4, 0.1, w + 0.8, mats().woodDark, { pos: [mp[0], y + 1.55, mp[1]], rot: [0, yaw + Math.PI / 2, 0], tile: 0.8 });
  // logs & embers
  const logs = new THREE.Group();
  const lp = L(0, 0.72); logs.position.set(lp[0], y + 0.25, lp[1]);
  for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.7, 8), mats().blackWood); m.rotation.z = Math.PI / 2; m.rotation.y = (i - 1.5) * 0.35 + yaw; m.position.set((i % 2) * 0.05, i * 0.07, (i - 1.5) * 0.14); m.castShadow = true; logs.add(m); }
  const emberMat = new THREE.MeshStandardMaterial({ color: 0x220a02, emissive: 0xff5a14, emissiveIntensity: 1.6, roughness: 0.9 });
  const ember = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), emberMat); ember.scale.set(1.5, 0.3, 1.8); ember.position.y = -0.12; logs.add(ember);
  B.parent.add(logs);
  B.col.addBox(x + 0.3 * c, z + 0.3 * s, 0.9, w + 0.6, y, y + 2.7, yaw + Math.PI / 2, {});
  const lt = game.lights.add({ pos: [lp[0], y + 0.5, lp[1]], color: 0xff7a2a, intensity: 9, distance: 9, flicker: { amp: 0.35, speed: 9 }, tag: 'fire', shadow: true });
  return { logs, ember, emberMat, light: lt };
}

export function lamp(B, game, x, z, { y = 0, h = 0.55, base = 0.8, tag = 'room', color = 0xffc77a, intensity = 14, distance = 8, shade = 0xe8d6a8, on = false, floor = false, shadow = false, name = '' } = {}) {
  const top = floor ? 1.5 : y + base + h;
  const group = new THREE.Group(); group.position.set(x, y, z);
  const bodyH = floor ? 1.5 : base;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, floor ? 0.02 : 0.03, bodyH, 8), mats().brass); post.position.y = bodyH / 2; post.castShadow = true; group.add(post);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(floor ? 0.14 : 0.1, floor ? 0.16 : 0.12, 0.03, 16), mats().brass); foot.position.y = 0.015; group.add(foot);
  const shadeMat = new THREE.MeshStandardMaterial({ color: shade, emissive: color, emissiveIntensity: on ? 0.8 : 0.0, roughness: 0.85, side: THREE.DoubleSide, transparent: false });
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.26, 20, 1, true), shadeMat); sh.position.y = bodyH + 0.1; group.add(sh);
  B.parent.add(group);
  const lt = game.lights.add({ pos: [x, y + bodyH + 0.12, z], color, intensity: intensity * 0.55, distance, tag, on, shadow, decay: 1.8 });
  const api = { group, light: lt, shadeMat, on, intensityOn: 1.4,
    set(v, silent) { api.on = v; lt.on = v; shadeMat.emissiveIntensity = v ? 0.8 : 0; game.emit('lamp', api, v); } };
  const it = game.interact.add({ object: sh, radius: 0.28, label: () => (api.on ? 'Turn off' : 'Turn on'), icon: 'switch', maxDist: 2.0,
    onUse: () => { api.set(!api.on); game.audio && game.audio.at(new THREE.Vector3(x, y + bodyH, z), 'switch', { vol: 0.8 }); it.used = false; } });
  api.interact = it; api.name = name;
  if (on) api.set(true);
  return api;
}

/** a ceiling light controlled by a wall switch */
export function ceilingLight(B, game, x, z, y, { tag = 'room', color = 0xffd9a0, intensity = 26, distance = 9, on = false, shadow = true, pendant = true } = {}) {
  const group = new THREE.Group(); group.position.set(x, y, z);
  const mat = new THREE.MeshStandardMaterial({ color: 0xf0e0c0, emissive: color, emissiveIntensity: on ? 0.9 : 0, roughness: 0.6, side: THREE.DoubleSide });
  if (pendant) { const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.35, 5), mats().iron); cord.position.y = -0.175; group.add(cord); const sh = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 18, 1, true), mat); sh.position.y = -0.45; group.add(sh); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: on ? 0xfff2cc : 0x222222 })); bulb.position.y = -0.46; group.add(bulb); group.userData.bulb = bulb; }
  else { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 16), mat); d.position.y = -0.03; group.add(d); }
  B.parent.add(group);
  const lt = game.lights.add({ pos: [x, y - (pendant ? 0.42 : 0.1), z], color, intensity: intensity * 0.55, distance, tag, on, shadow, decay: 1.7, flicker: null });
  const api = { group, light: lt, mat, on, set(v) { api.on = v; lt.on = v; mat.emissiveIntensity = v ? 0.9 : 0; if (group.userData.bulb) group.userData.bulb.material.color.set(v ? 0xfff2cc : 0x222222); game.emit('lamp', api, v); } };
  return api;
}

/** wall light switch next to a door. Returns api; toggles all lamps given */
export function wallSwitch(B, game, x, y, z, yaw, targets, { label = 'Light switch', mat = mats().ceramic, taped = false } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.01), mat); plate.castShadow = false; g.add(plate);
  const tog = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.04, 0.012), solid(0xf6f1e4, { rough: 0.4 })); tog.position.set(0, 0.014, 0.008); g.add(tog);
  if (taped) { const tape = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.005), solid(0xcdbf8a, { rough: 0.7 })); tape.position.set(0, 0.0, 0.016); tape.rotation.z = 0.12; g.add(tape); g.userData.tape = tape; }
  B.parent.add(g);
  const api = { group: g, targets, toggle() { const any = targets.some((t) => t.on); targets.forEach((t) => t.set(!any)); tog.rotation.x = !any ? -0.35 : 0.35; game.audio && game.audio.at(g.getWorldPosition(new THREE.Vector3()), 'switch', { vol: 0.9 }); } };
  api.interact = game.interact.add({ object: g, radius: 0.18, label, icon: 'switch', maxDist: 1.9, onUse: () => { api.toggle(); api.interact.used = false; } });
  return api;
}

export function wallFrame(B, x, y, z, yaw, w, h, texture, { frame = mats().blackWood, depth = 0.025, name } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const f = new THREE.Mesh(boxGeo(w + 0.05, h + 0.05, depth, 0.4), frame); f.castShadow = false; f.receiveShadow = true; g.add(f);
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), texture instanceof THREE.Material ? texture : new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55 })); pic.position.z = depth / 2 + 0.001; g.add(pic);
  B.parent.add(g); g.userData.pic = pic; if (name) g.name = name; return g;
}

export function bed(B, x, z, yaw = 0, { w = 1.0, l = 2.0, y = 0, sheet = mats().fabricGreen, frame = mats().woodMid, made = true } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw); const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const p0 = L(0, 0);
  B.box(w + 0.1, 0.25, l + 0.1, frame, { pos: [p0[0], y + 0.2, p0[1]], rot: [0, yaw, 0], tile: 0.8 });
  B.box(w, 0.2, l, mats().canvas, { pos: [p0[0], y + 0.42, p0[1]], rot: [0, yaw, 0], round: 0.05, tile: 0.5 });
  const hb = L(0, -l / 2 - 0.03); B.box(w + 0.12, 0.8, 0.07, frame, { pos: [hb[0], y + 0.55, hb[1]], rot: [0, yaw, 0], tile: 0.8 });
  const fb = L(0, l / 2 + 0.03); B.box(w + 0.12, 0.45, 0.07, frame, { pos: [fb[0], y + 0.4, fb[1]], rot: [0, yaw, 0], tile: 0.8 });
  const bl = L(0, 0.25); B.box(w - 0.04, 0.09, l * 0.72, sheet, { pos: [bl[0], y + 0.56, bl[1]], rot: [0, yaw, 0], round: 0.04, tile: 0.5 });
  const pl = L(0, -l / 2 + 0.28); B.box(w * 0.7, 0.12, 0.34, mats().canvas, { pos: [pl[0], y + 0.6, pl[1]], rot: [0, yaw, 0.0], round: 0.05, tile: 0.4 });
  B.col.addBox(x, z, Math.abs(c) * w + Math.abs(s) * l, Math.abs(s) * w + Math.abs(c) * l, y, y + 0.6, 0, {});
}

export function desk(B, x, z, yaw = 0, { w = 1.3, d = 0.65, y = 0, mat = mats().woodDark } = {}) {
  table(B, x, z, { w, d, h: 0.75, y, mat, yaw });
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const p = [x + (w / 2 - 0.25) * c + 0.0 * s, z - (w / 2 - 0.25) * s]; B.box(0.42, 0.55, d - 0.06, mat, { pos: [p[0], y + 0.4, p[1]], rot: [0, yaw, 0], tile: 0.6 }); // drawers
}

export function wardrobe(B, game, x, z, yaw = 0, { w = 1.3, h = 2.0, d = 0.6, y = 0, mat = mats().woodDark } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw); const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const pb = L(0, -d / 2 + 0.01); B.box(w, h, 0.02, mat, { pos: [pb[0], y + h / 2, pb[1]], rot: [0, yaw, 0], tile: 0.7, cast: false });
  for (const sx of [-w / 2 + 0.015, w / 2 - 0.015]) { const p = L(sx, 0); B.box(0.03, h, d, mat, { pos: [p[0], y + h / 2, p[1]], rot: [0, yaw, 0], tile: 0.7 }); }
  const pt = L(0, 0); B.box(w, 0.04, d + 0.04, mat, { pos: [pt[0], y + h, pt[1]], rot: [0, yaw, 0], tile: 0.7 }); B.box(w, 0.04, d, mat, { pos: [pt[0], y + 0.05, pt[1]], rot: [0, yaw, 0], tile: 0.7, cast: false });
  B.col.addBox(x, z, Math.abs(c) * w + Math.abs(s) * d, Math.abs(s) * w + Math.abs(c) * d, y, y + h, 0, { tag: 'wardrobeShell' });
  return { L, w, h, d, yaw };
}

export function fridge(B, game, x, z, yaw = 0, { y = 0 } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  B.box(0.75, 1.75, 0.7, mats().whiteEnamel, { pos: [x, y + 0.875, z], rot: [0, yaw, 0], round: 0.03, tile: 1, collide: false });
  B.col.addBox(x, z, 0.78, 0.74, y, y + 1.75, yaw, {});
  const f = [x + 0.36 * s, z + 0.36 * c]; // front face along local +z
  B.box(0.02, 0.55, 0.03, mats().chrome, { pos: [x + (0.28) * c + 0.37 * s, y + 1.3, z - 0.28 * s + 0.37 * c], rot: [0, yaw, 0], tile: 0.5 });
  B.box(0.7, 0.012, 0.012, mats().iron, { pos: [x + 0.36 * s, y + 1.12, z + 0.36 * c], rot: [0, yaw, 0], tile: 0.5, cast: false });
}

export function counter(B, x, z, w, { y = 0, d = 0.62, yaw = 0, top = mats().woodDark, body = mats().woodPaint, sink = false } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  B.box(w, 0.86, d, body, { pos: [x, y + 0.43, z], rot: [0, yaw, 0], tile: 0.9, collide: false });
  B.col.addBox(x, z, Math.abs(c) * w + Math.abs(s) * d, Math.abs(s) * w + Math.abs(c) * d, y, y + 0.9, 0, {});
  B.box(w + 0.03, 0.04, d + 0.03, top, { pos: [x, y + 0.88, z], rot: [0, yaw, 0], round: 0.006, tile: 0.8 });
  const n = Math.max(1, Math.round(w / 0.5));
  for (let i = 0; i < n; i++) { const lx = -w / 2 + ((i + 0.5) * w) / n; const px = x + lx * c + (d / 2 + 0.005) * s, pz = z - lx * s + (d / 2 + 0.005) * c; B.box(w / n - 0.04, 0.7, 0.015, mats().woodCream, { pos: [px, y + 0.45, pz], rot: [0, yaw, 0], tile: 0.5, cast: false }); B.box(0.02, 0.1, 0.02, mats().brass, { pos: [px + 0.0, y + 0.72, pz + 0.02 * c], rot: [0, yaw, 0], tile: 0.3, cast: false }); }
  if (sink) { B.box(w * 0.5, 0.01, d * 0.6, mats().chrome, { pos: [x, y + 0.905, z], rot: [0, yaw, 0], tile: 0.5, cast: false }); const fx = x - (d / 2 - 0.08) * s, fz = z - (d / 2 - 0.08) * c; B.cyl(0.012, 0.012, 0.28, mats().chrome, { pos: [fx, y + 1.04, fz], tile: 0.3 }); B.box(0.02, 0.012, 0.15, mats().chrome, { pos: [fx + 0.07 * s, y + 1.17, fz + 0.07 * c], rot: [0, yaw, 0], tile: 0.3 }); }
}

export function piano(B, game, x, z, yaw = 0, { y = 0 } = {}) {
  // upright piano facing local +z; width 1.5
  const c = Math.cos(yaw), s = Math.sin(yaw); const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const wood = mats().blackWood; const w = 1.55;
  const body = L(0, 0); B.box(w, 1.25, 0.6, wood, { pos: [body[0], y + 0.63, body[1]], rot: [0, yaw, 0], tile: 0.9, round: 0.015 });
  const lid = L(0, 0.02); B.box(w + 0.04, 0.05, 0.66, wood, { pos: [lid[0], y + 1.27, lid[1]], rot: [0, yaw, 0], tile: 0.9 });
  const kb = L(0, 0.43); B.box(w - 0.1, 0.07, 0.3, wood, { pos: [kb[0], y + 0.72, kb[1]], rot: [0, yaw, 0], tile: 0.9 });
  const keyW = (w - 0.2) / 36;
  const keysGroup = new THREE.Group(); keysGroup.position.set(kb[0], y + 0.77, kb[1]); keysGroup.rotation.y = yaw; B.parent.add(keysGroup);
  const whiteMat = solid(0xf2eee0, { rough: 0.35 }), blackMat = solid(0x121212, { rough: 0.3 });
  const keys = [];
  const whiteIdx = [0, 2, 4, 5, 7, 9, 11]; // within an octave
  let wi = 0; const startMidi = 48 - 0; // C3 (D4=62 is the second octave) 36 white keys = 5 octaves+: we only build 3 octaves C3..B5
  const whites = [];
  for (let o = 0; o < 5; o++) for (const n of whiteIdx) whites.push(36 + o * 12 + n);   // C2.. start at MIDI 36 (C2)
  const total = whites.length; const kw = (w - 0.2) / total;
  whites.forEach((midi, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(kw - 0.002, 0.018, 0.2), whiteMat); m.position.set(-((w - 0.2) / 2) + (i + 0.5) * kw, 0, 0.02); m.castShadow = false; m.receiveShadow = true; m.userData = { midi, black: false, rest: 0 }; keysGroup.add(m); keys.push(m);
    const n = midi % 12; if ([0, 2, 5, 7, 9].includes(n)) { const bm = new THREE.Mesh(new THREE.BoxGeometry(kw * 0.6, 0.02, 0.12), blackMat); bm.position.set(-((w - 0.2) / 2) + (i + 1) * kw, 0.014, -0.025); bm.userData = { midi: midi + 1, black: true, rest: 0.014 }; bm.castShadow = false; keysGroup.add(bm); keys.push(bm); }
  });
  const stoolP = L(0, 0.95); stool(B, stoolP[0], stoolP[1], { y, h: 0.52, mat: wood });
  const sheet = L(0.05, 0.1); // music stand
  B.col.addBox(x, z, Math.abs(c) * w + Math.abs(s) * 0.62, Math.abs(s) * w + Math.abs(c) * 0.62, y, y + 1.3, 0, {});
  return { keys, keysGroup, center: new THREE.Vector3(kb[0], y + 0.78, kb[1]), yaw, standPos: new THREE.Vector3(...L(0, 0.2)).setY(y + 1.05) };
}

export function coatHooks(B, game, x, z, yaw, { y = 1.75, count = 5, w = 1.5 } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  B.box(w, 0.1, 0.03, mats().woodDark, { pos: [x, y, z], rot: [0, yaw, 0], tile: 0.5 });
  const hooks = [];
  for (let i = 0; i < count; i++) { const lx = -w / 2 + 0.12 + (i * (w - 0.24)) / (count - 1); const hx = x + lx * c + 0.04 * s, hz = z - lx * s + 0.04 * c; B.cyl(0.008, 0.008, 0.07, mats().iron, { pos: [hx, y - 0.01, hz], rot: [Math.PI / 2, yaw, 0], tile: 0.3 }); hooks.push(new THREE.Vector3(hx, y - 0.03, hz)); }
  return hooks;
}

/** a hanging coat: puffy tapering shape that hangs from a hook */
export function coat(B, game, hook, yaw, { color = 0x3c4a3a, len = 0.95, w = 0.5, mat, wet = false } = {}) {
  const g = new THREE.Group(); g.position.copy(hook); g.rotation.y = yaw;
  const m = mat || solid(color, { rough: 0.85 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.34, w * 0.5, len, 14, 6, false), m); body.scale.z = 0.5; body.position.set(0, -len / 2 - 0.05, 0.04); body.castShadow = true; body.receiveShadow = true;
  const pos = body.geometry.attributes.position; const rr = new RNG(Math.floor(hook.x * 100));
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const k = Math.sin(y * 9 + pos.getX(i) * 4) * 0.012 + (rr.next() - 0.5) * 0.004; pos.setX(i, pos.getX(i) * (1 + k * 6)); pos.setZ(i, pos.getZ(i) + k); }
  body.geometry.computeVertexNormals(); g.add(body);
  for (const sx of [-1, 1]) { const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.045, len * 0.78, 10), m); sl.position.set(sx * w * 0.45, -len * 0.45, 0.04); sl.rotation.z = sx * 0.1; sl.castShadow = true; g.add(sl); }
  const hood = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.75), m); hood.scale.set(1.2, 0.9, 0.9); hood.position.set(0, 0.0, -0.06); g.add(hood);
  B.parent.add(g); g.userData.body = body; return g;
}

export function boots(B, x, z, yaw = 0, { y = 0, color = 0x3a2a1a } = {}) {
  const m = solid(color, { rough: 0.6 });
  for (const sx of [-0.1, 0.1]) {
    const c = Math.cos(yaw), s = Math.sin(yaw); const px = x + sx * c, pz = z - sx * s;
    B.box(0.1, 0.07, 0.3, solid(0x151515, { rough: 0.9 }), { pos: [px, y + 0.035, pz], rot: [0, yaw + sx * 0.5, 0], round: 0.02, tile: 0.4 });
    B.box(0.095, 0.2, 0.12, m, { pos: [px - 0.04 * s, y + 0.15, pz - 0.04 * c], rot: [0, yaw + sx * 0.5, 0], round: 0.03, tile: 0.4 });
    B.box(0.09, 0.1, 0.18, m, { pos: [px + 0.06 * s, y + 0.11, pz + 0.06 * c], rot: [0, yaw + sx * 0.5, 0], round: 0.03, tile: 0.4 });
  }
}

export function book(B, x, y, z, yaw, { w = 0.15, h = 0.03, d = 0.22, color = 0x5a2a22 } = {}) { B.box(w, h, d, solid(color, { rough: 0.7 }), { pos: [x, y + h / 2, z], rot: [0, yaw, 0], round: 0.004, tile: 0.3 }); B.box(w - 0.01, h - 0.006, d - 0.01, mats().paper, { pos: [x, y + h / 2, z], rot: [0, yaw, 0], tile: 0.3, cast: false }); }
export function mug(B, x, y, z, { color = 0xe9e4d8 } = {}) { B.cyl(0.04, 0.036, 0.09, solid(color, { rough: 0.2 }), { pos: [x, y + 0.045, z], seg: 12, tile: 0.2 }); }
export function plate(B, x, y, z, { r = 0.11, color = 0xe9e4d8 } = {}) { B.cyl(r, r * 0.7, 0.02, solid(color, { rough: 0.2 }), { pos: [x, y + 0.01, z], seg: 18, tile: 0.2 }); }
export function candle(B, game, x, y, z, { lit = false } = {}) { B.cyl(0.015, 0.016, 0.12, solid(0xe8dcc0, { rough: 0.6 }), { pos: [x, y + 0.06, z], seg: 8, tile: 0.2 }); }
export function jar(B, x, y, z, { r = 0.07, h = 0.2, color = 0xc9d8d4 } = {}) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, h, 16), new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.35, roughness: 0.05, clearcoat: 1 })); m.position.set(x, y + h / 2, z); B.parent.add(m); return m; }

/** an old tube radio with a dial; returns {group, dial} */
export function radio(B, game, x, y, z, yaw = 0) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const body = new THREE.Mesh(boxGeo(0.42, 0.26, 0.2, 0.5), mats().woodDark); body.position.y = 0.13; body.castShadow = true; g.add(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0x3a3020, emissive: 0xffb050, emissiveIntensity: 0.0, roughness: 0.6 })); face.position.set(-0.04, 0.17, 0.1005); g.add(face);
  const grill = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.07), solid(0x1d1812, { rough: 0.9 })); grill.position.set(-0.02, 0.06, 0.1005); g.add(grill);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 18), mats().brass); dial.rotation.x = Math.PI / 2; dial.position.set(0.16, 0.13, 0.115); g.add(dial);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.08, 0.002), solid(0xcc2222)); needle.position.set(-0.04, 0.17, 0.102); g.add(needle);
  B.parent.add(g); return { group: g, dial, needle, face, faceMat: face.material };
}

/** landline telephone (wall or desk) */
export function phone(B, x, y, z, yaw = 0, { color = 0x1e1e1e } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const m = solid(color, { rough: 0.3 });
  const base = new THREE.Mesh(rbox(0.22, 0.07, 0.2, 0.02, 0.3), m); base.position.y = 0.035; base.castShadow = true; g.add(base);
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.01, 20), solid(0xcfcfcf, { rough: 0.3, metal: 1 })); dial.position.set(0, 0.072, 0.0); g.add(dial);
  const cradle = new THREE.Group(); cradle.position.set(0, 0.085, 0); g.add(cradle);
  const hs = new THREE.Mesh(rbox(0.2, 0.04, 0.05, 0.015, 0.3), m); hs.position.y = 0.02; hs.castShadow = true; cradle.add(hs);
  for (const sx of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.03, 12), m); cup.position.set(sx * 0.09, 0.0, 0); cradle.add(cup); }
  B.parent.add(g); return { group: g, cradle };
}

export function clock(B, x, y, z, yaw, { stopped = true, time = [3, 12] } = {}) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 24), mats().woodDark); face.rotation.x = Math.PI / 2; g.add(face);
  const plateM = new THREE.Mesh(new THREE.CircleGeometry(0.15, 24), solid(0xe8e0cc, { rough: 0.5 })); plateM.position.z = 0.0255; g.add(plateM);
  const hand = (len, w, ang, color = 0x151515) => { const h = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.004), solid(color)); h.geometry.translate(0, len / 2 - 0.01, 0); h.position.z = 0.03; h.rotation.z = -ang; g.add(h); return h; };
  const mh = hand(0.12, 0.006, (time[1] / 60) * Math.PI * 2), hh = hand(0.08, 0.009, ((time[0] % 12) / 12 + time[1] / 720) * Math.PI * 2);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const t = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.015, 0.002), solid(0x222222)); t.position.set(Math.sin(a) * 0.13, Math.cos(a) * 0.13, 0.027); t.rotation.z = -a; g.add(t); }
  B.parent.add(g); return { group: g, mh, hh };
}

export function mirror(B, game, x, y, z, yaw, w = 0.7, h = 1.0) { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; const frame = new THREE.Mesh(boxGeo(w + 0.08, h + 0.08, 0.04, 0.4), mats().woodDark); g.add(frame); B.parent.add(g); return g; }

export function crate(B, x, z, { y = 0, s = 0.5, yaw = 0, mat = mats().woodPale } = {}) { B.box(s, s, s, mat, { pos: [x, y + s / 2, z], rot: [0, yaw, 0], tile: 0.5, collide: true, round: 0.01 }); }
export function barrel(B, x, z, { y = 0, r = 0.28, h = 0.85 } = {}) { B.cyl(r, r, h, mats().woodDark, { pos: [x, y + h / 2, z], seg: 14, collide: true, tile: 0.7 }); for (const hh of [0.15, 0.7]) B.cyl(r + 0.008, r + 0.008, 0.03, mats().iron, { pos: [x, y + hh, z], seg: 14 }); }
export function shelfWall(B, x, y, z, yaw, w = 1.2, d = 0.25, mat = mats().woodDark) { B.box(w, 0.035, d, mat, { pos: [x, y, z], rot: [0, yaw, 0], tile: 0.6 }); const c = Math.cos(yaw), s = Math.sin(yaw); for (const sx of [-w / 2 + 0.1, w / 2 - 0.1]) B.box(0.03, 0.14, d * 0.7, mat, { pos: [x + sx * c, y - 0.08, z - sx * s], rot: [0, yaw, 0], tile: 0.5, cast: false }); }
export function woodpile(B, x, z, yaw = 0, { w = 2.0, h = 1.1, y = 0, seed = 5 } = {}) {
  const r = new RNG(seed); const rows = Math.round(h / 0.14), per = Math.round(w / 0.14); const c = Math.cos(yaw), s = Math.sin(yaw);
  const mat = pbr('bark', { key: 'logend', tint: 0xb89a7a });
  for (let j = 0; j < rows; j++) for (let i = 0; i < per; i++) { if (j > 2 && r.next() < 0.1) continue; const lx = -w / 2 + (i + 0.5) * (w / per) + (j % 2) * 0.07; const rr = 0.058 + r.range(-0.012, 0.012); B.cyl(rr, rr, 0.5, mat, { pos: [x + lx * c, y + 0.07 + j * 0.125, z - lx * s], rot: [Math.PI / 2, yaw, 0], seg: 7, tile: 0.4, cast: j > rows - 3 }); }
  B.col.addBox(x, z, Math.abs(c) * w + Math.abs(s) * 0.5, Math.abs(s) * w + Math.abs(c) * 0.5, y, y + h, 0, {});
}
