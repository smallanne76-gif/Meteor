// Shadow self-test. Some GPU/driver combinations return garbage when a shadow map is sampled in the same frame it was
// drawn: shadowed lights then come out black or blotchy (night scenes go dark, lamps flicker). At start-up we light a
// white plate with each kind of shadow-casting light, once with the shadow on and once off, with nothing in the way.
// Both must look the same. A light type that comes out clearly darker with its shadow on gets its shadows turned off.
import * as THREE from 'three';

function lum(px) { return 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]; }

export function probeShadows(renderer, { msaa = 0, sizes = { dir: 1024, spot: 512, point: 256 } } = {}) {
  const result = { dir: true, spot: true, point: true, detail: {} };
  const rt = new THREE.WebGLRenderTarget(32, 32, { samples: Math.min(msaa, renderer.capabilities.maxSamples || 0) });
  const scene = new THREE.Scene();
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }));
  plate.rotation.x = -Math.PI / 2; plate.receiveShadow = true; plate.castShadow = true; scene.add(plate);
  // a caster far outside every light's view of the plate centre, so the shadow pass has real work to do
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), plate.material); block.position.set(2.6, 0.25, 2.6); block.castShadow = true; scene.add(block);
  const cam = new THREE.PerspectiveCamera(20, 1, 0.1, 50); cam.position.set(0, 6, 0.01); cam.lookAt(0, 0, 0);

  const lights = {
    dir: () => { const l = new THREE.DirectionalLight(0xffffff, 2); l.position.set(1, 8, 1); l.target.position.set(0, 0, 0); scene.add(l.target); Object.assign(l.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 }); l.shadow.mapSize.set(sizes.dir, sizes.dir); l.shadow.bias = -0.0006; l.shadow.normalBias = 0.05; return l; },
    spot: () => { const l = new THREE.SpotLight(0xffffff, 60, 20, 0.7, 0.5, 2); l.position.set(0.5, 4, 0.5); l.target.position.set(0, 0, 0); scene.add(l.target); l.shadow.mapSize.set(sizes.spot, sizes.spot); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.02; return l; },
    point: () => { const l = new THREE.PointLight(0xffffff, 40, 12, 2); l.position.set(0.3, 2.5, 0.3); l.shadow.mapSize.set(sizes.point, sizes.point); l.shadow.bias = -0.004; l.shadow.normalBias = 0.06; l.shadow.camera.near = 0.15; return l; },
  };
  const prevTarget = renderer.getRenderTarget();
  const px = new Uint8Array(4 * 4);
  const shot = () => {
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam);
    renderer.render(scene, cam);                                   // twice: the second frame samples a map drawn this frame and kept from the last
    renderer.readRenderTargetPixels(rt, 14, 14, 2, 2, px);
    return (lum(px.subarray(0, 4)) + lum(px.subarray(4, 8)) + lum(px.subarray(8, 12)) + lum(px.subarray(12, 16))) / 4;
  };
  try {
    for (const k of Object.keys(lights)) {
      const l = lights[k](); scene.add(l);
      l.castShadow = false; const off = shot();
      l.castShadow = true; const on = shot();
      scene.remove(l); if (l.target) scene.remove(l.target); if (l.shadow && l.shadow.map) l.shadow.map.dispose();
      // nothing is between the light and the plate centre, so a working shadow changes nothing
      const ok = off < 8 || on >= off * 0.75;
      result[k] = ok; result.detail[k] = { off: Math.round(off), on: Math.round(on) };
    }
  } catch (e) {
    result.error = String(e && e.message || e);
  } finally {
    renderer.setRenderTarget(prevTarget);
    rt.dispose(); plate.geometry.dispose(); plate.material.dispose(); block.geometry.dispose();
  }
  return result;
}
