// Camera-anchored particle fields (snow, dust motes, pollen, ash) and breath vapour.
import * as THREE from 'three';
import { card } from './materials.js';
import { settings } from '../core/settings.js';
import { clamp, damp, RNG } from '../core/util.js';

const FIELD_VERT = /* glsl */`
uniform float uTime, uSize, uFall, uScale;
uniform vec3 uBox, uCam, uWind;
uniform float uTurb, uPhase;
attribute vec4 aRand;
varying float vAlpha; varying float vGlow; varying float vTw;
uniform vec3 uFlashPos, uFlashDir; uniform float uFlashCos, uFlashI;
uniform vec3 uL0, uL1, uL2; uniform vec3 uLI;   // nearby light positions, intensities in .xyz
void main(){
  vec3 b = aRand.xyz * uBox;
  float t = uTime * (0.6 + aRand.w * 0.8);
  vec3 drift = uWind * uTime + vec3(sin(t * 0.7 + aRand.x * 40.0), 0.0, cos(t * 0.6 + aRand.z * 40.0)) * uTurb;
  vec3 p = b - vec3(0.0, uFall * uTime * (0.7 + aRand.w * 0.6), 0.0) + drift;
  p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  gl_Position = projectionMatrix * mv;
  float s = uSize * (0.5 + aRand.w);
  gl_PointSize = clamp(s * uScale / max(d, 0.1), 1.0, 28.0);
  float fadeNear = smoothstep(0.15, 0.9, d);
  float fadeFar = 1.0 - smoothstep(uBox.x * 0.2, uBox.x * 0.5, d);
  vAlpha = fadeNear * fadeFar * (0.35 + 0.65 * aRand.w);
  // flashlight cone glow
  vec3 toP = normalize(p - uFlashPos);
  float c = dot(toP, uFlashDir);
  float cone = smoothstep(uFlashCos, 1.0, c) * uFlashI * (1.0 / (1.0 + 0.06 * length(p - uFlashPos)));
  float g = cone;
  g += uLI.x / (1.0 + dot(p - uL0, p - uL0) * 0.35) + uLI.y / (1.0 + dot(p - uL1, p - uL1) * 0.35) + uLI.z / (1.0 + dot(p - uL2, p - uL2) * 0.35);
  vGlow = g;
  vTw = 0.7 + 0.3 * sin(uTime * 3.0 + aRand.x * 60.0);
}`;
const FIELD_FRAG = /* glsl */`
uniform sampler2D uMap; uniform vec3 uColor; uniform float uBase, uOpacity;
varying float vAlpha; varying float vGlow; varying float vTw;
void main(){
  vec4 t = texture2D(uMap, gl_PointCoord);
  float a = t.a * vAlpha * uOpacity;
  if (a < 0.003) discard;
  vec3 col = uColor * (uBase + vGlow * 1.8) * vTw;
  gl_FragColor = vec4(col, a * (0.35 + clamp(vGlow, 0.0, 1.0) * 0.65 + uBase * 0.3));
}`;

export class ParticleField {
  constructor(game, { count = 6000, box = [40, 22, 40], size = 0.06, fall = 1.1, wind = [0.5, 0, 0.2], turb = 0.5, color = '#dfe8ff', base = 0.35, opacity = 0.9, map = 'flake' } = {}) {
    this.game = game;
    const rng = new RNG(4242);
    this.count0 = count;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { rnd[i * 4] = rng.next(); rnd[i * 4 + 1] = rng.next(); rnd[i * 4 + 2] = rng.next(); rnd[i * 4 + 3] = rng.next(); }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    this.uniforms = {
      uTime: { value: 0 }, uSize: { value: size }, uFall: { value: fall }, uScale: { value: 600 }, uBox: { value: new THREE.Vector3(...box) }, uCam: { value: new THREE.Vector3() },
      uWind: { value: new THREE.Vector3(...wind) }, uTurb: { value: turb }, uPhase: { value: 0 },
      uMap: { value: card(map) }, uColor: { value: new THREE.Color(color) }, uBase: { value: base }, uOpacity: { value: opacity },
      uFlashPos: { value: new THREE.Vector3() }, uFlashDir: { value: new THREE.Vector3(0, 0, -1) }, uFlashCos: { value: 0.92 }, uFlashI: { value: 0 },
      uL0: { value: new THREE.Vector3() }, uL1: { value: new THREE.Vector3() }, uL2: { value: new THREE.Vector3() }, uLI: { value: new THREE.Vector3() },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: FIELD_VERT, fragmentShader: FIELD_FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.NormalBlending });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false; this.points.renderOrder = 10;
    this.points.name = 'particles';
    this.baseOpacity = opacity;
    this.intensity = 1; this.target = 1;
    game.scene.add(this.points);
  }
  setIntensity(v) { this.target = v; }
  setDrawCount(f) { this.points.geometry.setDrawRange(0, Math.floor(this.count0 * clamp(f, 0, 1))); }
  update(dt, game) {
    const u = this.uniforms, cam = game.camera;
    this.intensity = damp(this.intensity, this.target, 1.5, dt);
    u.uTime.value += dt; u.uCam.value.copy(cam.position);
    u.uScale.value = game.gfx.size.h / (2 * Math.tan(cam.fov * Math.PI / 360));
    u.uOpacity.value = this.baseOpacity * this.intensity * (1 - game.indoor * this.indoorFade);
    this.points.visible = u.uOpacity.value > 0.01;
    const L = game.lights;
    u.uFlashPos.value.copy(L.flashOrigin || cam.position); u.uFlashDir.value.copy(L.flashDir || new THREE.Vector3(0, 0, -1));
    u.uFlashI.value = L.flashLevel * 1.6; u.uFlashCos.value = Math.cos(L.flash.angle * 1.05);
    // three brightest nearby logical lights
    const near = L.logical.filter((l) => l.on && l.eff > 0.5).map((l) => ({ l, d: l.pos.distanceToSquared(cam.position) })).sort((a, b) => a.d - b.d).slice(0, 3);
    const ps = [u.uL0.value, u.uL1.value, u.uL2.value]; const ii = [0, 0, 0];
    near.forEach((n, i) => { ps[i].copy(n.l.pos); ii[i] = clamp(n.l.eff / 70, 0, 1.2); });
    for (let i = near.length; i < 3; i++) ps[i].set(1e5, 1e5, 1e5);
    u.uLI.value.set(ii[0], ii[1], ii[2]);
  }
  set indoorFade(v) { this._if = v; } get indoorFade() { return this._if ?? 1; }
  dispose() { this.game.scene.remove(this.points); this.points.geometry.dispose(); this.points.material.dispose(); }
}

/** exhaled breath vapour in the cold */
export class BreathVapour {
  constructor(game, max = 120) {
    this.game = game; this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.life = new Float32Array(max); this.age = new Float32Array(max).fill(99); this.vel = new Float32Array(max * 3); this.size = new Float32Array(max);
    this.attr = new Float32Array(max * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aState', new THREE.BufferAttribute(this.attr, 2));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: card('soft_dot') }, uScale: { value: 600 }, uTint: { value: new THREE.Color(0.8, 0.88, 1.0) }, uLight: { value: 0.5 } },
      vertexShader: `attribute vec2 aState; uniform float uScale; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aState.x * uScale / max(-mv.z, 0.05), 1.0, 160.0); vA = aState.y; }`,
      fragmentShader: `uniform sampler2D uMap; uniform vec3 uTint; uniform float uLight; varying float vA; void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; gl_FragColor = vec4(uTint * uLight, a); }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 11;
    game.scene.add(this.points);
    this.next = 0; this.cold = 0; this.coldTarget = 0;
    this.off = game.on('breath', (b) => this.puff(b));
  }
  setCold(v) { this.coldTarget = v; }
  puff(b) {
    if (this.cold < 0.2) return;
    const g = this.game, cam = g.camera, p = g.player;
    const n = 4 + Math.round((b?.exert || 0) * 5);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(cam.quaternion);
    for (let i = 0; i < n; i++) {
      const k = this.next++ % this.max;
      const o = cam.position.clone().addScaledVector(fwd, 0.28 + Math.random() * 0.06).addScaledVector(down, 0.1);
      this.pos.set([o.x, o.y, o.z], k * 3);
      const sp = 0.35 + Math.random() * 0.25 + (b?.exert || 0) * 0.3;
      this.vel.set([fwd.x * sp + (Math.random() - .5) * 0.1, 0.08 + Math.random() * 0.08, fwd.z * sp + (Math.random() - .5) * 0.1], k * 3);
      this.life[k] = 1.6 + Math.random() * 0.9; this.age[k] = 0; this.size[k] = 0.06 + Math.random() * 0.04;
    }
  }
  update(dt) {
    this.cold = damp(this.cold, this.coldTarget, 1.0, dt);
    const cam = this.game.camera;
    this.mat.uniforms.uScale.value = this.game.gfx.size.h / (2 * Math.tan(cam.fov * Math.PI / 360));
    // light level: moonlight + flashlight
    const L = this.game.lights;
    this.mat.uniforms.uLight.value = 0.22 + L.flashLevel * 0.55 + (this.game.skyDef ? (this.game.skyDef.lightIntensity > 2 ? 0.7 : 0.1) : 0);
    for (let i = 0; i < this.max; i++) {
      if (this.age[i] >= this.life[i]) { this.attr[i * 2 + 1] = 0; continue; }
      this.age[i] += dt; const t = this.age[i] / this.life[i];
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 1 - 1.4 * dt; this.vel[i * 3 + 2] *= 1 - 1.4 * dt;
      this.attr[i * 2] = this.size[i] * (1 + t * 5); this.attr[i * 2 + 1] = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.16 * this.cold;
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.aState.needsUpdate = true;
  }
  dispose() { this.off(); this.game.scene.remove(this.points); this.points.geometry.dispose(); this.mat.dispose(); }
}
