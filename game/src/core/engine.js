// Game core: owns renderer, scene, player, input, audio, UI and the chapter lifecycle.
import * as THREE from 'three';
import { Emitter, Timers, clamp, damp, disposeObject, lerp } from './util.js';
import { settings } from './settings.js';
import { Gfx } from '../gfx/renderer.js';
import { Sky, SKIES } from '../gfx/sky.js';
import { LightRig } from '../gfx/lights.js';
import { initMaterials, preloadTextures, refreshTextureQuality } from '../gfx/materials.js';
import { Input } from './input.js';
import { Collision } from '../world/collision.js';
import { Player } from './player.js';
import { Interact } from './interact.js';
import { Hands, FlashBeam } from '../chars/hands.js';
import { Save } from './save.js';
import { Director } from './director.js';

export class Game extends Emitter {
  constructor(canvas) {
    super();
    this.canvas = canvas;
    this.gfx = new Gfx(canvas);
    initMaterials(this.gfx.renderer);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.get('fov'), 16 / 9, 0.05, 1500);
    this.camera.position.set(0, 1.6, 0); this.scene.add(this.camera);
    this.root = new THREE.Group(); this.root.name = 'levelRoot'; this.scene.add(this.root);
    this.sky = new Sky(); this.scene.add(this.sky.mesh);
    this.lights = new LightRig(this.scene); this.lights.game = this;
    this.collision = new Collision();
    this.input = new Input(canvas);
    this.timers = new Timers();
    this.player = new Player(this);
    this.interact = new Interact(this);
    this.fogObj = new THREE.FogExp2(0x101820, 0.01); this.scene.fog = this.fogObj;
    this.hands = new Hands(this);
    this.director = new Director(this);
    this.beam = new FlashBeam(this);

    this.mode = 'boot';          // boot | title | free | locked | hide | cutscene | paused | ended
    this.prevMode = 'free';
    this.chapter = null; this.chapterId = null;
    this.flags = {};
    this.time = 0; this.playTime = 0;
    this.allowEyesClosed = false;
    this.indoor = 0; this.indoorTarget = 0;
    this.fogMul = 1; this.fogMulTarget = 1;
    this.skyDef = null;
    this.paused = false;
    this.systems = [];           // objects with update(dt)
    this.focusPoint = null;
    this.ui = null; this.audio = null;
    this.fpsAcc = 0; this.fpsN = 0; this.fps = 60;
    this.debug = /[?&]debug/.test(location.search);

    addEventListener('resize', () => this.resize());
    settings.on('change', (k) => this.onSettings(k));
    this.input.onLockChange = (locked) => { if (!locked && this.mode === 'free' && !this.suppressAutoPause) this.pause(true); };
    this.resize();
  }

  // ---------------------------------------------------------------------------------------------------------------
  async init(onProgress) {
    await preloadTextures(onProgress);
  }
  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.gfx.resize();
  }
  onSettings(k) {
    if (k === 'preset' || k === 'resolutionScale' || k === '*') {
      this.gfx.applySettings(); this.lights.rebuild(); refreshTextureQuality(); this.emit('quality');
      // force shadow/material refresh
      this.scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { m.needsUpdate = true; }); } });
    }
    if (k === 'fov' || k === '*') { this.camera.fov = settings.get('fov'); this.camera.updateProjectionMatrix(); }
    this.audio && this.audio.applyVolumes();
  }

  // ---- sky / atmosphere -------------------------------------------------------------------------------------------
  setSky(name, over = {}, { env = true } = {}) {
    const def = this.sky.set(name, over);
    this.skyDef = def;
    this.lights.setSky(def, this.sky);
    this.fogObj.color.set(def.fogColor);
    this.fogBase = def.fogDensity;
    this.fogObj.density = def.fogDensity * this.fogMul;
    this.scene.background = null;
    if (env) {
      const e = this.sky.buildEnv(this.gfx.renderer);
      this.scene.environment = e;
    }
    this.scene.environmentIntensity = def.envIntensity;
    return def;
  }
  setGrade(name, instant, rate) { this.gfx.setGrade(name, instant, rate); }

  // ---- chapters ---------------------------------------------------------------------------------------------------
  async loadChapter(ch, opts = {}) {
    this.mode = 'locked';
    this.ui && this.ui.showLoading(true, ch.title || '');
    await new Promise((r) => setTimeout(r, 30));
    this.unloadChapter();
    this.chapter = ch; this.chapterId = ch.id;
    this.indoor = 0; this.indoorTarget = 0; this.fogMul = 1; this.fogMulTarget = 1;
    this.gfx.fx.fade = 1;
    await ch.build(this, opts);
    this.collision.bounds = ch.bounds || null;
    this.renderWarm();
    this.ui && this.ui.showLoading(false);
    this.emit('chapter', ch);
    return ch;
  }
  unloadChapter() {
    if (this.chapter) { try { this.chapter.dispose && this.chapter.dispose(this); } catch (e) { console.warn('dispose', e); } }
    this.chapter = null;
    this.timers.clear();
    this.interact.clear();
    this.lights.clear();
    this.collision.clear();
    this.systems.length = 0;
    this._h = new Map(); // drop chapter listeners
    this.audio && this.audio.clearChapter();
    for (const c of [...this.root.children]) { this.root.remove(c); disposeObject(c); }
    this.player.lookLimit = null; this.player.frozen = false; this.player.walkMul = 1; this.player.canRun = true;
    this.allowEyesClosed = false;
    this.lights.flashOn = false;
  }
  /** compile shaders/shadows once before revealing the level */
  renderWarm() {
    try { this.gfx.renderer.compile(this.scene, this.camera); } catch (e) { /* ignore */ }
    for (let i = 0; i < 2; i++) this.gfx.render(this.scene, this.camera, 0.016, this.sky.lightDir(new THREE.Vector3()));
  }

  addSystem(s) { this.systems.push(s); return s; }
  setIndoor(v) { this.indoorTarget = v; }

  // ---- modes ------------------------------------------------------------------------------------------------------
  setMode(m) { if (this.mode !== m) { this.prevMode = this.mode; this.mode = m; this.emit('mode', m); } }
  pause(on) {
    if (on && (this.mode === 'free' || this.mode === 'hide' || this.mode === 'locked' || this.mode === 'cutscene')) {
      this.pausedFrom = this.mode; this.mode = 'paused'; this.paused = true; this.input.unlock(); this.ui && this.ui.showPause(true); this.audio && this.audio.setPaused(true);
    } else if (!on && this.mode === 'paused') {
      this.mode = this.pausedFrom || 'free'; this.paused = false; this.ui && this.ui.showPause(false); this.audio && this.audio.setPaused(false);
      this.requestLock();
    }
  }
  requestLock() { if (!this.debug || true) this.input.lock(); }

  // ---- fx helpers -------------------------------------------------------------------------------------------------
  fadeTo(v, dur = 1, color) {
    const fx = this.gfx.fx; if (color) fx.fadeColor.set(color);
    const a = fx.fade, b = v;
    return new Promise((res) => {
      if (dur <= 0) { fx.fade = b; res(); return; }
      let t = 0; const h = (dt) => { t += dt; const k = clamp(t / dur); fx.fade = lerp(a, b, k * k * (3 - 2 * k)); if (k >= 1) { this.off('update', h); res(); } };
      this.on('update', h);
    });
  }
  tweenFx(key, to, dur = 1) {
    const fx = this.gfx.fx; const a = fx[key];
    return new Promise((res) => {
      if (dur <= 0) { fx[key] = to; res(); return; }
      let t = 0; const h = (dt) => { t += dt; const k = clamp(t / dur); fx[key] = lerp(a, to, k * k * (3 - 2 * k)); if (k >= 1) { this.off('update', h); res(); } };
      this.on('update', h);
    });
  }
  wait(s) { return this.timers.wait(s); }
  /** persist progress */
  saveCheckpoint(id, at) {
    const p = this.player;
    this.lastCheckpoint = { id, x: at?.x ?? p.pos.x, z: at?.z ?? p.pos.z, y: at?.y, yaw: at?.yaw ?? p.yaw };
    if (this.noSave) return;
    Save.write({ phase: this.flags.phase, chapterId: this.chapterId, checkpoint: this.lastCheckpoint, flags: this.flags, journal: this.journal.serialize(), playTime: this.playTime });
  }

  // ---- main loop --------------------------------------------------------------------------------------------------
  start() {
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      this.tick(dt, true);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  /** advance the simulation. render=false lets tests fast-forward without drawing. */
  tick(dt, render = true) {
    const input = this.input;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0; }

    if (this.mode === 'paused') {
      if (input.wasPressed('pause')) this.pause(false);
      if (render) this.drawFrame(0);
      input.endFrame(); return;
    }
    this.time += dt; this.playTime += dt;
    this.timers.update(dt);

    // global actions
    if (this.mode === 'free' || this.mode === 'hide') {
      if (input.wasPressed('pause')) this.pause(true);
      else if (input.wasPressed('journal') && this.ui) this.ui.toggleJournal();
      if (input.wasPressed('flashlight') && this.flashlightAvailable) this.toggleFlashlight();
    }

    // player + camera
    if (this.mode === 'free' || this.mode === 'hide' || this.mode === 'locked') this.player.update(dt, input);
    this.interact.update(dt, input);

    // indoor blend
    this.indoor = damp(this.indoor, this.indoorTarget, 2.2, dt);
    this.fogMul = damp(this.fogMul, this.fogMulTarget, 1.5, dt);
    const L = this.lights;
    if (this.skyDef) {
      this.scene.environmentIntensity = lerp(this.skyDef.envIntensity, this.skyDef.envIntensity * (this.indoorEnvK ?? 0.12), this.indoor);
      L.hemiMul = lerp(1, this.indoorHemiK ?? 0.35, this.indoor);
      this.fogObj.density = this.skyDef.fogDensity * this.fogMul * lerp(1, 0.35, this.indoor);
    }

    this.emit('update', dt);
    for (const s of this.systems) s.update && s.update(dt, this);
    this.chapter && this.chapter.update && this.chapter.update(dt, this);
    this.audio && this.audio.update(dt);
    this.ui && this.ui.update(dt);

    this.hands.update(dt);
    L.updateFlash(dt, this.camera, this.player.flashDir, this.hands.flashHeadCam, this);
    this.beam.update(dt);
    L.update(dt, this.camera, this.time);
    this.sky.update(dt, this.camera);

    if (render) this.drawFrame(dt);
    input.endFrame();
  }

  /** test helper: advance the simulation by `seconds`, yielding between ticks so awaited story code runs like in a live game */
  async advance(seconds, step = 1 / 30, renderLast = false) {
    const n = Math.max(1, Math.round(seconds / step));
    for (let i = 0; i < n; i++) { this.tick(step, renderLast && i === n - 1); for (let k = 0; k < 8; k++) await Promise.resolve(); }
  }

  drawFrame(dt) {
    this.camera.updateMatrixWorld();
    this.gfx.render(this.scene, this.camera, dt, this.sky.lightDir(new THREE.Vector3()));
  }

  // ---- flashlight -------------------------------------------------------------------------------------------------
  toggleFlashlight(force) {
    const on = force ?? !this.lights.flashOn;
    this.lights.flashOn = on;
    this.audio && this.audio.sfx('click', { vol: 0.5 });
    this.emit('flashlight', on);
  }

  // ---- flags ------------------------------------------------------------------------------------------------------
  flag(k, v) { if (v === undefined) return this.flags[k]; this.flags[k] = v; this.emit('flag', k, v); return v; }
}
