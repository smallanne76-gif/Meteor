// Interaction targeting: look at something, get a quiet prompt, press E (or click). Supports hold-to-use.
import * as THREE from 'three';

let uid = 1;
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3(), _off = new THREE.Vector3();

export class Interact {
  constructor(game) {
    this.game = game; this.list = []; this.target = null; this.hold = 0; this.holding = null; this.cooldown = 0; this.locked = false;
  }
  /** def: { object|pos, offset, radius, label, icon, enabled, onUse, maxDist, hold, once, priority, id, kind } */
  add(def) {
    const h = Object.assign({ id: def.id || `i${uid++}`, radius: 0.3, label: 'Use', icon: 'hand', maxDist: 2.1, hold: 0, once: false, used: false, priority: 0, enabled: true, kind: 'use' }, def);
    if (def.pos && !(def.pos instanceof THREE.Vector3)) h.pos = new THREE.Vector3(...def.pos);
    h.remove = () => this.remove(h);
    this.list.push(h); return h;
  }
  remove(h) { const i = this.list.indexOf(h); if (i >= 0) this.list.splice(i, 1); if (this.target === h) this.target = null; }
  clear() { this.list.length = 0; this.target = null; this.holding = null; this.hold = 0; }
  byId(id) { return this.list.find((i) => i.id === id); }

  center(h, out) {
    if (h.object) { h.object.getWorldPosition(out); if (h.offset) out.add(_off.set(...h.offset)); }   // own temp: `out` is often _v
    else out.copy(h.pos);
    return out;
  }

  update(dt, input) {
    const g = this.game, cam = g.camera;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (g.mode !== 'free' || this.locked) { this.target = null; this.holding = null; this.hold = 0; g.ui && g.ui.setPrompt(null); return; }
    cam.getWorldPosition(_o); cam.getWorldDirection(_d);
    let best = null, bestScore = 1e9;
    for (const h of this.list) {
      const en = typeof h.enabled === 'function' ? h.enabled(g) : h.enabled;
      if (!en || (h.once && h.used)) continue;
      this.center(h, _v);
      const to = _v.clone().sub(_o); const dist = to.length();
      if (dist > h.maxDist || dist < 0.05) continue;
      to.divideScalar(dist);
      const ang = Math.acos(Math.min(1, Math.max(-1, to.dot(_d))));
      const limit = Math.asin(Math.min(0.99, h.radius / Math.max(dist, 0.2))) + 0.045;
      if (ang > limit) continue;
      const score = ang / limit + dist * 0.12 - h.priority;
      if (score < bestScore) {
        // line of sight (static blockers)
        // objects that sit on or in furniture (a jar on a counter, the piano's keys) must not be hidden by that furniture
        if (!g.collision.los(_o, _v, (it) => !it.noInteractBlock && !g.collision.contains(it, _v, 0.12))) continue;
        bestScore = score; best = h;
      }
    }
    this.target = best;
    if (!best) { this.holding = null; this.hold = 0; g.ui.setPrompt(null); return; }
    const label = typeof best.label === 'function' ? best.label(g) : best.label;
    const pressed = input.wasPressed('interact') || input.mouseClicked(0);
    const down = input.isDown('interact') || input.mouseDown(0);
    if (best.hold > 0) {
      if (down && this.cooldown <= 0) {
        if (this.holding !== best) { this.holding = best; this.hold = 0; }
        this.hold += dt;
        best.onHold && best.onHold(g, best, this.hold / best.hold);
        if (this.hold >= best.hold) { this.fire(best); this.holding = null; this.hold = 0; this.cooldown = 0.4; }
      } else { if (this.holding === best) best.onHoldCancel && best.onHoldCancel(g, best); this.holding = null; this.hold = 0; }
      g.ui.setPrompt(label, best.icon, this.hold / best.hold);
    } else {
      g.ui.setPrompt(label, best.icon, 0);
      if (pressed && this.cooldown <= 0) { this.fire(best); this.cooldown = 0.25; }
    }
  }
  fire(h) {
    h.used = true;
    this.game.emit('interact', h);
    h.onUse && h.onUse(this.game, h);
  }
}
