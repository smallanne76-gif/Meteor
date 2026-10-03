// Base class for chapters (levels). Handles scoped event listeners, disposal and common helpers.
import * as THREE from 'three';

export class Chapter {
  constructor(id, title, opts = {}) {
    this.id = id; this.title = title; this.subtitle = opts.subtitle || '';
    this.offs = []; this.cleanups = []; this.game = null;
    this.bounds = null;
  }
  /** register a game event listener that is removed when the chapter unloads */
  on(ev, fn) { const off = this.game.on(ev, fn); this.offs.push(off); return off; }
  add(obj) { this.game.root.add(obj); return obj; }
  cleanup(fn) { this.cleanups.push(fn); }
  dispose() {
    for (const f of this.offs) f(); this.offs.length = 0;
    for (const f of this.cleanups) { try { f(); } catch (e) { console.warn(e); } } this.cleanups.length = 0;
  }
  async build(game, opts) { this.game = game; }
  update(dt, game) {}
}
