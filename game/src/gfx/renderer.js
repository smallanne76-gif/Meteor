// HDR render pipeline: MSAA scene buffer -> depth SSAO -> dual-filter bloom -> filmic composite
// (grade, DOF, motion blur, memory/closed-eyes/cold overlays, grain, dither).
import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { installAtmosphere, updateAtmosphere } from './atmosphere.js';
import { clamp, lerp, damp } from '../core/util.js';

const FS_VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const AO_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDepth;
uniform mat4 uProjInv, uProj;
uniform vec2 uTexel;
uniform float uRadius, uIntensity;
vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = uProjInv * vec4(uv*2.0-1.0, d*2.0-1.0, 1.0); return p.xyz / p.w; }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main(){
  float d0 = texture2D(tDepth, vUv).x;
  if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 P = viewPos(vUv);
  vec3 Pr = viewPos(vUv + vec2(uTexel.x, 0.0)), Pl = viewPos(vUv - vec2(uTexel.x, 0.0));
  vec3 Pu = viewPos(vUv + vec2(0.0, uTexel.y)), Pd = viewPos(vUv - vec2(0.0, uTexel.y));
  vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
  vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
  vec3 N = normalize(cross(dx, dy));
  if (dot(N, P) > 0.0) N = -N;
  vec3 up = abs(N.y) < 0.99 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);
  vec3 T = normalize(cross(up, N)); vec3 B = cross(N, T);
  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  float rr = uRadius * clamp(-P.z * 0.35, 1.0, 3.0) ;
  float occ = 0.0;
  const int NS = 12;
  for (int i = 0; i < NS; i++) {
    float fi = float(i);
    float a = rot + fi * 2.39996;
    float r = sqrt((fi + 0.5) / float(NS));
    vec2 disk = vec2(cos(a), sin(a)) * r;
    vec3 dir = T * disk.x + B * disk.y + N * sqrt(max(0.0, 1.0 - dot(disk, disk)));
    float sc = mix(0.25, 1.0, fract(fi * 0.618 + ign(gl_FragCoord.yx)));
    vec3 S = P + dir * rr * sc;
    vec4 pr = uProj * vec4(S, 1.0);
    vec2 suv = pr.xy / pr.w * 0.5 + 0.5;
    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
    vec3 Q = viewPos(suv);
    float diff = Q.z - S.z;
    float range = smoothstep(0.0, 1.0, rr / max(0.001, abs(P.z - Q.z)));
    occ += step(0.03 * rr, diff) * range;
  }
  float ao = 1.0 - clamp(occ / float(NS) * uIntensity, 0.0, 1.0);
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`;

const AO_BLUR_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tAO, tDepth;
uniform vec2 uTexel;
uniform float uNear, uFar;
float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
void main(){
  float c = lin(texture2D(tDepth, vUv).x);
  float sum = 0.0, wsum = 0.0;
  for (int x = -2; x <= 1; x++) for (int y = -2; y <= 1; y++) {
    vec2 o = (vec2(float(x), float(y)) + 0.5) * uTexel;
    float a = texture2D(tAO, vUv + o).x;
    float z = lin(texture2D(tDepth, vUv + o).x);
    float w = exp(-abs(z - c) / (0.05 + c * 0.04));
    sum += a * w; wsum += w;
  }
  float v = sum / max(wsum, 1e-4);
  gl_FragColor = vec4(v, v, v, 1.0);
}`;

const BLOOM_PRE_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold, uKnee;
vec3 sampleSrc(vec2 uv){ return min(texture2D(tSrc, uv).rgb, vec3(24.0)); }
void main(){
  vec3 a = sampleSrc(vUv + uTexel*vec2(-1.,-1.)), b = sampleSrc(vUv + uTexel*vec2(1.,-1.)), c = sampleSrc(vUv + uTexel*vec2(-1.,1.)), d = sampleSrc(vUv + uTexel*vec2(1.,1.));
  vec3 col = (a+b+c+d)*0.25;
  float br = max(col.r, max(col.g, col.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0*uKnee); soft = soft*soft/(4.0*uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(col * contrib, 1.0);
}`;
const BLOOM_DOWN_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uTexel;
void main(){
  vec3 a = texture2D(tSrc, vUv + uTexel*vec2(-2.,-2.)).rgb, b = texture2D(tSrc, vUv + uTexel*vec2(0.,-2.)).rgb, c = texture2D(tSrc, vUv + uTexel*vec2(2.,-2.)).rgb;
  vec3 d = texture2D(tSrc, vUv + uTexel*vec2(-2.,0.)).rgb, e = texture2D(tSrc, vUv).rgb, f = texture2D(tSrc, vUv + uTexel*vec2(2.,0.)).rgb;
  vec3 g = texture2D(tSrc, vUv + uTexel*vec2(-2.,2.)).rgb, h = texture2D(tSrc, vUv + uTexel*vec2(0.,2.)).rgb, i = texture2D(tSrc, vUv + uTexel*vec2(2.,2.)).rgb;
  vec3 j = texture2D(tSrc, vUv + uTexel*vec2(-1.,-1.)).rgb, k = texture2D(tSrc, vUv + uTexel*vec2(1.,-1.)).rgb, l = texture2D(tSrc, vUv + uTexel*vec2(-1.,1.)).rgb, m = texture2D(tSrc, vUv + uTexel*vec2(1.,1.)).rgb;
  vec3 col = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
  gl_FragColor = vec4(col, 1.0);
}`;
const BLOOM_UP_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv; uniform sampler2D tSrc, tPrev; uniform vec2 uTexel; uniform float uMix;
void main(){
  vec3 col = texture2D(tSrc, vUv).rgb * 4.0;
  col += texture2D(tSrc, vUv + uTexel*vec2(-1.,0.)).rgb * 2.0 + texture2D(tSrc, vUv + uTexel*vec2(1.,0.)).rgb * 2.0 + texture2D(tSrc, vUv + uTexel*vec2(0.,-1.)).rgb * 2.0 + texture2D(tSrc, vUv + uTexel*vec2(0.,1.)).rgb * 2.0;
  col += texture2D(tSrc, vUv + uTexel*vec2(-1.,-1.)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.,-1.)).rgb + texture2D(tSrc, vUv + uTexel*vec2(-1.,1.)).rgb + texture2D(tSrc, vUv + uTexel*vec2(1.,1.)).rgb;
  col /= 16.0;
  gl_FragColor = vec4(col * uMix + texture2D(tPrev, vUv).rgb, 1.0);
}`;

const FINAL_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene, tBloom, tAO, tDepth;
uniform vec2 uRes;
uniform float uTime, uNear, uFar;
uniform float uExposure, uBloom, uAOAmt, uContrast, uSat, uTemp, uTint;
uniform vec3 uLift, uGain, uShadowTint, uHighTint;
uniform float uGamma;
uniform float uVignette, uGrain, uChroma;
uniform float uFade; uniform vec3 uFadeColor;
uniform float uMemory, uEyes, uCold, uFlash, uPulse, uDread, uBlink;
uniform float uDof, uFocus, uAperture;
uniform vec2 uMotion;
uniform float uBrightness;
uniform float uUseAO, uUseBloom;

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float lin(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
vec3 sceneAt(vec2 uv){ return texture2D(tScene, uv).rgb; }

void main(){
  vec2 uv = vUv;
  vec2 cuv = uv - 0.5;
  float r2 = dot(cuv, cuv);

  // memory ripple: gentle lens breathing
  uv += cuv * (uMemory * 0.012 * sin(uTime * 0.7) + uDread * 0.01 * sin(uTime * 3.1)) ;

  vec3 col;
  float depth = texture2D(tDepth, uv).x;
  float zlin = lin(depth);

  // ---- depth of field (gather) -------------------------------------------------------------------------------
  float coc = 0.0;
  if (uDof > 0.001) {
    float f = max(uFocus, 0.2);
    coc = clamp(abs(1.0 / f - 1.0 / max(zlin, 0.05)) * uAperture, 0.0, 1.0) * uDof;
  }
  float mb = length(uMotion);
  if (coc > 0.02 || mb > 0.0004) {
    vec3 acc = vec3(0.0); float wsum = 0.0;
    const int N = 14;
    for (int i = 0; i < N; i++) {
      float fi = float(i);
      float a = fi * 2.39996 + hash12(gl_FragCoord.xy) * 6.28;
      float rr = sqrt((fi + 0.5) / float(N));
      vec2 o = vec2(cos(a), sin(a)) * rr * coc * 0.012 * vec2(uRes.y / uRes.x, 1.0);
      o += uMotion * ((fi / float(N - 1)) - 0.5);
      vec3 s = sceneAt(uv + o);
      float w = 1.0 + dot(s, vec3(0.3)) ;
      acc += s * w; wsum += w;
    }
    col = acc / wsum;
  } else {
    col = sceneAt(uv);
  }

  // chromatic aberration (stronger at the edges, stronger in dread)
  float ca = uChroma * (0.0002 + r2 * 0.0016) + uDread * 0.0012 + uMemory * 0.0008;
  if (ca > 0.00005) {
    col.r = mix(col.r, sceneAt(uv + cuv * ca * 6.0).r, 0.85);
    col.b = mix(col.b, sceneAt(uv - cuv * ca * 6.0).b, 0.85);
  }

  // ambient occlusion
  if (uUseAO > 0.5) { float ao = texture2D(tAO, uv).x; col *= mix(1.0, ao, uAOAmt); }

  // bloom
  if (uUseBloom > 0.5) col += texture2D(tBloom, uv).rgb * uBloom;

  // exposure + (blink) + closed eyes
  float eyeLid = 1.0;
  if (uEyes > 0.001 || uBlink > 0.001) {
    float lid = max(uEyes, uBlink);
    // eyelids close from top and bottom
    float edge = abs(cuv.y) * 2.0;
    float closed = smoothstep(1.0 - lid * 1.15 - 0.15, 1.0 - lid * 1.15 + 0.1, 1.0 - edge * (1.0 - lid * 0.2) + (lid - 0.5) * 0.0);
    eyeLid = 1.0 - smoothstep(1.02 - lid * 1.4, 1.1 - lid * 1.4 + 0.25, edge);
    eyeLid = mix(eyeLid, 0.0, smoothstep(0.85, 1.0, lid));
    // blood-warm dark when fully closed
    col = mix(vec3(0.0), col, eyeLid * (1.0 - smoothstep(0.3, 1.0, uEyes) * 0.85));
    col += vec3(0.02, 0.004, 0.002) * uEyes * (1.0 - eyeLid);
  }
  col *= uExposure;

  // memory: golden, soft, light-bleeding
  if (uMemory > 0.001) {
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    vec3 warm = vec3(1.18, 1.0, 0.78);
    col = mix(col, mix(vec3(l), col, 0.55) * warm + vec3(0.025, 0.015, 0.0) * l, uMemory);
    // light veil
    col += vec3(0.05, 0.035, 0.02) * uMemory * smoothstep(0.1, 0.6, r2) ;
  }
  // dread: slight desaturation / cold crush
  if (uDread > 0.001) {
    float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
    col = mix(col, vec3(l) * vec3(0.9, 1.0, 1.08), uDread * 0.35);
  }

  // white balance
  col *= vec3(1.0 + uTemp, 1.0 + uTint * 0.5, 1.0 - uTemp);
  // split toning
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= mix(uShadowTint, uHighTint, smoothstep(0.02, 0.9, lum));
  // lift/gain
  col = col * uGain + uLift * 0.02;
  col = max(col, 0.0);
  col = pow(col, vec3(1.0 / uGamma));
  // saturation
  float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l2), col, uSat);

  // tonemap
  col = aces(col * 0.92);
  col = pow(col, vec3(1.0 / 2.2));
  // filmic contrast
  col = mix(col, col * col * (3.0 - 2.0 * col), uContrast);

  // frost vignette (cold) + edge darkening
  float vig = smoothstep(0.12, 0.62, r2 * 1.55);
  col *= 1.0 - vig * uVignette;
  if (uCold > 0.001) {
    float fr = smoothstep(0.16, 0.5, r2 * 1.6 + (hash12(floor(gl_FragCoord.xy / 3.0)) - 0.5) * 0.06);
    col = mix(col, vec3(0.78, 0.88, 0.95), fr * uCold * 0.55);
  }
  // flash / pulse (heartbeat edge pulse)
  col += vec3(uFlash);
  col *= 1.0 - uPulse * smoothstep(0.05, 0.5, r2) * 0.5;

  // grain + dither
  float g = hash12(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5;
  float g2 = hash12(gl_FragCoord.xy * 1.37 + fract(uTime * 1.3) * 53.1) - 0.5;
  float lum2 = dot(col, vec3(0.333));
  col += (g + g2) * uGrain * (0.55 - 0.35 * lum2) ;
  col += (g) / 255.0;

  col *= uBrightness;
  col = mix(col, uFadeColor, uFade);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const GRADES = {
  neutral:   { exposure: 1.0, contrast: 0.25, sat: 1.0, temp: 0.0, tint: 0.0, lift: [0, 0, 0], gain: [1, 1, 1], shadow: [1, 1, 1], high: [1, 1, 1], gamma: 1.0, vignette: 0.35, bloom: 0.5 },
  nightSnow: { exposure: 1.05, contrast: 0.35, sat: 0.9, temp: -0.05, tint: 0.0, lift: [-0.3, 0.1, 0.6], gain: [0.98, 1.0, 1.04], shadow: [0.92, 1.0, 1.1], high: [1.04, 1.0, 0.96], gamma: 1.05, vignette: 0.5, bloom: 0.6 },
  interiorWarm: { exposure: 1.05, contrast: 0.3, sat: 1.0, temp: 0.05, tint: 0.0, lift: [0.4, 0.1, -0.2], gain: [1.03, 1.0, 0.95], shadow: [0.95, 1.0, 1.07], high: [1.07, 1.0, 0.9], gamma: 1.02, vignette: 0.45, bloom: 0.55 },
  interiorCold: { exposure: 1.0, contrast: 0.35, sat: 0.82, temp: -0.03, tint: 0.0, lift: [-0.2, 0.2, 0.5], gain: [0.97, 1.0, 1.03], shadow: [0.9, 1.0, 1.1], high: [1.0, 1.0, 1.0], gamma: 1.08, vignette: 0.55, bloom: 0.5 },
  memory:    { exposure: 1.15, contrast: 0.12, sat: 1.05, temp: 0.12, tint: 0.0, lift: [0.5, 0.3, 0.0], gain: [1.05, 1.0, 0.92], shadow: [1.0, 0.98, 0.95], high: [1.1, 1.02, 0.9], gamma: 0.95, vignette: 0.4, bloom: 0.9 },
  summer:    { exposure: 1.1, contrast: 0.22, sat: 1.1, temp: 0.08, tint: 0.0, lift: [0.2, 0.2, 0.0], gain: [1.04, 1.0, 0.95], shadow: [0.95, 1.0, 1.06], high: [1.06, 1.0, 0.92], gamma: 0.98, vignette: 0.32, bloom: 0.75 },
  dawn:      { exposure: 1.1, contrast: 0.2, sat: 1.05, temp: 0.06, tint: 0.0, lift: [0.3, 0.2, 0.1], gain: [1.03, 1.0, 0.97], shadow: [0.97, 1.0, 1.05], high: [1.08, 1.02, 0.92], gamma: 0.98, vignette: 0.3, bloom: 0.8 },
  underground: { exposure: 1.0, contrast: 0.35, sat: 0.85, temp: 0.0, tint: 0.02, lift: [0.1, 0.2, 0.2], gain: [1.0, 1.0, 0.98], shadow: [0.93, 1.02, 1.06], high: [1.04, 1.0, 0.94], gamma: 1.06, vignette: 0.55, bloom: 0.5 },
  dread:     { exposure: 0.95, contrast: 0.4, sat: 0.7, temp: -0.06, tint: 0.02, lift: [-0.3, 0.2, 0.4], gain: [0.95, 1.0, 1.02], shadow: [0.9, 1.0, 1.1], high: [0.98, 1.0, 1.0], gamma: 1.1, vignette: 0.65, bloom: 0.5 },
};

export class Gfx {
  constructor(canvas) {
    installAtmosphere();
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, preserveDrawingBuffer: false });
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.autoUpdate = true;
    r.setClearColor(0x05070a, 1);
    this.info = r.info;
    this.maxAniso = r.capabilities.getMaxAnisotropy();

    this.quad = new THREE.Mesh(new THREE.BufferGeometry(), null);
    const g = this.quad.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    this.fsScene = new THREE.Scene(); this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsScene.add(this.quad); this.quad.frustumCulled = false;

    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: FS_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    this.mAO = mk(AO_FRAG, { tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.45 }, uIntensity: { value: 1.6 } });
    this.mAOBlur = mk(AO_BLUR_FRAG, { tAO: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() }, uNear: { value: 0.06 }, uFar: { value: 1200 } });
    this.mPre = mk(BLOOM_PRE_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.0 }, uKnee: { value: 0.5 } });
    this.mDown = mk(BLOOM_DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.mUp = mk(BLOOM_UP_FRAG, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } });
    const V = (...a) => new THREE.Vector3(...a);
    this.mFinal = mk(FINAL_FRAG, {
      tScene: { value: null }, tBloom: { value: null }, tAO: { value: null }, tDepth: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uNear: { value: 0.06 }, uFar: { value: 1200 },
      uExposure: { value: 1 }, uBloom: { value: 0.5 }, uAOAmt: { value: 0.85 }, uContrast: { value: 0.25 }, uSat: { value: 1 }, uTemp: { value: 0 }, uTint: { value: 0 },
      uLift: { value: V(0, 0, 0) }, uGain: { value: V(1, 1, 1) }, uShadowTint: { value: V(1, 1, 1) }, uHighTint: { value: V(1, 1, 1) }, uGamma: { value: 1 },
      uVignette: { value: 0.4 }, uGrain: { value: 0.05 }, uChroma: { value: 1 },
      uFade: { value: 0 }, uFadeColor: { value: V(0, 0, 0) },
      uMemory: { value: 0 }, uEyes: { value: 0 }, uCold: { value: 0 }, uFlash: { value: 0 }, uPulse: { value: 0 }, uDread: { value: 0 }, uBlink: { value: 0 },
      uDof: { value: 0 }, uFocus: { value: 5 }, uAperture: { value: 4 }, uMotion: { value: new THREE.Vector2() },
      uBrightness: { value: 1 }, uUseAO: { value: 0 }, uUseBloom: { value: 1 },
    });

    // live effect state (tweened by game code)
    this.fx = { fade: 1, fadeColor: new THREE.Color(0, 0, 0), memory: 0, eyes: 0, cold: 0, flash: 0, pulse: 0, dread: 0, blink: 0, dof: 0, focus: 5, exposureMul: 1, grain: 0.05 };
    this.grade = { ...GRADES.neutral };
    this.gradeTarget = { ...GRADES.neutral };
    this.gradeLerp = 1;
    this.prevQuat = new THREE.Quaternion(); this.prevEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.motion = new THREE.Vector2();
    this.time = 0;
    this.targets = {};
    this.size = { w: 1, h: 1 };
    this.applySettings();
  }

  // ---- settings -------------------------------------------------------------------------------------------------
  applySettings() {
    const p = settings.preset;
    this.p = p;
    const r = this.renderer;
    r.shadowMap.enabled = p.shadows;
    r.shadowMap.type = { basic: THREE.BasicShadowMap, pcf: THREE.PCFShadowMap, pcfsoft: THREE.PCFSoftShadowMap, vsm: THREE.VSMShadowMap }[p.shadowType] ?? THREE.PCFShadowMap;
    r.shadowMap.needsUpdate = true;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2) * p.pixelRatio * settings.get('resolutionScale');
    this.pixelRatio = Math.max(0.35, this.pixelRatio);
    this.resize(true);
    this.emitMaterialRefresh = true;
  }

  resize(force = false) {
    const w = Math.max(2, Math.floor((this.canvas.clientWidth || window.innerWidth) * this.pixelRatio));
    const h = Math.max(2, Math.floor((this.canvas.clientHeight || window.innerHeight) * this.pixelRatio));
    if (!force && w === this.size.w && h === this.size.h) return;
    this.size = { w, h };
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this._buildTargets();
  }

  _buildTargets() {
    const { w, h } = this.size;
    const old = this.targets;
    for (const k in old) { const t = old[k]; if (Array.isArray(t)) t.forEach((x) => x.dispose()); else t.dispose(); }
    const p = this.p;
    const maxS = this.renderer.capabilities.maxSamples;
    const samples = Math.min(p.msaa, maxS);
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType; depth.format = THREE.DepthFormat;
    const scene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, samples, depthTexture: depth, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    scene.texture.colorSpace = THREE.LinearSRGBColorSpace;
    const t = { scene };
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    const mk = (a, b, type = THREE.HalfFloatType) => new THREE.WebGLRenderTarget(a, b, { type, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    if (p.ssao) { t.ao = mk(hw, hh, THREE.UnsignedByteType); t.ao2 = mk(hw, hh, THREE.UnsignedByteType); }
    if (p.bloom) {
      const lv = 6; t.down = []; t.up = [];
      let bw = Math.max(2, Math.floor(w * 0.5 * p.bloomRes)), bh = Math.max(2, Math.floor(h * 0.5 * p.bloomRes));
      for (let i = 0; i < lv; i++) {
        t.down.push(mk(bw, bh)); t.up.push(mk(bw, bh));
        bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      }
    }
    this.targets = t;
  }

  setGrade(name, instant = false, rate = 1.4) {
    const g = GRADES[name] || GRADES.neutral;
    this.gradeTarget = { ...g }; this.gradeRate = rate;
    if (instant) this.grade = { ...g, lift: [...g.lift], gain: [...g.gain], shadow: [...g.shadow], high: [...g.high] };
  }

  _pass(mat, target, uniformsFn) {
    this.quad.material = mat;
    if (uniformsFn) uniformsFn(mat.uniforms);
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  // ---- frame ----------------------------------------------------------------------------------------------------
  render(scene, camera, dt, scatterDir) {
    const r = this.renderer, t = this.targets, p = this.p, fx = this.fx;
    this.time += dt;
    // grade easing
    const k = 1 - Math.exp(-(this.gradeRate || 1.4) * dt);
    const g = this.grade, gt = this.gradeTarget;
    for (const key of ['exposure', 'contrast', 'sat', 'temp', 'tint', 'gamma', 'vignette', 'bloom']) g[key] = lerp(g[key], gt[key], k);
    for (const key of ['lift', 'gain', 'shadow', 'high']) for (let i = 0; i < 3; i++) g[key][i] = lerp(g[key][i], gt[key][i], k);

    // camera angular velocity -> motion blur vector
    this.prevEuler.setFromQuaternion(this.prevQuat);
    const e = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(camera.quaternion);
    let dy = e.y - this.prevEuler.y; if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
    const dp = e.x - this.prevEuler.x;
    this.prevQuat.copy(camera.quaternion);
    const fovR = camera.fov * Math.PI / 180;
    const wantMB = p.motionBlur && settings.get('motionBlur');
    const mx = wantMB ? clamp(-dy / (fovR * camera.aspect) * 0.6, -0.02, 0.02) : 0;
    const my = wantMB ? clamp(dp / fovR * 0.6, -0.02, 0.02) : 0;
    this.motion.set(damp(this.motion.x, mx, 18, dt), damp(this.motion.y, my, 18, dt));

    camera.updateMatrixWorld();
    updateAtmosphere(camera, scatterDir || new THREE.Vector3(0, 1, 0));

    // 1. scene
    r.setRenderTarget(t.scene);
    r.clear();
    r.render(scene, camera);

    // 2. AO
    let useAO = 0;
    if (p.ssao && t.ao) {
      useAO = 1;
      const hw = t.ao.width, hh = t.ao.height;
      this._pass(this.mAO, t.ao, (u) => { u.tDepth.value = t.scene.depthTexture; u.uProjInv.value.copy(camera.projectionMatrixInverse); u.uProj.value.copy(camera.projectionMatrix); u.uTexel.value.set(1 / hw, 1 / hh); u.uRadius.value = 0.5; u.uIntensity.value = 1.7; });
      this._pass(this.mAOBlur, t.ao2, (u) => { u.tAO.value = t.ao.texture; u.tDepth.value = t.scene.depthTexture; u.uTexel.value.set(1 / hw, 1 / hh); u.uNear.value = camera.near; u.uFar.value = camera.far; });
    }

    // 3. bloom
    let useBloom = 0;
    if (p.bloom && t.down) {
      useBloom = 1;
      const lv = t.down.length;
      this._pass(this.mPre, t.down[0], (u) => { u.tSrc.value = t.scene.texture; u.uTexel.value.set(1 / this.size.w, 1 / this.size.h); u.uThreshold.value = 1.05; u.uKnee.value = 0.6; });
      for (let i = 1; i < lv; i++) this._pass(this.mDown, t.down[i], (u) => { u.tSrc.value = t.down[i - 1].texture; u.uTexel.value.set(1 / t.down[i - 1].width, 1 / t.down[i - 1].height); });
      // up: start with the smallest
      this._pass(this.mUp, t.up[lv - 1], (u) => { u.tSrc.value = t.down[lv - 1].texture; u.tPrev.value = t.down[lv - 1].texture; u.uTexel.value.set(1 / t.down[lv - 1].width, 1 / t.down[lv - 1].height); u.uMix.value = 0.0; });
      for (let i = lv - 2; i >= 0; i--) this._pass(this.mUp, t.up[i], (u) => { u.tSrc.value = t.up[i + 1].texture; u.tPrev.value = t.down[i].texture; u.uTexel.value.set(1 / t.up[i + 1].width, 1 / t.up[i + 1].height); u.uMix.value = 0.85; });
    }

    // 4. composite
    const dofOn = p.dof ? 1 : 0;
    this._pass(this.mFinal, null, (u) => {
      u.tScene.value = t.scene.texture; u.tDepth.value = t.scene.depthTexture; u.tAO.value = t.ao2 ? t.ao2.texture : null; u.tBloom.value = t.up ? t.up[0].texture : null;
      u.uRes.value.set(this.size.w, this.size.h); u.uTime.value = this.time; u.uNear.value = camera.near; u.uFar.value = camera.far;
      u.uExposure.value = g.exposure * fx.exposureMul; u.uBloom.value = g.bloom * 0.42; u.uAOAmt.value = 0.9;
      u.uContrast.value = g.contrast; u.uSat.value = g.sat; u.uTemp.value = g.temp; u.uTint.value = g.tint; u.uGamma.value = g.gamma;
      u.uLift.value.set(...g.lift); u.uGain.value.set(...g.gain); u.uShadowTint.value.set(...g.shadow); u.uHighTint.value.set(...g.high);
      u.uVignette.value = g.vignette; u.uGrain.value = p.grain ? fx.grain : 0.012; u.uChroma.value = p.chroma ? 1 : 0;
      u.uFade.value = fx.fade; u.uFadeColor.value.set(fx.fadeColor.r, fx.fadeColor.g, fx.fadeColor.b);
      u.uMemory.value = fx.memory; u.uEyes.value = fx.eyes; u.uCold.value = fx.cold; u.uFlash.value = fx.flash; u.uPulse.value = fx.pulse; u.uDread.value = fx.dread; u.uBlink.value = fx.blink;
      u.uDof.value = dofOn * fx.dof; u.uFocus.value = fx.focus; u.uAperture.value = 5.0;
      u.uMotion.value.copy(this.motion);
      u.uBrightness.value = settings.get('brightness');
      u.uUseAO.value = useAO; u.uUseBloom.value = useBloom;
    });
  }

  readPixels() {
    const gl = this.renderer.getContext();
    return gl;
  }
  dispose() { this.renderer.dispose(); }
}
