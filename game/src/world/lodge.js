// Halden Lodge: shell, openings, stairs, roof, porch and the room/light system.
// Floor plan (x east, z south; front door faces south, the lake is north):
//   ground  : LIVING (double height, west/north) | KITCHEN (east/north) | STUDY (sw) | HALL + STAIRS (south middle) | MUDROOM (se)
//   upper   : JO'S ROOM (nw) | MARA'S ROOM (ne) | corridor | DAD'S ROOM (sw, locked) | BATHROOM (se)
import * as THREE from 'three';
import { Builder, Door, buildWindow, splitCaps } from './builder.js';
import { pbr, solid, glass, snowMaterial } from '../gfx/materials.js';
import { box as boxGeo, rbox, plane, worldUV } from '../gfx/geo.js';
import { RNG } from '../core/util.js';

export const LODGE = {
  x0: -7.5, x1: 7.5, z0: -5.5, z1: 5.5, H: 2.7, SLAB: 0.15, UY: 2.85, UH: 2.5,
  roofEave: 5.45, roofRidge: 9.1,
};

export const ROOMS = {
  living: { x0: -7.5, x1: 1.5, z0: -5.5, z1: 0.5, y: 0, name: 'Living room' },
  kitchen: { x0: 1.5, x1: 7.5, z0: -5.5, z1: 0.5, y: 0, name: 'Kitchen' },
  study: { x0: -7.5, x1: -3.0, z0: 0.5, z1: 5.5, y: 0, name: 'Study' },
  hall: { x0: -3.0, x1: 3.5, z0: 0.5, z1: 5.5, y: 0, name: 'Hall' },
  mudroom: { x0: 3.5, x1: 7.5, z0: 0.5, z1: 5.5, y: 0, name: 'Mudroom' },
  jo: { x0: -3.0, x1: 1.5, z0: -5.5, z1: -0.5, y: 2.85, name: "Jo's room" },
  mara: { x0: 1.5, x1: 7.5, z0: -5.5, z1: -0.5, y: 2.85, name: "Mara's room" },
  corridor: { x0: -3.0, x1: 7.5, z0: -0.5, z1: 1.0, y: 2.85, name: 'Upstairs hall' },
  dad: { x0: -3.0, x1: 1.4, z0: 1.0, z1: 5.5, y: 2.85, name: "Dad's room" },
  bath: { x0: 3.2, x1: 7.5, z0: 1.0, z1: 5.5, y: 2.85, name: 'Bathroom' },
  stairs: { x0: 1.4, x1: 3.2, z0: 1.0, z1: 5.5, y: 0, name: 'Stairs' },
};

export function roomAt(x, y, z) {
  const up = y > 1.6;
  for (const [id, r] of Object.entries(ROOMS)) {
    if (id === 'stairs') continue;
    if ((r.y > 1) !== up) continue;
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return id;
  }
  if (x >= ROOMS.stairs.x0 && x <= ROOMS.stairs.x1 && z >= ROOMS.stairs.z0 && z <= ROOMS.stairs.z1) return 'stairs';
  return null;
}

export function buildLodge(game, parent, opts = {}) {
  const B = new Builder(game, parent);
  const L = LODGE, col = game.collision;
  const out = { B, doors: {}, rooms: ROOMS, lights: {}, windows: [], switches: {}, anchors: {}, litRooms: new Set() };

  // --- materials -------------------------------------------------------------------------------------------------
  const M = {
    logOut: pbr('log_wall', { tint: 0xb89a78, key: 'logOut' }),
    logIn: pbr('log_wall', { tint: 0x9a7a58, key: 'logIn' }),
    wallpaper: pbr('wallpaper', { key: 'wp', tint: 0xd8cdb4 }),
    plaster: pbr('plaster', { key: 'pl', tint: 0xcfc4ad, normal: 0.55 }),
    plasterG: pbr('plaster', { key: 'plg', tint: 0xa9b7a2 }),
    paintGreen: pbr('wood_paint', { key: 'wpg', tint: 0xbfd0bd }),
    paintCream: pbr('wood_paint', { key: 'wpc', tint: 0xf1ead2 }),
    floorDark: pbr('wood_floor', { key: 'fd' }),
    floorPale: pbr('wood_pale', { key: 'fp', tint: 0xcfb08a }),
    floorStudy: pbr('wood_dark', { key: 'fs' }),
    tile: pbr('tile', { key: 'ft', tint: 0xdcdcd2 }),
    ceilWood: pbr('wood_pale', { key: 'cw', tint: 0xb08a5c, normal: 0.3 }),
    beam: pbr('wood_dark', { key: 'beam', tint: 0xb89a80 }),
    roofIn: pbr('wood_pale', { key: 'ri', tint: 0x8a6a46 }),
    stone: pbr('rock', { key: 'chim', tint: 0xb4aca0 }),
    snow: snowMaterial({ name: 'snow' }),
    shingle: pbr('wood_dark', { key: 'shingle', tint: 0x6a5a4a }),
    deck: pbr('wood_floor', { key: 'deck', tint: 0xb59a7a, wet: 0.3 }),
    trim: pbr('wood_paint', { key: 'trim', tint: 0xf0ebdd }),
    reveal: solid(0xd9d2c0, { rough: 0.6 }),
    concrete: pbr('concrete', { key: 'conc' }),
    black: solid(0x151515, { rough: 0.8 }),
  };
  out.M = M;
  const T = { e: 0.3, i: 0.14 };
  const y1 = L.UY, yU = L.UY, UH = L.UH;
  const doorH = 2.1, trimW = 0.07;

  // trims around openings (casing): thin boxes on both faces
  function openingTrim(wl, u, wOpen, yBase, hOpen, depth, mat = M.trim) {
    const [dx, dz] = wl.dir; const px = wl.start[0] + dx * u, pz = wl.start[1] + dz * u; const yaw = wl.yaw; const t = trimW;
    const place = (ww, hh, ox, oy) => {
      for (const side of [1, -1]) {
        const nx = -dz, nz = dx;   // wall normal
        B.box(ww, hh, 0.025, mat, { pos: [px + dx * ox + nx * side * (depth / 2 + 0.012), (wl.mesh.position.y) + oy, pz + dz * ox + nz * side * (depth / 2 + 0.012)], rot: [0, yaw, 0], tile: 0.6, cast: false });
      }
    };
    place(t, hOpen + t, -wOpen / 2 - t / 2, yBase + hOpen / 2 + t / 2); place(t, hOpen + t, wOpen / 2 + t / 2, yBase + hOpen / 2 + t / 2);
    place(wOpen + 2 * t, t, 0, yBase + hOpen + t / 2);
    if (yBase > 0.05) place(wOpen + 2 * t, t, 0, yBase - t / 2);
  }
  const uOf = (wl, x, z) => (x - wl.start[0]) * wl.dir[0] + (z - wl.start[1]) * wl.dir[1];

  // =================================================================================================================
  // GROUND FLOOR
  // =================================================================================================================
  const fl = (r, mat, tile, surf) => B.slab(r.x0, r.z0, r.x1, r.z1, r.y, mat, { t: 0.14, tile, surf, walk: true });
  fl(ROOMS.living, M.floorDark, 1.5, 'wood'); fl(ROOMS.kitchen, M.tile, 2.4, 'tile'); fl(ROOMS.study, M.floorStudy, 1.4, 'wood');
  fl(ROOMS.hall, M.floorPale, 1.4, 'wood'); fl(ROOMS.mudroom, M.floorStudy, 1.4, 'wood');
  // footing slab under everything (so no gap shows at the outside edge)
  B.box(L.x1 - L.x0 + 0.6, 0.5, L.z1 - L.z0 + 0.6, M.concrete, { pos: [0, -0.25, 0], tile: 2, recv: true });

  const wallH = L.H + L.SLAB;   // ground walls rise to the underside of the upper slab top
  const W = {};
  // --- exterior walls (outer face log, inner face by room) ---
  // mats order: [side along (-dz,dx) normal, opposite, reveal]. For a west->east wall the first is the SOUTH face.
  // SOUTH wall (travel west->east): +Z face = south (outside)
  W.south = B.wall(L.x0, L.z1, L.x1, L.z1, { h: wallH, thick: T.e, holes: [
    { u: 7.2, w: 1.15, y: 0, h: 2.25 },                 // front door x=-0.3
    { u: 2.3, w: 1.2, y: 0.95, h: 1.3 },                // study window x=-5.2
    { u: 13.0, w: 1.2, y: 0.95, h: 1.3 },               // mudroom window x=5.5
  ], mats: [M.logOut, M.wallpaper, M.reveal], tile: 1.6 });
  // NORTH wall (travel west->east): +Z face = south (inside), -Z = north (outside)
  W.north = B.wall(L.x0, L.z0, L.x1, L.z0, { h: wallH + (UH + 0.3) * 0, thick: T.e, holes: [
    { u: 1.5, w: 1.5, y: 0.45, h: 2.35 }, { u: 4.0, w: 1.5, y: 0.45, h: 2.35 },   // living windows x=-6.0, -3.5
    { u: 6.7, w: 1.7, y: 0, h: 2.35 },                                              // deck glass door x=-0.8
    { u: 11.5, w: 1.6, y: 1.0, h: 1.25 },                                           // kitchen window x=4.0
  ], mats: [M.logIn, M.logOut, M.reveal], tile: 1.6 });
  // WEST wall (travel north->south): normal (-dz,dx) = (-1,0) -> west face (outside) first
  W.west = B.wall(L.x0, L.z0, L.x0, L.z1, { h: wallH, thick: T.e, holes: [{ u: 8.5, w: 1.2, y: 0.95, h: 1.3 }], mats: [M.logOut, M.wallpaper, M.reveal], tile: 1.6 });
  // EAST wall (travel north->south): first = west face = inside
  W.east = B.wall(L.x1, L.z0, L.x1, L.z1, { h: wallH, thick: T.e, holes: [
    { u: 3.0, w: 1.0, y: 0, h: 2.15 },                  // back door (kitchen) z=-2.5
    { u: 1.0, w: 1.0, y: 1.0, h: 1.2 },                 // kitchen window z=-4.5
    { u: 8.6, w: 1.0, y: 1.0, h: 1.2 },                 // mudroom window z=3.1
  ], mats: [M.paintGreen, M.logOut, M.reveal], tile: 1.6 });

  // double-height extension of the living room's north/west walls up to the roof eave
  const upperHW = UH + 0.12;
  W.northUp = B.wall(L.x0, L.z0, -3.0, L.z0, { h: upperHW, y0: wallH, thick: T.e, holes: [{ u: 2.75, w: 1.3, y: 0.3, h: 1.4 }], mats: [M.logIn, M.logOut, M.reveal], tile: 1.6 });
  W.westUp = B.wall(L.x0, L.z0, L.x0, 0.5, { h: upperHW, y0: wallH, thick: T.e, mats: [M.logOut, M.logIn, M.reveal], tile: 1.6 });
  W.studySouthUp = B.wall(L.x0, L.z1, -3.0, L.z1, { h: upperHW, y0: wallH, thick: T.e, mats: [M.logOut, M.plaster, M.reveal], tile: 1.6 });
  W.livingSouthUp = B.wall(L.x0, 0.5, -3.0, 0.5, { h: upperHW, y0: wallH, thick: T.i, mats: [M.wallpaper, M.logIn, M.reveal] });

  // --- interior partitions (ground) ---
  // H1: z=0.5 from west to east. travel west->east: first = south face (hall/study/mudroom side)
  W.h1 = B.wall(L.x0, 0.5, L.x1, 0.5, { h: wallH, thick: T.i, holes: [
    { u: 2.2, w: 0.95, y: 0, h: doorH },                // study <-> living (x=-5.3)
    { u: 6.9, w: 2.0, y: 0, h: 2.4 },                   // living <-> hall (cased, x=-0.6)
    { u: 10.2, w: 0.95, y: 0, h: doorH },               // kitchen <-> hall (x=2.7)
    { u: 13.0, w: 0.95, y: 0, h: doorH },               // kitchen <-> mudroom (x=5.5)
  ], mats: [M.wallpaper, M.plaster, M.reveal] });
  // V1 x=-3.0 (study | hall) z 0.5..5.5 (travel north->south: first = west face = study)
  W.v1 = B.wall(-3.0, 0.5, -3.0, L.z1, { h: wallH, thick: T.i, holes: [{ u: 2.5, w: 0.95, y: 0, h: doorH }], mats: [M.wallpaper, M.wallpaper, M.reveal] });
  // V2 x=3.5 (hall | mudroom)
  W.v2 = B.wall(3.5, 0.5, 3.5, L.z1, { h: wallH, thick: T.i, holes: [{ u: 3.8, w: 0.95, y: 0, h: doorH }], mats: [M.wallpaper, M.plaster, M.reveal] });
  // V3 x=1.5 (living | kitchen) z -5.5..0.5: wide cased opening
  W.v3 = B.wall(1.5, L.z0, 1.5, 0.5, { h: wallH, thick: T.i, holes: [{ u: 3.0, w: 2.2, y: 0, h: 2.35 }], mats: [M.logIn, M.paintGreen, M.reveal] });

  // ceilings (ground): under the upper slab. living double-height part has none.
  B.ceiling(-3.0, -5.5, 1.5, 0.5, L.H, M.ceilWood, 1.2);     // living east half (under Jo's room)
  B.ceiling(1.5, -5.5, 7.5, 0.5, L.H, M.plaster, 1.5);       // kitchen
  B.ceiling(-7.5, 0.5, -3.0, 5.5, L.H, M.plaster, 1.5);      // study
  B.ceiling(-3.0, 0.5, 1.4, 5.5, L.H, M.ceilWood, 1.2);      // hall
  B.ceiling(3.5, 0.5, 7.5, 5.5, L.H, M.plaster, 1.5);        // mudroom
  B.ceiling(1.4, 0.5, 3.5, 1.0, L.H, M.ceilWood, 1.2);

  // =================================================================================================================
  // UPPER FLOOR
  // =================================================================================================================
  const slabs = [[-3.0, -5.5, 1.4, 5.5], [3.2, -5.5, 7.5, 5.5], [1.4, -5.5, 3.2, 1.0]];
  for (const s of slabs) B.slab(s[0], s[1], s[2], s[3], yU, M.floorDark, { t: 0.15, tile: 1.5, walk: true });
  // upper floor finish by room (overlay planes)
  const upFloor = (r, mat, tile = 1.4) => B.slab(r.x0, r.z0, r.x1, r.z1, yU + 0.003, mat, { topOnly: true, tile });
  upFloor(ROOMS.jo, M.floorPale); upFloor(ROOMS.mara, M.floorPale); upFloor(ROOMS.corridor, M.floorStudy); upFloor(ROOMS.dad, M.floorPale);
  upFloor({ x0: 3.2, x1: 7.5, z0: 1.0, z1: 5.5 }, M.tile, 2.4);
  const uH = UH;
  // upper exterior walls
  W.nU = B.wall(-3.0, L.z0, L.x1, L.z0, { h: uH, y0: yU, thick: T.e, holes: [{ u: 2.2, w: 1.1, y: 0.85, h: 1.3 }, { u: 8.0, w: 1.1, y: 0.85, h: 1.3 }], mats: [M.wallpaper, M.logOut, M.reveal], tile: 1.6 });
  W.sU = B.wall(-3.0, L.z1, L.x1, L.z1, { h: uH, y0: yU, thick: T.e, holes: [{ u: 3.5, w: 1.0, y: 0.9, h: 1.2 }, { u: 8.5, w: 0.9, y: 1.1, h: 0.8 }], mats: [M.logOut, M.wallpaper, M.reveal], tile: 1.6 });
  W.eU = B.wall(L.x1, L.z0, L.x1, L.z1, { h: uH, y0: yU, thick: T.e, holes: [{ u: 3.0, w: 0.9, y: 0.9, h: 1.2 }], mats: [M.wallpaper, M.logOut, M.reveal], tile: 1.6 });
  // upper west wall x=-3.0 (faces the double-height living room on the west)
  W.wU = B.wall(-3.0, L.z0, -3.0, L.z1, { h: uH, y0: yU, thick: T.i, mats: [M.logIn, M.wallpaper, M.reveal], tile: 1.6 });
  // corridor north wall z=-0.5 (travel west->east: first = south face = corridor)
  W.cN = B.wall(-3.0, -0.5, L.x1, -0.5, { h: uH, y0: yU, thick: T.i, holes: [{ u: 2.2, w: 0.9, y: 0, h: doorH }, { u: 8.2, w: 0.9, y: 0, h: doorH }], mats: [M.wallpaper, M.wallpaper, M.reveal] });
  // corridor south wall z=1.0, stairwell opening x 1.4..3.2 left open (u 4.4..6.2)
  W.cS1 = B.wall(-3.0, 1.0, 1.4, 1.0, { h: uH, y0: yU, thick: T.i, holes: [{ u: 1.6, w: 0.9, y: 0, h: doorH }], mats: [M.wallpaper, M.wallpaper, M.reveal] });
  W.cS2 = B.wall(3.2, 1.0, L.x1, 1.0, { h: uH, y0: yU, thick: T.i, holes: [{ u: 1.5, w: 0.9, y: 0, h: doorH }], mats: [M.wallpaper, M.plasterG, M.reveal] });
  // Jo | Mara partition x=1.5 z -5.5..-0.5
  W.jm = B.wall(1.5, L.z0, 1.5, -0.5, { h: uH, y0: yU, thick: T.i, mats: [M.wallpaper, M.paintGreen, M.reveal] });
  // stairwell shaft walls x=1.4 (Dad's | shaft) and x=3.2 (shaft | bath) z 1.0..5.5, full height from floor below
  W.sh1 = B.wall(1.4, 1.0, 1.4, L.z1, { h: wallH + uH, thick: T.i, mats: [M.wallpaper, M.wallpaper, M.reveal] });
  W.sh2 = B.wall(3.2, 1.0, 3.2, L.z1, { h: wallH + uH, thick: T.i, mats: [M.wallpaper, M.plasterG, M.reveal] });
  // upper ceilings
  const uc = (r, mat) => B.ceiling(r.x0, r.z0, r.x1, r.z1, yU + uH, mat, 1.4);
  for (const k of ['jo', 'mara', 'corridor', 'dad']) uc(ROOMS[k], M.plaster); uc({ x0: 3.2, x1: 7.5, z0: 1.0, z1: 5.5 }, M.plaster);
  uc({ x0: 1.4, x1: 3.2, z0: 1.0, z1: 5.5 }, M.plaster);

  // stairs (visual) — rising north from z=5.2 (y=0) to z=1.0 (y=2.85)
  const nSteps = 16, run = 4.2, rise = L.UY; const stepW = 1.5, stepX = 2.3;
  for (let i = 0; i < nSteps; i++) {
    const zc = 5.2 - (i + 0.5) * (run / nSteps), top = (i + 1) * (rise / nSteps);
    B.box(stepW, 0.05, run / nSteps + 0.03, M.floorDark, { pos: [stepX, top - 0.025, zc], tile: 0.9, cast: true });
    B.box(stepW, rise / nSteps, 0.03, M.floorDark, { pos: [stepX, top - rise / nSteps / 2, zc + run / nSteps / 2], tile: 0.9, cast: false });
  }
  // stringers + underside
  for (const sx of [stepX - stepW / 2 - 0.03, stepX + stepW / 2 + 0.03]) {
    const len = Math.hypot(run, rise);
    B.box(0.06, 0.28, len, M.floorStudy, { pos: [sx, rise / 2 - 0.1, 3.1], rot: [Math.atan2(rise, run), 0, 0], tile: 0.9 });
  }
  col.addRamp(stepX, 3.1, run, stepW, 0, rise, -Math.PI / 2, { surf: 'wood' });
  // solid underside blocker so you can't walk under the stairs from the side
  col.addBox(stepX, 3.9, stepW + 0.2, 3.2, 0, 1.2, 0, { tag: 'stairUnder' });
  // banister on the open side (west)
  for (let i = 0; i <= nSteps; i += 2) { const zc = 5.2 - i * (run / nSteps); const top = i * (rise / nSteps); B.box(0.045, 0.9, 0.045, M.floorStudy, { pos: [stepX - stepW / 2 - 0.02, top + 0.45, zc], tile: 0.5 }); }
  B.box(0.06, 0.06, Math.hypot(run, rise), M.floorStudy, { pos: [stepX - stepW / 2 - 0.02, rise / 2 + 0.92, 3.1], rot: [Math.atan2(rise, run), 0, 0], tile: 0.5 });
  // upper landing rail along the stairwell (west edge at x=1.4 is a wall already), protect the north edge of the opening: none (stairs arrive there)
  // fix: invisible collision to stop falling into the stairwell hole from the corridor sides
  col.addBox(1.45, 3.0, 0.1, 4.0, yU - 0.2, yU + 1.2, 0, { tag: 'rail', rayBlock: false });

  // =================================================================================================================
  // ROOF, CHIMNEY, PORCH, DECK
  // =================================================================================================================
  const ridge = L.roofRidge, eave = L.roofEave, ov = 0.7;
  const halfD = (L.z1 - L.z0) / 2 + ov;               // horizontal run from ridge to eave (z)
  const slopeLen = Math.hypot(halfD, ridge - eave);
  const slopeAng = Math.atan2(ridge - eave, halfD);
  const roofW = (L.x1 - L.x0) + 2 * ov;
  for (const sgn of [-1, 1]) {
    const zc = sgn * halfD / 2; const yc = (eave + ridge) / 2;
    const rot = [sgn * -slopeAng, 0, 0];   // tilt
    // outer snow-covered shingles
    B.box(roofW, 0.12, slopeLen, M.shingle, { pos: [0, yc, zc], rot: [sgn * slopeAng * 1, 0, 0], tile: 1.2, round: 0 });
    B.box(roofW + 0.04, 0.2, slopeLen * 0.98, M.snow, { pos: [0, yc + 0.14, zc], rot: [sgn * slopeAng, 0, 0], tile: 2.4, cast: true });
    // inner board lining visible from inside the double-height room
    B.box(roofW - 0.3, 0.06, slopeLen - 0.1, M.roofIn, { pos: [0, yc - 0.1, zc], rot: [sgn * slopeAng, 0, 0], tile: 1.2, cast: false });
  }
  // gable end walls (triangles) above eave, east and west
  for (const gx of [L.x0, L.x1]) {
    const shape = new THREE.Shape(); const hw = (L.z1 - L.z0) / 2 + 0.15; shape.moveTo(-hw, 0); shape.lineTo(hw, 0); shape.lineTo(0, ridge - eave + 0.05); shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }); g.translate(0, 0, -0.15); g.computeVertexNormals(); worldUV(g, 1.6);
    B.add(g, M.logOut, { pos: [gx, eave, 0], rot: [0, Math.PI / 2, 0] });
  }
  // exposed rafters/ties in the double-height living room
  for (const bx of [-6.6, -4.9, -3.3]) B.box(0.22, 0.26, 11.2, M.beam, { pos: [bx, eave - 0.18, 0], rot: [0, 0, 0], tile: 1.0, cast: true, recv: true });
  B.box(15.2, 0.3, 0.3, M.beam, { pos: [0, ridge - 0.25, 0], tile: 1.0 });                // ridge beam
  for (const bz of [-3.5, 0.0, 3.5]) B.box(15.0, 0.22, 0.22, M.beam, { pos: [0, eave + 0.05, bz * 0.3], tile: 1.0, cast: false }); // purlins (cheap)
  // cross ties (collar beams) over the living double height
  for (const bx of [-6.9, -5.4, -3.9]) B.box(0.2, 0.2, 11.0, M.beam, { pos: [bx, eave - 0.05, 0], tile: 1.0 });

  // stone chimney on the west wall (fireplace breast inside, stack outside)
  B.box(1.2, 8.6, 2.6, M.stone, { pos: [L.x0 - 0.45, 4.3, -2.6], tile: 1.2, collide: false });
  B.box(1.4, 0.35, 2.8, M.stone, { pos: [L.x0 - 0.45, 8.7, -2.6], tile: 1.2 });
  B.box(1.0, 0.5, 2.2, M.snow, { pos: [L.x0 - 0.45, 8.95, -2.6], tile: 2 });

  // porch (south): deck, posts, roof, steps
  const porchZ0 = L.z1, porchZ1 = L.z1 + 2.7, pX0 = -3.6, pX1 = 3.0, deckY = 0.18;
  B.slab(pX0, porchZ0, pX1, porchZ1, deckY, M.deck, { t: 0.22, tile: 1.3, surf: 'dock', walk: true });
  for (const px of [pX0 + 0.12, -1.2, 1.2, pX1 - 0.12]) B.box(0.18, 2.6, 0.18, M.beam, { pos: [px, deckY + 1.3, porchZ1 - 0.15], collide: true, tile: 0.8 });
  B.box(pX1 - pX0 + 0.5, 0.2, 0.22, M.beam, { pos: [(pX0 + pX1) / 2, deckY + 2.65, porchZ1 - 0.15], tile: 0.8 });
  const pr = Math.atan2(0.9, 3.2);
  B.box(pX1 - pX0 + 0.8, 0.1, 3.5, M.shingle, { pos: [(pX0 + pX1) / 2, deckY + 3.0, porchZ0 + 1.4], rot: [-pr * 0.6, 0, 0], tile: 1.2 });
  B.box(pX1 - pX0 + 0.84, 0.16, 3.46, M.snow, { pos: [(pX0 + pX1) / 2, deckY + 3.13, porchZ0 + 1.4], rot: [-pr * 0.6, 0, 0], tile: 2.4 });
  // porch railings (left/right/front with a gap at the steps)
  const rail = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0); const yaw = Math.atan2(-(z1 - z0), x1 - x0); B.box(len, 0.07, 0.07, M.beam, { pos: [(x0 + x1) / 2, deckY + 0.95, (z0 + z1) / 2], rot: [0, yaw, 0], tile: 0.5 }); for (let i = 0; i <= len; i += 0.22) { B.box(0.035, 0.85, 0.035, M.beam, { pos: [x0 + (x1 - x0) * i / len, deckY + 0.5, z0 + (z1 - z0) * i / len], tile: 0.5, cast: false }); } col.addBox((x0 + x1) / 2, (z0 + z1) / 2, len, 0.12, deckY, deckY + 1.0, yaw, { rayBlock: false }); };
  rail(pX0, porchZ0, pX0, porchZ1); rail(pX1, porchZ0, pX1, porchZ1); rail(pX0, porchZ1, -0.9, porchZ1); rail(0.9, porchZ1, pX1, porchZ1);
  // steps
  for (let i = 0; i < 3; i++) B.box(1.8, 0.06, 0.34, M.deck, { pos: [0, deckY - 0.06 - i * 0.06 + 0.0, porchZ1 + 0.17 + i * 0.34], tile: 0.9, cast: true });
  // steps ramp: from terrain (0) at z+... up to deck: ramp along local x of yaw=-90deg means rising toward -z (towards the house)
  col.addRamp(0, porchZ1 + 0.55, 1.1, 1.8, 0.0, deckY, -Math.PI / 2, { surf: 'wood' });

  // lake-side deck north (outside the glass door) simple platform
  B.slab(-2.2, L.z0 - 2.6, 0.8, L.z0, 0.05, M.deck, { t: 0.14, tile: 1.3, surf: 'dock', walk: true });

  // =================================================================================================================
  // DOORS
  // =================================================================================================================
  const D = (name, wl, u, o = {}) => {
    const [dx, dz] = wl.dir; const x = wl.start[0] + dx * u, z = wl.start[1] + dz * u;
    const d = new Door(game, { name, x, z, yaw: wl.yaw, y0: wl.mesh.position.y, w: o.w ?? 0.95, h: o.h ?? doorH, hinge: o.hinge || 'L', mat: o.mat, thick: o.thick, locked: o.locked, key: o.key, lockMsg: o.lockMsg, lockLabel: o.lockLabel, creaky: o.creaky, swing: o.swing, invert: o.invert, open: o.open, onOpen: o.onOpen, onClose: o.onClose, onUnlock: o.onUnlock, onLocked: o.onLocked });
    out.doors[name] = d; return d;
  };
  const frontMat = pbr('wood_paint', { key: 'frontdoor', tint: 0x6a7e6a });
  out.doors.front = D('front', W.south, 7.2, { w: 1.05, h: 2.15, hinge: 'L', mat: frontMat, invert: true });
  out.doors.back = D('back', W.east, 3.0, { w: 0.95, h: 2.1, hinge: 'R', mat: frontMat, locked: true, key: 'backKey', lockLabel: 'Locked', lockMsg: 'The back door is locked. The key isn\'t where it should be.' });
  out.doors.study = D('study', W.h1, 2.2, { hinge: 'L', locked: true, key: 'studyKey', lockLabel: 'Locked', lockMsg: 'Dad\'s study is locked. He always kept the key somewhere stupidly obvious.' });
  out.doors.kitchenHall = D('kitchenHall', W.h1, 10.2, { hinge: 'R' });
  out.doors.kitchenMud = D('kitchenMud', W.h1, 13.0, { hinge: 'L' });
  out.doors.studyHall = D('studyHall', W.v1, 2.5, { hinge: 'L' });
  out.doors.hallMud = D('hallMud', W.v2, 3.8, { hinge: 'R' });
  out.doors.joDoor = D('jo', W.cN, 2.2, { hinge: 'L', locked: true, key: 'joKey', lockLabel: 'Locked', lockMsg: 'Jo\'s door. Locked. He never locked it. Not once.' });
  out.doors.maraDoor = D('mara', W.cN, 8.2, { hinge: 'R' });
  out.doors.dadDoor = D('dad', W.cS1, 1.6, { hinge: 'L', locked: true, key: 'dadKey', lockLabel: 'Locked', lockMsg: 'Dad\'s room. I haven\'t been in there since the funeral.' });
  out.doors.bathDoor = D('bath', W.cS2, 1.5, { hinge: 'R' });
  // trims
  const trims = [[W.south, 7.2, 1.15, 0, 2.25], [W.h1, 2.2, 0.95, 0, doorH], [W.h1, 6.9, 2.0, 0, 2.4], [W.h1, 10.2, 0.95, 0, doorH], [W.h1, 13.0, 0.95, 0, doorH], [W.v1, 2.5, 0.95, 0, doorH], [W.v2, 3.8, 0.95, 0, doorH], [W.v3, 3.0, 2.2, 0, 2.35], [W.east, 3.0, 1.0, 0, 2.15], [W.cN, 2.2, 0.9, 0, doorH], [W.cN, 8.2, 0.9, 0, doorH], [W.cS1, 1.6, 0.9, 0, doorH], [W.cS2, 1.5, 0.9, 0, doorH]];
  for (const t of trims) openingTrim(t[0], t[1], t[2], t[3], t[4], t[0].thick);

  // windows (frame + glass)
  const win = (wl, u, y, w, h, panes = [2, 2]) => { const [dx, dz] = wl.dir; const x = wl.start[0] + dx * u, z = wl.start[1] + dz * u; out.windows.push(buildWindow(B, { x, z, y: y + wl.mesh.position.y, w, h, yaw: wl.yaw, panes, thick: 0.3 })); };
  win(W.south, 2.3, 0.95, 1.2, 1.3); win(W.south, 13.0, 0.95, 1.2, 1.3);
  win(W.north, 1.5, 0.45, 1.5, 2.35, [2, 3]); win(W.north, 4.0, 0.45, 1.5, 2.35, [2, 3]); win(W.north, 11.5, 1.0, 1.6, 1.25, [3, 2]);
  win(W.west, 8.5, 0.95, 1.2, 1.3); win(W.east, 1.0, 1.0, 1.0, 1.2); win(W.east, 8.6, 1.0, 1.0, 1.2);
  win(W.northUp, 2.75, 0.3, 1.3, 1.4, [2, 2]);
  win(W.nU, 2.2, 0.85, 1.1, 1.3); win(W.nU, 8.0, 0.85, 1.1, 1.3); win(W.sU, 3.5, 0.9, 1.0, 1.2); win(W.sU, 8.5, 1.1, 0.9, 0.8); win(W.eU, 3.0, 0.9, 0.9, 1.2);
  // glass door to the lake deck
  out.deckDoorWall = W.north;
  const [ndx, ndz] = W.north.dir; const gdX = W.north.start[0] + ndx * 6.7, gdZ = W.north.start[1] + ndz * 6.7;
  buildWindow(B, { x: gdX, z: gdZ, y: 0.02, w: 1.7, h: 2.33, yaw: W.north.yaw, panes: [2, 4], thick: 0.3 });

  out.W = W; out.D = D;
  return out;
}
