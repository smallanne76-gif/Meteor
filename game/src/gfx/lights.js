// Light rig: a fixed pool of real lights (so shaders never recompile) driven by any number of logical lights,
// plus the sun/moon directional light, hemisphere ambient and the player's flashlight.
import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { damp, clamp, lerp } from '../core/util.js';

const _c = new THREE.Color();
let uid = 1;

export class LightRig {
  constructor(scene) {
    this.scene = scene;
    this.logical = [];
    this.pool = { points: [], shadowPoints: [], spots: [], shadowSpots: [] };
    this.root = new THREE.Group(); this.root.name = 'lightPool'; scene.add(this.root);

    this.hemi = new THREE.HemisphereLight(0x8899bb, 0x222222, 0.5); scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true; scene.add(this.sun); scene.add(this.sun.target);
    // a shadow-free share of the same moon/sun: if a GPU gets shadow lookups wrong, the world is still lit
    this.sunFill = new THREE.DirectionalLight(0xffffff, 0); this.sunFill.castShadow = false; scene.add(this.sunFill); scene.add(this.sunFill.target);
    this.sunHandle = { on: true };

    // flashlight
    this.flash = new THREE.SpotLight(0xfff2d8, 0, 55, 0.38, 0.75, 1.6);
    this.flash.castShadow = true; this.flash.shadow.bias = -0.0004; this.flash.shadow.normalBias = 0.02;
    scene.add(this.flash); scene.add(this.flash.target);
    this.flashFill = new THREE.SpotLight(0xffe8c8, 0, 18, 0.9, 1.0, 2);   // wide soft spill
    scene.add(this.flashFill); scene.add(this.flashFill.target);
    this.flashOn = false; this.flashLevel = 0; this.flashFlicker = 0; this.flashBattery = 1;

    this.sunTexel = new THREE.Vector3();
    this.support = { dir: true, spot: true, point: true };   // filled in by the start-up shadow self-test (gfx/shadowProbe.js)
    this.rebuild();
  }
  setShadowSupport(s) { this.support = { dir: s.dir !== false, spot: s.spot !== false, point: s.point !== false }; this.rebuild(); }

  rebuild() {
    const p = settings.preset;
    for (const arr of Object.values(this.pool)) for (const l of arr) { this.root.remove(l); if (l.target) this.root.remove(l.target); if (l.shadow && l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } }
    this.pool = { points: [], shadowPoints: [], spots: [], shadowSpots: [] };
    const sm = p.shadowMap, S = this.support;
    const sh = p.shadows && settings.get('shadows') !== false;
    const wantSP = sm >= 2048 ? 2 : 1, nsp = sh && S.point ? wantSP : 0;
    const np = p.maxPointLights + (wantSP - nsp);                         // lights that lose their shadow still light the room
    for (let i = 0; i < np; i++) this._mk('points', new THREE.PointLight(0xffffff, 0, 10, 2));
    // point shadows are a 4x2 atlas: 1024 -> a 4096x2048 texture, so keep them modest
    for (let i = 0; i < nsp; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); l.castShadow = true; l.shadow.mapSize.set(sm >= 2048 ? 1024 : 512, sm >= 2048 ? 1024 : 512); l.shadow.bias = -0.004; l.shadow.normalBias = 0.06; l.shadow.radius = 2; l.shadow.camera.near = 0.15; this._mk('shadowPoints', l); }
    const nss = sh && S.spot ? 2 : 0;
    for (let i = 0; i < 2 + (2 - nss); i++) this._mk('spots', new THREE.SpotLight(0xffffff, 0, 10, 0.6, 0.6, 2));
    for (let i = 0; i < nss; i++) { const l = new THREE.SpotLight(0xffffff, 0, 10, 0.6, 0.6, 2); l.castShadow = true; l.shadow.mapSize.set(sm >= 2048 ? 1024 : 512, sm >= 2048 ? 1024 : 512); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; this._mk('shadowSpots', l); }
    // sun
    this.sun.shadow.mapSize.set(sm, sm);
    // three keeps the old render target when only mapSize changes: drop it so the map is re-created at the new size
    if (this.sun.shadow.map && this.sun.shadow.map.width !== sm) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.needsUpdate = true;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 220;
    const R = 38; Object.assign(this.sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R }); this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 2.5;
    this.sun.castShadow = sh && S.dir;
    this.flash.castShadow = sh && S.spot; this.flash.shadow.mapSize.set(Math.min(sm, 1024), Math.min(sm, 1024));
    for (const l of this.logical) l.slot = null;
  }
  /** after a live rebuild (e.g. preset change while paused, when update() is not running): assign the new pool at full level straight away */
  settle(camera, time) {
    this.update(0, camera, time);
    for (const arr of Object.values(this.pool)) for (const l of arr) if (l.userData.slot) l.userData.level = 1;
    this.update(0, camera, time);
  }
  _mk(kind, l) {
    l.userData = { slot: null, level: 0 }; this.pool[kind].push(l); this.root.add(l);
    if (l.isSpotLight) this.root.add(l.target);
    if (l.shadow) l.shadow.autoUpdate = false;
  }

  /**
   * add({ pos:[x,y,z], color, intensity (candela), distance, decay, shadow, spot:{dir:[x,y,z], angle, penumbra}, flicker, name, layer })
   */
  add(def) {
    const h = {
      id: uid++, name: def.name || '', pos: new THREE.Vector3(...(def.pos || [0, 0, 0])), color: new THREE.Color(def.color ?? 0xffffff),
      intensity: def.intensity ?? 20, base: def.intensity ?? 20, distance: def.distance ?? 12, decay: def.decay ?? 2, shadow: !!def.shadow, on: def.on ?? true,
      spot: def.spot ? { dir: new THREE.Vector3(...def.spot.dir).normalize(), angle: def.spot.angle ?? 0.7, penumbra: def.spot.penumbra ?? 0.6 } : null,
      flicker: def.flicker || null, level: def.on === false ? 0 : 1, slot: null, tag: def.tag || '', fadeRate: def.fadeRate ?? 3.5,
      parent: def.parent || null, local: def.parent ? new THREE.Vector3(...(def.pos || [0, 0, 0])) : null,
    };
    this.logical.push(h); return h;
  }
  remove(h) { const i = this.logical.indexOf(h); if (i >= 0) this.logical.splice(i, 1); if (h.slot) { h.slot.userData.slot = null; } }
  clear() { for (const h of this.logical) if (h.slot) h.slot.userData.slot = null; this.logical.length = 0; }
  byTag(tag) { return this.logical.filter((l) => l.tag === tag); }
  setTag(tag, on) { for (const l of this.logical) if (l.tag === tag) l.on = on; }

  setSky(def, sky) {
    this.skyDef = def;
    this.sunColor = new THREE.Color(def.lightColor); this.sunIntensity = def.lightIntensity;
    this.hemi.color.set(def.hemiSky); this.hemi.groundColor.set(def.hemiGround);
    this.hemiBase = def.hemiIntensity;
    this.envBase = def.envIntensity;
    this.sky = sky;
  }

  /** player flashlight: pass the camera + lag quaternion + hand-held origin */
  updateFlash(dt, camera, flashQuat, handOffset, game) {
    // battery flicker
    let lvl = this.flashOn ? 1 : 0;
    this.flashLevel = damp(this.flashLevel, lvl, this.flashOn ? 30 : 18, dt);
    let f = 1;
    if (this.flashFlicker > 0) { this.flashFlicker -= dt; f = settings.get('reduceFlash') ? 0.7 + 0.2 * Math.sin(performance.now() * 0.004) : (Math.sin(performance.now() * 0.09) > 0.2 ? 1 : 0.12) * (Math.random() > 0.3 ? 1 : 0.4); }
    const I = this.flashLevel * f;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(flashQuat);
    const origin = camera.position.clone().add(handOffset.clone().applyQuaternion(camera.quaternion));
    this.flash.position.copy(origin); this.flash.target.position.copy(origin).add(dir);
    this.flash.intensity = I * 56; this.flash.visible = true;
    this.flashFill.position.copy(origin); this.flashFill.target.position.copy(origin).add(dir);
    this.flashFill.intensity = I * 8;
    this.flash.shadow.autoUpdate = I > 0.02;
    this.flashDir = dir; this.flashOrigin = origin;
  }

  update(dt, camera, time) {
    const cp = camera.position;
    this.sun.shadow.autoUpdate = true;
    // ---- sun/moon -------------------------------------------------------------------------------------------
    if (this.sky && this.skyDef) {
      const L = this.sky.lightDir(new THREE.Vector3());
      const kSun = this.sunOn === false ? 0 : 1;
      const sunI = this.sunIntensity * kSun * (this.sunMul ?? 1);
      this.sun.color.copy(this.sunColor); this.sun.intensity = sunI * 0.6;
      this.sunFill.color.copy(this.sunColor); this.sunFill.intensity = sunI * 0.4;
      // snap shadow camera to texel grid to avoid shimmer
      const R = 38, texel = (2 * R) / this.sun.shadow.mapSize.x;
      this.sunTexel.set(Math.round(cp.x / texel) * texel, Math.round(cp.y / texel) * texel, Math.round(cp.z / texel) * texel);
      this.sun.target.position.copy(this.sunTexel);
      this.sun.position.copy(this.sunTexel).addScaledVector(L, 120);
      this.sunFill.target.position.copy(this.sunTexel); this.sunFill.position.copy(this.sunTexel).addScaledVector(L, 120);
      this.hemi.intensity = this.hemiBase * (this.hemiMul ?? 1);
    }

    // ---- pool assignment ------------------------------------------------------------------------------------
    const act = [];
    for (const h of this.logical) {
      // follow parent
      if (h.parent) { h.pos.copy(h.local); h.parent.localToWorld(h.pos); }
      // flicker + fade
      let target = h.on ? 1 : 0;
      h.level = damp(h.level, target, h.fadeRate, dt);
      if (h.level < 0.003 && !h.on) { h.eff = 0; if (h.slot) { h.slot.userData.slot = null; h.slot = null; } continue; }
      let fl = 1;
      if (h.flicker) { const t = time * (h.flicker.speed || 8); fl = 1 - (h.flicker.amp || 0.2) * (0.5 + 0.5 * Math.sin(t + Math.sin(t * 2.3) * 2) * Math.sin(t * 0.37 + 1.3)); }
      if (h.surge) { h.surge = Math.max(0, h.surge - dt); fl *= settings.get('reduceFlash') ? 0.6 : (Math.sin(time * 70) > 0 ? 1 : 0.1); }
      h.eff = h.base * h.level * fl;
      h.intensity = h.eff;
      const d2 = cp.distanceToSquared(h.pos);
      // rank on the steady brightness (not the flicker), so lamps don't trade light slots every frame
      h.score = (h.base * h.level * (0.3 + 0.59 * h.color.g + 0.11 * h.color.b)) / (d2 + 6);
      if (h.distance > 0 && Math.sqrt(d2) > h.distance * 2.4 + 8) h.score *= 0.01;
      act.push(h);
    }
    act.sort((a, b) => b.score - a.score);
    const P = this.pool;
    const claimed = new Set();
    const assign = (kind, filt) => {
      const arr = P[kind]; if (!arr.length) return;
      // hysteresis: a light that already holds a slot of this kind keeps it unless another is clearly more important
      const chosen = act.filter((h) => !claimed.has(h) && filt(h))
        .map((h) => [h, h.score * (h.slot && arr.includes(h.slot) ? 1.6 : 1)]).sort((a, b) => b[1] - a[1])
        .slice(0, arr.length).map((x) => x[0]);
      const chosenSet = new Set(chosen);
      for (const l of arr) { const h = l.userData.slot; if (h && !chosenSet.has(h)) { if (h.slot === l) h.slot = null; l.userData.slot = null; } }
      for (const h of chosen) {
        claimed.add(h);
        if (h.slot && h.slot.userData.slot === h && arr.includes(h.slot)) continue;
        const free = arr.find((l) => !l.userData.slot);
        if (!free) continue;
        if (h.slot && h.slot.userData.slot === h) h.slot.userData.slot = null;
        free.userData.slot = h; h.slot = free; free.userData.level = 0;
        if (free.shadow) free.shadow.needsUpdate = true;
      }
    };
    assign('shadowSpots', (h) => h.spot && h.shadow);
    assign('spots', (h) => !!h.spot);
    assign('shadowPoints', (h) => !h.spot && h.shadow);
    assign('points', (h) => !h.spot);
    // lights that lost every pool this frame
    for (const h of act) if (!claimed.has(h) && h.slot) { if (h.slot.userData.slot === h) h.slot.userData.slot = null; h.slot = null; }

    for (const kind of Object.keys(P)) for (const l of P[kind]) {
      const h = l.userData.slot;
      if (!h) { l.userData.level = damp(l.userData.level, 0, 12, dt); l.intensity *= 0; continue; }
      l.userData.level = damp(l.userData.level, 1, 10, dt);
      l.position.copy(h.pos); l.color.copy(h.color); l.intensity = h.eff * l.userData.level;
      l.distance = h.distance; l.decay = h.decay;
      if (l.isSpotLight && h.spot) {
        l.angle = h.spot.angle; l.penumbra = h.spot.penumbra;
        l.target.position.copy(h.pos).add(h.spot.dir);
        l.target.updateMatrixWorld();
      }
      if (l.shadow) {
        const mv = this.game && this.game.dynamicShadows;
        // every shadow map is redrawn every frame: skipping frames made consecutive frames differ, which some GPUs turned into flashing
        l.shadow.autoUpdate = true;
        if (l.isPointLight) l.shadow.camera.far = Math.max(8, h.distance);
      }
    }
  }
}
