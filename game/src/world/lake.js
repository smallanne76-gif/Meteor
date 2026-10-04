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
    const snowBase = snowMaterial({ name: 'snow' }); const sm = snowBase.clone(); sm.userData.shared = false; sm.alphaTest = 0.5;
    // wind-swept: big drifts and bare black-ice pans from world-space noise (no tiling, no moire in the distance)
    const baseHook = snowBase.onBeforeCompile;
    sm.onBeforeCompile = (shader, r) => {
      baseHook && baseHook(shader, r);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
float lkh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lkn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(lkh(i), lkh(i+vec2(1,0)), f.x), mix(lkh(i+vec2(0,1)), lkh(i+vec2(1,1)), f.x), f.y); }
float lkf(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * lkn(p); p = p * 2.03 + 17.0; a *= 0.5; } return s; }`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        { float dd = length(vWPos.xz - cameraPosition.xz); vec2 q = vWPos.xz;
          float n = lkf(q * 0.011) * 0.55 + lkf(q * 0.07 + 5.0) * 0.3 + mix(lkf(q * 0.6), 0.5, smoothstep(25.0, 110.0, dd)) * 0.15;
          float cover = smoothstep(0.43, 0.57, n); diffuseColor.a = cover; if (cover < 0.5) discard; }
        #include <alphatest_fragment>`);
    };
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
  /** thin ice: a soft black-ice disc with fractures. The player has to hear (or see) it and go around. */
  addPatch(x, z, r) {
    this.patches = this.patches || []; const g = new THREE.Group(); g.position.set(x, LAYOUT.iceY + 0.012, z); this.group.add(g);
    const dm = new THREE.MeshStandardMaterial({ color: 0x050b10, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.88, alphaMap: card('soft_dot'), depthWrite: false });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 1.15, 32), dm); disc.rotation.x = -Math.PI / 2; disc.renderOrder = 2; g.add(disc);
    const cm = new THREE.MeshBasicMaterial({ map: card('scratch'), color: 0xbfe3f2, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.4, r * 1.4), cm); c.rotation.x = -Math.PI / 2; c.rotation.z = i * 1.3 + x; c.position.y = 0.004 + i * 0.001; c.renderOrder = 3; g.add(c); }
    this.patches.push({ x, z, r, group: g });
  }
  /** 0 = solid ice, 1 = in the middle of a thin patch */
  thinAt(x, z) { let m = 0; for (const p of this.patches || []) { if (p.mercy) continue; const d = Math.hypot(x - p.x, z - p.z); m = Math.max(m, clamp(1 - (d - p.r * 0.55) / (p.r * 0.45))); } return m; }
  update(dt) { this.time += dt; this.waterMat.normalMap.offset.set(this.time * 0.01, this.time * 0.006); }
}
