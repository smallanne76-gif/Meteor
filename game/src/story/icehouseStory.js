// THE ICE HOUSE: listen, collect, splice. Then the lights go out and something that sounds like you comes down the corridor.
import * as THREE from 'three';
import { assembleTapes } from '../ui/tapeAssemble.js';
import { askCode } from '../ui/lockUI.js';
import { clamp, damp } from '../core/util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// the chase route: from the corridor outside the listening room, through it, down the cold-room corridor, across the cellar, along the tunnel
const CHASE = [[-3, 0], [8, 0], [11.5, 0], [11.5, -12], [11.5, -14.2], [8.2, -17.2], [4.2, -20], [-12, -20], [-12, 8], [-1, 8]];

export class IceHousePhase {
  constructor(ch) { this.c = ch; this.g = ch.game; this.fired = {}; this.deaths = 0; this.state = 'explore'; this.sP = 0; this.sS = 0; this.cum = [0]; for (let i = 1; i < CHASE.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(CHASE[i][0] - CHASE[i - 1][0], CHASE[i][1] - CHASE[i - 1][1])); this.total = this.cum[this.cum.length - 1]; }

  think(t, o = {}) { return this.g.ui.say(t, { speaker: 'MARA', style: 'thought', ...o }); }
  async seq(lines, gap = 0.5) { for (const l of lines) { await this.think(l); await this.g.wait(gap); } }

  start(opts = {}) {
    const g = this.g, c = this.c, P = g.player;
    g.flags.chapter = 'icehouse'; g.flags.phase = 'icehouse';
    g.audio.music.stopAll && g.audio.music.stopAll(1); g.audio.music.setDread(0.08);
    P.teleport(-2.4, 0, 0, -Math.PI / 2); P.pitch = 0.18; P.walkMul = 1; P.canRun = true;
    this.hookUp();
    if (opts.resumeAt) this.restore(opts.resumeAt);
    g.fadeTo(0, 3.5, 0x000000);
    if (!opts.resumeAt) { g.ui.chapterCard('III', 'THE ICE HOUSE', '', 4.5); this.intro(); }
  }

  async intro() {
    const g = this.g;
    await g.wait(4.0);
    g.ui.objective('Find Jo’s recording.');
    await this.think('Cold air. Old, wet brick.'); await g.wait(0.8);
    await this.think('And a tape hiss, very faint. Somewhere ahead.');
    g.saveCheckpoint('icehouse:start', { x: -2.4, z: 0 });
  }

  restore(at) {
    const g = this.g, c = this.c, P = g.player;
    P.teleport(at.x, at.y ?? 0, at.z, at.yaw ?? 0);
    if (g.flags.dialOpen) { c.doors.dial.unlock(); c.doors.dial.toggle(true); }
    for (const [k, id] of [['tapeA', 'a'], ['tapeB', 'b'], ['tapeC', 'c'], ['tapeD', 'd']]) if (g.flags[k]) this['it' + id] && (this['it' + id].enabled = false);
  }

  // ---- the places ---------------------------------------------------------------------------------------------------------------
  ex(label, pos, lines, o = {}) { const g = this.g; const it = g.interact.add({ pos, radius: o.radius ?? 0.55, maxDist: o.maxDist ?? 2.4, label, icon: 'eye', onUse: () => { it.used = false; this.seq(typeof lines === 'function' ? lines() : lines); } }); return it; }

  hookUp() {
    const g = this.g, c = this.c;
    // arrival
    this.ex('The way I came', V(-3.7, 1.8, 0), ['The ladder up to the boathouse. The hatch is closed behind me.', 'Somebody closed it.'], { radius: 0.9 });
    this.ex('The chart', V(9.2, 1.7, 3.2), ['Dad’s ice log. Air, ice, minutes of song.', 'One night is boxed in red: 02/14/05. “Best night. D falling. The boy was awake.”', 'Minus twenty-six. That was the night Jo said the lake was “talking in laser.”'], { radius: 0.8 });
    this.ex('The photograph', V(14.7, 1.75, 0.3), ['Dad, with his big headphones, listening to something I can’t hear.', 'He used to say: “The trick is to stop waiting for a sound and start hearing the room.”'], { radius: 0.5 });
    this.ex('The speakers', V(8.9, 1.2, 0), ['Two big speakers aimed at one chair.', 'He listened alone, mostly. Sometimes he let Jo sit on his knee.'], { radius: 1.6, maxDist: 3.2 });
    this.ex('Dad’s chair', V(12.7, 0.9, 0.9), ['Still warm. It can’t be.'], { radius: 0.5 });
    this.button = this.ex('A button in the ice', V(8.4, 0.6, -21.0), ['A yellow button, frozen in the block.', 'The exact yellow. Four holes — no, two. It’s from a raincoat.', '…This ice is older than he was. Isn’t it?'], { radius: 0.45, maxDist: 2.6 });
    // tapes
    const take = (id, flag, pos, label, nm, after) => { const it = g.interact.add({ pos, radius: 0.5, maxDist: 2.4, label, icon: 'hand', onUse: async () => { it.remove(); g.flags[flag] = true; g.audio.sfx('pickup', { vol: 0.7 }); g.journal.add('tape_' + id); await g.ui.read('tape_' + id); await g.wait(0.4); after && after(); this.checkTapes(); } }); this['it' + id] = it; return it; };
    take('a', 'tapeA', V(10.9, 1.2, 3.0), 'A tape box: “XMAS ’02”', 'a', () => this.seq(['“DO NOT PLAY.” In Dad’s handwriting. So of course.', 'It’s not Christmas. That’s Jo’s voice.']));
    take('d', 'tapeD', V(14.1, 0.95, -0.7), 'A tape on the desk', 'd', () => this.seq(['Dad. “Good night, lake.” He used to say that.', 'It’s not Jo’s. It doesn’t belong with the others.']));
    take('b', 'tapeB', V(13.9, 0.6, 1.4), 'The cabinet', 'b', () => this.seq(['“LAKE — FEB 03.” That isn’t the date. That’s the lake, though.', 'I know that voice.']));
    take('c', 'tapeC', c.tapeShelf.clone(), 'The third reel', 'c', () => this.seq(['“BIRTHDAY — NOT YET.” Torn at the end.']));
    // the machine
    this.machineIt = g.interact.add({ pos: V(14.15, 1.15, 0.9), radius: 0.55, maxDist: 2.4, label: 'The reel-to-reel', icon: 'hand', onUse: () => { this.machineIt.used = false; this.machine(); } });
    // breaker note on the way in
    // the ladder room is used at the end
    this.climbIt = g.interact.add({ pos: c.ladderPos.clone().add(V(0, 0.6, 0)), radius: 0.9, maxDist: 2.6, label: 'Climb the ladder', icon: 'hand', hold: 1.4, enabled: () => this.state === 'chase', onUse: () => this.climbOut() });
  }

  have() { const f = this.g.flags; return [f.tapeA, f.tapeB, f.tapeC].filter(Boolean).length; }
  checkTapes() {
    const g = this.g; const n = this.have();
    if (n === 1 && !this.fired.t1) { this.fired.t1 = true; g.ui.objective('More of it. Dad’s labels are all wrong.'); }
    if (n === 3 && !this.fired.t3) { this.fired.t3 = true; g.ui.objective('Put the pieces together at the reel-to-reel.'); }
    g.saveCheckpoint('icehouse:tape', { x: g.player.pos.x, z: g.player.pos.z });
  }

  async dialDoor() {
    const g = this.g, c = this.c; const d = c.doors.dial; if (this.state !== 'explore' && this.state !== 'tapes') return;
    g.audio.at(V(11.5, 1.1, -12), 'door_locked', { vol: 1 });
    g.mode = 'locked'; g.ui.setPrompt(null);
    const code = await askCode(g, { title: 'Cold-room dial', initial: '00', hint: 'A temperature, written on the wall. The best night, no minus sign.' });
    g.requestLock(); g.mode = 'free';
    if (code === null) return;
    if (code === '26') {
      g.flags.dialOpen = true; g.audio.sfx('unlock', { vol: 1 }); await g.wait(0.7); d.unlock(); d.toggle(true); g.saveCheckpoint('icehouse:dial', { x: 11.5, z: -10.5 });
      await this.think('The cold-room door.'); await g.wait(0.5); await this.think('Dad’s ice cellar. I was never allowed down here.');
      g.ui.objective('The cellar.');
    } else { g.audio.sfx('click', { vol: 0.8 }); g.audio.sfx('rattle', { vol: 0.5 }); this.think('Nothing.'); }
  }

  // ---- the splice ----------------------------------------------------------------------------------------------------------------
  say(text, who = 'm', pos = V(9, 1.4, 0)) { const g = this.g; const src = g.audio.out('voice', pos, { reverb: 0.4, ref: 2 }); g.audio.voice.murmur(src.input, { t: g.audio.ctx.currentTime + 0.05, text, gender: who, gain: who === 'm' ? 0.16 : 0.14, rate: who === 'm' ? 0.95 : 0.8, muffle: true }); src.dispose(6); }

  async machine() {
    const g = this.g, f = g.flags; if (this.state !== 'explore' && this.state !== 'tapes') return;
    if (this.have() < 3) { await this.seq(['The deck is empty. Two spindles, waiting.', 'He’d have filed them somewhere. “Wrong on purpose.”']); return; }
    g.mode = 'locked'; g.ui.setPrompt(null);
    const reels = [
      { id: 'd', label: '(no label)', text: '“Forty-one centimetres. Kids are asleep. Good night, lake.”', decoy: true, listen: () => this.say('Forty-one centimetres. Kids are asleep. Good night, lake.', 'm') },
      { id: 'c', label: 'BIRTHDAY — NOT YET', text: '“I’m gonna walk out a little further, get a cleaner take. Leave the porch light on? So I can find the shore when I —”', listen: () => this.say('I’m gonna walk out a little further, get a cleaner take. Leave the porch light on? So I can find the shore when I', 'm') },
      { id: 'a', label: 'XMAS ’02 — DO NOT PLAY', text: '“Mar. You’re gonna hate that I’m calling at three in the —”', listen: () => this.say('Mar. You’re gonna hate that I’m calling at three in the', 'm') },
      { id: 'b', label: 'LAKE — FEB 03', text: '“— morning, but listen. Just — listen. Hear that? It’s doing the laser thing, but lower. Like the whole lake is a cello. Dad was right. It isn’t breaking. It’s stretching.”', listen: () => this.say('morning, but listen. Just listen. Hear that? It’s doing the laser thing, but lower. Like the whole lake is a cello. Dad was right. It isn’t breaking. It’s stretching.', 'm') },
    ].filter((r) => (r.id === 'd' ? f.tapeD : true));
    const res = await assembleTapes(g, reels, ['a', 'b', 'c']);
    g.requestLock(); g.mode = 'free';
    if (res === 'ok') this.playMessage();
  }

  async playMessage() {
    const g = this.g, c = this.c; this.state = 'playing'; g.mode = 'locked'; g.ui.hideHint(); g.ui.objective('');
    g.audio.setDuck({ amb: 0.2 }); g.audio.music.setDread(0.1); c.machineRun = true; c.reels[0].userData.dir = 1; c.reels[1].userData.dir = -1; g.audio.sfx('reel', { vol: 0.8 });
    const a = g.audio, k = a.kit; const t = a.ctx.currentTime + 1.0; const pos = V(8.9, 1.3, 0);
    const src = a.out('voice', pos, { reverb: 0.5, ref: 2.2, occlude: false }); const hp = k.filt('highpass', 260, 0.7), lp = k.filt('lowpass', 3600, 0.8); hp.connect(lp); lp.connect(src.input);
    k.hiss(hp, { t, dur: 40, gain: 0.04 });
    const L = (dt, text, d = 0.95) => a.voice.murmur(hp, { t: t + dt, text, gender: 'm', gain: 0.17, rate: d });
    L(1.0, 'Mar. You’re gonna hate that I’m calling at three in the morning.'); L(7.0, 'But listen. Just. Listen.');
    // the lake: one long falling note and a lower one under it
    k.tone(hp, { t: t + 10.5, f0: 1480, f1: 1210, dur: 5.4, gain: 0.06, attack: 1.2, release: 2.4, lp: 3000 }); k.tone(hp, { t: t + 11.5, f0: 330, f1: 250, dur: 6.5, gain: 0.08, attack: 1.8, release: 2.8, lp: 900 });
    L(17.5, 'Hear that? It’s doing the laser thing, but lower. Like the whole lake is a cello. Dad was right.', 0.92); L(26.5, 'It isn’t breaking. It’s stretching.');
    L(31.5, 'I’m gonna walk out a little further, get a cleaner take.'); L(37.5, 'Leave the porch light on? So I can find the shore when I', 0.95);
    k.staticNoise && k.staticNoise(hp, { t: t + 43.4, dur: 2.6, gain: 0.5, bright: 1.7 }); src.dispose(52);
    const lines = [[1.0, 'Mar. You’re gonna hate that I’m calling at three in the morning.', 5.2], [7.0, 'But listen. Just — listen.', 3.2], [17.5, 'Hear that? It’s doing the laser thing, but lower. Like the whole lake is a cello. Dad was right.', 6.4], [26.5, 'It isn’t breaking. It’s stretching.', 3.6], [31.5, 'I’m gonna walk out a little further, get a cleaner take.', 4.4], [37.5, 'Leave the porch light on? So I can find the shore when I —', 4.6]];
    let cur = 0; for (const [at, text, dur] of lines) { await g.wait(Math.max(0, at - cur)); cur = at; g.ui.say(text, { speaker: 'JO', style: 'memory', dur, crit: true }); }
    await g.wait(8.0); c.machineRun = false; g.audio.sfx('static', { dur: 0.4, vol: 0.2 }); g.audio.setDuck({ amb: 1 });
    await g.wait(1.4);
    await this.think('“Leave the porch light on.”'); await g.wait(1.2);
    await this.think('He asked me to. So he could find the shore.'); await g.wait(1.4);
    await this.think('I did. I left it on. Every night.'); await g.wait(1.6);
    await this.think('And he never came back along it.'); await g.wait(1.6);
    await this.think('The tape just… ends. Torn. What did he say next?');
    g.flags.heardVoicemail = true; g.saveCheckpoint('icehouse:heard', { x: g.player.pos.x, z: g.player.pos.z });
    g.mode = 'free'; this.state = 'tapes';
    await g.wait(2.2);
    this.lightsDie();
  }

  // ---- the lights go out -------------------------------------------------------------------------------------------------------------
  async lightsDie() {
    const g = this.g, c = this.c, P = g.player, S = c.searcher; if (this.state === 'chase') return; this.state = 'dark';
    // one long flicker, a clunk from somewhere deep in the building, then nothing
    for (let k = 0; k < 5; k++) { c.lamps.forEach((l) => l.set(k % 2 === 1)); for (const l of g.lights.logical) if (l.tag !== 'tunnel') l.surge = 0.2; await g.wait(0.09 + Math.random() * 0.12); }
    c.lamps.forEach((l) => l.set(false)); for (const l of g.lights.logical) if (!['tunnel', 'searcher'].includes(l.tag)) l.on = false; if (c.shaftLight) c.shaftLight.on = false;
    g.audio.sfx('switch', { vol: 1 }); g.audio.at(V(-3, 1, 0), 'thud', { vol: 0.8, f: 55 }); g.audio.music.sting('low', 0.9); g.audio.music.setDread(0.4);
    g.toggleFlashlight(true);
    await g.wait(1.4);
    await this.think('The breaker. Of course.'); await g.wait(1.4);
    // the speakers wake up on their own: a woman's voice calling one word, over and over, through a mile of tape hiss
    const a = g.audio, k = a.kit; const t = a.ctx.currentTime + 0.5;
    for (const sp of c.speakerPos) { const src = a.out('voice', sp, { reverb: 0.55, ref: 2 }); const bp = k.filt('highpass', 230, 0.7), lp = k.filt('lowpass', 4300, 0.7); bp.connect(lp); lp.connect(src.input); k.hiss(bp, { t, dur: 10, gain: 0.05 }); a.voice.maraCall(bp, { t: t + 0.3, gain: 0.2, n: 3 }); src.dispose(12); }
    await g.wait(3.2);
    await this.think('That’s me.'); await g.wait(1.0);
    await this.think('That’s the search tape. That’s me, on night three.'); await g.wait(2.2);
    // the corridor door swings open. a lantern, far down the corridor, and the wet sound of someone being careful
    c.doors.d2.toggle(true); g.audio.at(V(8, 1.1, 0), 'door_open', { vol: 1, creaky: true });
    S.setPos(-3, 0, 0, Math.PI * 0.5); S.setLantern(true); S.show(true); S.state = 'script'; S.sPath = null; S.scriptWalking = true; S.callT = 99; S.opts.noHunt = true; S.opts.prints = true;
    this.sS = -4; this.state = 'chase'; this.chaseT = 0; this.assist = this.deaths >= 2;
    S.call && S.call(0.2);
    g.ui.hint('run', 'Run. Don’t stop. Don’t look back.', 6);
    g.ui.objective('Get out. The tunnel past the cellar.');
    g.audio.music.setDread(0.75);
    g.saveCheckpoint('icehouse:chase', { x: 13.5, z: 0.5 });
  }

  projectPath(p) {
    let best = 1e9, bs = 0;
    for (let i = 0; i < CHASE.length - 1; i++) {
      const [ax, az] = CHASE[i], [bx, bz] = CHASE[i + 1]; const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz; const u = clamp(((p.x - ax) * dx + (p.z - az) * dz) / l2); const px = ax + dx * u, pz = az + dz * u; const d = Math.hypot(p.x - px, p.z - pz);
      if (d < best) { best = d; bs = this.cum[i] + u * Math.sqrt(l2); }
    }
    return bs;
  }
  pathAt(s) {
    s = clamp(s, 0, this.total); let i = 0; while (i < CHASE.length - 2 && this.cum[i + 1] < s) i++;
    const [ax, az] = CHASE[i], [bx, bz] = CHASE[i + 1]; const l = this.cum[i + 1] - this.cum[i]; const u = l > 0 ? (s - this.cum[i]) / l : 0; return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, yaw: Math.atan2(bx - ax, bz - az) };
  }

  updateChase(dt) {
    const g = this.g, c = this.c, S = c.searcher, P = g.player; this.chaseT += dt;
    const sP = this.projectPath(P.pos); this.sP = Math.max(this.sP * 0 + sP, 0);
    // it keeps a steady, patient pace; it does not hurry and it does not stop
    const sp = (this.assist ? 1.45 : 1.8) * (0.95 + 0.1 * Math.sin(this.chaseT * 0.7)); const prev = this.sS; this.sS += sp * dt;
    const p = this.pathAt(this.sS); S.pos.set(p.x, 0, p.z); S.yaw = p.yaw; S.body.walking = true; S.walkSpeed = sp;
    S.stepAcc += (this.sS - prev); if (S.stepAcc > 0.95) { S.stepAcc = 0; S.footstep && S.footstep(); }
    S.callT -= dt; if (S.callT <= 0) { S.callT = 6 + Math.random() * 4; S.call && S.call(Math.max(0, 1 - (sP - this.sS) / 20)); }
    const gap = sP - this.sS; g.player.setFear(clamp(1 - gap / 18, 0.2, 1)); g.audio.music.setDread(clamp(0.4 + (1 - gap / 20) * 0.6, 0.4, 1));
    if (!this.fired.tunnelLights && sP > this.cum[6]) { this.fired.tunnelLights = true; for (const l of this.c.tunLights) l.on = true; }
    if (gap < 1.5 && !this.fired.caught) this.caught();
    // the cold air and the sound of breath
    if (sP > this.total - 5 && !this.fired.ladderHint) { this.fired.ladderHint = true; g.ui.hint('interact', 'Climb the ladder — hold', 6); }
  }

  async caught() {
    const g = this.g, c = this.c, S = c.searcher, P = g.player; if (this.fired.caught) return; this.fired.caught = true; this.deaths++;
    g.mode = 'locked'; S.body.reachTo('R', V(P.pos.x, P.pos.y + 1.35, P.pos.z)); g.audio.music.sting('high', 1); P.addShake(0.7);
    await g.wait(0.7); await g.fadeTo(1, 0.6, 0x000000);
    g.audio.setDuck({ amb: 0.3 }); await g.wait(1.0);
    // back at the cold-room door; it is further back this time
    P.teleport(11.5, 0, -10.8, 0); P.pitch = 0; S.body.reachTo('R', null); this.sS = this.projectPath(V(11.5, 0, -10.8)) - 16; this.fired.caught = false; this.fired.tunnelLights = false;
    g.audio.setDuck({ amb: 1 }); this.assist = this.deaths >= 2;
    await g.fadeTo(0, 1.4); g.mode = 'free';
    this.think(this.deaths === 1 ? 'Don’t stop. Don’t look back.' : 'Keep moving. It only catches you if you stop.');
  }

  async climbOut() {
    const g = this.g, c = this.c, S = c.searcher, P = g.player; if (this.fired.out) return; this.fired.out = true; this.state = 'out'; g.mode = 'locked'; g.ui.hideHint();
    g.audio.at(c.ladderPos, 'thud', { vol: 0.5 }); S.vanish(); S.scriptWalking = false; g.audio.music.setDread(0.2);
    await g.wait(0.5); await g.fadeTo(1, 1.6, 0x000000);
    g.audio.setDuck({ amb: 1 }); g.flags.icehouseDone = true; g.saveCheckpoint('icehouse:done', { x: 0, z: 0 });
    g.lights.flashOn = false;
    if (g.goto) await g.goto('loop'); else g.mode = 'free';
  }

  dispose() {}
  update(dt) {
    const g = this.g, c = this.c;
    if (this.state === 'chase') this.updateChase(dt);
    // when the cellar is first entered
    if (!this.fired.cellar && g.player.pos.z < -13 && g.player.pos.x > 5) { this.fired.cellar = true; this.seq(['Ice. Cut from the lake, stacked in sawdust.', 'Dad filled this every February. I was never allowed down here.']); g.ui.objective('The third tape is down here somewhere.'); }
  }
}
