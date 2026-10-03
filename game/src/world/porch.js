import * as THREE from 'three';
import { solid } from '../gfx/materials.js';
import { Builder } from './builder.js';
import { card } from '../gfx/materials.js';

/** The porch light: a caged lantern on the wall beside the door, always on. A halo sprite sells the glow. */
export function buildPorchLight(game, parent, x = 1.35, y = 2.35, z = 5.62) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const metal = solid(0x1c1c1e, { rough: 0.5, metal: 0.8 });
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.04), metal); back.position.z = -0.02; g.add(back);
  const glass = new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffc070, emissiveIntensity: 2.2, transparent: true, opacity: 0.85, roughness: 0.3 });
  const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.19, 12, 1, true), glass); gl.position.set(0, 0, 0.1); g.add(gl);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.095, 0.06, 12), metal); cap.position.set(0, 0.125, 0.1); g.add(cap);
  const bot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.02, 12), metal); bot.position.set(0, -0.105, 0.1); g.add(bot);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff2cc })); bulb.position.set(0, 0, 0.1); g.add(bulb);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: card('soft_dot'), color: 0xffc27a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(1.6, 1.6, 1); halo.position.set(0, 0, 0.14); g.add(halo);
  const lt = game.lights.add({ pos: [x, y, z + 0.4], color: 0xffbe70, intensity: 55, distance: 16, decay: 1.7, shadow: true, flicker: { amp: 0.04, speed: 2.3 }, tag: 'porch', on: true });
  const api = { group: g, light: lt, halo, glass, on: true, set(v) { api.on = v; lt.on = v; glass.emissiveIntensity = v ? 2.2 : 0; bulb.material.color.set(v ? 0xfff2cc : 0x222222); halo.visible = v; game.emit('porch', v); } };
  // faint electrical hum so the player can hear it long before the lodge is visible
  game.audio && game.audio.amb.addHum(new THREE.Vector3(x, y, z + 0.4), { f: 60, gain: 0.012, name: 'porchhum' });
  return api;
}
