// Furnishes Halden Lodge. Everything here is environmental storytelling: a house kept exactly as it was.
// `hooks` lets the chapter attach story logic to the interactive pieces.
import * as THREE from 'three';
import { PM, table, chair, stool, sofa, armchair, rug, bookshelf, fireplace, lamp, ceilingLight, wallSwitch, wallFrame, bed, desk, wardrobe, fridge, counter, piano, coatHooks, coat, boots, book, mug, plate, candle, jar, radio, phone, clock, crate, barrel, shelfWall, woodpile, contactShadow } from './props.js';
import { solid, pbr, glass, card } from '../gfx/materials.js';
import { box as boxGeo, rbox, plane } from '../gfx/geo.js';
import { RNG } from '../core/util.js';
import { photoDock } from '../story/draw.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function dressGround(game, B, lodge, hooks) {
  const M = PM(), out = { lamps: {}, objs: {}, switches: {}, interact: {} };
  const I = (def) => game.interact.add(def);

  // ============================ HALL =================================================================================
  {
    const g = game;
    // coat hooks on the hall's west wall (x = -3.0 + face)
    const hk = coatHooks(B, g, -2.9, 4.5, Math.PI / 2, { y: 1.8, count: 4, w: 1.5 });
    out.objs.yellowCoat = coat(B, g, hk[0], Math.PI / 2, { mat: M.yellowCoat, len: 1.0, w: 0.52 });
    coat(B, g, hk[1], Math.PI / 2, { color: 0x4a3a30, len: 1.1, w: 0.58 });          // Dad's plaid-ish wool coat
    coat(B, g, hk[2], Math.PI / 2, { color: 0x3b4a6a, len: 0.62, w: 0.36 });         // a child's blue jacket, never moved
    out.objs.emptyHook = hk[3];
    boots(B, -2.55, 4.15, 0.3, { color: 0x3a2a1a }); boots(B, -2.55, 4.55, 0.5, { color: 0x20242a }); boots(B, -2.55, 4.95, -0.2, { color: 0x6a5a30 });
    B.box(0.4, 0.04, 1.6, M.woodDark, { pos: [-2.7, 0.22, 4.5], tile: 0.5 });   // boot tray
    // small table with a key bowl by the door
    table(B, -1.8, 5.1, { w: 0.9, d: 0.35, h: 0.78, mat: M.woodDark });
    B.cyl(0.11, 0.07, 0.05, M.ceramicBlue, { pos: [-1.8, 0.8, 5.1], seg: 14, tile: 0.2 });
    // clock stopped at 3:12 above the table
    out.objs.hallClock = clock(B, -1.8, 1.7, 5.34, Math.PI, { time: [3, 12] });
    // rug
    rug(B, -0.3, 3.0, 2.4, 3.6, { mat: PM().fabricRed, tile: 0.8 });
    // wall light + switch cluster next to the front door (inside, east of the door)
    out.lamps.hall = ceilingLight(B, g, -0.5, 3.0, 2.7, { tag: 'hall', intensity: 22, distance: 8, shadow: false });
    out.lamps.hallSconce = lamp(B, g, -2.2, 0.9, { y: 0.0, h: 0.0, base: 0.0, tag: 'hall', intensity: 0, on: false }); out.lamps.hallSconce.interact.enabled = false;
    // switches: hall light (centre) and the porch switch (taped)
    out.switches.hall = wallSwitch(B, g, 0.55, 1.25, 5.33, Math.PI, [out.lamps.hall], { label: 'Hall light' });
    // the porch-light switch is taped on, with a note on the tape
    out.switches.porch = wallSwitch(B, g, 0.78, 1.25, 5.33, Math.PI, [], { label: 'Porch light', taped: true });
    out.switches.porch.interact.onUse = () => { hooks.porchSwitch && hooks.porchSwitch(); out.switches.porch.interact.used = false; };
    // note on the front door (inside)
    const nd = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.24), new THREE.MeshStandardMaterial({ map: canvasTex(128, 170, (c, w, h) => { c.fillStyle = '#efe6cf'; c.fillRect(0, 0, w, h); c.fillStyle = '#2b2217'; c.font = '16px Caveat, cursive'; ['If you\'re reading this —', 'don\'t turn the', 'porch light off.'].forEach((l, i) => c.fillText(l, 10, 40 + i * 22)); c.strokeStyle = '#7b6a4a'; c.strokeRect(2, 2, w - 4, h - 4); }), roughness: 0.9 }));
    nd.position.set(-0.3 + 0.0, 1.55, 5.31); nd.rotation.y = Math.PI; nd.rotation.z = 0.03; B.parent.add(nd); out.objs.doorNote = nd;
    out.interact.doorNote = I({ object: nd, radius: 0.2, label: 'Read note', icon: 'eye', maxDist: 2, onUse: () => { game.ui.read('note_door'); out.interact.doorNote.used = false; } });
    // staircase newel lamp-free; hall photos along the stair wall
    for (let i = 0; i < 3; i++) wallFrame(B, 3.44, 1.55 + i * 0.35, 4.6 - i * 0.7, -Math.PI / 2, 0.3, 0.22, canvasTex(160, 120, (c, w, h) => photoDock(c, w, h, { scratched: false })), { depth: 0.02 });
  }

  // ============================ LIVING ROOM ==========================================================================
  {
    const g = game;
    const fp = fireplace(B, g, -7.1, -2.6, 0, { w: 2.0, h: 1.15 }); out.objs.fire = fp;
    // sofa faces the fire (west); Dad's armchair at an angle; coffee table
    sofa(B, -3.6, -2.6, Math.PI / 2, { w: 2.1, mat: PM().fabricRed });
    armchair(B, -4.6, -4.4, Math.PI / 2 + 0.5, { mat: PM().leather });
    armchair(B, -4.9, -0.6, Math.PI / 2 - 0.55, { mat: PM().fabricGreen });
    table(B, -5.4, -2.6, { w: 1.1, d: 0.6, h: 0.42, mat: M.woodDark, yaw: Math.PI / 2 });
    rug(B, -5.2, -2.6, 3.4, 2.6, { mat: PM().fabricRed, tile: 0.9, yaw: Math.PI / 2 });
    // coffee table items: two mugs, a book, Jo's glasses? a board game half-played
    mug(B, -5.3, 0.45, -2.35); mug(B, -5.55, 0.45, -2.9, { color: 0x9a4a3a }); book(B, -5.45, 0.45, -2.6, 0.3, { color: 0x2f4a3a });
    // bookshelves on the south wall flanking the hall opening
    bookshelf(B, -2.5, 0.28, Math.PI, { w: 1.1, h: 2.1, seed: 2 });
    bookshelf(B, 1.0, 0.28, Math.PI, { w: 1.0, h: 2.1, seed: 5 }); // x=1.0 sits right of the opening
    // piano against the east wall (south part), keys facing west
    const pn = piano(B, g, 1.12, -0.75, -Math.PI / 2, { y: 0 }); out.objs.piano = pn;
    // secret drawer below the keyboard (opens when Jo's tune is played)
    { const dr = new THREE.Group(); dr.position.set(1.12 - 0.3, 0.48, -0.75); dr.rotation.y = -Math.PI / 2 + Math.PI / 2 * 0; out.objs.pianoDrawer = dr; dr.add(Object.assign(new THREE.Mesh(boxGeo(0.5, 0.1, 0.05, 0.4), PM().blackWood), { castShadow: true })); const knob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), PM().brass); knob.position.set(0, 0, 0.03); dr.add(knob); dr.rotation.y = -Math.PI / 2; B.parent.add(dr); out.objs.pianoDrawerHome = dr.position.clone(); }
    // lamps
    out.lamps.livingFloor = lamp(B, g, -2.2, -1.1, { floor: true, y: 0, tag: 'living', intensity: 18, distance: 9, shadow: true, on: false });
    out.lamps.livingTable = lamp(B, g, -4.3, -4.9, { y: 0.0, base: 0.5, h: 0.4, tag: 'living', intensity: 10, distance: 7, on: false });
    table(B, -4.3, -4.9, { w: 0.5, d: 0.5, h: 0.5, mat: M.woodDark });
    out.lamps.livingTable.group.position.y = 0.5; out.lamps.livingTable.light.pos.y = 1.1;
    // mantel items: photo frames and a candle
    const mt = (x, z, w, h, seed) => wallFrame(B, -7.0, 1.72, -2.6 + z, Math.PI / 2, w, h, canvasTex(160, 120, (c, W, H) => photoDock(c, W, H, { scratched: false })), { depth: 0.02 });
    mt(0, -0.6, 0.22, 0.17); mt(0, 0.0, 0.3, 0.22); mt(0, 0.62, 0.2, 0.15);
    // wall light switch for the living room at the hall opening
    out.switches.living = wallSwitch(B, g, 0.62, 1.25, 0.4, 0, [out.lamps.livingFloor, out.lamps.livingTable], { label: 'Living room lamps' });
    // wood in the basket, poker
    B.cyl(0.2, 0.2, 0.3, M.woodDark, { pos: [-6.4, 0.15, -4.0], seg: 12 });
    // Jo's guitar leaning on the piano? (ukulele) — a small instrument case
    B.box(0.38, 0.12, 0.6, M.leather, { pos: [0.55, 0.06, -2.2], rot: [0, 0.3, 0], round: 0.03, tile: 0.4, collide: true });
    // the deck door curtain
    for (const wx of [-6.0, -3.5]) B.box(1.9, 2.6, 0.04, PM().fabricGreen, { pos: [wx, 1.55, -5.28], tile: 0.5, cast: false, recv: true });
  }

  // ============================ KITCHEN ==============================================================================
  {
    const g = game;
    // counters along the north wall and the east wall (back door at z=-2.5)
    counter(B, 3.0, -5.15, 2.0, { sink: true }); counter(B, 5.0, -5.15, 2.0, {}); counter(B, 6.55, -5.15, 1.0, {});
    counter(B, 7.15, -4.0, 1.6, { yaw: Math.PI / 2 });
    fridge(B, g, 2.1, -5.0, 0);
    // wood stove / range on the north wall between counters? use an iron stove in the NE corner
    B.box(0.75, 0.85, 0.65, M.iron, { pos: [4.0, 0.43, -5.12], tile: 0.8, collide: true, round: 0.02 });
    for (let i = 0; i < 4; i++) B.cyl(0.11, 0.11, 0.015, M.iron, { pos: [3.82 + (i % 2) * 0.35, 0.86, -5.28 + Math.floor(i / 2) * 0.28], seg: 14 });
    // kettle on the stove (memory trigger)
    const kettle = new THREE.Group(); kettle.position.set(3.88, 0.88, -5.12);
    kettle.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), M.chrome), { castShadow: true })); kettle.children[0].scale.set(1, 0.85, 1); const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 0.12, 8), M.chrome); spout.position.set(0.1, 0.02, 0); spout.rotation.z = -1.0; kettle.add(spout);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 6, 14, Math.PI), M.iron); handle.position.y = 0.09; kettle.add(handle); B.parent.add(kettle); out.objs.kettle = kettle;
    // table set for two; one plate half eaten, the other untouched, pancake "Ohio" shapes
    table(B, 4.6, -2.0, { w: 1.5, d: 0.9, h: 0.76, mat: M.woodPale });
    chair(B, 3.75, -2.0, Math.PI / 2, { mat: M.woodPale }); chair(B, 5.45, -2.0, -Math.PI / 2, { mat: M.woodPale }); chair(B, 4.6, -1.35, Math.PI, { mat: M.woodPale, y: 0 });
    // chair pulled out: replace one by rotating? (chair at north side removed so Jo's seat looks used)
    plate(B, 4.1, 0.78, -2.0); plate(B, 5.1, 0.78, -2.0);
    B.cyl(0.1, 0.1, 0.015, solid(0x8a5a30, { rough: 0.7 }), { pos: [4.1, 0.795, -2.0], seg: 12 });       // eaten pancake
    // an Ohio-shaped pancake: irregular blob
    { const g1 = new THREE.CylinderGeometry(0.1, 0.1, 0.018, 7); const p = g1.attributes.position; for (let i = 0; i < p.count; i++) { p.setX(i, p.getX(i) * (1 + 0.28 * Math.sin(i * 2.3))); p.setZ(i, p.getZ(i) * (1 + 0.25 * Math.cos(i * 1.7))); } B.add(g1, solid(0x9a6a38, { rough: 0.7 }), { pos: [5.1, 0.8, -2.0] }); }
    mug(B, 4.45, 0.76, -1.8); mug(B, 4.9, 0.76, -2.25, { color: 0x4a6a8a });
    B.cyl(0.04, 0.04, 0.14, solid(0x7a3a1a, { rough: 0.3 }), { pos: [4.6, 0.83, -2.0], seg: 10 });   // syrup
    // birthday: banner, balloons, a cake box
    out.objs.banner = new THREE.Group(); const bn = out.objs.banner;
    const letters = 'HAPPY BIRTHDAY MAR'; let lx = 0; const flags = [];
    for (let i = 0; i < letters.length; i++) {
      if (letters[i] === ' ') { lx += 0.12; continue; }
      const t = canvasTex(64, 64, (c, w, h) => { c.fillStyle = ['#d94b3b', '#e8b81c', '#3b7fd9', '#4aa86a'][i % 4]; c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w / 2, h); c.closePath(); c.fill(); c.fillStyle = '#fff6e0'; c.font = 'bold 30px Caveat, cursive'; c.textAlign = 'center'; c.fillText(letters[i], w / 2, 28); });
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 })); f.position.set(lx, -0.02 - 0.25 * Math.sin((lx / 3.6) * Math.PI) * 0.0 - (i > 10 ? 0.05 : 0), 0); f.rotation.z = (i % 3 - 1) * 0.12 + (i > 11 ? 0.5 : 0); f.rotation.x = i > 11 ? -0.2 : 0; bn.add(f); lx += 0.22;
    }
    bn.position.set(2.7, 2.2, -5.2); bn.userData.width = lx; B.parent.add(bn);
    // drooping string
    const stringGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.09, 0), new THREE.Vector3(lx * 0.5, -0.1, 0), new THREE.Vector3(lx, 0.09, 0)]), 20, 0.004, 4); bn.add(new THREE.Mesh(stringGeo, solid(0xd8cfa8)));
    for (let i = 0; i < 5; i++) { const col = [0xd94b3b, 0xe8b81c, 0x3b7fd9, 0x4aa86a, 0xc060c0][i]; const bl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), solid(col, { rough: 0.3 })); bl.scale.set(0.8, 0.5, 0.8); bl.position.set(3.3 + i * 0.5 + (i % 2) * 0.2, 0.05, -1.0 + (i % 3) * 0.4); bl.rotation.y = i; bl.castShadow = true; B.parent.add(bl); }  // deflated, on the floor
    // the unopened gift on the counter next to the window
    const gift = new THREE.Group(); gift.position.set(6.1, 0.9, -5.15);
    gift.add(Object.assign(new THREE.Mesh(rbox(0.32, 0.14, 0.2, 0.008, 0.3), new THREE.MeshStandardMaterial({ map: canvasTex(256, 160, (c, w, h) => { c.fillStyle = '#efe4c8'; c.fillRect(0, 0, w, h); c.fillStyle = '#7b6a4a'; for (let k = 0; k < 6; k++) { c.strokeStyle = '#8b7a58'; c.lineWidth = 1.5; c.strokeRect(6 + (k % 3) * 80, 8 + Math.floor(k / 3) * 72, 70, 62); c.fillStyle = '#d8b050'; c.beginPath(); c.arc(40 + (k % 3) * 80, 40 + Math.floor(k / 3) * 72, 12, 0, 7); c.fill(); } }), roughness: 0.85 })), { castShadow: true }));
    for (const rot of [0, Math.PI / 2]) { const tw = new THREE.Mesh(new THREE.BoxGeometry(rot ? 0.008 : 0.34, 0.145, rot ? 0.22 : 0.008), solid(0xb89a58, { rough: 0.9 })); tw.position.y = 0.0; gift.add(tw); }
    B.parent.add(gift); out.objs.gift = gift;
    // cookie jar by the sink
    const cj = new THREE.Group(); cj.position.set(2.4, 0.88, -5.2);
    const cjBody = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.22, 16), M.ceramicBlue); cjBody.position.y = 0.11; cjBody.castShadow = true; cj.add(cjBody);
    const cjLid = new THREE.Group(); cjLid.position.y = 0.22; const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 16), M.ceramic); lid.position.y = 0.015; const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), M.ceramic); knob.position.y = 0.05; cjLid.add(lid, knob); cj.add(cjLid);
    B.parent.add(cj); out.objs.cookieJar = cj; out.objs.cookieJarLid = cjLid;
    // note from Jo on the fridge
    const noteMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), new THREE.MeshStandardMaterial({ map: canvasTex(150, 195, (c, w, h) => { c.fillStyle = '#f4ecd2'; c.fillRect(0, 0, w, h); c.fillStyle = '#2b2217'; c.font = '17px Caveat, cursive'; ['Mar —', 'Happy (early)', 'birthday!! DO NOT', 'open it till', 'tomorrow...'].forEach((l, i) => c.fillText(l, 12, 34 + i * 24)); }), roughness: 0.9 }));
    noteMesh.position.set(2.1, 1.4, -4.64); B.parent.add(noteMesh); out.objs.fridgeNote = noteMesh;
    out.interact.fridgeNote = I({ object: noteMesh, radius: 0.22, label: 'Read note', icon: 'eye', maxDist: 2.1, onUse: () => { game.ui.read('note_jo'); out.interact.fridgeNote.used = false; hooks.readJoNote && hooks.readJoNote(); } });
    // lights: pendant over the table, under-cabinet glow
    out.lamps.kitchen = ceilingLight(B, g, 4.6, -2.0, 2.7, { tag: 'kitchen', intensity: 26, distance: 8.5, shadow: true });
    out.switches.kitchen = wallSwitch(B, g, 1.62, 1.25, -1.1, Math.PI / 2, [out.lamps.kitchen], { label: 'Kitchen light' });
    // a window curtain & flour tins
    B.box(0.4, 0.3, 0.3, M.woodPale, { pos: [6.55, 1.5, -5.3], tile: 0.5 });
    // calendar by the fridge, stuck on February with the 12th circled
    out.objs.calendar = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.38), new THREE.MeshStandardMaterial({ map: canvasTex(224, 300, (c, w, h) => { c.fillStyle = '#f4efe0'; c.fillRect(0, 0, w, h); c.fillStyle = '#7a2a22'; c.fillRect(0, 0, w, 40); c.fillStyle = '#fff'; c.font = '600 28px Cormorant, serif'; c.fillText('FEBRUARY', 54, 30); c.fillStyle = '#333'; c.font = '16px Cormorant, serif'; for (let d = 1; d <= 28; d++) { const x = 12 + ((d + 4) % 7) * 29, y = 70 + Math.floor((d + 4) / 7) * 40; c.fillText(String(d), x, y); if (d === 12) { c.strokeStyle = '#c0392b'; c.lineWidth = 3; c.beginPath(); c.arc(x + 6, y - 5, 14, 0, 7); c.stroke(); } if (d === 11) { c.strokeStyle = '#2b4a8a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 18, y - 12); c.stroke(); } } c.fillStyle = '#c0392b'; c.font = '20px Caveat, cursive'; c.fillText('MAR!!', 120, 160); }), roughness: 0.9 }));
    out.objs.calendar.position.set(2.62, 1.55, -5.34); B.parent.add(out.objs.calendar);
    // door of the back exit: coats & a snow shovel by the door
    B.box(0.04, 1.4, 0.04, M.woodDark, { pos: [7.25, 0.7, -1.1], tile: 0.3, cast: false });
  }

  // ============================ STUDY ================================================================================
  {
    const g = game;
    desk(B, -6.3, 3.0, Math.PI / 2, { w: 1.5, d: 0.7 });
    chair(B, -5.5, 3.0, -Math.PI / 2, { mat: M.woodDark, cushion: M.leather });
    // field log on the desk (interactive), desk lamp
    out.lamps.study = lamp(B, g, -6.55, 2.4, { y: 0.75, base: 0.35, h: 0.3, tag: 'study', intensity: 12, distance: 7, shadow: true, on: false });
    const log = new THREE.Mesh(rbox(0.22, 0.03, 0.3, 0.004, 0.3), solid(0x3a2a20, { rough: 0.6 })); log.position.set(-6.2, 0.78, 3.4); log.rotation.y = 0.4; B.parent.add(log); out.objs.fieldLog = log;
    out.interact.fieldLog = I({ object: log, radius: 0.22, label: 'Read the log', icon: 'eye', maxDist: 2.0, onUse: () => { game.ui.read('field_log'); out.interact.fieldLog.used = false; hooks.readFieldLog && hooks.readFieldLog(); } });
    // landline phone on the desk
    out.objs.phone = phone(B, -6.3, 0.75, 3.7, Math.PI / 2 + 0.2);
    // reel-to-reel on a shelf unit + radio
    B.box(1.4, 0.8, 0.5, M.woodDark, { pos: [-7.2, 0.4, 4.7], tile: 0.7, collide: true });
    out.objs.reel = new THREE.Group(); out.objs.reel.position.set(-7.2, 0.8, 4.7); { const r = out.objs.reel; r.add(Object.assign(new THREE.Mesh(rbox(0.5, 0.2, 0.34, 0.015, 0.4), M.iron), { castShadow: true })); for (const sx of [-0.12, 0.12]) { const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 20), M.chrome); reel.rotation.x = Math.PI / 2; reel.position.set(sx, 0.14, 0.12); r.add(reel); } B.parent.add(r); }
    out.objs.radio = radio(B, g, -5.3, 1.38, 5.2, Math.PI);
    B.box(1.1, 0.04, 0.3, M.woodDark, { pos: [-5.3, 1.35, 5.28], tile: 0.5 });
    // big lake map on the west wall with Jo's pencil route
    const mapTex = canvasTex(512, 384, (c, w, h) => {
      c.fillStyle = '#e6dcc0'; c.fillRect(0, 0, w, h); c.strokeStyle = '#a89870'; c.lineWidth = 1; for (let i = 0; i < 24; i++) { c.beginPath(); c.moveTo(0, i * 16); c.lineTo(w, i * 16); c.stroke(); c.beginPath(); c.moveTo(i * 22, 0); c.lineTo(i * 22, h); c.stroke(); }
      c.fillStyle = '#9ec0d4'; c.beginPath(); c.ellipse(w * 0.5, h * 0.36, w * 0.42, h * 0.3, 0, 0, 7); c.fill(); c.strokeStyle = '#4a6a80'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#6b5a3a'; c.fillRect(w * 0.48, h * 0.78, 14, 10); c.fillStyle = '#222'; c.font = '14px Elite, monospace'; c.fillText('HALDEN LAKE', w * 0.4, h * 0.34); c.fillText('LODGE', w * 0.42, h * 0.92); c.fillText('BOATHOUSE', w * 0.78, h * 0.6);
      c.strokeStyle = '#2b4a8a'; c.lineWidth = 3; c.setLineDash([6, 5]); c.beginPath(); c.moveTo(w * 0.49, h * 0.77); c.lineTo(w * 0.62, h * 0.7); c.lineTo(w * 0.8, h * 0.62); c.stroke(); c.setLineDash([]);
      c.strokeStyle = '#b3261e'; c.lineWidth = 3; c.beginPath(); c.arc(w * 0.5, h * 0.15, 20, 0, 7); c.stroke(); c.fillStyle = '#b3261e'; c.font = '600 20px Caveat, cursive'; c.fillText('north bay — J.', w * 0.52, h * 0.1); c.fillText('3 AM (!!)', w * 0.52, h * 0.2);
    });
    const mp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.9), new THREE.MeshStandardMaterial({ map: mapTex, roughness: 0.85 })); mp.position.set(-7.33, 1.55, 3.5); mp.rotation.y = Math.PI / 2; B.parent.add(mp); out.objs.map = mp;
    out.interact.map = I({ object: mp, radius: 0.6, label: 'Study the map', icon: 'eye', maxDist: 2.4, onUse: () => { out.interact.map.used = false; hooks.readMap && hooks.readMap(); } });
    // bookshelves
    bookshelf(B, -4.0, 4.0, 0, { w: 1.0, h: 2.1, seed: 8 }); // against hall wall? x=-3.15..; face -x? yaw 0 faces +z; use yaw pi/2 to face west
    // polaroids pinned on the corkboard above the desk
    const polas = [];
    for (let i = 0; i < 4; i++) { const t = canvasTex(110, 120, (c, w, h) => { c.fillStyle = '#ece6d6'; c.fillRect(0, 0, w, h); const g2 = c.createLinearGradient(0, 8, 0, 90); g2.addColorStop(0, '#9fb7cf'); g2.addColorStop(1, '#e9eef3'); c.fillStyle = g2; c.fillRect(8, 8, w - 16, 84); c.fillStyle = '#3a4a5a'; c.beginPath(); c.moveTo(8, 70); c.lineTo(40, 40 + i * 4); c.lineTo(70, 66); c.lineTo(w - 8, 54); c.lineTo(w - 8, 92); c.lineTo(8, 92); c.fill(); c.fillStyle = '#e8b81c'; c.fillRect(50 + i * 6, 52, 10, 22); c.fillStyle = '#c7a'; c.font = '13px Caveat, cursive'; c.fillStyle = '#333'; c.fillText(['Feb 3 · 41cm', 'Feb 9 · 37cm', 'Feb 14 · 44cm', 'Feb 11 · ??'][i], 10, 110); });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.185), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 })); pl.position.set(-7.34, 1.65 + (i % 2) * 0.12, 2.2 + i * 0.22); pl.rotation.y = Math.PI / 2; pl.rotation.z = (i - 1.5) * 0.06; B.parent.add(pl); polas.push(pl); }
    out.objs.polaroids = polas;
    // Dad's tin on a high shelf (4-dial lock): interactive -> puzzle in the chapter
    shelfWall(B, -7.2, 1.9, 4.2, Math.PI / 2, 1.0, 0.25);
    const tin = new THREE.Group(); tin.position.set(-7.18, 2.03, 4.2);
    tin.add(Object.assign(new THREE.Mesh(rbox(0.3, 0.18, 0.2, 0.01, 0.3), solid(0x6a2a22, { rough: 0.4, metal: 0.5 })), { castShadow: true }));
    const lockPlate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.01), M.brass); lockPlate.position.set(0.0, 0.03, 0.105); tin.add(lockPlate);
    B.parent.add(tin); out.objs.tin = tin;
    out.interact.tin = I({ object: tin, radius: 0.3, label: 'Dad\'s tin', icon: 'hand', maxDist: 2.1, onUse: () => { out.interact.tin.used = false; hooks.tin && hooks.tin(); } });
    // the stuffed owl on the bookcase
    // study rug and window
    rug(B, -6.0, 3.2, 2.4, 3.0, { mat: PM().fabricGreen, tile: 0.9, yaw: 0.0 });
    out.switches.study = wallSwitch(B, g, -3.07, 1.25, 1.2, Math.PI / 2, [out.lamps.study], { label: 'Desk lamp' });
  }

  // ============================ MUDROOM ==============================================================================
  {
    const g = game;
    B.box(1.6, 0.08, 0.4, M.woodDark, { pos: [5.6, 0.5, 5.2], tile: 0.5 }); for (const sx of [-0.7, 0.7]) B.box(0.06, 0.5, 0.36, M.woodDark, { pos: [5.6 + sx, 0.25, 5.2], tile: 0.5 });
    boots(B, 4.6, 5.05, 0.2); boots(B, 6.0, 5.1, -0.3, { color: 0x1c1f24 });
    const hk = coatHooks(B, g, 7.35, 3.3, -Math.PI / 2, { y: 1.8, count: 4, w: 1.6 });
    coat(B, g, hk[0], -Math.PI / 2, { color: 0x6a3a22, len: 1.0 }); coat(B, g, hk[2], -Math.PI / 2, { color: 0x3a4a5a, len: 0.9 });
    // breaker box on the wall (interactive)
    const brk = new THREE.Group(); brk.position.set(4.0, 1.5, 0.62); brk.add(Object.assign(new THREE.Mesh(boxGeo(0.34, 0.5, 0.1, 0.3), solid(0x8a8f92, { rough: 0.5, metal: 0.6 })), { castShadow: true }));
    const door = new THREE.Mesh(boxGeo(0.3, 0.46, 0.012, 0.3), solid(0x9a9fa2, { rough: 0.45, metal: 0.6 })); door.position.z = 0.055; brk.add(door);
    B.parent.add(brk); out.objs.breaker = brk;
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.18), new THREE.MeshStandardMaterial({ map: canvasTex(100, 128, (c, w, h) => { c.fillStyle = '#f2ead0'; c.fillRect(0, 0, w, h); c.fillStyle = '#2b2217'; c.font = '700 14px Caveat, cursive'; ['KEEP THE', 'LIGHTS ON.'].forEach((l, i) => c.fillText(l, 12, 30 + i * 18)); c.font = '12px Caveat, cursive'; c.fillText('It doesn\'t come', 12, 78); c.fillText('where it\'s lit.', 12, 92); }), roughness: 0.9 })); paper.position.set(4.0, 1.5, 0.62 + 0.065); paper.rotation.z = 0.05; B.parent.add(paper); out.objs.breakerNote = paper;
    out.interact.breaker = I({ object: paper, radius: 0.22, label: 'Read note', icon: 'eye', maxDist: 2.2, onUse: () => { game.ui.read('note_breaker'); out.interact.breaker.used = false; hooks.readBreaker && hooks.readBreaker(); } });
    // tools, shovel, broom
    B.box(0.03, 1.5, 0.03, M.woodDark, { pos: [7.2, 0.75, 1.0], rot: [0, 0, 0.08], tile: 0.3 }); B.box(0.25, 0.02, 0.3, M.iron, { pos: [7.15, 0.04, 1.0], tile: 0.3 });
    shelfWall(B, 5.6, 1.5, 0.7, 0, 1.6, 0.3); shelfWall(B, 5.6, 1.1, 0.7, 0, 1.6, 0.3);
    jar(B, 5.1, 1.5, 0.7); jar(B, 5.4, 1.5, 0.7, { color: 0xd8c8a0 }); crate(B, 6.4, 1.6, { s: 0.6 }); crate(B, 6.4, 1.6, { y: 0.6, s: 0.4 });
    out.lamps.mud = ceilingLight(B, g, 5.5, 3.0, 2.7, { tag: 'mud', intensity: 16, distance: 6.5, shadow: false, pendant: false });
    out.switches.mud = wallSwitch(B, g, 3.57, 1.25, 1.6, -Math.PI / 2, [out.lamps.mud], { label: 'Mudroom light' });
    // trapdoor to the cellar in the floor
    const trap = new THREE.Group(); trap.position.set(6.2, 0.02, 2.6); trap.add(Object.assign(new THREE.Mesh(boxGeo(0.95, 0.06, 0.95, 0.5), M.woodDark), { castShadow: false })); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 6, 14), M.iron); ring.rotation.x = Math.PI / 2; ring.position.set(0.0, 0.05, 0.3); trap.add(ring);
    // chain & padlock
    const chain = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 6, 14), M.iron); chain.rotation.x = Math.PI / 2; chain.position.set(0, 0.06, -0.3); trap.add(chain);
    B.parent.add(trap); out.objs.trapdoor = trap;
    out.interact.trap = I({ object: trap, radius: 0.5, label: 'Cellar hatch', icon: 'hand', maxDist: 2.4, onUse: () => { out.interact.trap.used = false; hooks.trapdoor && hooks.trapdoor(); } });
  }
  return out;
}

export function dressUpper(game, B, lodge, hooks) {
  const M = PM(), out = { lamps: {}, objs: {}, switches: {}, interact: {} }; const g = game; const I = (def) => game.interact.add(def); const y = 2.85;
  // ============================ UPSTAIRS HALL ===========================================================================
  rug(B, 2.25, 0.25, 9.4, 1.0, { mat: PM().fabricRed, y: y + 0.012, tile: 0.8 });
  out.lamps.upHall = ceilingLight(B, g, 3.0, 0.25, y + 2.5, { tag: 'uphall', intensity: 16, distance: 7, shadow: false, pendant: false });
  out.switches.upHall = wallSwitch(B, g, 1.45, y + 1.25, 0.9, Math.PI, [out.lamps.upHall], { label: 'Hall light' });
  for (let i = 0; i < 4; i++) wallFrame(B, 4.0 + i * 0.7, y + 1.55, 0.93, Math.PI, 0.3, 0.22, canvasTex(160, 120, (c, w, h) => photoDock(c, w, h, { scratched: false })), { depth: 0.02 });
  // standing mirror at the far east end of the corridor? (hall mirror scare) -> built in chapter
  // ============================ JO'S ROOM ===============================================================================
  {
    bed(B, -1.4, -4.2, 0, { w: 1.0, l: 2.0, y, sheet: PM().fabricGreen, frame: M.woodPale });
    desk(B, -2.3, -2.0, Math.PI / 2, { w: 1.4, d: 0.7, y, mat: M.woodPale }); chair(B, -1.5, -2.0, -Math.PI / 2, { y, mat: M.woodPale });
    out.lamps.joDesk = lamp(B, g, -2.6, -2.5, { y: y + 0.75, base: 0.32, h: 0.3, tag: 'jo', intensity: 12, distance: 6, shadow: true, on: false });
    // comics stack and drawing board on the desk
    const stack = new THREE.Mesh(rbox(0.3, 0.06, 0.22, 0.004, 0.3), solid(0xf0e4c0, { rough: 0.8 })); stack.position.set(-2.3, y + 0.78, -1.5); B.parent.add(stack); out.objs.comicStack = stack;
    out.interact.comics = I({ object: stack, radius: 0.25, label: 'Captain Owl', icon: 'eye', maxDist: 2.0, onUse: () => { out.interact.comics.used = false; hooks.readComics && hooks.readComics(); } });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.32), new THREE.MeshStandardMaterial({ roughness: 0.9, color: 0xf1e7cf })); board.rotation.x = -Math.PI / 2 + 0.25; board.position.set(-2.3, y + 0.8, -2.4); B.parent.add(board); out.objs.board = board;
    // pinned to-do list over the desk
    const todo = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.38), new THREE.MeshStandardMaterial({ map: canvasTex(200, 250, (c, w, h) => { c.fillStyle = '#f1e8c8'; c.fillRect(0, 0, w, h); c.fillStyle = '#2b2217'; c.font = '600 20px Caveat, cursive'; c.fillText('THINGS TO DO', 20, 30); c.font = '17px Caveat, cursive'; ['☐ finish the song', '☐ find the last note', '☐ hydrophone — wrap it', '☐ ask Mar to stay', '☒ tell Mar the', '    comics are good'].forEach((l, i) => c.fillText(l, 16, 62 + i * 30)); }), roughness: 0.9 })); todo.position.set(-2.88, y + 1.55, -2.0); todo.rotation.y = Math.PI / 2; B.parent.add(todo); out.objs.todo = todo;
    out.interact.todo = I({ object: todo, radius: 0.25, label: 'Read', icon: 'eye', maxDist: 2.2, onUse: () => { game.ui.read('note_jo_room'); out.interact.todo.used = false; } });
    // owl figurines on a shelf, a poster
    shelfWall(B, -2.9, y + 1.5, -3.9, Math.PI / 2, 1.3, 0.2); shelfWall(B, -2.9, y + 1.05, -3.9, Math.PI / 2, 1.3, 0.2);
    for (let i = 0; i < 7; i++) { const o = new THREE.Mesh(new THREE.CapsuleGeometry(0.03 + (i % 3) * 0.006, 0.06 + (i % 4) * 0.01, 4, 8), solid([0x9a6b3c, 0xb98a50, 0x7a5a30, 0xd8c8a0][i % 4], { rough: 0.6 })); o.position.set(-2.88, y + 1.55 + 0.05, -3.9 + (i - 3) * 0.17); o.castShadow = true; B.parent.add(o); }
    // wardrobe (hide spot) against the south wall of Jo's room? corridor wall is z=-0.5: place on the west wall x=-2.9? use the east partition x=1.5: at x=1.15
    const wd = wardrobe(B, g, 0.95, -3.0, -Math.PI / 2, { w: 1.3, h: 2.05, d: 0.62, y }); out.objs.wardrobe = wd;
    // wardrobe doors (two) with slatted front: built as a group the chapter can open
    const wg = new THREE.Group(); wg.position.set(0.95 - 0.31, y, -3.0); wg.rotation.y = -Math.PI / 2 * 1; out.objs.wardrobeDoors = wg; B.parent.add(wg);
    const wm = M.woodDark;
    const doorL = new THREE.Group(); doorL.position.set(-0.65, 0, 0); const doorR = new THREE.Group(); doorR.position.set(0.65, 0, 0); wg.add(doorL, doorR);
    for (const [dgrp, sgn] of [[doorL, 1], [doorR, -1]]) {
      const part = (w, h, d, px, py, pz, rx = 0) => { const m = new THREE.Mesh(boxGeo(w, h, d, 0.5), wm); m.position.set(sgn * px, py, pz); m.rotation.x = rx; m.castShadow = true; dgrp.add(m); return m; };
      for (const sx of [0.025, 0.615]) part(0.05, 2.0, 0.03, sx, 1.0, 0.015);                 // stiles
      for (const ry of [0.03, 0.99, 1.97]) part(0.64, 0.05, 0.03, 0.32, ry, 0.015);            // rails
      part(0.54, 0.9, 0.02, 0.32, 0.5, 0.012);                                                   // solid lower panel
      for (let yy = 1.06; yy < 1.94; yy += 0.056) part(0.55, 0.03, 0.012, 0.32, yy, 0.022, 0.5);   // louvre slats: real gaps to look through
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), M.brass); knob.position.set(sgn * 0.58, 1.0, 0.045); dgrp.add(knob);
    }
    out.objs.wardrobeInner = new THREE.Group(); out.objs.wardrobeInner.position.copy(wg.position);
    // clothes inside: a few shirts hanging
    for (let i = 0; i < 5; i++) { const sh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.75, 0.4), solid([0x3a5a7a, 0x8a3a2a, 0x5a6a4a, 0xc8b070, 0x4a4a52][i], { rough: 0.9 })); sh.position.set(0.95 + 0.0, y + 1.3, -3.0 - 0.45 + i * 0.22); B.parent.add(sh); }
    // a hanging rod
    B.cyl(0.012, 0.012, 1.2, M.chrome, { pos: [0.95, y + 1.78, -3.0], rot: [Math.PI / 2, 0, 0] });
    // tally marks on the inside of the doorframe handled in chapter (mesh with note)
    const tal = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.4), new THREE.MeshStandardMaterial({ map: canvasTex(100, 180, (c, w, h) => { c.fillStyle = 'rgba(0,0,0,0)'; c.clearRect(0, 0, w, h); c.strokeStyle = '#3a3026'; c.lineWidth = 3; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(20, 20 + i * 24); c.lineTo(70, 20 + i * 24); c.stroke(); } c.fillStyle = '#3a3026'; c.font = '13px Caveat, cursive'; c.fillText('Feb 11', 30, 14); }), transparent: true, roughness: 0.9 }));
    tal.position.set(-2.04, y + 1.45, -0.58); tal.rotation.y = 0; B.parent.add(tal); out.objs.tally = tal;
    out.interact.tally = I({ object: tal, radius: 0.22, label: 'The marks', icon: 'eye', maxDist: 2.0, onUse: () => { game.ui.read('tally'); out.interact.tally.used = false; hooks.tally && hooks.tally(); } });
    rug(B, -1.5, -2.8, 1.8, 2.6, { mat: PM().fabricGreen, y: y + 0.012, tile: 0.8 });
    out.lamps.jo = ceilingLight(B, g, -0.8, -2.6, y + 2.5, { tag: 'jo', intensity: 18, distance: 7, shadow: false, pendant: false });
    out.switches.jo = wallSwitch(B, g, -2.15, y + 1.25, -0.57, Math.PI, [out.lamps.jo, out.lamps.joDesk], { label: 'Light' });
  }
  // ============================ MARA'S ROOM =============================================================================
  {
    bed(B, 6.4, -3.5, Math.PI / 2, { w: 0.95, l: 2.0, y, sheet: PM().fabricRed, frame: M.woodPale });
    desk(B, 3.0, -4.4, 0, { w: 1.3, d: 0.65, y, mat: M.woodPale }); chair(B, 3.0, -3.6, Math.PI, { y, mat: M.woodPale });
    out.lamps.maraDesk = lamp(B, g, 2.45, -4.6, { y: y + 0.75, base: 0.32, h: 0.3, tag: 'mara', intensity: 12, distance: 6, shadow: true, on: false });
    // dresser with keepsake box & the face-down scratched photo
    B.box(1.2, 0.85, 0.5, M.woodPale, { pos: [5.0, y + 0.43, -5.2], tile: 0.7, collide: true });
    const keep = new THREE.Group(); keep.position.set(4.7, y + 0.9, -5.2); keep.add(Object.assign(new THREE.Mesh(rbox(0.26, 0.1, 0.18, 0.008, 0.3), solid(0x7a4a2a, { rough: 0.5 })), { castShadow: true })); B.parent.add(keep); out.objs.keepsake = keep;
    out.interact.keepsake = I({ object: keep, radius: 0.22, label: 'Open keepsake box', icon: 'hand', maxDist: 2.0, onUse: () => { out.interact.keepsake.used = false; hooks.keepsake && hooks.keepsake(); } });
    const frameDown = new THREE.Group(); frameDown.position.set(5.3, y + 0.88, -5.22); frameDown.rotation.set(-Math.PI / 2 + 0.05, 0, 0.2); frameDown.add(Object.assign(new THREE.Mesh(boxGeo(0.22, 0.17, 0.02, 0.3), M.blackWood), { castShadow: true })); B.parent.add(frameDown); out.objs.framedPhoto = frameDown;
    out.interact.photo = I({ object: frameDown, radius: 0.2, label: 'Turn the frame over', icon: 'hand', maxDist: 2.0, onUse: () => { game.ui.read('photo_scratched'); out.interact.photo.used = false; hooks.photoScratched && hooks.photoScratched(); } });
    // half-packed suitcase, always leaving
    B.box(0.85, 0.2, 0.55, solid(0x3a3a40, { rough: 0.6 }), { pos: [4.0, y + 0.1, -2.0], rot: [0, 0.4, 0], round: 0.03, tile: 0.5, collide: true });
    B.box(0.8, 0.05, 0.5, solid(0x4a6a8a, { rough: 0.8 }), { pos: [4.0, y + 0.22, -2.0], rot: [0, 0.4, 0.0], tile: 0.4 });
    // old cassette recorder + headphones on the desk
    B.box(0.2, 0.05, 0.14, M.iron, { pos: [3.4, y + 0.78, -4.5], rot: [0, 0.3, 0], round: 0.01, tile: 0.4 });
    rug(B, 5.0, -2.2, 2.4, 1.6, { mat: PM().fabricGreen, y: y + 0.012, tile: 0.8 });
    out.lamps.mara = ceilingLight(B, g, 4.5, -3.0, y + 2.5, { tag: 'mara', intensity: 18, distance: 7, shadow: false, pendant: false });
    out.switches.mara = wallSwitch(B, g, 1.57, y + 1.25, -1.0, Math.PI / 2, [out.lamps.mara, out.lamps.maraDesk], { label: 'Light' });
    // ribbons: a wall of ribbons from audio competitions
  }
  // ============================ BATHROOM ================================================================================
  {
    const wm = pbr('tile', { key: 'bathwall', tint: 0xd8e0dc });
    B.box(1.7, 0.55, 0.78, M.whiteEnamel, { pos: [6.5, y + 0.4, 4.9], round: 0.08, tile: 0.5, collide: true }); // tub
    B.box(0.55, 0.12, 0.45, M.whiteEnamel, { pos: [4.2, y + 0.82, 1.35], round: 0.04, tile: 0.5 }); B.box(0.1, 0.8, 0.1, M.whiteEnamel, { pos: [4.2, y + 0.4, 1.35], tile: 0.5 }); B.col.addBox(4.2, 1.35, 0.6, 0.5, y, y + 0.9, 0, {});
    B.box(0.4, 0.5, 0.65, M.whiteEnamel, { pos: [4.0, y + 0.25, 4.5], round: 0.05, tile: 0.5, collide: true });  // toilet
    // wall mirror cabinet (the reflection scare happens here)
    const cab = new THREE.Group(); cab.position.set(4.2, y + 1.5, 1.065); B.parent.add(cab); out.objs.mirrorCab = cab;
    cab.add(Object.assign(new THREE.Mesh(boxGeo(0.62, 0.8, 0.12, 0.4), M.whiteEnamel), { castShadow: false }));
    // toothbrushes: two, one still damp-looking, one dry & dusty
    B.cyl(0.03, 0.03, 0.1, M.ceramic, { pos: [3.95, y + 0.9, 1.3], tile: 0.2 }); B.box(0.01, 0.17, 0.01, solid(0x3a6aa8), { pos: [3.95, y + 1.0, 1.3], rot: [0, 0, 0.15], tile: 0.1 }); B.box(0.01, 0.17, 0.01, solid(0xe8c81c), { pos: [3.99, y + 1.0, 1.3], rot: [0, 0, -0.2], tile: 0.1 });
    out.lamps.bath = ceilingLight(B, g, 5.0, 3.0, y + 2.5, { tag: 'bath', intensity: 14, distance: 6, shadow: false, pendant: false });
    out.switches.bath = wallSwitch(B, g, 4.4, y + 1.25, 1.07, Math.PI, [out.lamps.bath], { label: 'Bathroom light' });
  }
  return out;
}
