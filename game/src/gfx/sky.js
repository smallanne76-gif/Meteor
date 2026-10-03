// Procedural sky dome: gradient, sun/moon, stars, clouds, aurora. Also bakes an environment map (PMREM) for IBL.
import * as THREE from 'three';
import { atmo } from './atmosphere.js';

const VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;   // always at far plane
}`;

const FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 uTop, uHorizon, uBottom, uSunDir, uMoonDir, uSunCol, uMoonCol, uCloudCol, uAuroraA, uAuroraB;
uniform float uStars, uAurora, uCloud, uTime, uSunSize, uMoonSize, uHaze;
float h1(float n){ return fract(sin(n) * 43758.5453123); }
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  float a = fract(sin(dot(i, vec2(127.1,311.7))) * 43758.5453), b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7))) * 43758.5453);
  float c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7))) * 43758.5453), d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7))) * 43758.5453);
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n2(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }

void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uTop, t);
  // haze band hugging the horizon
  col = mix(col, uHorizon * 1.15, exp(-max(h, 0.0) * 9.0) * uHaze);
  col = mix(col, uBottom, smoothstep(0.0, -0.08, h));

  // sun
  float sd = dot(d, uSunDir);
  float sg = max(sd, 0.0);
  col += uSunCol * (pow(sg, 5.0) * 0.18 + pow(sg, 48.0) * 0.8 + pow(sg, 700.0) * 2.0);
  float sdisc = smoothstep(1.0 - uSunSize * 1.4, 1.0 - uSunSize, sd);
  col = mix(col, uSunCol * 22.0, sdisc * step(0.0, uSunDir.y + 0.04));

  // moon
  float md = dot(d, uMoonDir);
  float mdisc = smoothstep(1.0 - uMoonSize * 1.25, 1.0 - uMoonSize, md);
  if (mdisc > 0.0) {
    vec3 up = abs(uMoonDir.y) < 0.99 ? vec3(0,1,0) : vec3(1,0,0);
    vec3 tx = normalize(cross(up, uMoonDir)); vec3 ty = cross(uMoonDir, tx);
    vec2 mp = vec2(dot(d, tx), dot(d, ty)) / sqrt(uMoonSize * 2.0) * 1.0;
    float mare = fbm(mp * 3.5 + 4.0);
    float craters = fbm(mp * 14.0);
    float tone = 0.78 - 0.22 * smoothstep(0.45, 0.62, mare) - 0.08 * craters;
    float limb = sqrt(max(0.0, 1.0 - dot(mp, mp)));
    col = mix(col, uMoonCol * 5.0 * tone * (0.7 + 0.3 * limb), mdisc);
  }
  float mg = max(md, 0.0);
  col += uMoonCol * (pow(mg, 18.0) * 0.06 + pow(mg, 200.0) * 0.35) * step(0.0, uMoonDir.y + 0.05);

  // stars
  if (uStars > 0.001 && h > -0.02) {
    vec3 sp = d * 180.0;
    vec3 ip = floor(sp);
    float r = h3(ip);
    float star = step(0.9962, r);
    float mag = pow(h3(ip + 7.0), 6.0);
    vec3 f = fract(sp) - 0.5;
    float disc = smoothstep(0.5, 0.0, length(f));
    float tw = 0.75 + 0.25 * sin(uTime * (1.0 + h3(ip) * 4.0) + h3(ip + 3.0) * 20.0);
    vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), h3(ip + 11.0));
    float vis = smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(0.0, 0.7, mg) * 0.9);
    col += tint * star * (0.15 + 3.0 * mag) * disc * tw * uStars * vis;
    // milky-way-ish band of faint dust
    float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.8, -0.5))) * 3.2, 2.0));
    col += vec3(0.35, 0.42, 0.6) * (0.012 + 0.03 * fbm(d.xz * 9.0 + d.y * 4.0)) * band * uStars * vis * 1.3;
  }

  // clouds (single layer, projected)
  if (uCloud > 0.001 && h > 0.0) {
    vec2 cp = d.xz / (h + 0.22) * 1.6 + vec2(uTime * 0.004, uTime * 0.0025);
    float c = fbm(cp * 1.1) * 0.7 + fbm(cp * 3.7) * 0.3;
    float m = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.25, c);
    m *= smoothstep(0.0, 0.2, h);
    float lit = 0.55 + 0.45 * pow(max(sd, 0.0), 2.0) + 0.3 * pow(max(md, 0.0), 3.0);
    vec3 cc = uCloudCol * lit;
    col = mix(col, cc, m * 0.92);
  }

  // aurora curtains
  if (uAurora > 0.001 && h > 0.04) {
    float az = atan(d.x, d.z);
    float acc = 0.0; vec3 acol = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float el = 0.2 + 0.18 * fi;
      float wob = fbm(vec2(az * (2.0 + fi) + uTime * 0.03 * (1.0 + fi * 0.5), fi * 7.0));
      float band = exp(-pow((h - (el + wob * 0.28)) * (7.0 - fi), 2.0));
      float rays = pow(fbm(vec2(az * (22.0 + fi * 9.0) + wob * 5.0, uTime * 0.08 + fi)), 2.0);
      float fall = smoothstep(0.0, 0.5, h) ;
      float pres = smoothstep(0.3, 0.8, fbm(vec2(az * 1.2 + fi * 3.0, uTime * 0.02 + fi * 11.0)));
      float a = band * (0.35 + 1.4 * rays) * pres;
      vec3 cc = mix(uAuroraA, uAuroraB, smoothstep(0.1, 0.7, h + wob * 0.2));
      acol += cc * a; acc += a;
    }
    col += acol * uAurora * 0.9;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export const SKIES = {
  nightSnow: {
    top: '#050b1c', horizon: '#1b2e45', bottom: '#0b141d', stars: 1.0, aurora: 0.0, cloud: 0.18, cloudCol: '#2b3a52', haze: 0.8,
    sunDir: [0, -1, 0], sunCol: '#000000', moonDir: [-0.35, 0.58, -0.73], moonCol: '#cfe0ff', moonSize: 0.0005,
    fogColor: '#13202e', fogDensity: 0.010, fogBase: 0, fogFalloff: 0.06, scatterCol: '#2a4260', scatterPow: 5,
    lightColor: '#a9c4f0', lightIntensity: 1.25, hemiSky: '#38557d', hemiGround: '#15202a', hemiIntensity: 0.55, envIntensity: 0.55,
  },
  auroraNight: {
    top: '#030a1a', horizon: '#102740', bottom: '#09121b', stars: 1.0, aurora: 1.0, cloud: 0.05, cloudCol: '#223048', haze: 0.7,
    sunDir: [0, -1, 0], sunCol: '#000000', moonDir: [0.5, 0.45, -0.7], moonCol: '#c0d4f4', moonSize: 0.0005,
    auroraA: '#27ff9a', auroraB: '#9b4dff',
    fogColor: '#0f1c2b', fogDensity: 0.006, fogBase: 0, fogFalloff: 0.05, scatterCol: '#1f4a50', scatterPow: 4,
    lightColor: '#a9c4f0', lightIntensity: 1.15, hemiSky: '#2f5278', hemiGround: '#14202a', hemiIntensity: 0.55, envIntensity: 0.6,
  },
  dusk: {
    top: '#1b2850', horizon: '#c0735a', bottom: '#2a2428', stars: 0.2, aurora: 0.0, cloud: 0.5, cloudCol: '#9a6a68', haze: 1.0,
    sunDir: [-0.2, 0.04, -0.98], sunCol: '#ff9a5a', moonDir: [0.6, 0.5, 0.6], moonCol: '#c0d0f0', moonSize: 0.0005,
    fogColor: '#6a5668', fogDensity: 0.007, fogBase: 0, fogFalloff: 0.05, scatterCol: '#ff8a50', scatterPow: 4,
    lightColor: '#ff9d60', lightIntensity: 3.2, hemiSky: '#6a6c9a', hemiGround: '#3a2a28', hemiIntensity: 0.5, envIntensity: 0.9,
  },
  dawn: {
    top: '#35517e', horizon: '#f0b690', bottom: '#8a8a90', stars: 0.0, aurora: 0.0, cloud: 0.45, cloudCol: '#f2d2bc', haze: 1.0,
    sunDir: [-0.4, 0.14, -0.9], sunCol: '#ffd9a8', moonDir: [0.6, -0.5, 0.6], moonCol: '#000000', moonSize: 0.0003,
    fogColor: '#c9b8b0', fogDensity: 0.006, fogBase: 0, fogFalloff: 0.05, scatterCol: '#ffc890', scatterPow: 5,
    lightColor: '#ffd2a0', lightIntensity: 4.2, hemiSky: '#9ab0d8', hemiGround: '#7a6a62', hemiIntensity: 0.9, envIntensity: 1.1,
  },
  morning: {
    top: '#4a7fc0', horizon: '#cfe0ee', bottom: '#aab4ba', stars: 0.0, aurora: 0.0, cloud: 0.4, cloudCol: '#ffffff', haze: 0.8,
    sunDir: [-0.35, 0.45, -0.82], sunCol: '#fff0d8', moonDir: [0.6, -0.5, 0.6], moonCol: '#000000', moonSize: 0.0003,
    fogColor: '#c4d3de', fogDensity: 0.004, fogBase: 0, fogFalloff: 0.06, scatterCol: '#fff0d0', scatterPow: 6,
    lightColor: '#fff0dc', lightIntensity: 5.5, hemiSky: '#a6c4e8', hemiGround: '#8a8f86', hemiIntensity: 1.1, envIntensity: 1.2,
  },
  summerEvening: {
    top: '#3f78c4', horizon: '#ffd7a0', bottom: '#8a8a70', stars: 0.0, aurora: 0.0, cloud: 0.35, cloudCol: '#ffe9d0', haze: 1.0,
    sunDir: [-0.55, 0.28, -0.78], sunCol: '#ffcf8a', moonDir: [0.6, -0.5, 0.6], moonCol: '#000000', moonSize: 0.0003,
    fogColor: '#e0cdb0', fogDensity: 0.0035, fogBase: 0, fogFalloff: 0.05, scatterCol: '#ffb870', scatterPow: 5,
    lightColor: '#ffd49a', lightIntensity: 5.2, hemiSky: '#90b4e0', hemiGround: '#7a7a50', hemiIntensity: 1.0, envIntensity: 1.1,
  },
  dim: {   // generic interior: no sky shown
    top: '#050608', horizon: '#0a0c10', bottom: '#050608', stars: 0, aurora: 0, cloud: 0, cloudCol: '#000', haze: 0,
    sunDir: [0, -1, 0], sunCol: '#000', moonDir: [0, -1, 0], moonCol: '#000', moonSize: 0.0001,
    fogColor: '#0b0d10', fogDensity: 0.02, fogBase: 0, fogFalloff: 0.2, scatterCol: '#000', scatterPow: 4,
    lightColor: '#000', lightIntensity: 0, hemiSky: '#222a33', hemiGround: '#14110e', hemiIntensity: 0.3, envIntensity: 0.12,
  },
};

export class Sky {
  constructor() {
    this.uniforms = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, -1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color() }, uMoonCol: { value: new THREE.Color() }, uCloudCol: { value: new THREE.Color() },
      uAuroraA: { value: new THREE.Color('#27ff9a') }, uAuroraB: { value: new THREE.Color('#9b4dff') },
      uStars: { value: 1 }, uAurora: { value: 0 }, uCloud: { value: 0.2 }, uTime: { value: 0 }, uSunSize: { value: 0.00035 }, uMoonSize: { value: 0.0005 }, uHaze: { value: 0.8 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';
    this.cur = null;
    this.sunDir = new THREE.Vector3(); this.moonDir = new THREE.Vector3();
  }

  /** apply a sky preset (optionally overriding fields) */
  set(nameOrDef, over = {}) {
    const d = typeof nameOrDef === 'string' ? { ...SKIES[nameOrDef], ...over } : { ...nameOrDef, ...over };
    this.cur = d;
    const u = this.uniforms;
    u.uTop.value.set(d.top); u.uHorizon.value.set(d.horizon); u.uBottom.value.set(d.bottom);
    this.sunDir.set(...d.sunDir).normalize(); this.moonDir.set(...d.moonDir).normalize();
    u.uSunDir.value.copy(this.sunDir); u.uMoonDir.value.copy(this.moonDir);
    u.uSunCol.value.set(d.sunCol); u.uMoonCol.value.set(d.moonCol); u.uCloudCol.value.set(d.cloudCol);
    u.uStars.value = d.stars; u.uAurora.value = d.aurora; u.uCloud.value = d.cloud; u.uHaze.value = d.haze ?? 0.8;
    u.uMoonSize.value = d.moonSize ?? 0.0005;
    if (d.auroraA) u.uAuroraA.value.set(d.auroraA);
    if (d.auroraB) u.uAuroraB.value.set(d.auroraB);
    // atmosphere (fog scattering)
    atmo.uFogBase.value = d.fogBase; atmo.uFogFalloff.value = d.fogFalloff;
    atmo.uScatterCol.value.set(d.scatterCol); atmo.uScatterPow.value = d.scatterPow;
    return d;
  }
  /** direction toward the dominant light (sun if up, else moon) */
  lightDir(target = new THREE.Vector3()) {
    const d = this.cur;
    if (d && d.sunDir[1] > -0.05 && d.sunCol !== '#000000' && d.sunCol !== '#000') return target.copy(this.sunDir);
    return target.copy(this.moonDir);
  }
  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    if (camera) this.mesh.position.copy(camera.position);
  }

  /** Build an environment map from the current sky; call after set(). */
  buildEnv(renderer, intensityHint = 1) {
    const size = 128;
    const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cam = new THREE.CubeCamera(1, 2000, rt);
    const s = new THREE.Scene(); s.add(this.mesh.clone());
    const prev = this.mesh.position.clone();
    const m = s.children[0]; m.position.set(0, 0, 0);
    cam.update(renderer, s);
    if (!this._pmrem) this._pmrem = new THREE.PMREMGenerator(renderer);
    const env = this._pmrem.fromCubemap(rt.texture);
    rt.dispose();
    if (this.env) this.env.dispose();
    this.env = env.texture;
    this.mesh.position.copy(prev);
    return this.env;
  }
}
