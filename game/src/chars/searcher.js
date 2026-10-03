// The Searcher: tall, wet, hooded, carrying a brass lantern, calling "Jo…". It is the part of Mara that never stopped searching.
// Rules (learned by the player): it will not enter lit places (lit rooms, lamp pools); it walks the same search; it reaches out
// rather than lunges; when it catches you, you wake by the fire with the porch light on.
import * as THREE from 'three';
import { Humanoid } from './humanoid.js';
import { clamp, damp, lerp, wrapAngle, RNG, dampAngle } from '../core/util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Searcher {
  /**
   * opts: { world:{ ground(x,z,y)->y, lit(x,y,z)->bool, nav?:fn }, speed }
   * states: 'absent' | 'glimpse' | 'patrol' | 'investigate' | 'hunt' | 'search' | 'standing' | 'caught' | 'script'
   */
  constructor(game, opts = {}) {
    this.game = game; this.opts = opts;
    this.body = new Humanoid({ kind: 'searcher', outfit: 'parka', hood: true, gloves: true, hunch: 0.14, pants: 0x2e332f, boots: 0x1c1f1a, face: { wet: 0.8, pale: 0.5 } });
    this.root = new THREE.Group(); this.root.name = 'searcher'; this.root.add(this.body.root);
    this.root.visible = false;
    this.pos = new THREE.Vector3(); this.yaw = 0; this.vel = new THREE.Vector3();
    this.state = 'absent'; this.t = 0;
    this.walkSpeed = opts.speed ?? 1.15; this.huntSpeed = opts.huntSpeed ?? 1.75;
    this.path = []; this.pathI = 0; this.target = null; this.pause = 0; this.callT = rrnd(6, 12);
    this.noiseHeard = null; this.sees = 0; this.alert = 0; this.lostT = 0;
    this.footT = 0; this.footSide = 1; this.stepAcc = 0;
    // lantern in the right hand: swinging pendulum + warm light + clinks
    this.lantern = new THREE.Group(); this.lantern.name = 'lantern';
    const frame = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.5, metalness: 0.8 });
    const glass = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xff9a30, emissiveIntensity: 1.8, transparent: true, opacity: 0.7, roughness: 0.2 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.025, 10), frame); base.position.y = -0.13;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.06, 10), frame); top.position.y = 0.08;
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.17, 10, 1, true), glass); gl.position.y = -0.02;
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.005, 6, 16, Math.PI), frame); bail.position.y = 0.105;
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a })); flame.scale.set(0.7, 1.5, 0.7); flame.position.y = -0.05; this.flame = flame;
    this.lantern.add(base, top, gl, bail, flame);
    this.root.add(this.lantern);
    this.swing = { a: 0, v: 0, b: 0, vb: 0 };
    this.light = game.lights.add({ pos: [0, 1, 0], color: 0xffa24a, intensity: 5.5, distance: 7, decay: 2, shadow: true, flicker: { amp: 0.18, speed: 11 }, tag: 'searcher', on: false, fadeRate: 2.5 });
    // footprints
    this.prints = []; this.maxPrints = 40; this.printMat = new THREE.MeshBasicMaterial({ color: 0x07090d, transparent: true, opacity: 0.55, depthWrite: false });
    this.printGroup = new THREE.Group(); game.root.add(this.printGroup);
    // drip + frost particles are handled via audio only; visual: faint mist at its feet
    game.root.add(this.root);
    this.dead = false;
    this.onCaught = null; this.visibleToPlayer = false; this.facingPlayer = false;
    this.glimpseT = 0; this.fade = 0;
  }

  setPos(x, y, z, yaw) { this.pos.set(x, y, z); if (yaw !== undefined) this.yaw = yaw; this.syncRoot(); }
  syncRoot() { this.root.position.copy(this.pos); this.root.rotation.y = this.yaw; }
  show(v = true) { this.root.visible = v; this.light.on = v && !this.lanternOff; }
  setLantern(on) { this.lanternOff = !on; this.light.on = this.root.visible && on; this.lantern.visible = on; }

  /** begin walking a route [[x,z],...]; speed multiplier */
  patrol(points, { loop = false, speedMul = 1 } = {}) { this.state = 'patrol'; this.path = points.map((p) => new THREE.Vector3(p[0], 0, p[1])); this.pathI = 0; this.loop = loop; this.speedMul = speedMul; this.show(true); this.body.walking = true; this.body.walkSpeed = this.walkSpeed * speedMul; }
  /** walk a scripted route [[x,z],…] ignoring light/hearing; resolves at the end. state stays 'script'. */
  scriptWalk(points, { speed = 1 } = {}) {
    this.state = 'script'; this.sPath = points.map((p) => new THREE.Vector3(p[0], 0, p[1])); this.sI = 0; this.sSpeed = speed; this.body.walking = true;
    return new Promise((res) => { this.sDone = res; });
  }
  stand(yaw) { this.state = 'standing'; if (yaw !== undefined) this.yaw = yaw; this.body.walking = false; }
  vanish() { this.state = 'absent'; this.show(false); this.body.walking = false; this.light.on = false; }
  hear(pos, loud = 0.5) { if (this.state === 'absent' || this.state === 'script') return; this.noiseHeard = { pos: pos.clone(), loud, t: this.game.time }; }
  /** distance to the player on the ground plane */
  distToPlayer() { const p = this.game.player.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  /** is the player visible to it? dark + within cone + line of sight; lit / hidden / still-in-dark reduce it */
  perceive(dt) {
    const g = this.game, p = g.player; const eye = _v.set(this.pos.x, this.pos.y + 1.9, this.pos.z); const tgt = _w.set(p.pos.x, p.pos.y + (p.crouching ? 0.9 : 1.5), p.pos.z);
    const d = eye.distanceTo(tgt); let seen = 0;
    const lit = this.opts.world && this.opts.world.lit ? this.opts.world.lit(p.pos.x, p.pos.y, p.pos.z) : false;
    const hidden = g.mode === 'hide';
    if (!lit && !hidden && d < (this.opts.sightRange ?? 16)) {
      const dir = tgt.clone().sub(eye).normalize(); const fwd = _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); // forward = +Z in model => world (sin yaw, cos yaw)? model faces +Z rotated by yaw
      const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const ang = Math.acos(clamp(dir.setY(0).normalize().dot(f), -1, 1));
      if (ang < 1.15 || d < 3.2) {
        if (g.collision.los(eye, tgt)) {
          const light = g.lights.flashOn ? 1.0 : 0.55; const stealth = p.crouching ? 0.55 : 1; const still = p.speed < 0.2 ? 0.45 : 1;
          seen = clamp((1 - d / 16)) * light * stealth * still * (ang < 0.5 ? 1.2 : 0.7) + (d < 2.5 ? 0.6 : 0);
        }
      }
    }
    this.sees = seen; this.alert = clamp(this.alert + (seen > 0.05 ? seen * dt * 1.6 : -dt * 0.35));
    return seen;
  }

  update(dt) {
    const g = this.game; this.t += dt;
    const active = this.state !== 'absent';
    if (!active) { this.body.update(dt); return; }
    const world = this.opts.world || {};
    const speed = this.state === 'hunt' ? this.huntSpeed : this.walkSpeed * (this.speedMul || 1);
    this.body.walkSpeed = speed;
    // --- behaviour -------------------------------------------------------------------------------------------------
    if (this.state === 'patrol' || this.state === 'investigate' || this.state === 'hunt' || this.state === 'search') {
      const seen = this.state !== 'caught' ? this.perceive(dt) : 0;
      // hearing
      if (this.noiseHeard && g.time - this.noiseHeard.t < 0.5 && this.state !== 'hunt') {
        const d = this.pos.distanceTo(this.noiseHeard.pos); if (d < 6 + 24 * this.noiseHeard.loud) { this.state = 'investigate'; this.target = this.noiseHeard.pos.clone(); this.pause = 0.6; this.noiseHeard = null; this.body.walking = false; }
      }
      if (this.alert > 0.85 && this.state !== 'hunt' && !this.opts.noHunt) { this.state = 'hunt'; this.lostT = 0; g.emit('searcherHunt', this); }
      if (this.state === 'hunt') {
        const p = g.player.pos; this.target = new THREE.Vector3(p.x, p.y, p.z);
        const lit = world.lit && world.lit(p.x, p.y, p.z);
        if (lit) { // it will not cross into the light: it stops, lowers its head, and calls
          const d = this.distToPlayer(); if (d < 3.5) { this.state = 'search'; this.pause = 6; this.body.walking = false; this.alert = 0.3; g.emit('searcherStopped', this); }
        }
        if (seen < 0.02) { this.lostT += dt; if (this.lostT > 6) { this.state = 'search'; this.pause = 5; this.alert = 0.2; } } else this.lostT = 0;
        // caught
        if (!lit && this.distToPlayer() < 1.15 && Math.abs(p.y - this.pos.y) < 1.4) { this.catchPlayer(); return; }
      }
      // move
      if (this.pause > 0) { this.pause -= dt; this.body.walking = false; if (this.pause <= 0) { if (this.state === 'investigate') { this.state = 'search'; this.pause = 3.5; } else if (this.state === 'search') { this.state = this.path.length ? 'patrol' : 'standing'; } } }
      else {
        let goal = null;
        if (this.state === 'patrol') { goal = this.path[this.pathI]; if (!goal) { this.state = 'standing'; this.body.walking = false; } }
        else if (this.state === 'investigate' || this.state === 'hunt') goal = this.target;
        if (goal) {
          const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z; const dist = Math.hypot(dx, dz);
          if (dist < 0.5) {
            if (this.state === 'patrol') { this.pathI++; if (this.pathI >= this.path.length) { if (this.loop) this.pathI = 0; else { this.state = 'standing'; this.body.walking = false; this.onPathEnd && this.onPathEnd(); } } else if (this.opts.stopOnWaypoints) { this.pause = rrnd(1.5, 3.5); } }
            else if (this.state === 'investigate') { this.pause = 3.0; }
          } else {
            const want = Math.atan2(dx, dz); this.yaw = dampAngle(this.yaw, want, this.state === 'hunt' ? 6 : 3, dt);
            let step = Math.min(dist, speed * dt);
            // don't walk into lit places
            const nx = this.pos.x + Math.sin(this.yaw) * step, nz = this.pos.z + Math.cos(this.yaw) * step;
            const blocked = world.lit && world.lit(nx, this.pos.y + 0.5, nz) && this.state !== 'script';
            if (blocked) { this.pause = 1.2; this.body.walking = false; if (this.state === 'patrol') { this.state = 'search'; this.pause = 3; } }
            else {
              this.pos.x = nx; this.pos.z = nz; this.body.walking = true;
              if (world.ground) this.pos.y = damp(this.pos.y, world.ground(nx, nz, this.pos.y), 12, dt);
              this.stepAcc += step; if (this.stepAcc > 0.95) { this.stepAcc = 0; this.footstep(); }
            }
          }
        }
      }
    } else if (this.state === 'standing') {
      this.body.walking = false;
      if (this.faceTarget) { const dx = this.faceTarget.x - this.pos.x, dz = this.faceTarget.z - this.pos.z; this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 2, dt); }
    } else if (this.state === 'script') {
      // scripted walk: ignores light and hearing; used for set pieces
      const goal = this.sPath && this.sPath[this.sI];
      if (goal) {
        const sp = this.walkSpeed * (this.sSpeed || 1); this.body.walkSpeed = sp;
        const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z, dist = Math.hypot(dx, dz);
        if (dist < 0.3) { this.sI++; if (this.sI >= this.sPath.length) { this.sPath = null; this.body.walking = false; const d = this.sDone; this.sDone = null; d && d(); } }
        else {
          this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 4, dt);
          const step = Math.min(dist, sp * dt); this.pos.x += Math.sin(this.yaw) * step; this.pos.z += Math.cos(this.yaw) * step; this.body.walking = true;
          if (world.ground) this.pos.y = damp(this.pos.y, world.ground(this.pos.x, this.pos.z, this.pos.y), 12, dt);
          this.stepAcc += step; if (this.stepAcc > 0.95) { this.stepAcc = 0; this.footstep(); }
        }
      } else this.body.walking = false;
    }

    // calls
    this.callT -= dt;
    if (this.callT <= 0 && (this.state === 'patrol' || this.state === 'search' || this.state === 'standing' || this.state === 'investigate')) { this.call(); this.callT = rrnd(9, 18); }

    // listening pose: while searching, tilt the head toward the player's last noise
    this.body.opts.headTilt = this.state === 'search' ? 0.22 : 0;
    this.syncRoot();
    // lantern swing physics + placement at the right hand
    this.updateLantern(dt);
    this.body.update(dt);
    // light follows the lantern
    this.lantern.getWorldPosition(_v); this.light.pos.copy(_v);
    this.visibleToPlayer = this.root.visible;
  }

  updateLantern(dt) {
    const hand = this.body.parts.R.hand; hand.updateMatrixWorld(true);
    const hp = hand.getWorldPosition(new THREE.Vector3());
    const sw = this.swing; const sp = this.body.walking ? 1 : 0.2;
    sw.v += (-sw.a * 22 - sw.v * 1.6 + Math.sin(this.body.walkPhase * 1.0) * 6 * sp * (this.body.walking ? 1 : 0)) * dt; sw.a += sw.v * dt;
    sw.vb += (-sw.b * 22 - sw.vb * 1.6 + Math.cos(this.body.walkPhase * 0.5) * 3 * sp) * dt; sw.b += sw.vb * dt;
    // hand carries it slightly forward and low
    this.lantern.position.copy(hp).add(new THREE.Vector3(0, -0.14, 0));
    this.lantern.rotation.set(clamp(sw.b, -0.6, 0.6), this.yaw, clamp(sw.a, -0.6, 0.6));
    // clink when the swing reverses hard
    if (Math.abs(sw.v) > 4 && Math.sign(sw.v) !== Math.sign(this.lastV || 1) && (this.t - (this.lastClink || 0)) > 0.5) { this.lastClink = this.t; this.game.audio && this.game.audio.at(this.lantern.getWorldPosition(new THREE.Vector3()), 'lantern', { vol: 0.5 }); }
    this.lastV = sw.v;
    const fl = this.flame; fl.scale.set(0.7, 1.4 + Math.sin(this.t * 17) * 0.2, 0.7);
  }

  footstep() {
    const g = this.game; const p = this.pos.clone();
    g.audio && g.audio.at(p.clone().setY(p.y + 0.1), 'wet_step', { vol: 0.9 });
    if (this.opts.prints !== false) this.leavePrint();
  }
  leavePrint() {
    const g = this.game; this.footSide *= -1;
    const m = new THREE.Mesh(g._printGeo || (g._printGeo = new THREE.PlaneGeometry(0.15, 0.34).rotateX(-Math.PI / 2)), this.printMat);
    const side = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(0.12 * this.footSide);
    m.position.set(this.pos.x + side.x, this.pos.y + 0.025, this.pos.z + side.z); m.rotation.y = this.yaw; m.renderOrder = 2;
    this.printGroup.add(m); this.prints.push(m); if (this.prints.length > this.maxPrints) { const o = this.prints.shift(); this.printGroup.remove(o); }
  }

  call(near) {
    const g = this.game; if (!g.audio) return;
    const d = this.distToPlayer(); const vol = clamp(1.1 - d / 70, 0.25, 1);
    const pos = this.pos.clone().setY(this.pos.y + 1.9);
    const src = g.audio.out('voice', pos, { reverb: 0.8, ref: 2, rolloff: 1.0 }); const t = g.audio.ctx.currentTime + 0.05;
    g.audio.voice.searcherCall(src.input, { t, gain: 0.34 * vol, near: clamp(1 - d / 25) });
    src.dispose(5);
    g.emit('searcherCall', this);
  }

  catchPlayer() {
    if (this.state === 'caught') return; this.state = 'caught'; this.body.walking = false; this.light.on = true;
    // it reaches out — not a lunge
    const p = this.game.player.pos; this.body.reachTo('R', new THREE.Vector3(p.x, p.y + 1.35, p.z));
    this.game.emit('caught', this); this.onCaught && this.onCaught(this);
  }

  dispose() { this.game.lights.remove(this.light); this.game.root.remove(this.root); this.game.root.remove(this.printGroup); this.body.dispose(); }
}
const rrnd = (a, b) => a + Math.random() * (b - a);
