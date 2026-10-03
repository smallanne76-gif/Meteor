// PBR material library on top of the baked textures. World-scale UVs are applied to *geometry* (see geo.js),
// so one material serves every size of wall/floor/prop.
import * as THREE from 'three';
import { settings } from '../core/settings.js';
import { bindAtmo } from './atmosphere.js';

const BASE = './assets/tex/';
const loader = new THREE.TextureLoader();
const texCache = new Map();
let renderer = null;
export function initMaterials(r) { renderer = r; }

function tex(url, srgb) {
  const key = url + (srgb ? ':s' : ':l');
  if (texCache.has(key)) return texCache.get(key);
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = Math.min(settings.preset.anisotropy, renderer ? renderer.capabilities.getMaxAnisotropy() : 4);
  t.userData.shared = true;
  texCache.set(key, t);
  return t;
}

/** list of every texture file the game uses, for the loading screen */
export const TEX_MANIFEST = [
  'snow', 'snow_packed', 'forest_floor', 'bark', 'wood_floor', 'wood_pale', 'wood_paint', 'wood_dark', 'log_wall', 'plaster', 'wallpaper', 'concrete', 'brick',
  'rock', 'metal_rust', 'fabric_wool', 'fabric_green', 'canvas', 'parka', 'wool_knit', 'tile', 'ice', 'water', 'grass', 'gravel', 'paper', 'skin',
];
export const CARD_MANIFEST = ['pine_card', 'pine_snow_card', 'leaf_card', 'grass_card', 'flower_card', 'soft_dot', 'flake', 'footprint', 'stain', 'scratch'];

export function preloadTextures(onProgress) {
  const urls = [];
  for (const n of TEX_MANIFEST) urls.push([`${BASE}${n}_c.jpg`, true], [`${BASE}${n}_n.jpg`, false], [`${BASE}${n}_o.jpg`, false]);
  for (const n of CARD_MANIFEST) urls.push([`${BASE}${n}.png`, true]);
  urls.push([`${BASE}noise.jpg`, false], [`${BASE}books.jpg`, true]);
  let done = 0;
  return Promise.all(urls.map(([u, s]) => new Promise((res) => {
    const t = tex(u, s);
    const finish = () => { done++; onProgress && onProgress(done / urls.length); res(); };
    if (t.image && t.image.complete) finish();
    else {
      // TextureLoader sets image later; poll via onLoad on the image element
      const img = new Image(); img.onload = img.onerror = finish; img.src = u;
    }
  })));
}

export const card = (name) => tex(`${BASE}${name}.png`, true);
export const noiseTex = () => tex(`${BASE}noise.jpg`, false);
export const booksTex = () => tex(`${BASE}books.jpg`, true);

const matCache = new Map();

/**
 * pbr('wood_floor', { tint:0xffffff, rough:1, normal:1, metal:0, wet:0, key:'x' })
 * Roughness/AO come from the baked _o map (R=AO, G=roughness).
 */
export function pbr(name, o = {}) {
  const key = `${name}|${o.tint ?? ''}|${o.rough ?? ''}|${o.normal ?? ''}|${o.metal ?? ''}|${o.wet ?? ''}|${o.side ?? ''}|${o.emissive ?? ''}|${o.key ?? ''}|${o.aoStrength ?? ''}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    map: tex(`${BASE}${name}_c.jpg`, true),
    normalMap: tex(`${BASE}${name}_n.jpg`, false),
    normalScale: new THREE.Vector2(o.normal ?? 1, o.normal ?? 1),
    roughnessMap: tex(`${BASE}${name}_o.jpg`, false),
    aoMap: tex(`${BASE}${name}_o.jpg`, false),
    aoMapIntensity: o.aoStrength ?? 1,
    roughness: o.rough ?? 1,
    metalness: o.metal ?? 0,
    metalnessMap: o.metal ? tex(`${BASE}${name}_o.jpg`, false) : null,
    color: new THREE.Color(o.tint ?? 0xffffff),
    side: o.side ?? THREE.FrontSide,
  });
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  if (o.wet) patchWet(m, o.wet);
  m.userData.shared = true;
  matCache.set(key, m);
  return m;
}

/** plain colour material */
export function solid(color, o = {}) {
  const key = `solid|${color}|${o.rough ?? .8}|${o.metal ?? 0}|${o.emissive ?? ''}|${o.side ?? ''}|${o.opacity ?? ''}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, side: o.side ?? THREE.FrontSide });
  if (o.emissive) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  if (o.opacity !== undefined) { m.transparent = true; m.opacity = o.opacity; }
  m.userData.shared = true;
  matCache.set(key, m);
  return m;
}

export function glass(o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: o.color ?? 0xcfe4ea, roughness: o.rough ?? 0.04, metalness: 0, transmission: 0, transparent: true, opacity: o.opacity ?? 0.18,
    ior: 1.5, envMapIntensity: o.env ?? 1.4, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1,
  });
  m.userData.shared = true;
  return m;
}

/** wet look: darkens albedo + drops roughness in noisy puddly patches (world-space) */
function patchWet(m, amt) {
  m.onBeforeCompile = (shader) => {
    bindAtmo(shader);
    shader.uniforms.uWet = { value: amt };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform float uWet;
float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float wn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(wh(i),wh(i+vec2(1,0)),f.x), mix(wh(i+vec2(0,1)),wh(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float wetMask = smoothstep(0.35, 0.65, wn(vWPos.xz * 0.7) * 0.6 + wn(vWPos.xz * 2.3) * 0.4) * uWet;
roughnessFactor = mix(roughnessFactor, 0.08, wetMask);
diffuseColor.rgb *= 1.0 - wetMask * 0.45;`);
  };
}

/** Snow surface: adds sparkle + a cold sub-surface tint. Sampled in world space so it never tiles visibly. */
let SEASON = 'winter';
/** summer hides every snow cap (roofs, rocks, cars) without touching the code that places them */
export function setSeason(s) { SEASON = s; }
export const getSeason = () => SEASON;
let _noSnow = null;
export function snowMaterial(o = {}) {
  if (SEASON === 'summer') return (_noSnow ||= Object.assign(new THREE.MeshBasicMaterial({ visible: false }), { userData: { shared: true } }));
  const key = 'snowmat|' + (o.name ?? 'snow') + (o.tint ?? '');
  if (matCache.has(key)) return matCache.get(key);
  const m = pbr(o.name ?? 'snow', { tint: o.tint ?? 0xffffff, key: 'snowbase', normal: 1.0, rough: 1 }).clone();
  m.userData.shared = true;
  m.onBeforeCompile = (shader) => {
    bindAtmo(shader);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vWPos;
float sh(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // glints: tiny crystals that catch the light depending on view angle
  vec3 cell = floor(vWPos * 38.0);
  float g = sh(cell);
  float tw = step(0.985, g);
  vec3 V = normalize(vViewPosition);
  float ph = sh(cell + 17.0) * 6.2831;
  float flick = pow(max(0.0, sin(ph + dot(V, vec3(5.0, 3.0, 4.0)) * 6.0)), 24.0);
  totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * tw * flick * 0.55;
}`);
  };
  matCache.set(key, m);
  return m;
}

/** rebuild anisotropy after a settings change */
export function refreshTextureQuality() {
  for (const t of texCache.values()) t.anisotropy = Math.min(settings.preset.anisotropy, renderer ? renderer.capabilities.getMaxAnisotropy() : 4);
}

/** an alpha-tested foliage card material (double sided, shadow-casting via alphaTest) */
export function foliageMaterial(name, o = {}) {
  const key = 'fol|' + name + (o.tint ?? '') + (o.rough ?? '');
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ map: card(name), alphaTest: o.alphaTest ?? 0.45, side: THREE.DoubleSide, roughness: o.rough ?? 0.9, color: new THREE.Color(o.tint ?? 0xffffff) });
  m.userData.shared = true;
  matCache.set(key, m);
  return m;
}
