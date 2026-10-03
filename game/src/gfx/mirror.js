// Planar mirror: renders the scene from the reflected camera into a render target. Objects on `GHOST_LAYER` are visible ONLY in mirrors —
// that is how the bathroom mirror shows the Searcher standing exactly where your own reflection should be.
import * as THREE from 'three';
import { clamp, damp } from '../core/util.js';

export const GHOST_LAYER = 3;

const VERT = `uniform mat4 textureMatrix; varying vec4 vUv; varying vec2 vPos; void main(){ vUv = textureMatrix * vec4(position,1.0); vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FRAG = `uniform sampler2D tDiffuse; uniform vec3 uTint; uniform float uDirt; uniform float uFog; uniform vec2 uSize; varying vec4 vUv; varying vec2 vPos;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec2 uv = vUv.xy / vUv.w;
  // slight warp so old glass isn't perfect
  uv += (vec2(n(vPos*9.0), n(vPos*9.0+7.0)) - 0.5) * 0.004;
  vec3 c = texture2D(tDiffuse, uv).rgb;
  // silvering wear: dark speckled edges, foggy patches (breath on glass)
  vec2 q = vPos / uSize + 0.5; float edge = smoothstep(0.0, 0.14, min(min(q.x, 1.0-q.x), min(q.y, 1.0-q.y)));
  float stain = n(vPos*14.0)*0.5 + n(vPos*40.0)*0.25;
  float fog = uFog * (0.6 + 0.4*n(vPos*6.0));
  c = mix(c, vec3(0.55,0.62,0.66) * 0.5, fog * 0.8);
  c *= (0.55 + 0.25*edge) * (1.0 - uDirt*stain*0.35);
  gl_FragColor = vec4(c * uTint, 1.0);
}`;

export class Mirror {
  /** pos: world centre; yaw: rotation about Y so the mirror's +Z faces into the room */
  constructor(game, { pos, yaw = 0, w = 0.6, h = 0.8, res = 512, parent }) {
    this.game = game; this.w = w; this.h = h; this.enabled = true; this.ghost = null; this.active = false; this.fog = 0;
    const rt = this.rt = new THREE.WebGLRenderTarget(Math.round(res * (w / h > 1 ? 1 : w / h)) || res, Math.round(res * (w / h > 1 ? h / w : 1)) || res, { type: THREE.HalfFloatType, samples: 0 });
    rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.textureMatrix = new THREE.Matrix4();
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { tDiffuse: { value: rt.texture }, textureMatrix: { value: this.textureMatrix }, uTint: { value: new THREE.Color(1, 1, 1) }, uDirt: { value: 1 }, uFog: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) } } });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat); this.mesh.position.set(pos.x, pos.y, pos.z); this.mesh.rotation.y = yaw; this.mesh.name = 'mirror';
    (parent || game.root).add(this.mesh);
    this.vcam = new THREE.PerspectiveCamera(); this.vcam.layers.enable(GHOST_LAYER);
    this._n = new THREE.Vector3(); this._rp = new THREE.Vector3(); this._cp = new THREE.Vector3(); this._view = new THREE.Vector3(); this._la = new THREE.Vector3(); this._tg = new THREE.Vector3();
    this._rot = new THREE.Matrix4(); this._plane = new THREE.Plane(); this._clip = new THREE.Vector4(); this._q = new THREE.Vector4();
    this.mesh.onBeforeRender = (renderer, scene, camera) => this.render(renderer, scene, camera);
    this.maxDist = 6.5;
  }
  render(renderer, scene, camera) {
    if (!this.enabled) return;
    const rp = this._rp.setFromMatrixPosition(this.mesh.matrixWorld), cp = this._cp.setFromMatrixPosition(camera.matrixWorld);
    this._rot.extractRotation(this.mesh.matrixWorld); const n = this._n.set(0, 0, 1).applyMatrix4(this._rot);
    const view = this._view.subVectors(rp, cp);
    if (view.dot(n) > 0 || view.length() > this.maxDist) { this.active = false; return; }
    this.active = true;
    view.reflect(n).negate().add(rp);
    this._rot.extractRotation(camera.matrixWorld);
    this._la.set(0, 0, -1).applyMatrix4(this._rot).add(cp);
    this._tg.subVectors(rp, this._la).reflect(n).negate().add(rp);
    const v = this.vcam; v.position.copy(view); v.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n); v.lookAt(this._tg);
    v.far = camera.far; v.near = camera.near; v.updateMatrixWorld(); v.projectionMatrix.copy(camera.projectionMatrix);
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(v.projectionMatrix).multiply(v.matrixWorldInverse).multiply(this.mesh.matrixWorld);
    this._plane.setFromNormalAndCoplanarPoint(n, rp).applyMatrix4(v.matrixWorldInverse);
    const clip = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant); const pm = v.projectionMatrix; const q = this._q;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0]; q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5]; q.z = -1.0; q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0 - 0.003; pm.elements[14] = clip.w;
    this.mesh.visible = false;
    const cur = renderer.getRenderTarget(); const sa = renderer.shadowMap.autoUpdate; renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt); renderer.state.buffers.depth.setMask(true); renderer.clear(); renderer.render(scene, v);
    renderer.shadowMap.autoUpdate = sa; renderer.setRenderTarget(cur);
    this.mesh.visible = true;
  }
  setFog(v) { this.fog = v; this.mat.uniforms.uFog.value = v; }
  dispose() { this.rt.dispose(); this.mat.dispose(); this.mesh.parent && this.mesh.parent.remove(this.mesh); }
}
