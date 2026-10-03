// Prologue — "FEB 11". Wake in the car on a dead-end road; walk to the lodge's porch light.
import * as THREE from 'three';
import { Chapter } from './chapter.js';
import { HaldenTerrain, LAYOUT } from '../world/halden.js';
import { TerrainStreamer } from '../world/terrainMesh.js';
import { Forest } from '../world/trees.js';
import { ParticleField, BreathVapour } from '../gfx/particles.js';

export class Prologue extends Chapter {
  constructor() { super('prologue', 'FEB 11'); }

  async build(game, opts = {}) {
    await super.build(game, opts);
    const terrain = this.terrain = new HaldenTerrain('winter');
    game.collision.terrain = (x, z) => terrain.height(x, z);
    game.collision.terrainSurface = (x, z) => terrain.surface(x, z);

    game.setSky('nightSnow');
    game.setGrade('nightSnow', true);

    this.streamer = new TerrainStreamer(terrain, game.root, { radius: 260 });
    this.forest = new Forest(terrain, game.root, game.collision, {
      collideNear: (x, z) => terrain.road.nearest(x, z).d < 22 || Math.hypot(x, z) < 40,
    });

    this.snow = new ParticleField(game, { count: 9000, box: [44, 24, 44], size: 0.05, fall: 1.1, wind: [0.7, 0, 0.25], turb: 0.6 });
    this.snow.indoorFade = 1;
    this.cleanup(() => this.snow.dispose());
    this.vapour = new BreathVapour(game); this.vapour.setCold(1);
    this.cleanup(() => this.vapour.dispose());

    // start on the road
    const start = terrain.road.at(20);
    game.player.teleport(start.x, terrain.height(start.x, start.z), start.z, Math.atan2(-start.dirx, -start.dirz));
    this.streamer.buildAllNear(game.camera.position, 60);
    this.forest.warm(game.camera.position, 160);
    game.flashlightAvailable = true;
  }

  update(dt, game) {
    const cam = game.player.pos;
    this.streamer.update(cam, 1);
    this.forest.update(cam, dt, 1);
    this.snow.update(dt, game);
    this.vapour.update(dt);
  }
}
