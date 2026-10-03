// The frozen lake: dark glassy ice with fractures, snow patches, and a water layer for the thaw at the end.
import * as THREE from 'three';
import { pbr, card, noiseTex, snowMaterial } from '../gfx/materials.js';
import { LAYOUT } from './halden.js';
import { plane } from '../gfx/geo.js';
import { damp, clamp } from '../core/util.js';

export class Lake {
  constructor(game, parent, terrain) {
    this.game = game; this.terrain = terrain; this.group = new THREE.Group(); this.group.name = 'lake'; parent.add(this.group);
    const L = LAYOUT.lake; const size = [L.rx * 2.4, L.rz * 2.4];
    const ice = pbr('ice', { key: 'lakeice', tint: 0x9fb8c8, rough: 1, normal: 1.0 });
    this.iceMat = new THREE.MeshPhysicalMaterial({ map: ice.map.clone(), normalMap: ice.normalMap.clone(), roughnessMap: ice.roughnessMap.clone(), color: 0xaac0cf, roughness: 0.55, metalness: 0.0, clearcoat: 0.6, clearcoatRoughness: 0.15, envMapIntensity: 1.2, transparent: true, opacity: 1 });
    for (const t of [this.iceMat.map, this.iceMat.normalMap, this.iceMat.roughnessMap]) { t.repeat.set(size[0] / 14, size[1] / 14); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true; }
    this.iceMat.normalScale = new THREE.Vector2(0.8, 0.8);
    const geo = new THREE.PlaneGeometry(size[0], size[1], 1, 1); geo.rotateX(-Math.PI / 2);
    this.ice = new THREE.Mesh(geo, this.iceMat); this.ice.position.set(L.cx, LAYOUT.iceY, L.cz); this.ice.receiveShadow = true; this.group.add(this.ice);
    // snow drifts on the ice (alpha-cut blotches)
    const noise = noiseTex().clone(); noise.repeat.set(size[0] / 60, size[1] / 60); noise.wrapS = noise.wrapT = THREE.RepeatWrapping; noise.needsUpdate = true;
    const sm = snowMaterial({ name: 'snow' }).clone(); sm.alphaMap = noise; sm.alphaTest = 0.52; sm.userData.shared = false;
    const sgeo = new THREE.PlaneGeometry(size[0], size[1]); sgeo.rotateX(-Math.PI / 2); const uv = sgeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size[0] / 5, uv.getY(i) * size[1] / 5);
    this.snowCover = new THREE.Mesh(sgeo, sm); this.snowCover.position.set(L.cx, LAYOUT.iceY + 0.03, L.cz); this.snowCover.receiveShadow = true; this.group.add(this.snowCover);
    // water (for the thaw): same footprint slightly below, hidden at first
    const wn = pbr('water', { key: 'lakewater' });
    this.waterMat = new THREE.MeshPhysicalMaterial({ color: 0x1f3d4a, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: wn.normalMap.clone(), normalScale: new THREE.Vector2(0.5, 0.5), envMapIntensity: 1.6, transparent: true, opacity: 0 });
    this.waterMat.normalMap.repeat.set(size[0] / 10, size[1] / 10); this.waterMat.normalMap.wrapS = this.waterMat.normalMap.wrapT = THREE.RepeatWrapping;
    this.water = new THREE.Mesh(geo, this.waterMat); this.water.position.set(L.cx, LAYOUT.iceY - 0.04, L.cz); this.water.visible = false; this.group.add(this.water);
    this.thaw = 0; this.time = 0;
  }
  setThaw(v) { this.thaw = v; this.water.visible = v > 0.001; this.waterMat.opacity = clamp(v * 2.2); this.iceMat.opacity = clamp(1 - (v - 0.2) * 1.4); this.snowCover.material.opacity = 1; this.snowCover.visible = v < 0.55; this.ice.visible = v < 0.99; this.ice.renderOrder = 1; }
  update(dt) { this.time += dt; this.waterMat.normalMap.offset.set(this.time * 0.01, this.time * 0.006); }
}
