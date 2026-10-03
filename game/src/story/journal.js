// Journal: discovered notes/photos/recordings (persisted with the save).
import { Emitter } from '../core/util.js';

export class Journal extends Emitter {
  constructor() { super(); this.items = []; this.objective = ''; this.read = new Set(); }
  add(id) { if (!this.items.includes(id)) { this.items.push(id); this.emit('add', id); return true; } return false; }
  has(id) { return this.items.includes(id); }
  clear() { this.items = []; this.read.clear(); this.objective = ''; }
  serialize() { return { items: [...this.items], objective: this.objective }; }
  load(d) { this.items = d?.items ? [...d.items] : []; this.objective = d?.objective || ''; }
}
