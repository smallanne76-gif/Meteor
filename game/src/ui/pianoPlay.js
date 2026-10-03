// Piano interaction: the camera settles over the keyboard; click keys (or A S D F G H J K = C4..C5) to play.
// Jo's tune (D F A G F E D) opens the little drawer.
import * as THREE from 'three';

const KEYMAP = { KeyA: 60, KeyS: 62, KeyD: 64, KeyF: 65, KeyG: 67, KeyH: 69, KeyJ: 71, KeyK: 72, KeyW: 61, KeyE: 63, KeyT: 66, KeyY: 68, KeyU: 70 };

export class PianoSession {
  constructor(game, piano, { expected = [62, 65, 69, 67, 65, 64, 62], onSolved, onExit } = {}) {
    this.g = game; this.p = piano; this.expected = expected; this.onSolved = onSolved; this.onExit = onExit; this.seq = []; this.active = false;
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2(); this.down = new Map(); this.hover = null; this.solved = false;
    this.mm = (e) => { this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); };
    this.md = (e) => { if (e.button === 0) this.clickKey(); };
  }
  start() {
    const g = this.g, P = this.p; this.active = true; g.suppressAutoPause = true; g.input.unlock();
    g.hands.setVisible(false);
    const fwd0 = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)); this.lamp = g.lights.add({ name: 'pianoLamp', pos: P.center.clone().addScaledVector(fwd0, 0.45).add(new THREE.Vector3(0, 0.6, 0)).toArray(), color: 0xffd9a8, intensity: 3, distance: 3.2, decay: 2, shadow: false, fadeRate: 2 });
    const fwd = new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw));    // local +z in world
    const cam = P.center.clone().addScaledVector(fwd, 0.62).add(new THREE.Vector3(0, 0.5, 0));
    g.director.take({ pos: cam, look: P.center.clone().addScaledVector(fwd, 0.02).add(new THREE.Vector3(0, -0.04, 0)), fov: 52, handheld: 0.12, bars: false, hideHands: true });
    document.getElementById('game').style.cursor = 'default'; document.getElementById('reticle') && (document.getElementById('reticle').style.display = 'none');
    addEventListener('mousemove', this.mm); addEventListener('mousedown', this.md);
    g.ui.hint('A S D F G H J K', 'Play the keys. Leave: E', 9);
    g.ui.setReticleVisible && g.ui.setReticleVisible(false);
    this.mouse.set(0, 0);
  }
  stop() {
    const g = this.g; if (!this.active) return; this.active = false; if (this.lamp) { g.lights.remove(this.lamp); this.lamp = null; } removeEventListener('mousemove', this.mm); removeEventListener('mousedown', this.md);
    g.director.release(); g.suppressAutoPause = false; g.requestLock(); g.hands.setVisible(true); document.getElementById('game').style.cursor = 'none';
    g.ui.setReticleVisible && g.ui.setReticleVisible(true); g.ui.hideHint();
    for (const k of this.p.keys) k.position.y = k.userData.rest;
    this.onExit && this.onExit();
  }
  note(midi, key) {
    const g = this.g; g.audio.playNote(midi, 0.75);
    if (key) { this.down.set(key, 0.18); }
    this.seq.push(midi); if (this.seq.length > this.expected.length) this.seq.shift();
    if (!this.solved && this.seq.length === this.expected.length && this.seq.every((m, i) => m === this.expected[i])) { this.solved = true; this.onSolved && this.onSolved(); }
  }
  clickKey() { if (this.hover) this.note(this.hover.userData.midi, this.hover); }
  update(dt) {
    if (!this.active) return; const g = this.g, inp = g.input;
    this.ray.setFromCamera(this.mouse, g.camera);
    const hits = this.ray.intersectObjects(this.p.keys, false); this.hover = hits.length ? hits[0].object : null;
    for (const code of Object.keys(KEYMAP)) if (inp.pressed.has(code)) { const key = this.p.keys.find((k) => k.userData.midi === KEYMAP[code]); this.note(KEYMAP[code], key); }
    for (const k of this.p.keys) {
      const d = this.down.get(k) || 0; if (d > 0) this.down.set(k, d - dt);
      const pressed = d > 0 ? 0.008 : (k === this.hover ? 0.003 : 0);
      k.position.y += ((k.userData.rest - pressed) - k.position.y) * Math.min(1, dt * 30);
    }
    if (inp.wasPressed('interact') || inp.wasPressed('pause')) { if (!inp.wasPressed('interact') || true) this.stop(); }
  }
}
