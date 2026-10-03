// Halden Lake (winter): the continuous outdoor world + lodge used by the Prologue, Lodge, Search, Lake and Goodbye phases.
import * as THREE from 'three';
import { Chapter } from './chapter.js';
import { HaldenTerrain, LAYOUT } from '../world/halden.js';
import { TerrainStreamer } from '../world/terrainMesh.js';
import { Forest } from '../world/trees.js';
import { ParticleField, BreathVapour } from '../gfx/particles.js';
import { buildLodge, roomAt, ROOMS, LODGE } from '../world/lodge.js';
import { dressGround, dressUpper } from '../world/lodgeRooms.js';
import { buildCar, buildMailbox, buildRoadSign, buildLampPost, buildRibbon, buildSearchCamp, buildBoathouse, buildDock, buildTruck } from '../world/exterior.js';
import { buildPorchLight } from '../world/porch.js';
import { Lake } from '../world/lake.js';
import { buildIsland } from '../world/island.js';
import { setSeason } from '../gfx/materials.js';
import { Searcher } from '../chars/searcher.js';
import { PM, woodpile } from '../world/props.js';
import { Builder } from '../world/builder.js';
import { clamp, damp, lerp, RNG } from '../core/util.js';
import { ProloguePhase } from '../story/prologue.js';
import { LodgePhase } from '../story/lodgeStory.js';
import { SearchPhase } from '../story/search.js';
import { LakePhase } from '../story/lakeStory.js';
import { FinalPhase } from '../story/finale.js';
import { TitlePhase } from '../story/title.js';
import { SummerPhase } from '../story/summer.js';

const PHASES = { title: TitlePhase, prologue: ProloguePhase, lodge: LodgePhase, search: SearchPhase, summer: SummerPhase, lake: LakePhase, final: FinalPhase };

export class Halden extends Chapter {
  constructor(phase = 'prologue', opts = {}) { super('halden', 'Halden Lake'); this.startPhase = phase; this.opts = opts; this.phaseObj = null; this.phaseName = ''; }

  async build(game, opts = {}) {
    await super.build(game, opts);
    const summer = this.summer = this.opts.season === 'summer'; setSeason(summer ? 'summer' : 'winter');
    const terrain = this.terrain = new HaldenTerrain(summer ? 'summer' : 'winter');
    const col = game.collision;
    col.terrain = (x, z) => (terrain.lakeDist(x, z) < 0.965 ? LAYOUT.iceY : terrain.height(x, z));
    col.terrainSurface = (x, z) => terrain.surface(x, z);
    col.bounds = { minx: -300, maxx: 300, minz: -560, maxz: 330 };
    col.walkable = (x, z) => this.walkable(x, z);
    this.zones = { lodge: true, road: true, trail: false, boathouse: false, lake: false, deck: false };

    // ---- sky / atmosphere
    game.setSky(summer ? 'summerEvening' : (this.startPhase === 'final' ? 'dawn' : (this.startPhase === 'lake' ? 'auroraNight' : 'nightSnow')));
    game.setGrade(summer ? 'summer' : (this.startPhase === 'final' ? 'dawn' : 'nightSnow'), true);

    // ---- terrain & forest
    this.streamer = new TerrainStreamer(terrain, game.root, { radius: 250 });
    const near = (x, z) => terrain.road.nearest(x, z).d < 24 || terrain.trail.nearest(x, z).d < 28 || Math.hypot(x, z) < 46 || Math.hypot(x - LAYOUT.boathouse.x, z - LAYOUT.boathouse.z) < 36;
    const camp = { x: 62, z: -4 };
    this.forest = new Forest(terrain, game.root, col, {
      collideNear: near,
      exclusions: [
        (x, z) => Math.hypot(x - LAYOUT.boathouse.x, z - LAYOUT.boathouse.z) < 17,
        (x, z) => Math.hypot(x - camp.x, z - camp.z) < 9,
        (x, z) => Math.hypot(x - LAYOUT.dock.x, z - LAYOUT.dock.z) < 8,
        (x, z) => z < -10 && z > -60 && Math.abs(x) < 20,           // lakeside meadow in front of the lodge
      ],
      density: [1, 0.8, 0.6, 0.45, 0.35][['ULTRA', 'HIGH', 'MEDIUM', 'LOW', 'LOW'].indexOf('HIGH')] ?? 1,
    });

    // ---- the lodge
    this.lodge = buildLodge(game, game.root);
    this.hooks = {};
    this.ground = dressGround(game, this.lodge.B, this.lodge, this.hooks);
    this.upper = dressUpper(game, this.lodge.B, this.lodge, this.hooks);
    this.lodge.B.finish();
    this.porch = buildPorchLight(game, game.root);
    this.porch.set(true);
    this.rooms = ROOMS;

    this.lampPosts = []; this.camp = null; this.car = null;
    const road = terrain.road;
    if (!summer) {
        // ---- exterior set pieces
      const road = terrain.road;
      const carT = 14; const rp = road.at(carT); const cy = terrain.height(rp.x, rp.z);
      const carYaw = Math.atan2(-rp.dirx, -rp.dirz);
      // the road runs south->north: its points go from far south towards the lodge, so "dir" already points toward the lodge
      this.carBase = { x: rp.x + 1.0, z: rp.z, yaw: carYaw, y: cy };
      this.car = buildCar(game, game.root, this.carBase);
      const sg = road.at(30); buildRoadSign(game, game.root, { x: sg.x + 4.2, z: sg.z, y: terrain.height(sg.x + 4.2, sg.z), yaw: -0.4 });
      const mb = road.at(road.length - 34); this.mailbox = buildMailbox(game, game.root, { x: mb.x + 3.2, z: mb.z, y: terrain.height(mb.x + 3.2, mb.z), yaw: Math.PI / 2 });
      const mbp = this.mailbox.getWorldPosition(new THREE.Vector3()); mbp.y += 1.28;
      this.mailboxInteract = game.interact.add({ pos: mbp, radius: 0.5, maxDist: 2.6, label: 'The mailbox', icon: 'eye', onUse: () => { this.mailboxInteract.used = false; this.phaseObj && this.phaseObj.onMailbox && this.phaseObj.onMailbox(); } });
      this.truck = buildTruck(game, game.root, { x: -11.5, z: 11.5, y: terrain.height(-11.5, 11.5), yaw: 0.25 });
      this.truckInteract = game.interact.add({ pos: new THREE.Vector3(-11.5, 1.2, 11.5), radius: 1.3, maxDist: 3.6, label: 'Jo\'s truck', icon: 'eye', onUse: () => { this.truckInteract.used = false; this.phaseObj && this.phaseObj.onTruck && this.phaseObj.onTruck(); } });
      const wb = new Builder(game, game.root); woodpile(wb, 9.6, 1.0, Math.PI / 2, { w: 3, h: 1.2, y: 0.0 }); wb.finish();
      // lamp posts along the trail
      this.lampPosts = [];
      [[18, -10], [38, -17], [62, -13], [86, -18], [110, -38], [136, -62]].forEach(([lx, lz], i) => {
        const t = terrain.trail.nearest(lx, lz); const px = t.x + 1.7, pz = t.z + 0.6;
        this.lampPosts.push(buildLampPost(game, game.root, { x: px, z: pz, y: terrain.height(px, pz), id: 'L' + i, onLight: (lp) => this.onLampLit(lp) }));
      });
      // ribbons on trees along the trail
      const rr = new RNG(8); for (let t = 6; t < terrain.trail.length; t += 6 + rr.next() * 5) { const p = terrain.trail.at(t); const side = rr.next() < 0.5 ? -1 : 1; const x = p.x - p.dirz * side * (2.2 + rr.next() * 1.8), z = p.z + p.dirx * side * (2.2 + rr.next() * 1.8); buildRibbon(game.root, x, terrain.height(x, z) + 1.5 + rr.next() * 0.8, z, rr.next() < 0.7 ? 0xff6a1a : 0xffd21a); }
      // search camp
      this.camp = buildSearchCamp(game, game.root, { x: camp.x, z: camp.z, y: terrain.height(camp.x, camp.z), yaw: 0.35 });
      { const cp = { x: camp.x + 4.4, z: camp.z + 2.2 }; const cl = buildLampPost(game, game.root, { x: cp.x, z: cp.z, y: terrain.height(cp.x, cp.z), id: 'camp', lit: true }); cl.radius = 11; this.lampPosts.push(cl); this.campLamp = cl; }
    }
    // boathouse & docks
    const bh = LAYOUT.boathouse; this.boathouse = buildBoathouse(game, game.root, { x: bh.x, z: bh.z, y: terrain.height(bh.x, bh.z) });
    this.dock = buildDock(game, game.root, { x: LAYOUT.dock.x, z: LAYOUT.dock.z, y: LAYOUT.iceY + 0.55, yaw: 0, len: 15, w: 2 });
    // the lake
    this.lake = new Lake(game, game.root, terrain);
    this.island = buildIsland(game, game.root, { x: LAYOUT.bay.x, z: LAYOUT.bay.z, summer });
    if (summer) this.lake.setThaw(1);
    col.terrain = (x, z) => { const hi = this.island.height(x, z); if (hi !== null) return hi; return terrain.lakeDist(x, z) < 0.965 ? LAYOUT.iceY : terrain.height(x, z); };

    // ---- particles & atmosphere
    this.snow = summer
      ? new ParticleField(game, { count: 700, box: [40, 14, 40], size: 0.035, fall: -0.04, wind: [0.25, 0, 0.12], turb: 0.9, color: '#fff2cf', base: 0.3, opacity: 0.55 })       // pollen, drifting in the low sun
      : new ParticleField(game, { count: 9500, box: [44, 24, 44], size: 0.05, fall: 1.05, wind: [0.7, 0, 0.25], turb: 0.6 });
    this.snow.indoorFade = 1; this.snow.setDrawCount(game.gfx.p.particles);
    this.vapour = new BreathVapour(game); this.vapour.setCold(1);
    this.cleanup(() => { this.snow.dispose(); this.vapour.dispose(); });

    // ---- the Searcher
    const self = this;
    this.searcher = new Searcher(game, { world: { ground: (x, z, y) => col.groundAt(x, z, y, 0.6).y, lit: (x, y, z) => self.isLit(x, y, z) } });
    this.cleanup(() => this.searcher.dispose());
    game.on('step', (e) => { if (e.loud > 0.3) this.searcher.hear(game.player.pos.clone(), e.loud); });

    // warm-up
    const pp = this.startPos(this.startPhase);
    this.streamer.buildAllNear(pp, 70);
    this.forest.warm(pp, 150);
    game.flashlightAvailable = true;
    game.audio && game.audio.amb.set('winterNight', { fade: 0.1 });

    this.setPhase(this.startPhase, this.opts);
  }

  startPos(phase) { const r = this.terrain.road.at(14); return new THREE.Vector3(r.x, 0, r.z); }

  // ---- regions the player may walk in ---------------------------------------------------------------------------------
  walkable(x, z) {
    const t = this.terrain, Z = this.zones;
    if (Z.lodge && x > -22 && x < 22 && z > -14 && z < 34) return Z.yardOnly ? this._yard(x, z) : true;
    if (Z.deck && x > -14 && x < 14 && z > -62 && z <= -14) return true;                 // the meadow down to the lake
    if (Z.road && t.road.nearest(x, z).d < 9) return true;
    if (Z.trail && t.trail.nearest(x, z).d < 9) return true;
    if (Z.boathouse && Math.hypot(x - LAYOUT.boathouse.x, z - LAYOUT.boathouse.z) < 26) return true;
    if (Z.lake && t.lakeDist(x, z) < 1.0) return true;
    return false;
  }
  _yard(x, z) { return x > -20 && x < 20 && z > -14 && z < 34; }

  // ---- lit zones (the Searcher respects light) --------------------------------------------------------------------------
  isLit(x, y, z) {
    const lodgeIn = x > LODGE.x0 - 0.2 && x < LODGE.x1 + 0.2 && z > LODGE.z0 - 0.2 && z < LODGE.z1 + 0.2;
    if (lodgeIn) {
      const r = roomAt(x, y, z); if (!r) return false;
      return this.roomLit(r);
    }
    // porch pool
    if (this.porch.on && Math.hypot(x - 0.3, z - 7.5) < 5.2) return true;
    for (const lp of this.lampPosts) if (lp.lit && Math.hypot(x - lp.pos.x, z - lp.pos.z) < lp.radius) return true;
    if (this.extraLit && this.extraLit(x, y, z)) return true;
    return false;
  }
  roomLit(id) {
    const tags = { hall: ['hall'], living: ['living'], kitchen: ['kitchen'], study: ['study'], mudroom: ['mud'], jo: ['jo'], mara: ['mara'], corridor: ['uphall'], bath: ['bath'], dad: [], stairs: ['hall', 'uphall'] }[id] || [];
    return this.game.lights.logical.some((l) => l.on && tags.includes(l.tag));
  }

  // ---- phases ------------------------------------------------------------------------------------------------------
  setPhase(name, opts = {}) {
    if (this.phaseObj && this.phaseObj.dispose) this.phaseObj.dispose();
    this.phaseName = name; this.game.flags.phase = name;
    const P = PHASES[name]; this.phaseObj = new P(this, opts); this.phaseObj.start(opts);
    if (opts.resumeAt && opts.resumeAt.x !== undefined) { const r = opts.resumeAt; this.game.player.teleport(r.x, r.y ?? 0, r.z, r.yaw ?? 0); }
  }
  onLampLit(lp) { this.phaseObj && this.phaseObj.onLamp && this.phaseObj.onLamp(lp); this.checkpoint('lamp:' + lp.id, { x: lp.pos.x, z: lp.pos.z + 1.5 }); }
  checkpoint(id, at) { this.game.saveCheckpoint && this.game.saveCheckpoint(id, at); }

  say(text, o = {}) { return this.game.ui.say(text, o); }
  think(text, o = {}) { return this.game.ui.say(text, { style: 'thought', speaker: 'MARA', ...o }); }

  // ---- per frame ----------------------------------------------------------------------------------------------------
  update(dt, game) {
    const p = game.player.pos;
    this.streamer.update(p, 2); this.forest.update(p, dt, 1);
    this.snow.update(dt, game); this.vapour.update(dt);
    this.lake.update(dt);
    for (const d of Object.values(this.lodge.doors)) d.update(dt);
    if (this.car) { this.car.userData.sync && this.car.userData.sync(); }
    // indoor blend & ambience
    const inside = p.x > LODGE.x0 + 0.3 && p.x < LODGE.x1 - 0.3 && p.z > LODGE.z0 + 0.3 && p.z < LODGE.z1 - 0.3;
    const porch = p.x > -3.6 && p.x < 3.0 && p.z >= LODGE.z1 - 0.3 && p.z < LODGE.z1 + 2.8;
    const target = this.inCar ? 0.9 : (inside ? 1 : (porch ? 0.45 : 0));
    game.indoorTarget = target; game.fogMulTarget = inside ? 0.4 : 1;
    this.snow.setIntensity(this.snowLevel ?? 1);
    this.vapour.setCold(inside ? (this.roomLit(roomAt(p.x, p.y, p.z)) ? 0.45 : 0.8) : 1);
    if (this._inside !== inside && game.audio) { this._inside = inside; if (this.ambOverride !== true) game.audio.amb.set(inside ? 'house' : (this.outsideAmb || 'winterNight'), { fade: 1.5 }); }
    // porch halo flicker
    this.porch.halo.material.opacity = 0.5 + Math.sin(game.time * 2.1) * 0.03 + (Math.random() < 0.01 ? -0.15 : 0);
    // ember flicker
    const fire = this.ground.objs.fire; if (fire) { fire.emberMat.emissiveIntensity = 1.2 + Math.sin(game.time * 3.1) * 0.35 + Math.sin(game.time * 7.7) * 0.15; fire.flameMat.uniforms.uTime.value = game.time; }
    // searcher
    if (this.boathouse && this.boathouse.update) this.boathouse.update(dt);
    this.searcher.update(dt);
    this.phaseObj && this.phaseObj.update && this.phaseObj.update(dt);
    // lit-zone fear: closer to the searcher in the dark raises fear
    if (this.searcher.state !== 'absent' && this.searcher.root.visible) {
      const d = this.searcher.distToPlayer(); const lit = this.isLit(p.x, p.y, p.z);
      const f = clamp(1 - d / 22) * (lit ? 0.5 : 1) * (this.searcher.state === 'hunt' ? 1.3 : 0.8);
      game.player.setFear(damp(game.player.fear, f, 2, dt)); game.audio && game.audio.music.setDread(Math.max(game.audio.music.dreadTarget * 0.0, f * 0.9));
    } else game.player.setFear(damp(game.player.fear, this.baseFear ?? 0.05, 1.5, dt));
  }
}
