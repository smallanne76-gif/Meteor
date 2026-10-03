// First-person controller: slow believable locomotion, breathing, fear tremor, head bob, footsteps, flashlight lag.
import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, smooth } from './util.js';
import { settings } from './settings.js';

const EYE_STAND = 1.62, EYE_CROUCH = 1.02, RADIUS = 0.28;

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3(0, 0, 0);   // feet
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.eye = EYE_STAND; this.crouching = false;
    this.speed = 0; this.moving = false; this.running = false;
    this.stamina = 1; this.exhausted = false;
    this.fear = 0;               // 0..1 raises breath rate / tremor
    this.breathPhase = 0; this.breathRate = 0.22;
    this.holdingBreath = false; this.breathHeld = 0; this.breathLimit = 14; this.breathNeed = 0;
    this.eyesClosed = false;
    this.bobPhase = 0; this.stepDist = 0; this.stepSide = 1;
    this.surface = 'snow';
    this.grounded = true; this.vy = 0;
    this.camera = game.camera;
    this.lookLimit = null;       // {yaw0, yawRange, pitchMin, pitchMax} for hide spots
    this.frozen = false;         // no locomotion (cutscenes, inspect)
    this.canRun = true;
    this.noclip = false; this.noResolve = false; this.eyeOverride = null;
    this.walkMul = 1; this.lookMul = 1;
    this.lastBreathSound = 0;
    this.shake = 0; this.shakeT = 0;
    this.sway = new THREE.Vector2();
    this.flashDir = new THREE.Quaternion();   // lagged flashlight orientation
    this.kick = new THREE.Vector2();          // transient camera kick (pitch,roll)
    this.roll = 0; this.fovKick = 0; this.fovScale = 1;
    this.wasGrounded = true;
    this.noise = 0;              // 0..1 loudness this frame (for the Searcher)
    this.breathAmp = 1;
  }

  get eyePos() { return new THREE.Vector3(this.pos.x, this.pos.y + this.eye, this.pos.z); }
  get forward() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
  get height() { return this.crouching ? 1.2 : 1.75; }

  teleport(x, y, z, yaw) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.pitch = 0; this.vy = 0;
    this.syncCamera();
  }
  syncCamera() {
    this.camera.position.set(this.pos.x, this.pos.y + this.eye, this.pos.z);
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.camera.updateMatrixWorld();
    this.flashDir.copy(this.camera.quaternion);
  }
  lookAt(x, y, z) {
    const dx = x - this.pos.x, dz = z - this.pos.z, dy = y - (this.pos.y + this.eye);
    this.yaw = Math.atan2(-dx, -dz); this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  update(dt, input) {
    const g = this.game, col = g.collision;
    this.noise = 0;
    const free = g.mode === 'free' && !this.frozen;

    // ---- look --------------------------------------------------------------------------------------------------
    const look = input.look();
    if (g.mode === 'free' || g.mode === 'hide') {
      this.yaw -= look.x * this.lookMul; this.pitch -= look.y * this.lookMul;
      this.pitch = clamp(this.pitch, -1.45, 1.45);
      if (this.lookLimit) {
        const L = this.lookLimit;
        let d = ((this.yaw - L.yaw0 + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        d = clamp(d, -L.yawRange, L.yawRange); this.yaw = L.yaw0 + d;
        this.pitch = clamp(this.pitch, L.pitchMin, L.pitchMax);
      }
    }

    // ---- movement ----------------------------------------------------------------------------------------------
    const ax = free ? input.axis() : { x: 0, y: 0 };
    const wantMove = Math.hypot(ax.x, ax.y) > 0.01;
    // crouch
    if (free) {
      if (settings.get('crouchToggle')) { if (input.wasPressed('crouch')) this.crouching = !this.crouching; }
      else this.crouching = input.isDown('crouch');
      // can't stand if something is overhead
      if (!this.crouching && this.eye < EYE_STAND - 0.1 && this.headBlocked()) this.crouching = true;
    }
    this.eye = damp(this.eye, this.eyeOverride ?? (this.crouching ? EYE_CROUCH : EYE_STAND), 9, dt);

    const wantRun = free && input.isDown('run') && wantMove && !this.crouching && this.canRun && !this.exhausted && ax.y > 0;
    this.running = wantRun && this.stamina > 0.02;
    if (this.running) this.stamina = Math.max(0, this.stamina - dt / 5.5);
    else this.stamina = Math.min(1, this.stamina + dt / (wantMove ? 8 : 4));
    if (this.stamina <= 0.01) this.exhausted = true;
    if (this.exhausted && this.stamina > 0.35) this.exhausted = false;

    let top = this.crouching ? 0.85 : (this.running ? 3.1 : 1.55);
    top *= this.walkMul;
    if (this.holdingBreath) top *= 0.0;
    const cs = Math.cos(this.yaw), sn = Math.sin(this.yaw);
    const wx = (ax.x * cs - ax.y * sn), wz = (-ax.x * sn - ax.y * cs);
    const len = Math.hypot(wx, wz) || 1;
    const tx = wantMove ? wx / len * top : 0, tz = wantMove ? wz / len * top : 0;
    const accel = wantMove ? 9 : 11;
    this.vel.x = damp(this.vel.x, tx, accel, dt); this.vel.z = damp(this.vel.z, tz, accel, dt);

    const prevX = this.pos.x, prevZ = this.pos.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const y0 = this.pos.y + 0.4, y1 = this.pos.y + this.height;
    if (!this.noclip && !this.noResolve) col.resolve(this.pos, RADIUS, y0, y1);
    // soft boundary: stay inside the walkable region (the dark forest is not an option)
    if (!this.noclip && !this.noResolve && col.walkable && !col.walkable(this.pos.x, this.pos.z)) {
      const nx = this.pos.x, nz = this.pos.z;
      this.pos.x = prevX; this.pos.z = prevZ;
      if (col.walkable(nx, prevZ)) this.pos.x = nx; else if (col.walkable(prevX, nz)) this.pos.z = nz;
      this.vel.multiplyScalar(0.5); g.emit('boundary', this.pos);
    }
    // ground
    const gr = col.groundAt(this.pos.x, this.pos.z, this.pos.y, 0.5);
    this.surface = gr.surf;
    if (gr.y > -1e8) {
      if (this.pos.y > gr.y + 0.02) { this.vy -= 18 * dt; this.pos.y += this.vy * dt; if (this.pos.y <= gr.y) { this.pos.y = gr.y; if (this.vy < -3) this.landed(-this.vy); this.vy = 0; this.grounded = true; } else this.grounded = false; }
      else { this.pos.y = damp(this.pos.y, gr.y, 30, dt); if (Math.abs(this.pos.y - gr.y) < 0.002) this.pos.y = gr.y; this.vy = 0; this.grounded = true; }
    }
    const moved = Math.hypot(this.pos.x - prevX, this.pos.z - prevZ);
    this.speed = moved / Math.max(dt, 1e-4);
    this.moving = this.speed > 0.25 && this.grounded;

    // ---- steps -------------------------------------------------------------------------------------------------
    if (this.moving) {
      this.stepDist += moved;
      const stride = this.running ? 1.25 : (this.crouching ? 0.85 : 0.82);
      if (this.stepDist >= stride) {
        this.stepDist -= stride; this.stepSide *= -1;
        const loud = this.running ? 1 : (this.crouching ? 0.18 : 0.5);
        this.noise = Math.max(this.noise, loud);
        g.emit('step', { surface: this.surface, loud, side: this.stepSide, running: this.running, crouch: this.crouching, pos: this.pos });
      }
    } else this.stepDist = Math.min(this.stepDist, 0.4);

    // ---- breath ------------------------------------------------------------------------------------------------
    const stillOk = g.mode === 'free' || g.mode === 'hide';
    // accessibility: with "hold breath is a toggle" one press of Space latches stillness until pressed again
    let stillKey = input.isDown('still');
    if (settings.get('holdBreathToggle')) { if (stillOk && input.wasPressed('still')) this.stillLatch = !this.stillLatch; if (!stillOk) this.stillLatch = false; stillKey = this.stillLatch; } else this.stillLatch = false;
    const still = stillOk && stillKey;
    this.eyesClosed = still && g.allowEyesClosed;
    const wantHold = still && !this.eyesClosed && this.breathHeld < this.breathLimit && !this.gaspLock;
    if (wantHold && !this.holdingBreath) { this.holdingBreath = true; g.emit('breathHold', true); }
    if (!wantHold && this.holdingBreath) { this.holdingBreath = false; g.emit('breathHold', false); if (this.breathHeld > 3) g.emit('gasp', this.breathHeld); }
    if (this.holdingBreath) { this.breathHeld += dt; if (this.breathHeld >= this.breathLimit) { this.gaspLock = true; } }
    else { this.breathHeld = Math.max(0, this.breathHeld - dt * 1.4); if (this.breathHeld <= 0.1) this.gaspLock = false; }
    // rate: base .2Hz; fear and exertion raise it
    const exert = this.running ? 1 : (1 - this.stamina) * 0.8;
    const targetRate = 0.2 + this.fear * 0.55 + exert * 0.55 + (this.holdingBreath ? 0 : this.breathHeld * 0.03);
    this.breathRate = damp(this.breathRate, targetRate, 1.4, dt);
    if (!this.holdingBreath) this.breathPhase += dt * this.breathRate;
    const prevPh = this.breathPhase - dt * this.breathRate;
    if (!this.holdingBreath && Math.floor(this.breathPhase) !== Math.floor(prevPh)) g.emit('breath', { fear: this.fear, exert, rate: this.breathRate });
    this.breathAmp = damp(this.breathAmp, this.holdingBreath ? 0.15 : (1 + this.fear * 0.8 + exert), 4, dt);

    // ---- camera composition --------------------------------------------------------------------------------
    this.shakeT += dt;
    const bobOn = settings.get('headBob');
    const spd01 = clamp(this.speed / 3.1);
    if (this.moving) this.bobPhase += dt * lerp(5.2, 9.2, spd01) ;
    const bobA = bobOn ? lerp(0.012, 0.034, spd01) * (this.crouching ? 0.7 : 1) : 0;
    const bobY = this.moving ? Math.sin(this.bobPhase * 2) * bobA : 0;
    const bobX = this.moving ? Math.sin(this.bobPhase) * bobA * 0.8 : 0;
    const bAmp = 0.0035 * this.breathAmp;
    const breathY = Math.sin(this.breathPhase * Math.PI * 2) * bAmp;
    const breathPitch = Math.sin(this.breathPhase * Math.PI * 2 - 0.6) * 0.0016 * this.breathAmp;
    // fear tremor
    const shakeOn = settings.get('cameraShake');
    const trem = shakeOn ? (this.fear * 0.0016 + this.shake * 0.01) : 0;
    const tx2 = Math.sin(this.shakeT * 31.7) * trem, ty2 = Math.sin(this.shakeT * 27.3 + 1.7) * trem;
    this.kick.x = damp(this.kick.x, 0, 7, dt); this.kick.y = damp(this.kick.y, 0, 7, dt);
    this.shake = damp(this.shake, 0, 3, dt);
    this.roll = damp(this.roll, -ax.x * 0.012 * (this.moving ? 1 : 0), 6, dt);
    const camPos = this.camera.position;
    camPos.set(this.pos.x + bobX * Math.cos(this.yaw), this.pos.y + this.eye + bobY + breathY, this.pos.z - bobX * Math.sin(this.yaw));
    const e = new THREE.Euler(this.pitch + breathPitch + ty2 + this.kick.x, this.yaw + tx2, this.roll + this.kick.y + (this.moving && bobOn ? Math.sin(this.bobPhase) * 0.004 : 0), 'YXZ');
    this.camera.quaternion.setFromEuler(e);
    const fov = (settings.get('fov') + (this.running ? 3 : 0) + this.fovKick) * (this.fovScale ?? 1);
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = damp(this.camera.fov, fov, 6, dt); this.camera.updateProjectionMatrix(); }
    this.fovKick = damp(this.fovKick, 0, 3, dt);
    this.camera.updateMatrixWorld();

    // flashlight orientation lags behind the camera
    const k = 1 - Math.exp(-14 * dt);
    this.flashDir.slerp(this.camera.quaternion, k);
  }

  headBlocked() {
    const col = this.game.collision;
    const y0 = this.pos.y + 1.25, y1 = this.pos.y + 1.8;
    // test a small circle at head height against blockers
    const p = this.pos.clone();
    const before = p.clone();
    // cheap: treat as blocked if any blocker overlaps [1.25,1.8] and contains the player circle
    const probe = col.resolve(p, RADIUS - 0.02, y0, y1);
    return probe && before.distanceTo(p) > 0.001;
  }

  landed(speed) { this.kick.x = -clamp(speed * 0.006, 0, 0.06); this.game.emit('land', speed); this.noise = Math.max(this.noise, 0.8); }
  addShake(a) { this.shake = Math.max(this.shake, a); }
  addKick(pitch, roll = 0) { this.kick.x += pitch; this.kick.y += roll; }
  setFear(f) { this.fear = clamp(f); }
}
