import * as THREE from 'three';
import { Chapter } from './chapter.js';
import { HaldenTerrain } from '../world/halden.js';
import { TerrainStreamer } from '../world/terrainMesh.js';
import { Forest } from '../world/trees.js';
import { ParticleField } from '../gfx/particles.js';
import { buildLodge } from '../world/lodge.js';
import { dressGround, dressUpper } from '../world/lodgeRooms.js';

export class TestLodge extends Chapter {
  constructor() { super('testlodge', 'TEST'); }
  async build(game) {
    await super.build(game);
    const terrain = this.terrain = new HaldenTerrain('winter');
    game.collision.terrain = (x, z) => terrain.height(x, z);
    game.setSky('nightSnow'); game.setGrade('nightSnow', true);
    this.streamer = new TerrainStreamer(terrain, game.root, { radius: 200 });
    this.forest = new Forest(terrain, game.root, game.collision, {});
    this.lodge = buildLodge(game, game.root);
    this.ground = dressGround(game, this.lodge.B, this.lodge, {}); this.upper = dressUpper(game, this.lodge.B, this.lodge, {});
    this.lodge.B.finish();
    this.streamer.buildAllNear(new THREE.Vector3(0, 0, 20), 60);
    this.forest.warm(new THREE.Vector3(0, 0, 20), 120);
    game.lights.add({ pos: [0.3, 2.6, 6.2], color: 0xffd9a0, intensity: 26, distance: 12, shadow: true });
    game.player.teleport(0, 0.2, 14, 0);
    game.flashlightAvailable = true;
  }
  update(dt, game) { this.streamer.update(game.player.pos, 1); this.forest.update(game.player.pos, dt, 1); for (const d of Object.values(this.lodge.doors)) d.update(dt); }
}
