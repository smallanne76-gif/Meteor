// THE SEARCH: the forest trail from the back door to the boathouse. Light the lamps; it will not cross the light.
import * as THREE from 'three';
import { clamp } from '../core/util.js';
import { LAYOUT } from '../world/halden.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class SearchPhase {
  constructor(world) { this.w = world; this.g = world.game; this.disposed = false; this.fired = {}; this.deaths = 0; this.hi = -1; this.dash = false; this.inBoat = false; this.lastSafe = null; }

  trailPts(t0, t1, step = 6) { const T = this.w.terrain.trail, out = []; const dir = t1 >= t0 ? 1 : -1; for (let t = t0; dir > 0 ? t <= t1 : t >= t1; t += dir * step) { const p = T.at(t); out.push([p.x, p.z]); } return out; }

  async start(opts = {}) {
    const w = this.w, g = this.g, S = w.searcher, T = w.terrain.trail;
    g.flags.chapter = 'search'; g.flags.phase = 'search';
    w.zones = { lodge: true, yardOnly: false, road: false, trail: true, boathouse: true, lake: false, deck: false };
    w.baseFear = 0.22; w.outsideAmb = 'winterNight'; w.snowLevel = 1; g.setSky('nightSnow'); g.setGrade('nightSnow', false, 1.5);
    g.audio.amb.set('winterNight', { fade: 3 }); g.audio.music.setDread(0.12);
    this.lampT = w.lampPosts.slice(0, 6).map((lp) => T.nearest(lp.pos.x, lp.pos.z).t);
    w.extraLit = (x, y, z) => (w.boathouse.lantern && w.boathouse.lantern.lit && w.boathouse.inside(x, z));
    S.opts.noHunt = false; S.opts.prints = true; S.walkSpeed = 1.15; S.huntSpeed = 1.85; S.onCaught = () => this.caught();
    this.hookUp();
    for (let i = 0; i < w.lampPosts.length; i++) if (g.flags['lamp' + i]) w.lampPosts[i].set(true);
    this.hi = g.flags.lampHi ?? -1;
    if (opts.skipTo) { this.skipTo(opts.skipTo); }
    if (opts.resumeAt) { const lp = this.w.lampPosts[Math.max(0, this.hi)]; this.lastSafe = this.hi >= 0 ? { x: lp.pos.x, z: lp.pos.z + 1.6 } : null; if (this.hi >= 1) this.startPatrol(); g.ui.objective(g.flags.boatKey ? 'Follow the trail to the boathouse.' : 'Follow the trail to the boathouse.', true); if (g.flags.boathouseDone) { /* back from below? */ } }
    if (!opts.resumeAt && !opts.skipTo) {
      g.ui.chapterCard('II', 'THE SEARCH', 'Feb 11', 4.5);
      await g.wait(3.5);
      g.ui.objective('Follow the trail to the boathouse.');
      await w.think('The trail. Jo and I walked this every winter.'); await g.wait(0.6);
      await w.think('It won’t come where it’s lit.');
      g.ui.hint('interact', 'Light the lamps along the trail', 7);
      g.saveCheckpoint('search:start', { x: 9.5, z: -3.5 });
    }
  }

  hookUp() {
    const w = this.w, g = this.g, C = w.camp, B = w.boathouse;
    const seq = async (lines, gap = 0.5) => { for (const l of lines) { await w.think(l); await g.wait(gap); } };
    // ---- the search camp: always lit, never closed
    C.onSheet = () => { g.ui.read('signin').then(async () => { await g.wait(0.4); await w.think('Forty lines. I signed in forty days.'); await g.wait(0.7); await w.think('I don’t remember the last one.'); await g.wait(0.7); await w.think('“Last day” crossed out. I wrote that.'); }); };
    C.onFlyer = () => { g.ui.read('flyer').then(async () => { await g.wait(0.4); await w.think('I drew the tabs myself. Eight of them.'); await g.wait(0.6); await w.think('Seven got taken.'); await g.wait(0.8); await w.think('Nobody ever called the eighth.'); }); };
    C.onTape = () => this.playTape();
    this.clipIt = g.interact.add({ pos: C.group.localToWorld(V(3.5, 1.0, -0.62)), radius: 0.45, maxDist: 2.6, label: 'A newspaper clipping', icon: 'eye', onUse: () => { this.clipIt.used = false; g.ui.read('clipping').then(() => seq(['“Keep looking.” I said that to a reporter.', 'I was so sure he was just late.'])); } });
    // ---- boathouse door and hatch
    this.noteIt = g.interact.add({ object: B.note, radius: 0.3, maxDist: 2.6, label: 'A note on the door', icon: 'eye', onUse: () => { this.noteIt.used = false; g.ui.read('boat_log').then(async () => { await g.wait(0.4); await w.think('“Second oar.” Of course it’s under the second oar.'); }); } });
    this.doorIt = g.interact.add({ pos: B.door.pos.clone(), radius: 0.8, maxDist: 2.7, label: () => (B.doorLocked ? (g.flags.boatKey ? 'Unlock the boathouse' : 'Locked') : (B.doorTarget ? 'Close the door' : 'Open the door')), icon: 'door', onUse: () => { this.doorIt.used = false; this.useDoor(); } });
    this.hatchIt = g.interact.add({ pos: B.hatchPos.clone().add(V(0, 0.15, 0)), radius: 0.8, maxDist: 2.6, label: 'Open the hatch', icon: 'door', enabled: () => B.lantern.lit && this.inBoat, onUse: () => { this.hatchIt.used = false; this.toIceHouse(); } });
  }

  async useDoor() {
    const w = this.w, g = this.g, B = w.boathouse;
    if (B.doorLocked) {
      if (!g.flags.boatKey) { g.audio.at(B.door.pos, 'door_locked', { vol: 1 }); await w.think('Locked.'); await g.wait(0.5); await w.think('“Key’s under the second oar.” There’s no oar out here.'); return; }
      B.doorLocked = false; g.audio.at(B.door.pos, 'unlock', { vol: 1 }); g.audio.at(B.door.pos, 'keys', { vol: 0.8 });
      await g.wait(0.4);
    }
    B.setDoor(!B.doorTarget); g.audio.at(B.door.pos, B.doorTarget ? 'door_open' : 'door_close', { vol: 1, creaky: true });
    if (B.doorTarget && !this.fired.lit) { this.fired.lit = true; this.enterBoathouse(); }
  }

  async enterBoathouse() {
    const w = this.w, g = this.g, B = w.boathouse, S = w.searcher;
    await g.wait(1.0);
    // the lantern is already warm. nobody lit it.
    B.lantern.set(true); B.lantern.interact.enabled = false; g.audio.at(B.hatchPos.clone().setY(1.2), 'match', { vol: 0.7 });
    g.audio.music.setDread(0.2);
    this.inBoat = true; g.saveCheckpoint('search:boathouse', { x: B.door.pos.x - Math.sin(B.yaw) * 1.4, z: B.door.pos.z - Math.cos(B.yaw) * 1.4 });
    await w.think('The lantern is lit.'); await g.wait(0.7);
    await w.think('I didn’t light that.');
    g.ui.objective('Dad’s ice house is down the hatch.');
    // if the Searcher was chasing, it stops at the edge of the light
    if (S.state === 'hunt' || this.dash) {
      this.dash = false; S.state = 'search'; S.pause = 6; S.body.walking = false;
    }
  }

  async toIceHouse() {
    const w = this.w, g = this.g; if (this.fired.down) return; this.fired.down = true;
    g.mode = 'locked'; g.hands.gesture && g.hands.gesture('grab', w.boathouse.hatchPos, 'R');
    g.audio.at(w.boathouse.hatchPos, 'door_open', { vol: 1.1, creaky: true });
    await g.wait(0.8);
    g.flags.boathouseDone = true;
    await w.think('Cold air. Old, wet brick. And — very faintly — a tape hiss.');
    g.saveCheckpoint('search:hatch');
    await g.fadeTo(1, 1.4);
    if (g.goto) await g.goto('icehouse'); else g.mode = 'free';
  }

  async playTape() {
    const w = this.w, g = this.g; if (this.taping) return; this.taping = true; w.camp.interact.recorder.used = false;
    g.journal.add('tape_search'); g.ui.toast('Added to journal');
    g.hands.gesture && g.hands.gesture('press', w.camp.group.localToWorld(V(3.4, 0.9, 0.7)), 'R');
    g.audio.at(w.camp.group.localToWorld(V(3.4, 0.9, 0.7)), 'tape', { vol: 1 });
    await g.wait(0.7);
    g.audio.playNoteAudio('search_tape');
    await g.wait(5.5);
    await w.think('…That’s me.'); await g.wait(4.5);
    await w.think('I’d know that voice anywhere. It’s what I sound like when I’m afraid.'); await g.wait(5);
    await w.think('But I’ve heard that exact call tonight.'); await g.wait(1.0);
    await w.think('From the trees.');
    g.audio.music.sting('low', 0.6);
    this.taping = false;
    if (!this.fired.tape) { this.fired.tape = true; g.flags.heardTape = true; }
  }

  // ---- lamps ------------------------------------------------------------------------------------------------------------
  onLamp(lp) {
    const w = this.w, g = this.g, S = w.searcher; const i = w.lampPosts.indexOf(lp); if (i < 0 || i > 5) return;
    g.flags['lamp' + i] = true; this.hi = Math.max(this.hi, i); g.flags.lampHi = this.hi; this.lastSafe = { x: lp.pos.x, z: lp.pos.z + 1.6 };
    g.audio.at(lp.pos.clone().setY(1.7), 'match', { vol: 0.8 });
    const think = (t, d = 0) => g.wait(d).then(() => w.think(t));
    if (S.state === 'hunt') { S.state = 'search'; S.pause = 4; }
    if (i === 0) {
      think('Warm. A little.', 0.4);
      g.wait(5).then(() => this.glimpse());
    } else if (i === 1) { this.startPatrol(); think('It’s out there, somewhere ahead. Lantern between the trees.', 1.2); }
    else if (i === 2) { think('The search camp is just off the trail.', 1.0); g.ui.objective('The search camp lies off the trail. Then the boathouse.'); }
    else if (i === 3) { this.startPatrol(); }
    else if (i === 4) { this.overlook(); }
    else if (i === 5) { this.finalDash(); return; }
    if (i < 5) this.startPatrol();
  }

  /** a first look at it, far off, walking away between the trunks */
  async glimpse() {
    const w = this.w, g = this.g, S = w.searcher; if (this.fired.glimpse || this.disposed || this.hi >= 1) return; this.fired.glimpse = true;
    const pts = this.trailPts(this.lampT[2] - 10, this.lampT[2] + 30, 6); S.setPos(pts[0][0] + 3, 0, pts[0][1] + 3, 0); S.setLantern(true); S.show(true); S.opts.noHunt = true;
    g.audio.at(S.pos.clone().setY(1.5), 'drip', { vol: 0.5 });
    await S.scriptWalk(pts.slice(1), { speed: 0.9 }); if (this.hi < 1) S.vanish(); S.opts.noHunt = false;
  }

  startPatrol() {
    const w = this.w, g = this.g, S = w.searcher; if (this.disposed || this.hi < 1) return;
    S.sPath = null; S.sDone = null;
    const hi = Math.min(this.hi, 4); const t0 = this.lampT[hi] + 11, t1 = this.lampT[hi + 1] + 4;
    const fwd = this.trailPts(t0, t1, 5); const path = fwd.concat(fwd.slice(0, -1).reverse());
    const start = fwd[Math.floor(fwd.length * 0.7)];
    if (S.state === 'absent' || this.dist(S, t0) > 80) { S.setPos(start[0], 0, start[1], 0); }
    S.setLantern(true); S.opts.noHunt = false; S.patrol(path, { loop: true, speedMul: 1 + hi * 0.06 });
    S.callT = 4;
  }
  dist(S, t) { const p = this.w.terrain.trail.at(t); return Math.hypot(S.pos.x - p.x, S.pos.z - p.z); }

  async overlook() {
    const w = this.w, g = this.g; if (this.fired.over) return; this.fired.over = true;
    g.setSky('auroraNight'); g.setGrade('nightSnow', false, 4); w.snow.setIntensity(0.35); w.snowLevel = 0.35;
    g.audio.music.setDread(0.1);
    await g.wait(3);
    await w.think('There it is. The whole lake, under the lights.'); await g.wait(1.0);
    g.audio.amb.iceSong && g.audio.amb.iceSong(V(40, 4, -150), 1, false);
    await w.think('And it’s… singing.'); await g.wait(0.7);
    await w.think('Dad said it would. If you waited.');
    g.saveCheckpoint('search:overlook', { x: this.lastSafe?.x, z: this.lastSafe?.z });
  }

  async finalDash() {
    const w = this.w, g = this.g, S = w.searcher; if (this.fired.dash) return; this.fired.dash = true;
    await g.wait(2.0);
    await w.think('The boathouse. Twenty paces.');
    // something wakes behind her
    const back = this.trailPts(this.lampT[4] + 6, this.lampT[4] + 14, 4)[0];
    S.setPos(back[0], 0, back[1], 0); S.setLantern(true); S.show(true); S.opts.noHunt = false; S.state = 'hunt'; S.lostT = 0; S.alert = 1; S.callT = 99;
    S.call(1); this.dash = true; w.baseFear = 0.6; g.audio.music.setDread(0.6);
    g.ui.hint('run', 'Run', 4);
    g.ui.objective('The boathouse. Get inside.');
  }

  // ---- caught: back to the last light --------------------------------------------------------------------------------------
  async caught() {
    const w = this.w, g = this.g, P = g.player, S = w.searcher; if (this.fired.catching) return; this.fired.catching = true; this.deaths++;
    g.mode = 'locked'; g.audio.setDuck({ amb: 0.3 }); g.audio.sfx('static', { dur: 1.0, vol: 0.5 });
    await g.wait(0.5); await g.fadeTo(1, 0.7); S.vanish(); this.dash = false;
    const at = this.lastSafe || { x: 9.5, z: -3.5 };
    P.teleport(at.x, 0, at.z, Math.atan2(-1, 0)); P.pitch = 0;
    g.audio.setDuck({ amb: 1 }); w.baseFear = 0.25; g.audio.music.setDread(0.15);
    await g.wait(1.2); await g.fadeTo(0, 2.2);
    g.mode = 'free'; this.fired.catching = false;
    const line = this.deaths === 1 ? 'It stopped at the light. Why did it stop at the light?' : (this.deaths === 2 ? 'Stay in the light. Move when it’s turned away.' : 'Slow. Quiet. Crouch.');
    await w.think(line);
    if (this.hi >= 1 && !this.dash) this.startPatrol();
    if (this.hi >= 5 && !w.boathouse.lantern.lit) this.finalDash();
  }

  skipTo(step) {
    const g = this.g, w = this.w;
    if (step === 'camp') { for (let i = 0; i < 3; i++) { w.lampPosts[i].set(true); g.flags['lamp' + i] = true; } this.hi = 2; g.flags.lampHi = 2; this.lastSafe = { x: w.lampPosts[2].pos.x, z: w.lampPosts[2].pos.z + 1.6 }; }
    if (step === 'boat') { for (let i = 0; i < 6; i++) { w.lampPosts[i].set(true); g.flags['lamp' + i] = true; } this.hi = 5; g.flags.boatKey = true; }
  }

  dispose() { this.disposed = true; }

  update(dt) {
    const w = this.w, g = this.g, S = w.searcher, P = g.player;
    // the lantern ahead is its own kind of music: stay off the trail's far side when it calls
    if (S.state !== 'absent' && S.root.visible) { const d = S.distToPlayer(); if (d < 14 && !this.fired.near) { this.fired.near = true; g.ui.hint('crouch', 'Crouch to stay quiet', 5); } }
    // the boathouse is safe once the lantern is lit; hold the Searcher outside
    if (this.inBoat && S.state === 'hunt' && w.boathouse.inside(P.pos.x, P.pos.z)) { S.state = 'search'; S.pause = 5; S.body.walking = false; }
  }
}
