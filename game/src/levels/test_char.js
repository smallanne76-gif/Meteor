import * as THREE from 'three';
import { Chapter } from './chapter.js';
import { Humanoid } from '../chars/humanoid.js';
import { box as boxGeo, plane } from '../gfx/geo.js';
import { pbr } from '../gfx/materials.js';
export class TestChar extends Chapter {
  constructor() { super('testchar', 'CHAR'); }
  async build(game) {
    await super.build(game);
    game.collision.terrain = () => 0;
    game.setSky('dim'); game.setGrade('interiorWarm', true);
    const floor = new THREE.Mesh(plane(30, 30, 2), pbr('wood_floor')); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; game.root.add(floor);
    const wall = new THREE.Mesh(boxGeo(30, 6, 0.3, 2), pbr('plaster')); wall.position.set(0, 3, -4); wall.receiveShadow = true; game.root.add(wall);
    game.lights.add({ pos: [2, 3, 2], color: 0xffc890, intensity: 40, distance: 14, shadow: true });
    game.lights.add({ pos: [-3, 2.4, 1], color: 0x7fa0d0, intensity: 14, distance: 12 });
    this.jo = new Humanoid({ kind: 'jo', outfit: 'flannel', shirt: 0xd08a6a, pants: 0x3b4560 }); this.jo.setPos(-1.2, 0, 0); this.jo.faceYaw(0.2); game.root.add(this.jo.root);
    this.se = new Humanoid({ kind: 'searcher', outfit: 'parka', hood: true, gloves: true, hunch: 0.12, pants: 0x2e332f, boots: 0x1c1f1a }); this.se.setPos(1.2, 0, 0); this.se.faceYaw(-0.25); game.root.add(this.se.root);
    this.ma = new Humanoid({ kind: 'mara', outfit: 'tee', shirt: 0x4a6a8a, pants: 0x2f3a4a }); this.ma.setPos(3.0, 0, 0); this.ma.faceYaw(-0.5); game.root.add(this.ma.root);
    this.chars = [this.jo, this.se, this.ma];
    game.indoorTarget = 1; game.indoor = 1;
    game.player.teleport(0, 0, 4.5, 0);
  }
  update(dt) {
    const t = this.game.time;
    // pose showcase: Jo walks in place, the searcher stands hunched with a reaching arm, Mara sits
    this.jo.walking = true; this.jo.walkSpeed = 1.3;
    this.ma.sitT = 1; this.ma.sitDangle = true;
    this.se.reachTo('R', new THREE.Vector3(1.0, 1.2, 0.7));
    for (const c of this.chars) c.update(dt);
  }
}
