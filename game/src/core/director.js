// Cinematic camera direction: take control from the player, move between composed shots, handheld drift, DOF focus.
import * as THREE from 'three';
import { clamp, lerp, damp, easeInOut, smoother } from './util.js';
import { settings } from './settings.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();

export class Director {
  constructor(game) {
    this.game = game; this.active = false; this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.fov = 60; this.roll = 0;
    this.shot = null; this.hand = 0.0; this.t0 = 0; this.focus = null; this.target = null;
    game.on('update', (dt) => this.update(dt));
  }
  /** take the camera. pos/look are Vector3 or [x,y,z] */
  take({ pos, look, fov = 58, handheld = 0.25, bars = true, dof = 0.0, hideHands = true, mode = 'cutscene' } = {}) {
    const g = this.game; this.active = true;
    this.pos.set(...(Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z])); this.look.set(...(Array.isArray(look) ? look : [look.x, look.y, look.z])); this.fov = fov; this.hand = handheld;
    this.prevMode = g.mode; g.setMode(mode); if (hideHands) g.hands.setVisible(false); if (bars) g.ui.cinema(true);
    g.gfx.fx.dof = dof; this.shot = null; this.apply(0); return this;
  }
  release({ keepBars = false } = {}) {
    const g = this.game; this.active = false; this.shot = null; g.hands.setVisible(true); if (!keepBars) g.ui.cinema(false); g.gfx.fx.dof = 0;
    g.setMode('free'); g.player.syncCamera && 0; g.camera.fov = settings.get('fov'); g.camera.updateProjectionMatrix();
  }
  /** glide to a new composition over `dur` s with easing */
  move({ pos, look, fov, dur = 3, ease = easeInOut, handheld }) {
    return new Promise((res) => {
      const a = { pos: this.pos.clone(), look: this.look.clone(), fov: this.fov };
      const b = { pos: new THREE.Vector3(...(Array.isArray(pos) ? pos : (pos ? [pos.x, pos.y, pos.z] : a.pos.toArray()))), look: new THREE.Vector3(...(Array.isArray(look) ? look : (look ? [look.x, look.y, look.z] : a.look.toArray()))), fov: fov ?? a.fov };
      if (handheld !== undefined) this.hand = handheld;
      this.shot = { a, b, t: 0, dur, ease, res };
    });
  }
  /** instantly cut to a composition */
  cut({ pos, look, fov, handheld }) { this.pos.set(...(Array.isArray(pos) ? pos : [pos.x, pos.y, pos.z])); this.look.set(...(Array.isArray(look) ? look : [look.x, look.y, look.z])); if (fov) this.fov = fov; if (handheld !== undefined) this.hand = handheld; this.shot = null; this.apply(0); }
  /** keep the look target tracking an object each frame */
  track(fn) { this.target = fn; }
  setFocus(distOrFn) { this.focus = distOrFn; }
  update(dt) {
    if (!this.active) return;
    const s = this.shot;
    if (s) { s.t += dt; const k = clamp(s.t / s.dur); const e = s.ease(k); this.pos.lerpVectors(s.a.pos, s.b.pos, e); this.look.lerpVectors(s.a.look, s.b.look, e); this.fov = lerp(s.a.fov, s.b.fov, e); if (k >= 1) { this.shot = null; s.res(); } }
    if (this.target) { const t = this.target(); if (t) this.look.copy(t); }
    this.apply(dt);
  }
  apply(dt) {
    const g = this.game, cam = g.camera; const t = g.time;
    // handheld drift: slow sines, never constant shake
    const hh = settings.get('cameraShake') ? this.hand : this.hand * 0.2;
    const dx = (Math.sin(t * 0.61) + Math.sin(t * 1.37 + 1) * 0.5) * 0.004 * hh, dy = (Math.sin(t * 0.47 + 2) + Math.sin(t * 1.11) * 0.4) * 0.004 * hh;
    cam.position.set(this.pos.x + dx, this.pos.y + dy, this.pos.z);
    _m.lookAt(cam.position, this.look, new THREE.Vector3(0, 1, 0)); _q.setFromRotationMatrix(_m);
    cam.quaternion.copy(_q);
    cam.rotateZ(Math.sin(t * 0.33) * 0.004 * hh + this.roll);
    cam.rotateX(Math.sin(t * 0.7) * 0.0015 * hh);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    // auto focus
    if (g.gfx.fx.dof > 0 || this.focus) { const f = typeof this.focus === 'function' ? this.focus() : (this.focus ?? cam.position.distanceTo(this.look)); g.gfx.fx.focus = damp(g.gfx.fx.focus, f, 4, dt || 0.016); }
  }
}
