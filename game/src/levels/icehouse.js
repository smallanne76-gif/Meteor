// THE ICE HOUSE — Dad's listening room, the old ice cellar and the brick tunnels under the boathouse and the lodge.
import * as THREE from 'three';
import { Chapter } from './chapter.js';
import { Builder, Door } from '../world/builder.js';
import { PM, chair, armchair, rug, lamp, ceilingLight, desk, shelfWall, crate, barrel, book } from '../world/props.js';
import { pbr, solid } from '../gfx/materials.js';
import { box as boxGeo, rbox } from '../gfx/geo.js';
import { Searcher } from '../chars/searcher.js';
import { IceHousePhase } from '../story/icehouseStory.js';
import { clamp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

export const IH = {
  H: 2.6,
  A: { x0: -4, z0: -2, x1: 0, z1: 2 },
  C1: { x0: 0, z0: -1, x1: 8, z1: 1 },
  L: { x0: 8, z0: -3.5, x1: 15, z1: 3.5 },
  C2: { x0: 10.5, z0: -12, x1: 12.5, z1: -3.5 },
  I: { x0: 4, z0: -24, x1: 19, z1: -12 },
  E: { x0: -1, z0: 6, x1: 3, z1: 10 },
  tunnel: [[4, -20], [-12, -20], [-12, 8], [-1, 8]],
  tunnelW: 2.2, tunnelH: 2.35,
};

export class IceHouse extends Chapter {
  constructor() { super('icehouse', 'The Ice House'); this.lamps = []; }
  cl(...a) { const api = ceilingLight(...a); this.lamps.push(api); return api; }
  lp(...a) { const api = lamp(...a); this.lamps.push(api); return api; }

  async build(game, opts = {}) {
    await super.build(game, opts); this.opts = opts;
    game.setSky('dim'); game.setGrade('underground', true); game.indoorTarget = 1; game.fogMulTarget = 0.25; game.indoorEnvK = 0.02; game.indoorHemiK = 0.5;
    game.collision.terrain = () => 0; game.collision.walkable = null; game.collision.bounds = { minx: -40, maxx: 40, minz: -60, maxz: 60 };
    const B = this.B = new Builder(game, game.root); this.game = game;
    const M = this.M = {
      brick: pbr('brick', { key: 'ihbrick', tint: 0x9a8a80 }), brickDark: pbr('brick', { key: 'ihbrick2', tint: 0x6e6460 }), concrete: pbr('concrete', { key: 'ihconc', tint: 0xa8a49c }),
      panel: pbr('wood_dark', { key: 'ihpanel', tint: 0x8a6a50 }), floorW: pbr('wood_floor', { key: 'ihfloor', tint: 0x8a6a4a }), plaster: pbr('plaster', { key: 'ihpl', tint: 0xcdc2ac, normal: 0.55 }),
      saw: pbr('gravel', { key: 'ihsaw', tint: 0xb59a6a }), metal: pbr('metal_rust', { key: 'ihmetal', tint: 0x9aa0a4, metal: 1 }), wood: PM().woodDark, woodPale: PM().woodPale,
      ice: new THREE.MeshPhysicalMaterial({ color: 0x8fbad6, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.4 }),
      iron: PM().iron, brass: PM().brass, leather: PM().leather, cloth: solid(0x2a2220, { rough: 0.95 }),
    };
    const L = IH, H = L.H;
    const reveal = M.brickDark;
    const W = (x1, z1, x2, z2, holes, mats, o = {}) => B.wall(x1, z1, x2, z2, { h: o.h ?? H, thick: 0.28, holes, mats: mats || [M.brick, M.brick, reveal], tile: 1.1, ...o });
    const floor = (r, mat, o = {}) => B.slab(r.x0, r.z0, r.x1, r.z1, 0, mat, { t: 0.2, tile: 1.4, walk: true, surf: o.surf || 'concrete' });
    const ceil = (r, mat, h = H, t = 1.2) => B.ceiling(r.x0, r.z0, r.x1, r.z1, h, mat, t);
    this.doors = {};
    const D = (name, wl, u, o = {}) => { const [dx, dz] = wl.dir; const d = new Door(game, { name, x: wl.start[0] + dx * u, z: wl.start[1] + dz * u, yaw: wl.yaw, y0: 0, w: o.w ?? 0.95, h: o.h ?? 2.15, hinge: o.hinge || 'L', mat: o.mat, locked: o.locked, key: o.key, lockMsg: o.lockMsg, lockLabel: o.lockLabel, onLocked: o.onLocked, onOpen: o.onOpen, onClose: o.onClose, creaky: true }); this.doors[name] = d; return d; };

    // ================================ A: the shaft room (arrival) =====================================================
    { const r = L.A; floor(r, M.concrete); ceil(r, M.concrete);
      W(r.x0, r.z0, r.x1, r.z0, [], null);                                                  // north
      const wE = W(r.x1, r.z0, r.x1, r.z1, [{ u: 2.0, w: 1.0, y: 0, h: 2.15 }]);            // east: door to C1
      W(r.x1, r.z1, r.x0, r.z1, []); W(r.x0, r.z1, r.x0, r.z0, []);
      D('d1', wE, 2.0, { hinge: 'L' });
      // ladder up to the boathouse hatch + a shaft of cold moonlit air
      const lx = r.x0 + 0.18; for (const sz of [-0.2, 0.2]) B.box(0.05, 2.7, 0.05, M.wood, { pos: [lx, 1.35, sz], tile: 0.5, cast: false });
      for (let i = 0; i < 9; i++) B.box(0.04, 0.04, 0.46, M.wood, { pos: [lx, 0.3 + i * 0.3, 0], tile: 0.4, cast: false });
      B.box(1.2, 0.3, 1.2, M.concrete, { pos: [lx + 0.6, H + 0.15, 0], tile: 1 });             // hatch collar on the ceiling
      this.shaftLight = game.lights.add({ pos: [-3.2, 2.4, 0], color: 0xa8c8e8, intensity: 18, distance: 7, shadow: true, tag: 'shaft', decay: 1.6 });
      this.lp(B, game, -1.0, 1.4, { y: 0, base: 0.5, h: 0.35, tag: 'a', intensity: 10, distance: 6, on: true, shadow: false });
      B.box(0.6, 0.04, 0.9, M.cloth, { pos: [-2.0, 0.025, 0.9], tile: 0.5, cast: false });
      barrel(B, -3.3, 1.5, { y: 0, r: 0.26, h: 0.8 }); crate(B, -3.4, -1.4, { y: 0, s: 0.55, yaw: 0.3 });
    }
    // ================================ C1: the corridor ================================================================
    { const r = L.C1; floor(r, M.concrete); ceil(r, M.brickDark, 2.4, 1.2);
      W(0, -1, 8, -1, [], null, { h: 2.4 }); const wS = W(8, 1, 0, 1, [], null, { h: 2.4 });
      for (const x of [2.3, 5.8]) this.cl(B, game, x, 0, 2.4, { tag: 'c1', intensity: 14, distance: 6, on: true, shadow: false, pendant: false });
      for (const x of [1.5, 3.2, 4.9, 6.6]) B.box(0.2, 0.2, 2.1, M.metal, { pos: [x, 2.3, 0], tile: 0.5, cast: false });   // ceiling ribs
      B.box(0.1, 0.1, 0.1, M.iron, { pos: [4, 2.3, 0.9] });
      // pipe along the wall
      B.cyl(0.05, 0.05, 8, M.metal, { pos: [4, 1.9, -0.9], rot: [0, 0, Math.PI / 2], tile: 0.6, cast: false });
      this.drips = [V(3.2, 2.2, 0.4), V(6.0, 2.2, -0.3)];
    }
    // ================================ L: the listening room ===========================================================
    this.buildListening(B, W, D, floor, ceil);
    // ================================ C2 + cellar =====================================================================
    this.buildCellar(B, W, D, floor, ceil);
    // ================================ tunnel and the lodge cellar ======================================================
    this.buildTunnel(B, W, D, floor, ceil);
    B.finish();
    // doors need collision toggled as the player uses them
    this.cleanup(() => { for (const d of Object.values(this.doors)) { /* doors are children of the scene root; removed on unload */ } });
    // the Searcher, for the chase
    this.searcher = new Searcher(game, { world: { ground: () => 0, lit: () => false } }); this.cleanup(() => this.searcher.dispose());
    this.searcher.opts.noHunt = true; this.searcher.opts.prints = true; this.searcher.walkSpeed = 1.3;
    game.flashlightAvailable = true; game.hands.holdFlashlight();
    game.audio && game.audio.amb.set('cellar', { fade: 0.1 });
    this.phase = new IceHousePhase(this); this.phase.start(opts);
  }

  buildListening(B, W, D, floor, ceil) {
    const game = this.game, M = this.M, L = IH, r = L.L, H = L.H;
    floor(r, M.floorW, { surf: 'wood' }); ceil(r, M.plaster, H, 1.4);
    const pm = [M.panel, M.brick, M.brickDark];
    W(r.x0, r.z0, r.x1, r.z0, [{ u: 3.5, w: 1.0, y: 0, h: 2.15 }], pm);                          // north: door to C2 at x=11.5
    W(r.x1, r.z0, r.x1, r.z1, [], pm);                                                                // east
    W(r.x1, r.z1, r.x0, r.z1, [], pm);                                                                // south
    const wW = W(r.x0, r.z1, r.x0, r.z0, [{ u: 3.5, w: 1.0, y: 0, h: 2.15 }], pm);                  // west: door from C1 at z=0
    // doors: the north wall travels W->E so u=3.5 → x=11.5
    this.doors.d2 = new Door(game, { name: 'd2', x: 8, z: 0, yaw: wW.yaw, y0: 0, w: 0.95, h: 2.15, hinge: 'R', creaky: true });
    const wN = { start: [r.x0, r.z0], dir: [1, 0], yaw: Math.atan2(0, 1) };
    this.doors.d3 = new Door(game, { name: 'd3', x: 11.5, z: r.z0, yaw: 0, y0: 0, w: 0.95, h: 2.15, hinge: 'L', creaky: true });
    // acoustic slats on the walls
    for (let x = r.x0 + 0.4; x < r.x1 - 0.2; x += 0.34) B.box(0.05, 2.2, 0.06, M.woodPale, { pos: [x, 1.25, r.z1 - 0.18], tile: 0.5, cast: false });
    for (let z = r.z0 + 0.4; z < r.z1 - 0.2; z += 0.34) B.box(0.06, 2.2, 0.05, M.woodPale, { pos: [r.x1 - 0.18, 1.25, z], tile: 0.5, cast: false });
    // warm light: ceiling lamp, floor lamp, desk lamp
    this.lampL = this.cl(B, game, 11.5, 0.5, H, { tag: 'listen', intensity: 20, distance: 8, on: true, shadow: true });
    this.lampFloor = this.lp(B, game, 9.2, -2.6, { floor: true, y: 0, tag: 'listen', intensity: 14, distance: 8, on: true });
    this.lampDesk = this.lp(B, game, 14.0, -1.4, { y: 0.8, base: 0.3, h: 0.3, tag: 'listen', intensity: 9, distance: 5, on: true });
    this.lampDesk.group.position.y = 0.8;
    rug(B, 11.0, 0.3, 4.0, 3.0, { mat: PM().fabricRed, tile: 0.9 });
    // the desk and the machine
    B.box(1.0, 0.07, 2.6, M.wood, { pos: [14.2, 0.79, 0.3], tile: 0.8, round: 0.01 });
    for (const sz of [-1.0, 1.6]) for (const sx of [-0.4, 0.4]) B.box(0.07, 0.76, 0.07, M.wood, { pos: [14.2 + sx, 0.38, sz], tile: 0.5, cast: false });
    B.box(0.9, 0.4, 2.4, M.wood, { pos: [14.4, 0.55, 0.3], tile: 0.8, cast: false });          // lower cabinet
    this.machine = this.buildReelMachine(14.15, 0.78, 0.9);
    // speakers on stands, facing the chair
    for (const sz of [-2.35, 2.35]) { B.box(0.45, 0.8, 0.4, M.wood, { pos: [8.7, 1.25, sz], tile: 0.6, round: 0.015 }); B.box(0.36, 0.7, 0.03, M.cloth, { pos: [8.93, 1.25, sz], tile: 0.4, cast: false }); B.cyl(0.14, 0.14, 0.02, M.iron, { pos: [8.95, 1.45, sz], rot: [0, 0, Math.PI / 2], cast: false }); B.cyl(0.07, 0.07, 0.02, M.iron, { pos: [8.95, 1.1, sz], rot: [0, 0, Math.PI / 2], cast: false }); B.box(0.08, 0.84, 0.08, M.iron, { pos: [8.7, 0.42, sz], tile: 0.4 }); }
    this.speakerPos = [V(8.9, 1.3, -2.35), V(8.9, 1.3, 2.35)];
    // Dad's chair, and the leather sofa behind it
    chair(B, 12.7, 0.9, Math.PI / 2, { mat: M.wood, cushion: M.leather });
    armchair(B, 11.0, 2.7, 0, { mat: M.leather });
    // shelves of tapes along the south wall, boxes labelled wrong on purpose
    this.tapeBoxes = [];
    for (let row = 0; row < 4; row++) { B.box(5.8, 0.04, 0.34, M.wood, { pos: [11.5, 0.5 + row * 0.5, 3.2], tile: 0.6, cast: false }); }
    for (const sx of [8.7, 14.3]) B.box(0.05, 2.1, 0.34, M.wood, { pos: [sx, 1.05, 3.2], tile: 0.5, cast: false });
    const cols = [0xb5a07a, 0x8a4a3a, 0x4a6a7a, 0xc9b890, 0x6a5a4a, 0x7a8a6a];
    for (let row = 0; row < 4; row++) for (let i = 0; i < 17; i++) { const hgt = 0.26 + ((i * 7 + row * 3) % 4) * 0.012; B.box(0.28, hgt, 0.2, solid(cols[(i + row * 2) % cols.length], { rough: 0.8 }), { pos: [8.95 + i * 0.32, 0.52 + row * 0.5 + hgt / 2, 3.2], tile: 0.3, cast: false }); }
    // the temperature and ice log, pinned up: the clue for the cold-room dial
    const chart = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), new THREE.MeshStandardMaterial({ map: canvasTex(640, 460, (c, w, h) => {
      c.fillStyle = '#e8e0c6'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = '600 26px Elite, monospace'; c.fillText('HALDEN LAKE — AIR / ICE', 24, 40);
      c.strokeStyle = '#a89870'; c.lineWidth = 1; for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(24, 70 + i * 32); c.lineTo(w - 24, 70 + i * 32); c.stroke(); }
      const rows = [['02/03/03', '−24°', '41 cm', '11 min'], ['02/09/04', '−19°', '37 cm', 'quiet'], ['02/14/05', '−26°', '44 cm', '6 min !!'], ['02/11/06', '−22°', '40 cm', '3 min']];
      c.font = '22px Elite, monospace'; rows.forEach((r, i) => r.forEach((t, j) => c.fillText(t, 30 + j * 150, 100 + i * 64)));
      c.strokeStyle = '#b3261e'; c.lineWidth = 3; c.strokeRect(14, 236, w - 28, 54); c.fillStyle = '#b3261e'; c.font = '20px Caveat, cursive'; c.fillText('best night — D falling — the boy was awake', 24, 322);
      c.fillStyle = '#26358a'; c.fillText('cold-room dial: the best night’s air, no minus sign', 24, 372);
    }), roughness: 0.9 }));
    chart.position.set(9.2, 1.7, 3.36); chart.rotation.y = Math.PI; chart.castShadow = false; game.root.add(chart); this.chart = chart;
    // Dad at work: a framed photograph over the desk
    const fr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.5), new THREE.MeshStandardMaterial({ map: canvasTex(200, 250, (c, w, h) => {
      c.fillStyle = '#7a7060'; c.fillRect(0, 0, w, h); const g2 = c.createLinearGradient(0, 0, 0, h); g2.addColorStop(0, '#b8ad96'); g2.addColorStop(1, '#6a6050'); c.fillStyle = g2; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3c3a38'; c.beginPath(); c.ellipse(100, 118, 38, 46, 0, 0, 7); c.fill(); c.fillStyle = '#d2ae92'; c.beginPath(); c.arc(100, 118, 30, 0, 7); c.fill();
      c.strokeStyle = '#1c1c1c'; c.lineWidth = 9; c.beginPath(); c.arc(100, 106, 40, Math.PI, 0); c.stroke(); c.fillStyle = '#1c1c1c'; c.fillRect(56, 104, 14, 28); c.fillRect(130, 104, 14, 28);
      c.fillStyle = '#4a5a6a'; c.beginPath(); c.moveTo(30, 250); c.quadraticCurveTo(100, 160, 170, 250); c.fill(); }), roughness: 0.6 }));
    fr.position.set(14.78, 1.75, 0.3); fr.rotation.y = -Math.PI / 2; game.root.add(fr); B.box(0.46, 0.56, 0.03, M.wood, { pos: [14.84, 1.75, 0.3], rot: [0, 0, 0], tile: 0.4, cast: false });
    this.frame = fr;
  }

  /** a reel-to-reel deck: two reels, a tape path, meters, and the little brass switch that starts it */
  buildReelMachine(x, y, z) {
    const g = new THREE.Group(); g.position.set(x, y, z); this.game.root.add(g); const M = this.M;
    const body = new THREE.Mesh(rbox(0.5, 0.24, 0.62, 0.02, 0.4), M.metal); body.position.y = 0.12; body.castShadow = true; g.add(body);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.56), solid(0x1c1c1e, { rough: 0.5, metal: 0.5 })); face.position.y = 0.245; g.add(face);
    this.reels = [];
    for (const dz of [-0.14, 0.15]) { const reel = new THREE.Group(); reel.position.set(0, 0.3, dz); g.add(reel); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 24), M.metal); reel.add(hub); const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.016, 24), solid(0x2a1c14, { rough: 0.5 })); tape.position.y = 0.012; reel.add(tape); for (let i = 0; i < 3; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.012), M.metal); sp.rotation.y = i * Math.PI / 3; sp.position.y = 0.022; reel.add(sp); } this.reels.push(reel); }
    for (let i = 0; i < 2; i++) { const vu = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.05), new THREE.MeshStandardMaterial({ color: 0xe8d9a0, emissive: 0xffc860, emissiveIntensity: 0.25 })); vu.position.set(-0.17 + i * 0.1, 0.26, 0.26); g.add(vu); }
    g.userData.reels = this.reels; return g;
  }

  buildCellar(B, W, D, floor, ceil) {
    const game = this.game, M = this.M, L = IH, H = L.H; const c2 = L.C2, I = L.I;
    // C2: the corridor north of the listening room, ending in a steel cold-room door
    floor(c2, M.concrete); ceil(c2, M.brickDark, 2.4, 1.2);
    const wE = W(c2.x1, c2.z1, c2.x1, c2.z0, [], null, { h: 2.4 });        // east, travelling north
    const wW = W(c2.x0, c2.z0, c2.x0, c2.z1, [], null, { h: 2.4 });        // west, travelling south
    this.doors.dial = new Door(game, { name: 'dial', x: 11.5, z: c2.z0, yaw: 0, y0: 0, w: 1.0, h: 2.15, hinge: 'L', mat: M.metal, locked: true, lockLabel: 'Cold-room door', creaky: true, onLocked: () => this.phase && this.phase.dialDoor() });
    this.cl(B, game, 11.5, -7.0, 2.4, { tag: 'c2', intensity: 10, distance: 6, on: true, shadow: false, pendant: false });
    // the cellar proper: a vaulted brick chamber of ice
    const ch = 3.6; floor(I, M.saw, { surf: 'gravel' }); ceil(I, M.brickDark, ch, 1.4);
    W(I.x0, I.z0, I.x1, I.z0, [], null, { h: ch });                                                   // north
    W(I.x1, I.z0, I.x1, I.z1, [], null, { h: ch });                                                   // east
    W(I.x1, I.z1, I.x0, I.z1, [{ u: 7.5, w: 1.0, y: 0, h: 2.15 }], null, { h: ch });                  // south, door gap at x=11.5
    W(I.x0, I.z1, I.x0, I.z0, [{ u: 8.0, w: 1.4, y: 0, h: 2.15 }], null, { h: ch });                  // west: tunnel mouth at z=-20 (travel from z=-12 northwards: u=8)
    // brick arches (decorative ribs)
    for (let x = I.x0 + 2; x < I.x1; x += 3) B.box(0.35, 0.35, 12, M.brickDark, { pos: [x, ch - 0.18, (I.z0 + I.z1) / 2], tile: 0.8, cast: false });
    // ice blocks, stacked to the ceiling in three bays, a path between them
    const rr = (a) => { let s = a; return () => (s = (s * 16807) % 2147483647) / 2147483647; }; const rnd = rr(11);
    const bays = [[7.5, -22.5, 3, 2], [15.5, -22.5, 3, 2], [7.5, -14.2, 3, 1.4], [16.2, -14.2, 2.4, 1.4]];
    for (const [bx, bz, nx, nz] of bays) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) for (let k = 0; k < 3; k++) {
      if (rnd() < 0.15 && k > 0) continue; const s = 0.78; B.box(s, 0.5, s, M.ice, { pos: [bx + i * 0.82 + (rnd() - 0.5) * 0.04, 0.25 + k * 0.52, bz + j * 0.82], rot: [0, (rnd() - 0.5) * 0.05, 0], round: 0.03, tile: 0.8, cast: false, recv: false });
    }
    B.box(2.4, 0.2, 2.4, M.concrete, { pos: [11.5, 0.1, -18], tile: 1, cast: false });
    // the well: a square of black water under thin ice
    B.box(2.0, 0.04, 2.0, solid(0x04080c, { rough: 0.06 }), { pos: [11.5, 0.22, -18], tile: 1, cast: false });
    // cold light: blue shafts from grates, and one stubborn warm bulb
    for (const [x, z] of [[8.5, -18], [14.5, -18], [11.5, -21.5]]) game.lights.add({ pos: [x, 3.0, z], color: 0x9cc8f0, intensity: 16, distance: 9, shadow: x === 11.5 && z === -21.5, tag: 'cellar', decay: 1.7 });
    this.cellarBulb = this.cl(B, game, 11.5, -13.4, 3.0, { tag: 'cellar', intensity: 12, distance: 7, on: true, shadow: false, pendant: false });
    // tools on the wall: saw, tongs, hooks
    B.box(1.6, 0.04, 0.1, M.wood, { pos: [11.5, 2.0, -23.85], tile: 0.5, cast: false }); for (let i = 0; i < 5; i++) B.box(0.03, 0.5 + i * 0.05, 0.02, M.metal, { pos: [10.8 + i * 0.3, 1.7, -23.82], tile: 0.4, cast: false });
    // a shelf of oddments: where the third tape is
    B.box(1.2, 0.05, 0.3, M.wood, { pos: [6.2, 1.1, -23.8], tile: 0.5 }); B.box(0.05, 1.1, 0.3, M.wood, { pos: [5.6, 0.55, -23.8], tile: 0.5, cast: false }); B.box(0.05, 1.1, 0.3, M.wood, { pos: [6.8, 0.55, -23.8], tile: 0.5, cast: false });
    for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 18), solid(0x1c1c1e, { rough: 0.4, metal: 0.6 })); t.rotation.x = Math.PI / 2; t.position.set(5.85 + i * 0.28, 1.2, -23.8); game.root.add(t); }
    // the button: one yellow button, frozen in the block at the front of the first bay
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.012, 14), new THREE.MeshStandardMaterial({ color: 0xe8b81c, roughness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.4 })); btn.position.set(8.4, 0.55, -21.0); btn.rotation.x = Math.PI / 2; game.root.add(btn); this.button = btn;
    this.tapeShelf = V(6.2, 1.25, -23.55);
    crate(B, 18, -13.2, { y: 0, s: 0.6, yaw: 0.4 }); barrel(B, 5.1, -13.2, { y: 0, r: 0.28, h: 0.85 });
  }

  buildTunnel(B, W, D, floor, ceil) {
    const game = this.game, M = this.M, L = IH, w = L.tunnelW, h = L.tunnelH; const pts = L.tunnel; this.tunnelPts = pts.map((p) => V(p[0], 0, p[1]));
    // each leg is a brick-walled box; corners get a pillar so no gaps show
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz); const ux = dx / len, uz = dz / len; const nx = -uz, nz = ux;
      const cx = (ax + bx) / 2, cz = (az + bz) / 2; const along = Math.abs(dx) > Math.abs(dz);
      // side walls run from end to end, stopping short at a corner (the corner gets its own outer walls below), and
      // reaching past the open ends of the tunnel so the mouths are sealed at the sides
      const t0 = i > 0 ? -w / 2 : w / 2, t1 = i < pts.length - 2 ? -w / 2 : w / 2;     // + = extend past the end, - = stop short
      const sxA = ax - ux * t0, szA = az - uz * t0, sxB = bx + ux * t1, szB = bz + uz * t1;
      const wcx = (sxA + sxB) / 2, wcz = (szA + szB) / 2, wlen = Math.hypot(sxB - sxA, szB - szA);
      if (along) { B.slab(Math.min(ax, bx) - w / 2, cz - w / 2, Math.max(ax, bx) + w / 2, cz + w / 2, 0, M.concrete, { t: 0.2, tile: 1.4, walk: true }); B.ceiling(Math.min(ax, bx) - w / 2, cz - w / 2, Math.max(ax, bx) + w / 2, cz + w / 2, h, M.brickDark, 1.2);
        for (const s of [-1, 1]) B.box(wlen, h, 0.3, M.brick, { pos: [wcx, h / 2, cz + s * (w / 2 + 0.15)], tile: 1.1, collide: true }); }
      else { B.slab(cx - w / 2, Math.min(az, bz) - w / 2, cx + w / 2, Math.max(az, bz) + w / 2, 0, M.concrete, { t: 0.2, tile: 1.4, walk: true }); B.ceiling(cx - w / 2, Math.min(az, bz) - w / 2, cx + w / 2, Math.max(az, bz) + w / 2, h, M.brickDark, 1.2);
        for (const s of [-1, 1]) B.box(0.3, h, wlen, M.brick, { pos: [cx + s * (w / 2 + 0.15), h / 2, wcz], tile: 1.1, collide: true }); }
    }
    // corners: close the two sides of the corner square that no leg uses (ahead of the incoming leg, behind the outgoing one)
    for (let j = 1; j < pts.length - 1; j++) {
      const [px, pz] = pts[j]; const dir = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
      const u1 = dir(pts[j - 1], pts[j]), u2 = dir(pts[j], pts[j + 1]);
      for (const [ux, uz] of [u1, [-u2[0], -u2[1]]]) {
        const wx = px + ux * (w / 2 + 0.15), wz = pz + uz * (w / 2 + 0.15);
        if (Math.abs(ux) > 0.5) B.box(0.3, h, w + 0.6, M.brick, { pos: [wx, h / 2, wz], tile: 1.1, collide: true });
        else B.box(w + 0.6, h, 0.3, M.brick, { pos: [wx, h / 2, wz], tile: 1.1, collide: true });
      }
    }
    // the tunnel meets the cellar's west wall at (4,-20): wall hole is there; the first wall segment of the tunnel is open at that end
    // dim emergency bulbs, every twelve metres, the colour of old blood
    this.tunLights = [];
    for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; const len = Math.hypot(bx - ax, bz - az); for (let s = 5; s < len; s += 12) { const t = s / len; const px = ax + (bx - ax) * t, pz = az + (bz - az) * t; const lt = game.lights.add({ pos: [px, h - 0.2, pz], color: 0xff5a2a, intensity: 3.2, distance: 6, tag: 'tunnel', decay: 1.8, flicker: { amp: 0.12, speed: 3 } }); this.tunLights.push(lt);
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a40 })); bulb.position.set(px, h - 0.2, pz); game.root.add(bulb); } }
    // obstacles: a fallen beam to crouch under, a barred door to open, crates
    const bm = B.box(w - 0.1, 0.22, 0.28, M.wood, { pos: [-12, 1.38, -8], tile: 0.6, collide: false }); this.beamZ = -8; game.collision.addBox(-12, -8, w - 0.1, 0.3, 1.27, 1.6, 0);   // crouching (1.2 m) fits under, standing doesn't
    this.barDoor = new Door(game, { name: 'bar', x: -12, z: 3.6, yaw: 0, y0: 0, w: 1.4, h: 2.1, hinge: 'L', locked: false, creaky: true, mat: M.wood });
    this.barDoor.it.label = () => (this.barDoor.isOpen ? 'Close' : 'Lift the bar'); this.barDoor.it.maxDist = 2.0;
    crate(B, -4, 7.2, { y: 0, s: 0.5, yaw: 0.2 }); crate(B, -3.4, 8.7, { y: 0, s: 0.45, yaw: -0.3 });
    // the lodge's cellar: a small room with the ladder up to the kitchen hatch
    const e = L.E; floor(e, M.concrete); ceil(e, M.brickDark, 2.5, 1.2);
    W(e.x0, e.z0, e.x1, e.z0, [], null, { h: 2.5 }); W(e.x1, e.z0, e.x1, e.z1, [], null, { h: 2.5 }); W(e.x1, e.z1, e.x0, e.z1, [], null, { h: 2.5 }); const wEW = W(e.x0, e.z1, e.x0, e.z0, [{ u: 2.0, w: 1.4, y: 0, h: 2.1 }], null, { h: 2.5 });
    const lx = e.x1 - 0.2; for (const sz of [-0.2, 0.2]) B.box(0.05, 2.6, 0.05, M.wood, { pos: [lx, 1.3, 8 + sz], tile: 0.5, cast: false }); for (let i = 0; i < 8; i++) B.box(0.04, 0.04, 0.46, M.wood, { pos: [lx, 0.3 + i * 0.3, 8], tile: 0.4, cast: false });
    this.ladderTop = V(lx - 0.1, 2.5, 8);
    this.lodgeLight = this.cl(B, game, 1, 8, 2.5, { tag: 'e', intensity: 14, distance: 6, on: false, shadow: false, pendant: false });
    this.ladderPos = V(lx - 0.5, 1.2, 8);
    B.box(1.4, 0.06, 1.4, solid(0x14100c, { rough: 0.7 }), { pos: [lx - 0.3, 2.52, 8], cast: false });
  }

  update(dt, game) {
    for (const d of Object.values(this.doors)) d.update(dt);
    this.barDoor && this.barDoor.update(dt);
    this.searcher && this.searcher.update(dt);
    this.phase && this.phase.update(dt);
    // reels turn while the machine runs
    if (this.machineRun) for (const r of this.reels) r.rotation.y += dt * 4.2 * (r.userData.dir || 1);
    // the cellar drips
    if (this.drips && Math.random() < dt * 0.6) game.audio && game.audio.at(this.drips[Math.floor(Math.random() * this.drips.length)], 'drip', { vol: 0.6 });
  }
}
