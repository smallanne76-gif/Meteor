// THE LOOP — the lodge on the night of the birthday, as memory keeps it: a party that never started, one corridor, too many doors.
import * as THREE from 'three';
import { Chapter } from './chapter.js';
import { Builder, Door } from '../world/builder.js';
import { PM, rug, table, chair } from '../world/props.js';
import { pbr, solid } from '../gfx/materials.js';
import { rbox } from '../gfx/geo.js';
import { LoopPhase } from '../story/loopStory.js';
import { RNG, clamp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

export const LOOPG = { x0: -1.5, x1: 1.5, zS: 14, zN: -14, H: 2.7, doorsW: [8, 0, -8], doorsE: [-8, 0, 8] };
const BALLOON = [0xd94a3a, 0xe8b81c, 0x4a7ac8, 0x4aa86a, 0xc85aa0, 0xf0e6d0];

export class Loop extends Chapter {
  constructor() { super('loop', 'The Loop'); this.stage = 0; this.dec = { balloons: [], streamers: [], lights: [], candles: [], letters: [] }; }

  async build(game, opts = {}) {
    await super.build(game, opts); this.opts = opts; this.game = game;
    game.setSky('dim'); game.setGrade('interiorWarm', true); game.indoorTarget = 1; game.fogMulTarget = 0.5; game.indoorEnvK = 0.03; game.indoorHemiK = 0.6;
    game.collision.terrain = () => 0; game.collision.walkable = null; game.collision.bounds = { minx: -30, maxx: 30, minz: -40, maxz: 40 };
    const B = this.B = new Builder(game, game.root); const G = LOOPG; const H = G.H;
    const M = this.M = {
      wp: pbr('wallpaper', { key: 'lpwp', tint: 0xdccaa0 }), wood: PM().woodDark, floor: pbr('wood_floor', { key: 'lpfloor', tint: 0x9a7a58 }), plaster: pbr('plaster', { key: 'lppl', tint: 0xdcd2bc, normal: 0.5 }),
      paint: pbr('wood_paint', { key: 'lpdoor', tint: 0xdfe6d6 }), reveal: pbr('wood_paint', { key: 'lprev', tint: 0xcfd2c4 }), brass: PM().brass, red: PM().fabricRed, foam: solid(0x2c2d30, { rough: 0.95 }),
    };
    // ---- the corridor ----------------------------------------------------------------------------------------------------
    B.slab(G.x0 - 0.1, G.zN, G.x1 + 0.1, G.zS, 0, M.floor, { t: 0.2, tile: 1.4, walk: true, surf: 'wood' }); B.ceiling(G.x0, G.zN, G.x1, G.zS, H, M.plaster, 1.4);
    const mats = [M.wp, M.plaster, M.reveal];
    const holes = (zs, fromS) => zs.map((z) => ({ u: fromS ? G.zS - z : z - G.zN, w: 1.0, y: 0, h: 2.15 }));
    const wW = B.wall(G.x0, G.zS, G.x0, G.zN, { h: H, thick: 0.22, holes: holes(G.doorsW, true), mats, tile: 1.4 });
    const wE = B.wall(G.x1, G.zN, G.x1, G.zS, { h: H, thick: 0.22, holes: holes(G.doorsE, false), mats, tile: 1.4 });
    B.wall(G.x0, G.zN, G.x1, G.zN, { h: H, thick: 0.22, holes: [{ u: 1.5, w: 1.0, y: 0, h: 2.15 }], mats, tile: 1.4 });      // the north wall, with the last door
    B.wall(G.x1, G.zS, G.x0, G.zS, { h: H, thick: 0.22, holes: [], mats, tile: 1.4 });
    this.doors = {};
    const D = (name, wl, u, hinge, o = {}) => { const [dx, dz] = wl.dir; const d = new Door(game, { name, x: wl.start[0] + dx * u, z: wl.start[1] + dz * u, yaw: wl.yaw, y0: 0, w: 0.95, h: 2.15, hinge, mat: M.paint, creaky: true, onOpen: () => this.phase && this.phase.doorOpened(name), ...o }); this.doors[name] = d; return d; };
    G.doorsW.forEach((z, i) => D('w' + i, wW, G.zS - z, 'L')); G.doorsE.forEach((z, i) => D('e' + i, wE, z - G.zN, 'L'));
    this.finalDoor = D('n', { start: [G.x0, G.zN], dir: [1, 0], yaw: 0 }, 1.5, 'L', { mat: M.wood });
    // wainscot, rail and skirting
    for (const sx of [G.x0 + 0.13, G.x1 - 0.13]) { B.box(0.06, 0.95, G.zS - G.zN - 0.4, M.wood, { pos: [sx, 0.475, (G.zS + G.zN) / 2], tile: 0.8, cast: false }); B.box(0.1, 0.05, G.zS - G.zN - 0.4, M.wood, { pos: [sx, 0.97, (G.zS + G.zN) / 2], tile: 0.8, cast: false }); }
    rug(B, 0, 0, 1.6, 26, { mat: M.red, tile: 0.9 });
    // frames between the doors: photographs with the faces rubbed out
    const photoTex = (i) => canvasTex(128, 160, (c, w, h) => { c.fillStyle = '#b8ad96'; c.fillRect(0, 0, w, h); c.fillStyle = '#8a8070'; c.fillRect(0, h * 0.64, w, h * 0.36); for (let k = 0; k < 2 + (i % 2); k++) { const x = 30 + k * 44; c.fillStyle = '#4a4540'; c.beginPath(); c.ellipse(x, 110, 20, 34, 0, Math.PI, 0); c.fill(); c.fillRect(x - 20, 110, 40, 60); c.fillStyle = '#c4b8a4'; c.beginPath(); c.arc(x, 66, 15, 0, 7); c.fill(); c.fillStyle = 'rgba(190,175,150,.95)'; c.beginPath(); c.arc(x, 66, 17, 0, 7); c.fill(); } });
    let fi = 0; for (const [wx, ry, zs] of [[G.x0 + 0.12, Math.PI / 2, [4, -4, 11, -11]], [G.x1 - 0.12, -Math.PI / 2, [4, -4, 11, -11]]]) for (const z of zs) { const f = new THREE.Group(); f.position.set(wx, 1.6, z); f.rotation.y = ry; game.root.add(f); f.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.03), M.wood), { castShadow: true })); const p = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.34), new THREE.MeshStandardMaterial({ map: photoTex(fi++), roughness: 0.6 })); p.position.z = 0.0175; f.add(p); }
    // ---- light: wall sconces, warm, on a shared dimmer ------------------------------------------------------------------
    for (const z of [-11, -4, 4, 11]) for (const sx of [-1, 1]) {
      const x = sx * (G.x1 - 0.2); const g = new THREE.Group(); g.position.set(x, 1.95, z); game.root.add(g);
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.17, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0xf0e0c0, emissive: 0xffc070, emissiveIntensity: 1.0, side: THREE.DoubleSide })); g.add(sh);
      const lt = game.lights.add({ pos: [x - sx * 0.2, 2.0, z], color: 0xffc47a, intensity: 8, distance: 7, tag: 'loop', decay: 1.7, shadow: false, flicker: { amp: 0.04, speed: 3 } });
      this.dec.lights.push({ lt, mat: sh.material, base: 8 });
    }
    // ---- the party: banner, balloons, streamers, the table at the south end ------------------------------------------------
    this.buildParty(B, game, M);
    // ---- the booth beyond the last door ----------------------------------------------------------------------------------------
    this.buildBooth(B, game, M);
    B.finish();
    game.flashlightAvailable = false; game.hands.hold('R', null); game.hands.setPose('R', 'relaxed');
    game.audio && game.audio.amb.set('loop', { fade: 0.1 });
    this.phase = new LoopPhase(this); this.phase.start(opts);
  }

  buildParty(B, game, M) {
    const G = LOOPG, rng = new RNG(5);
    // the banner across the hall: HAPPY BIRTHDAY MAR
    const bt = canvasTex(1024, 128, (c, w, h) => { c.clearRect(0, 0, w, h); const txt = 'HAPPY BIRTHDAY MAR'; const cols = ['#d94a3a', '#e8b81c', '#4a7ac8', '#4aa86a', '#c85aa0']; c.font = "700 74px 'Special Elite', monospace"; c.textAlign = 'center'; c.textBaseline = 'middle'; let x = 56; for (let i = 0; i < txt.length; i++) { const ch = txt[i]; if (ch === ' ') { x += 30; continue; } c.fillStyle = cols[i % cols.length]; c.fillText(ch, x, 66 + Math.sin(i * 0.7) * 6); x += 52; } });
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.4), new THREE.MeshStandardMaterial({ map: bt, transparent: true, side: THREE.DoubleSide, roughness: 0.8 })); ban.position.set(0, 2.15, 9.0); game.root.add(ban); this.banner = ban;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 3.1, 4), solid(0xd8d0c0)); cord.rotation.z = Math.PI / 2; cord.position.set(0, 2.38, 9.0); game.root.add(cord);
    // balloons: clusters in the corners and floating at the ceiling
    const clusters = [[-1.1, 12.8], [1.1, 12.8], [-1.2, 6], [1.2, 6], [-1.2, -1], [1.2, 1.5], [-1.1, -6.5], [1.1, -9.5], [0, -12.8]];
    for (const [cx, cz] of clusters) {
      const grp = new THREE.Group(); grp.position.set(cx, 0, cz); game.root.add(grp);
      for (let k = 0; k < 5; k++) {
        const r = 0.17 + rng.next() * 0.05; const col = BALLOON[Math.floor(rng.next() * BALLOON.length)]; const y = 2.0 + rng.next() * 0.45; const ox = (rng.next() - 0.5) * 0.5, oz = (rng.next() - 0.5) * 0.5;
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshStandardMaterial({ color: col, roughness: 0.25, metalness: 0.0, emissive: col, emissiveIntensity: 0.08 })); m.scale.y = 1.15; m.position.set(ox, y, oz); m.castShadow = true; grp.add(m);
        const str = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, y - 0.1, 3), solid(0xe0d8c8)); str.position.set(ox * 0.5, (y - 0.1) / 2, oz * 0.5); str.rotation.z = -ox * 0.3; grp.add(str);
        this.dec.balloons.push({ m, str, y0: y, r, ox, oz, ph: rng.next() * 6 });
      }
    }
    // streamers across the ceiling
    for (const z of [12, 5.5, -1.5, -7.5, -12]) { const cols = [0xd94a3a, 0xe8b81c, 0x4a7ac8]; cols.forEach((c, i) => { const s = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.012, 0.045), new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 })); s.position.set(0, 2.62 - i * 0.012, z + (i - 1) * 0.09); s.rotation.set(0, 0, (i - 1) * 0.08); game.root.add(s); this.dec.streamers.push({ m: s, z0: s.rotation.z, y0: s.position.y, ph: z + i }); }); }
    // the table: cake with candles, paper hats, an unopened gift
    const tx = 0, tz = 12.2; B.box(1.3, 0.05, 0.8, M.wood, { pos: [tx, 0.78, tz], tile: 0.8, round: 0.01 }); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.06, 0.76, 0.06, M.wood, { pos: [tx + sx * 0.58, 0.38, tz + sz * 0.34], tile: 0.5, cast: false });
    B.box(1.4, 0.01, 0.9, solid(0xf2ece0, { rough: 0.9 }), { pos: [tx, 0.81, tz], tile: 0.5, cast: false });
    const cake = new THREE.Group(); cake.position.set(0, 0.82, tz); game.root.add(cake);
    for (const [r, h, y, c] of [[0.24, 0.12, 0.06, 0xf0d8b8], [0.18, 0.1, 0.17, 0xf6ecdc]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), solid(c, { rough: 0.7 })); l.position.y = y; l.castShadow = true; cake.add(l); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const cd = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 5), solid(i % 2 ? 0xd94a3a : 0x4a7ac8)); cd.position.set(Math.cos(a) * 0.11, 0.27, Math.sin(a) * 0.11); cake.add(cd);
      const fl = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd27a })); fl.scale.set(0.7, 1.5, 0.7); fl.position.set(cd.position.x, 0.325, cd.position.z); cake.add(fl); this.dec.candles.push(fl); }
    this.candleLight = game.lights.add({ pos: [0, 1.25, tz], color: 0xffb060, intensity: 3.2, distance: 5, tag: 'loop', decay: 1.9, shadow: false, flicker: { amp: 0.2, speed: 8 } });
    for (let i = 0; i < 4; i++) { const hat = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.17, 12), solid(BALLOON[i], { rough: 0.6 })); hat.position.set(-0.5 + i * 0.32, 0.9, tz + 0.2 + (i % 2) * 0.05); hat.rotation.z = (i - 1.5) * 0.12; game.root.add(hat); }
    const gift = new THREE.Group(); gift.position.set(0.85, 0.0, tz - 0.55); gift.rotation.y = 0.4; game.root.add(gift); { const gb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.28), new THREE.MeshStandardMaterial({ color: 0xe9dfc2, roughness: 0.9 })); gb.castShadow = true; gb.position.set(0, 0.13, 0); gift.add(gb); }
    const rb = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.03), solid(0xc8b070)); rb.position.set(0, 0.27, 0); gift.add(rb); this.giftIt = gift;
    B.box(0.5, 0.5, 0.5, M.wood, { pos: [-0.9, 0.25, tz + 0.1], tile: 0.5, cast: false });                  // a stool, a child’s
    this.gift = gift;
  }

  buildBooth(B, game, M) {
    const G = LOOPG; const x0 = -2.0, x1 = 2.0, z0 = -19.5, z1 = G.zN; const H = 2.6;
    B.slab(x0, z0, x1, z1, 0, solid(0x1a1a1c, { rough: 0.9 }), { t: 0.2, tile: 1, walk: true, surf: 'wood' }); B.ceiling(x0, z0, x1, z1, H, M.foam, 0.6);
    const fm = [M.foam, M.foam, M.foam];
    B.wall(x1, z1, x0, z1, { h: H, thick: 0.2, holes: [], mats: fm, tile: 0.6, collide: false });         // (the corridor's north wall is already the south side of the booth)
    B.wall(x0, z1, x0, z0, { h: H, thick: 0.2, holes: [], mats: fm, tile: 0.6 }); B.wall(x0, z0, x1, z0, { h: H, thick: 0.2, holes: [], mats: fm, tile: 0.6 }); B.wall(x1, z0, x1, z1, { h: H, thick: 0.2, holes: [], mats: fm, tile: 0.6 });
    // wedge foam on the walls
    for (let z = z0 + 0.5; z < z1 - 0.4; z += 0.5) for (const sx of [x0 + 0.14, x1 - 0.14]) B.box(0.06, 2.2, 0.4, solid(0x383a3e, { rough: 0.95 }), { pos: [sx, 1.3, z], tile: 0.4, cast: false });
    // desk, mic on a boom with a pop filter, headphones, the phone face down
    B.box(1.6, 0.06, 0.8, M.wood, { pos: [0, 0.78, -17.6], tile: 0.8, round: 0.01 }); for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(0.06, 0.76, 0.06, M.wood, { pos: [sx * 0.75, 0.38, -17.6 + sz * 0.34], tile: 0.5, cast: false });
    const mic = new THREE.Group(); mic.position.set(0, 0.81, -17.4); game.root.add(mic);
    { const m1 = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.75, 8), solid(0x1c1c1e, { rough: 0.4, metal: 0.8 })); m1.position.set(0, 0.37, 0); mic.add(m1); }
    { const m2 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), solid(0x8a8f94, { rough: 0.3, metal: 1 })); m2.position.set(0, 0.78, 0); mic.add(m2); }
    const pop = new THREE.Mesh(new THREE.CircleGeometry(0.08, 24), new THREE.MeshStandardMaterial({ color: 0x111111, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); pop.position.set(0, 0.78, 0.1); mic.add(pop);
    chair(B, 0, -16.4, Math.PI, { mat: M.wood, cushion: M.red });
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.03), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff1a1a, emissiveIntensity: 1.2 })); red.position.set(0, 2.2, z1 - 0.02); red.rotation.y = 0; game.root.add(red); this.recLamp = red;
    const rt = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.06), new THREE.MeshBasicMaterial({ map: canvasTex(256, 48, (c, w, h) => { c.fillStyle = '#220000'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff6a5a'; c.font = "700 30px 'Special Elite', monospace"; c.textAlign = 'center'; c.fillText('RECORDING', w / 2, 34); }) })); rt.position.set(0, 2.2, z1 + 0.0 + 0.0 - 0.0); rt.position.z = z0 + 0.12; rt.rotation.y = 0; game.root.add(rt);
    this.boothLight = game.lights.add({ pos: [0, 2.0, -17.5], color: 0xff6a4a, intensity: 5, distance: 6, tag: 'booth', decay: 1.8, shadow: false, on: false });
    this.boothDesk = game.lights.add({ pos: [0.2, 1.2, -17.6], color: 0xffd9a0, intensity: 3, distance: 4, tag: 'booth', decay: 1.9, shadow: false, on: false });
    // the phone
    const ph = new THREE.Group(); ph.position.set(0.35, 0.81 + 0.006, -17.75); ph.rotation.y = 0.4; game.root.add(ph);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.009, 0.15), solid(0x151517, { rough: 0.3 })); ph.add(body);
    this.phoneGlowMat = new THREE.MeshBasicMaterial({ color: 0x9fe0b4, transparent: true, opacity: 0.0 }); const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), this.phoneGlowMat); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.006; ph.add(glow);
    this.phone = ph;
  }

  dispose() { super.dispose(); this.phase && this.phase.dispose(); }

  update(dt, game) {
    for (const d of Object.values(this.doors)) d.update(dt);
    this.phase && this.phase.update(dt);
    // the party is alive, then it isn't: balloons bob (and sag with the stage), candles flicker
    const t = game.time, st = this.stage;
    for (const b of this.dec.balloons) { const sag = st * 0.22 + (st >= 2 ? 0.1 : 0); const y = b.y0 - sag * (1 + b.ph * 0.05) * (st > 0 ? 1 : 0); b.m.position.y = y + Math.sin(t * 0.8 + b.ph) * 0.02 * (st < 2 ? 1 : 0.3); b.m.scale.set(1 - st * 0.12, 1.15 - st * 0.18, 1 - st * 0.12); b.str.scale.y = Math.max(0.3, (y - 0.1) / (b.y0 - 0.1)); b.str.position.y = (y - 0.1) / 2; }
    for (const s of this.dec.streamers) { s.m.rotation.z = s.z0 + st * 0.07 * Math.sin(s.ph); s.m.position.y = s.y0 - st * 0.05 * (1 + Math.sin(s.ph * 2) * 0.3); }
    for (const c of this.dec.candles) { c.visible = st < 2; c.scale.y = 1.5 + Math.sin(t * 17 + c.position.x * 20) * 0.25; }
    if (this.candleLight) this.candleLight.on = st < 2;
    if (this.banner) { this.banner.rotation.z = st * 0.06; this.banner.position.y = 2.15 - st * 0.1; }
    const dim = [1, 0.8, 0.5, 0.28][Math.min(3, st)];
    for (const l of this.dec.lights) { l.lt.base = l.base * dim * (st >= 1 ? 1 + 0.2 * Math.sin(t * 9 + l.base) * (st === 1 ? 0.5 : 1) : 1); l.mat.emissiveIntensity = 1.0 * dim; }
  }
}
