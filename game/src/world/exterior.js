// Outdoor set pieces for the Halden winter world: the car, mailbox, signs, oil-lamp posts, ribbons, search camp,
// the boathouse, the family dock and Jo's snowed-in truck.
import * as THREE from 'three';
import { Builder } from './builder.js';
import { PM, table, chair, crate, barrel, woodpile, contactShadow, lamp } from './props.js';
import { pbr, solid, glass, snowMaterial, card } from '../gfx/materials.js';
import { box as boxGeo, rbox, cyl as cylGeo, plane, worldUV } from '../gfx/geo.js';
import { RNG } from '../core/util.js';
import { LAYOUT } from './halden.js';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
}

/** Mara's station wagon: silhouette extruded, glass, wheels, headlights, interior with a driver's seat. */
export function buildCar(game, parent, { x, z, yaw, y }) {
  const car = new THREE.Group(); car.position.set(x, y, z); car.rotation.y = yaw; parent.add(car);   // car faces local -Z
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x5f8277, roughness: 0.42, metalness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const dirt = pbr('concrete', { key: 'cardirt', tint: 0x6a6a68 });
  // ---- lower body (hood, doors, trunk) as an extruded side profile; the CABIN is built open so you can sit in it ----
  const prof = new THREE.Shape(); const L = 2.25;
  prof.moveTo(-L, 0.38); prof.lineTo(-L, 0.86); prof.lineTo(-1.95, 0.93); prof.lineTo(-1.25, 0.96); prof.lineTo(1.5, 0.96); prof.lineTo(L, 0.88); prof.lineTo(L, 0.4); prof.lineTo(1.9, 0.3); prof.lineTo(-1.9, 0.3); prof.closePath();
  const bodyGeo = new THREE.ExtrudeGeometry(prof, { depth: 1.7, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 4 });
  bodyGeo.translate(0, 0, -0.85); bodyGeo.rotateY(Math.PI / 2); bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, paint); body.castShadow = true; body.receiveShadow = true; car.add(body);
  // cavity: hide the inside of the lower body between the doors by lining the footwell
  const liner = solid(0x24211f, { rough: 0.9 });
  const cab = (w, h, d, px, py, pz, rx = 0, ry = 0, rz = 0, m = paint, shadow = true) => { const mesh = new THREE.Mesh(boxGeo(w, h, d, 0.5), m); mesh.position.set(px, py, pz); mesh.rotation.set(rx, ry, rz); mesh.castShadow = shadow; mesh.receiveShadow = true; car.add(mesh); return mesh; };
  // roof + liner
  cab(1.62, 0.07, 2.0, 0, 1.42, 0.35); const lin = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.95), solid(0x6a6458, { rough: 0.95, side: THREE.DoubleSide })); lin.rotation.x = Math.PI / 2; lin.position.set(0, 1.375, 0.35); car.add(lin);
  // pillars: A (windshield), B, C
  for (const sx of [-1, 1]) {
    cab(0.07, 0.05, 0.75, sx * 0.8, 1.17, -0.9, -0.62, 0, sx * 0.0);                                       // A pillar (angled)
    cab(0.06, 0.52, 0.09, sx * 0.84, 1.16, 0.18);                                                           // B pillar
    cab(0.07, 0.5, 0.12, sx * 0.84, 1.16, 1.34, 0.0, 0, 0);                                                  // C pillar
    cab(0.06, 0.06, 2.18, sx * 0.84, 1.42, 0.2, 0, 0, 0);                                                    // roof rail
    // door panels (inner) under the windows
    const dp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 2.2), solid(0x3a342e, { rough: 0.85 })); dp.position.set(sx * 0.82, 0.62, 0.15); car.add(dp);
  }
  // floor and footwells
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.0), liner); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.36, 0.1); car.add(fl);
  // windows: windshield (frosted), side and rear glass (tinted)
  const gMat = new THREE.MeshPhysicalMaterial({ color: 0x0c1418, roughness: 0.05, metalness: 0.0, transparent: true, opacity: 0.32, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
  const win = (w, h, px, py, pz, rx, ry, m = gMat) => { const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); mesh.position.set(px, py, pz); mesh.rotation.set(rx, ry, 0); mesh.renderOrder = 4; car.add(mesh); return mesh; };
  win(1.9, 0.42, 0.81, 1.17, 0.45, 0, Math.PI / 2); win(1.9, 0.42, -0.81, 1.17, 0.45, 0, -Math.PI / 2);
  win(1.55, 0.5, 0, 1.15, 1.62, 0.5, 0);
  // windshield: frosted & snow-dusted from the inside (the player looks through it)
  const frost = new THREE.MeshStandardMaterial({ map: canvasTex(512, 256, (c, w, h) => { c.clearRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { c.fillStyle = `rgba(235,245,255,${Math.random() * 0.2})`; const s = 1 + Math.random() * 5; c.fillRect(Math.random() * w, Math.random() * h, s, s * (Math.random() * 3)); } const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(230,240,250,0.42)'); g.addColorStop(0.25, 'rgba(230,240,250,0.07)'); g.addColorStop(1, 'rgba(230,240,250,0.28)'); c.fillStyle = g; c.fillRect(0, 0, w, h); }), transparent: true, roughness: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.84), frost); ws.position.set(0, 1.17, -0.9); ws.rotation.x = -0.62; ws.renderOrder = 6; car.add(ws); car.userData.frost = ws;
  const wsGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 0.84), gMat); wsGlass.position.copy(ws.position); wsGlass.rotation.copy(ws.rotation); wsGlass.renderOrder = 5; car.add(wsGlass);
  // snow on roof & hood
  const snow = snowMaterial({ name: 'snow' });
  const roofSnow = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 2.4), snow); roofSnow.position.set(0, 1.45, 0.25); roofSnow.castShadow = true; car.add(roofSnow);
  const hoodSnow = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.0), snow); hoodSnow.position.set(0, 0.95, -1.7); hoodSnow.rotation.x = 0.03; car.add(hoodSnow);
  // wheels
  const tire = solid(0x121212, { rough: 0.9 }), rim = solid(0x8a8c90, { rough: 0.35, metal: 1 });
  for (const [wx, wz] of [[-0.85, -1.4], [0.85, -1.4], [-0.85, 1.35], [0.85, 1.35]]) {
    const g = new THREE.Group(); g.position.set(wx, 0.33, wz);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20), tire); t.rotation.z = Math.PI / 2; t.castShadow = true; g.add(t);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.25, 12), rim); r.rotation.z = Math.PI / 2; g.add(r); car.add(g);
  }
  // headlights (weak, yellow, flickering) + tail lights
  const hm = new THREE.MeshStandardMaterial({ color: 0xffefc0, emissive: 0xffd890, emissiveIntensity: 1.2, roughness: 0.2 });
  for (const sx of [-0.6, 0.6]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), hm); h.scale.set(1.2, 0.8, 0.5); h.position.set(sx, 0.7, -2.27); car.add(h); const tl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: 0x551111, emissive: 0x330000, emissiveIntensity: 0.5 })); tl.position.set(sx, 0.75, 2.27); car.add(tl); }
  const heads = [];
  for (const sx of [-0.6, 0.6]) { const sp = game.lights.add({ pos: [0, 0, 0], color: 0xffe2a8, intensity: 60, distance: 40, decay: 1.4, spot: { dir: [0, -0.04, -1], angle: 0.5, penumbra: 0.7 }, shadow: sx < 0, tag: 'car', on: true, flicker: { amp: 0.16, speed: 3.3 } }); heads.push({ lt: sp, sx }); }
  car.userData.heads = heads;
  car.userData.sync = () => { for (const h of heads) { const p = new THREE.Vector3(h.sx, 0.72, -2.2).applyMatrix4(car.matrixWorld); h.lt.pos.copy(p); const d = new THREE.Vector3(0, -0.04, -1).transformDirection(car.matrixWorld); h.lt.spot.dir.copy(d); } };
  // interior (visible from the driver seat)
  const trim = solid(0x1f1d1b, { rough: 0.8 }), seatMat = solid(0x3a3228, { rough: 0.95 });
  const dash = new THREE.Mesh(rbox(1.66, 0.22, 0.45, 0.04, 0.5), trim); dash.position.set(0, 0.98, -0.88); car.add(dash);
  const cluster = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), new THREE.MeshStandardMaterial({ color: 0x050505, emissive: 0x20ff90, emissiveIntensity: 0.06 })); cluster.position.set(-0.4, 1.02, -0.68); cluster.rotation.x = -0.4; car.add(cluster);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 8, 24), trim); wheel.position.set(-0.4, 0.98, -0.62); wheel.rotation.x = -0.9; car.add(wheel);
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), trim); col.position.set(-0.4, 0.9, -0.74); col.rotation.x = -0.9; car.add(col);
  for (const sx of [-0.4, 0.4]) { const seat = new THREE.Mesh(rbox(0.52, 0.12, 0.52, 0.04, 0.5), seatMat); seat.position.set(sx, 0.56, -0.05); car.add(seat); const back = new THREE.Mesh(rbox(0.52, 0.72, 0.12, 0.05, 0.5), seatMat); back.position.set(sx, 0.95, 0.22); back.rotation.x = 0.18; car.add(back); const hr = new THREE.Mesh(rbox(0.26, 0.2, 0.1, 0.04, 0.5), seatMat); hr.position.set(sx, 1.38, 0.28); car.add(hr); }
  const rear = new THREE.Mesh(rbox(1.5, 0.12, 0.5, 0.04, 0.5), seatMat); rear.position.set(0, 0.56, 0.8); car.add(rear); const rback = new THREE.Mesh(rbox(1.5, 0.7, 0.12, 0.05, 0.5), seatMat); rback.position.set(0, 0.95, 1.05); rback.rotation.x = 0.12; car.add(rback);
  const mir = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.03), trim); mir.position.set(0, 1.28, -0.95); car.add(mir);
  // dashboard clock stuck at 3:12 (a soft glow)
  const clk = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.03), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff5030, emissiveIntensity: 0.9 })); clk.position.set(0.0, 1.03, -0.655); clk.rotation.x = -0.3; car.add(clk);
  car.userData.dashClock = clk;
  // phone on the passenger seat
  const ph = new THREE.Mesh(rbox(0.07, 0.01, 0.145, 0.004, 0.2), solid(0x15161a, { rough: 0.3, metal: 0.5 })); ph.position.set(0.4, 0.635, -0.1); ph.rotation.y = 0.3; car.add(ph);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.13), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x8ab4ff, emissiveIntensity: 0.9 })); scr.rotation.x = -Math.PI / 2; scr.position.set(0.4, 0.642, -0.1); scr.rotation.z = 0.3; car.add(scr);
  car.userData.phone = ph; car.userData.phoneScreen = scr; car.userData.eye = new THREE.Vector3(-0.4, 1.2, -0.12);
  // dirt line along the sills
  const sill = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.14, 4.3), dirt); sill.position.set(0, 0.38, 0); sill.castShadow = false; car.add(sill);
  contactShadow({ parent, add: (g, m, o) => { const mesh = new THREE.Mesh(g, m); mesh.position.set(...o.pos); mesh.rotation.y = (o.rot || [0, 0, 0])[1]; parent.add(mesh); return mesh; } }, x, z, 2.2, 5.2, y + 0.02, 0.5, yaw);
  car.updateMatrixWorld(true);
  // collision: body OBB
  game.collision.addBox(x, z, 1.95, 4.6, y, y + 1.5, yaw, { tag: 'car' });
  return car;
}

export function buildMailbox(game, parent, { x, z, y, yaw = 0 }) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; parent.add(g);
  const wood = pbr('wood_dark', { key: 'mbpost', tint: 0x8a7a6a });
  const post = new THREE.Mesh(boxGeo(0.12, 1.15, 0.12, 0.5), wood); post.position.y = 0.575; post.castShadow = true; g.add(post);
  const box = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.55, 14, 1, false, 0, Math.PI * 2), new THREE.MeshStandardMaterial({ color: 0x23313a, roughness: 0.5, metalness: 0.5 })); box.rotation.x = Math.PI / 2; box.scale.set(1, 1, 0.8); box.position.set(0, 1.28, 0); box.castShadow = true; g.add(box);
  // stuffed with paper: flyers poking out of the door gap
  for (let i = 0; i < 9; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.12 + Math.random() * 0.06, 0.2), new THREE.MeshStandardMaterial({ color: [0xf0e4c0, 0xd8c8a0, 0xc8d8c0, 0xe8d0b0][i % 4], roughness: 0.9, side: THREE.DoubleSide })); p.position.set((Math.random() - 0.5) * 0.18, 1.3 + (Math.random() - 0.5) * 0.1, 0.28 + Math.random() * 0.08); p.rotation.set(-0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 0.9); g.add(p); }
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.07), new THREE.MeshStandardMaterial({ map: canvasTex(128, 40, (c, w, h) => { c.fillStyle = '#e8e0cc'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = '700 22px Elite, monospace'; c.fillText('LINDEN 41', 6, 28); }), roughness: 0.8 })); label.position.set(0, 1.28, -0.153 * 1.0); label.rotation.y = Math.PI; label.position.set(0.0, 1.1, 0.07); label.rotation.y = 0; g.add(label);
  const snow = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, 1.2), snowMaterial({ name: 'snow' })); snow.scale.set(1, 0.5, 1.7); snow.position.set(0, 1.42, 0); g.add(snow);
  g.userData.interactPoint = new THREE.Vector3(0, 1.28, 0.1);
  game.collision.addCylinder(x, z, 0.12, y, y + 1.4);
  return g;
}

export function buildRoadSign(game, parent, { x, z, y, yaw = 0 }) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; parent.add(g);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), solid(0x5a5a5a, { rough: 0.6, metal: 0.6 })); post.position.y = 1.1; post.castShadow = true; g.add(post);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.02), new THREE.MeshStandardMaterial({ map: canvasTex(256, 164, (c, w, h) => { c.fillStyle = '#2a5a3a'; c.fillRect(0, 0, w, h); c.strokeStyle = '#e8e8e0'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12); c.fillStyle = '#f0f0e8'; c.font = '700 28px Elite, monospace'; c.fillText('HALDEN LAKE RD', 22, 60); c.font = '700 20px Elite, monospace'; c.fillText('DEAD END', 80, 100); c.fillText('NO WINTER MAINT.', 36, 136); }), roughness: 0.5, metalness: 0.3 })); sign.position.set(0, 1.95, 0.02); sign.castShadow = true; g.add(sign);
  const snow = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.1), snowMaterial({ name: 'snow' })); snow.position.set(0, 2.2, 0.02); g.add(snow);
  game.collision.addCylinder(x, z, 0.06, y, y + 2.2);
  return g;
}

/** Iron post with an oil lantern. Lighting it makes a safe pool of light and a checkpoint. */
export function buildLampPost(game, parent, { x, z, y, id, lit = false, onLight }) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const iron = solid(0x1c1c1e, { rough: 0.5, metal: 0.8 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.0, 8), iron); post.position.y = 1.0; post.castShadow = true; g.add(post);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.03, 0.03), iron); arm.position.set(0.18, 1.97, 0); g.add(arm);
  const lanternG = new THREE.Group(); lanternG.position.set(0.36, 1.78, 0); g.add(lanternG);
  const frame = solid(0x2a2118, { rough: 0.5, metal: 0.8 });
  const lmat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xff9a30, emissiveIntensity: 0, transparent: true, opacity: 0.5, roughness: 0.2 });
  const glassM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.065, 0.2, 10, 1, true), lmat); lanternG.add(glassM);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.03, 10), frame); base.position.y = -0.11; lanternG.add(base);
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.07, 10), frame); top.position.y = 0.13; lanternG.add(top);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd27a })); flame.scale.set(0.7, 1.4, 0.7); flame.position.y = -0.04; flame.visible = false; lanternG.add(flame);
  const snow = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 5, 0, Math.PI * 2, 0, 1.0), snowMaterial({ name: 'snow' })); snow.position.y = 0.16; snow.scale.set(1, 0.6, 1); lanternG.add(snow);
  const lt = game.lights.add({ pos: [x + 0.36, y + 1.78, z], color: 0xffa850, intensity: 11, distance: 12, decay: 1.7, shadow: true, flicker: { amp: 0.13, speed: 9 }, on: false, tag: 'lamp:' + id, fadeRate: 1.2 });
  const api = { id, group: g, light: lt, lit: false, pos: new THREE.Vector3(x, y, z), radius: 6.5,
    light_() { if (api.lit) return; api.lit = true; lt.on = true; lmat.emissiveIntensity = 1.6; flame.visible = true; onLight && onLight(api); game.emit('lampLit', api); },
    set(on) { api.lit = on; lt.on = on; lmat.emissiveIntensity = on ? 1.6 : 0; flame.visible = on; } };
  if (lit) api.set(true);
  api.interact = game.interact.add({ object: lanternG, radius: 0.5, maxDist: 2.4, label: () => (api.lit ? '' : 'Light the lamp'), icon: 'hand', enabled: () => !api.lit, onUse: () => { game.audio && game.audio.at(lanternG.getWorldPosition(new THREE.Vector3()), 'match', { vol: 1 }); game.timers.wait(0.9).then(() => api.light_()); } });
  game.collision.addCylinder(x, z, 0.06, y, y + 2);
  return api;
}

export function buildRibbon(parent, x, y, z, color = 0xff6a1a) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.45), new THREE.MeshStandardMaterial({ color, roughness: 0.7, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.05 }));
  m.position.set(x, y, z); m.rotation.set(0, Math.random() * 6, (Math.random() - 0.5) * 0.5); parent.add(m); return m;
}

/** A search-party base camp: tent, table with radio / clipboard / flyers, board with a search grid, folding chairs. */
export function buildSearchCamp(game, parent, { x, z, y, yaw = 0 }) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; parent.add(g);
  const out = { group: g, interact: {} };
  const canvasM = pbr('canvas', { key: 'tent', tint: 0xc0b8a0, normal: 0.8 }); canvasM.side = THREE.DoubleSide;
  // wall tent: gable roof
  const tw = 3.4, td = 4.2, th = 1.8, rh = 2.6;
  const shape = new THREE.Shape(); shape.moveTo(-tw / 2, 0); shape.lineTo(tw / 2, 0); shape.lineTo(tw / 2, th); shape.lineTo(0, rh); shape.lineTo(-tw / 2, th); shape.closePath();
  const tg = new THREE.ExtrudeGeometry(shape, { depth: td, bevelEnabled: false }); tg.translate(0, 0, -td / 2); worldUV(tg, 1.2); tg.computeVertexNormals();
  const tent = new THREE.Mesh(tg, canvasM); tent.castShadow = true; tent.receiveShadow = true; tent.position.set(0, 0, -2.2); g.add(tent);
  // open front: cut by dark interior panel (we simply leave the front gable open: the extrude caps are closed; add an opening using a black plane in front)
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.7), new THREE.MeshBasicMaterial({ color: 0x040405 })); door.position.set(0, 0.85, -2.2 + td / 2 + 0.02); g.add(door);
  const roofSnow = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, td + 0.2), snowMaterial({ name: 'snow' })); roofSnow.position.set(-0.82, 2.22, -2.2); roofSnow.rotation.z = 0.7; g.add(roofSnow); const roofSnow2 = roofSnow.clone(); roofSnow2.position.x = 0.82; roofSnow2.rotation.z = -0.7; g.add(roofSnow2);
  game.collision.addBox(x + Math.sin(yaw) * 0, z, tw, td, y, y + 2.6, yaw, {});
  // table with items
  const B = new Builder(game, g);
  table(B, 3.0, 0.6, { w: 1.8, d: 0.8, h: 0.78, mat: PM().woodPale });
  chair(B, 3.0, 1.35, Math.PI, { mat: PM().woodPale }); chair(B, 3.9, 0.6, -Math.PI / 2, { mat: PM().woodPale });
  B.finish();
  // clipboard w/ sign-in sheet
  const clip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.015, 0.32), solid(0x6a5a40, { rough: 0.7 })); clip.position.set(2.7, 0.8, 0.5); clip.rotation.y = 0.3; g.add(clip);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshStandardMaterial({ map: canvasTex(128, 170, (c, w, h) => { c.fillStyle = '#efe9d6'; c.fillRect(0, 0, w, h); c.fillStyle = '#333'; c.font = '10px Elite, monospace'; c.fillText('SEARCH LOG — LINDEN, J.', 8, 14); for (let i = 0; i < 18; i++) c.fillRect(8, 22 + i * 8, 90 - (i % 5) * 8, 1); c.fillStyle = '#2b4a8a'; c.font = '11px Caveat, cursive'; for (let i = 0; i < 6; i++) c.fillText('M. Linden', 20, 120 + i * 8); }), roughness: 0.9 })); sheet.rotation.x = -Math.PI / 2; sheet.position.set(2.7, 0.809, 0.5); sheet.rotation.z = 0.3; g.add(sheet);
  out.interact.sheet = game.interact.add({ object: sheet, radius: 0.22, maxDist: 2.2, label: 'Sign-in sheet', icon: 'eye', onUse: () => { out.interact.sheet.used = false; out.onSheet && out.onSheet(); } });
  // cassette recorder
  const rec = new THREE.Mesh(rbox(0.3, 0.09, 0.2, 0.01, 0.3), solid(0x262626, { rough: 0.5 })); rec.position.set(3.4, 0.825, 0.7); rec.rotation.y = -0.4; g.add(rec); out.recorder = rec;
  const ledM = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 0 }); const led = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), ledM); led.position.set(0.1, 0.05, 0.06); rec.add(led); out.recLed = ledM;
  out.interact.recorder = game.interact.add({ object: rec, radius: 0.25, maxDist: 2.3, label: 'Play the tape', icon: 'hand', onUse: () => { out.interact.recorder.used = false; out.onTape && out.onTape(); } });
  // radio (static)
  const rad = new THREE.Mesh(rbox(0.22, 0.14, 0.08, 0.01, 0.3), solid(0x1f2a24, { rough: 0.5 })); rad.position.set(2.4, 0.86, 0.78); g.add(rad);
  // flyer board
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.04), solid(0x8a6a40, { rough: 0.8 })); board.position.set(3.6, 1.4, -0.6); board.rotation.y = -0.5; g.add(board);
  const flyer = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.46), new THREE.MeshStandardMaterial({ map: canvasTex(200, 270, (c, w, h) => { c.fillStyle = '#f7f2e4'; c.fillRect(0, 0, w, h); c.fillStyle = '#b3261e'; c.font = '700 30px Elite, monospace'; c.fillText('MISSING', 30, 36); c.fillStyle = '#d8cfba'; c.fillRect(40, 48, 120, 100); c.fillStyle = '#e8b81c'; c.fillRect(80, 80, 40, 66); c.fillStyle = '#d4a07a'; c.beginPath(); c.arc(100, 72, 20, 0, 7); c.fill(); c.fillStyle = '#222'; c.font = '700 15px Elite, monospace'; c.fillText('JONAH LINDEN, 22', 22, 170); c.font = '12px Elite, monospace'; ['Last seen Feb 11, north bay,', 'Halden Lake. Yellow raincoat.', '', 'If you see him, tell him', 'his sister is looking.'].forEach((l, i) => c.fillText(l, 18, 190 + i * 14)); }), roughness: 0.9 })); flyer.position.set(3.58, 1.4, -0.57); flyer.rotation.y = -0.5; g.add(flyer);
  out.interact.flyer = game.interact.add({ object: flyer, radius: 0.28, maxDist: 2.6, label: 'Read the flyer', icon: 'eye', onUse: () => { out.interact.flyer.used = false; out.onFlyer && out.onFlyer(); } });
  // lantern-lit lamp inside the tent mouth is added by the story (a lamp post is placed here)
  // thermos and cups
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 10), solid([0xe9e4d8, 0x4a6a8a, 0x9a4a3a][i % 3], { rough: 0.3 })); c.position.set(3.2 + i * 0.18, 0.82, 0.3 + (i % 2) * 0.2); g.add(c); }
  const th2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 12), solid(0x2a4a6a, { rough: 0.3, metal: 0.6 })); th2.position.set(2.2, 0.92, 0.2); g.add(th2);
  g.userData.recPos = new THREE.Vector3(3.4, 0.9, 0.7);
  return out;
}

export function buildBoathouse(game, parent, { x, z, y }) {
  const B = new Builder(game, parent); const out = { B };
  const log = pbr('log_wall', { key: 'bhlog', tint: 0x8a7a68 }), roof = pbr('wood_dark', { key: 'bhroof', tint: 0x5a4a3a });
  const w = 7, d = 9, h = 3.2;
  const yaw = -0.35;
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; parent.add(g); const B2 = new Builder(game, g);
  B2.box(w, 0.4, d, PM().concrete, { pos: [0, 0.2, 0], tile: 2 });
  B2.box(w, h, 0.3, log, { pos: [0, 0.4 + h / 2, -d / 2], tile: 1.6, collide: false }); B2.box(0.3, h, d, log, { pos: [-w / 2, 0.4 + h / 2, 0], tile: 1.6 }); B2.box(0.3, h, d, log, { pos: [w / 2, 0.4 + h / 2, 0], tile: 1.6 });
  // front wall with a door gap (door in the centre) : two segments + lintel
  B2.box(w / 2 - 0.55, h, 0.3, log, { pos: [-(w / 4 + 0.275), 0.4 + h / 2, d / 2], tile: 1.6 }); B2.box(w / 2 - 0.55, h, 0.3, log, { pos: [(w / 4 + 0.275), 0.4 + h / 2, d / 2], tile: 1.6 }); B2.box(1.1, h - 2.2, 0.3, log, { pos: [0, 0.4 + 2.2 + (h - 2.2) / 2, d / 2], tile: 1.6 });
  // roof (gable)
  const rr = Math.atan2(1.5, w / 2 + 0.6);
  for (const sg of [-1, 1]) { B2.box(w / 2 / Math.cos(rr) + 1.1, 0.14, d + 1.2, roof, { pos: [sg * (w / 4 + 0.15), 0.4 + h + 0.7, 0], rot: [0, 0, sg * rr], tile: 1.2 }); B2.box(w / 2 / Math.cos(rr) + 1.1, 0.16, d + 1.1, snowMaterial({ name: 'snow' }), { pos: [sg * (w / 4 + 0.15), 0.4 + h + 0.86, 0], rot: [0, 0, sg * rr], tile: 2.4 }); }
  B2.finish();
  // collision (rotated box walls)
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const L = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  game.collision.addBox(...L(0, -d / 2), w, 0.3, y, y + 4, yaw); game.collision.addBox(...L(-w / 2, 0), 0.3, d, y, y + 4, yaw); game.collision.addBox(...L(w / 2, 0), 0.3, d, y, y + 4, yaw);
  game.collision.addBox(...L(-(w / 4 + 0.275), d / 2), w / 2 - 0.55, 0.3, y, y + 4, yaw); game.collision.addBox(...L((w / 4 + 0.275), d / 2), w / 2 - 0.55, 0.3, y, y + 4, yaw);
  // door (locked with the boathouse key)
  const doorPos = L(0, d / 2 + 0.02);
  out.door = { pos: new THREE.Vector3(doorPos[0], y + 1.1, doorPos[1]), yaw };
  const doorMesh = new THREE.Mesh(boxGeo(1.05, 2.2, 0.08, 0.8), pbr('wood_dark', { key: 'bhdoor', tint: 0x6a5a48 })); doorMesh.position.set(0, 0.4 + 1.1, d / 2); doorMesh.castShadow = true; g.add(doorMesh); out.doorMesh = doorMesh;
  game.collision.addBox(...L(0, d / 2), 1.1, 0.12, y, y + 2.4, yaw, { tag: 'bhdoor' });
  out.group = g; out.floorY = y + 0.4; out.yaw = yaw; out.L = L;
  // lamp above the door (unlit)
  return out;
}

export function buildDock(game, parent, { x, z, y, yaw = 0, len = 14, w = 2.0 }) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; parent.add(g); const B = new Builder(game, g);
  const wood = pbr('wood_floor', { key: 'dockw', tint: 0xa89888, wet: 0.5 }), post = pbr('wood_dark', { key: 'dockp', tint: 0x7a6a5a });
  // planks (so footsteps can use the 'dock' surface): one slab
  B.slab(-w / 2, 0, w / 2, -len, 0.0, wood, { t: 0.1, tile: 1.1 });
  for (let i = 0; i < len; i += 2) for (const sx of [-w / 2 + 0.06, w / 2 - 0.06]) B.box(0.14, 2.2, 0.14, post, { pos: [sx, -1.0, -i - 0.1], tile: 0.5 });
  B.box(0.1, 0.1, len, post, { pos: [-w / 2, -0.12, -len / 2], tile: 0.5 }); B.box(0.1, 0.1, len, post, { pos: [w / 2, -0.12, -len / 2], tile: 0.5 });
  B.finish();
  const cx = x - (len / 2) * Math.sin(yaw), cz = z - (len / 2) * Math.cos(yaw);
  game.collision.addFloor(cx, cz, w, len, y, { surf: 'dock', yaw: -yaw });
  return g;
}

export function buildTruck(game, parent, { x, z, y, yaw }) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; parent.add(g);
  const paint = new THREE.MeshStandardMaterial({ color: 0x8a3a2a, roughness: 0.5, metalness: 0.35 });
  const cab = new THREE.Mesh(rbox(1.9, 0.8, 1.7, 0.1, 0.5), paint); cab.position.set(0, 1.15, -0.9); cab.castShadow = true; g.add(cab);
  const hood = new THREE.Mesh(rbox(1.85, 0.55, 1.6, 0.08, 0.5), paint); hood.position.set(0, 0.85, -2.3); g.add(hood);
  const bed = new THREE.Mesh(rbox(1.9, 0.6, 2.2, 0.06, 0.5), paint); bed.position.set(0, 0.85, 1.0); g.add(bed);
  const snow = snowMaterial({ name: 'snow' }); const bs = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 2.0), snow); bs.position.set(0, 1.2, 1.0); g.add(bs); const cs = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.5), snow); cs.position.set(0, 1.62, -0.9); g.add(cs); const hs = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.5), snow); hs.position.set(0, 1.16, -2.3); g.add(hs);
  const tire = solid(0x121212, { rough: 0.9 });
  for (const [wx, wz] of [[-0.9, -2.2], [0.9, -2.2], [-0.9, 1.3], [0.9, 1.3]]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16), tire); t.rotation.z = Math.PI / 2; t.position.set(wx, 0.28, wz); t.scale.set(1, 1, 1); g.add(t); }   // flat: lower profile
  g.updateMatrixWorld(true);
  game.collision.addBox(x, z, 2.0, 5.4, y, y + 1.8, yaw, { tag: 'truck' });
  return g;
}
