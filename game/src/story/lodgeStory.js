// LODGE phase: a house kept exactly as it was. Find the keys, hear the phone, play Jo's tune, and don't be found.
import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/util.js';
import { settings } from '../core/settings.js';
import { kitchenMemory, setupMirror, updateMirror, setupWardrobe, updateWardrobe, searcherInHouse } from './lodgeScenes.js';
import { PianoSession } from '../ui/pianoPlay.js';
import { askCode } from '../ui/lockUI.js';
import { roomAt } from '../world/lodge.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export class LodgePhase {
  constructor(world) { this.w = world; this.g = world.game; this.disposed = false; this.deaths = 0; this.comicsRead = 0; this.intrusion = null; this.inMemory = false; this.memory1Done = false; this.piano = null; this.phoneT = null; this.fired = {}; }

  async start(opts = {}) {
    const w = this.w, g = this.g, G = w.ground, U = w.upper, L = w.lodge;
    g.flags.chapter = 'lodge'; g.flags.phase = 'lodge';
    w.zones = { lodge: true, road: false, trail: false, boathouse: false, lake: false, deck: false, yardOnly: true };
    w.baseFear = 0.15; w.outsideAmb = 'winterNight'; w.snowLevel = 1;
    g.audio.amb.set('house', { fade: 2 }); g.audio.music.setDread(0.1);
    this.hookUp();
    setupMirror(this); setupWardrobe(this);
    // the front door swings shut behind her
    g.wait(1.2).then(() => { L.doors.front.toggle(false); g.audio.sfx('door_close', { pos: V(-0.3, 1.2, 5.5), vol: 0.7 }); });
    g.ui.objective('Find Jo.');
    if (opts.skipTo) { this.skipTo(opts.skipTo); return; }
    await g.wait(2.5);
    await w.think('Jo?');
    await g.wait(1.0);
    g.ui.hint('interact', 'Lamps and switches work. Light helps.', 6);
    this.coatDrip();
  }

  // ------------------------------------------------------------------------------------------------------------------
  hookUp() {
    const w = this.w, g = this.g, G = w.ground, U = w.upper, H = w.hooks, L = w.lodge;
    const think = (t) => w.think(t);
    const seq = async (lines, gap = 0.5) => { for (const l of lines) { await w.think(l); await g.wait(gap); } };
    H.porchSwitch = () => { g.journal.add('tape_switch'); g.ui.read('tape_switch').then(() => seq(['I taped it on.', 'Why did I tape it on?'])); };
    H.readJoNote = () => { g.ui.objective('The north bay. Go and find him.'); };
    H.readBreaker = () => { /* after the reader closes */ g.once && 0; this.afterRead(async () => { await w.think('That’s my handwriting.'); await g.wait(0.5); await w.think('I don’t remember writing that.'); }); };
    H.readFieldLog = () => this.afterRead(() => w.think('He wrote down every night. Every one.'));
    H.readMap = () => seq(['Jo’s pencil. The north bay.', 'Three in the morning, underlined twice.', 'He always underlines twice.']);
    H.readComics = () => this.readComics();
    H.tally = () => this.afterRead(async () => { await w.think('Six marks.'); await g.wait(0.5); await w.think('I didn’t make these.'); await g.wait(0.9); await w.think('…The pencil is still bright.'); });
    H.keepsake = () => this.keepsake();
    H.photoScratched = () => this.afterRead(async () => { await w.think('I did that.'); await g.wait(0.7); await w.think('I remember the scissors. I don’t remember why.'); });
    H.tin = () => this.tin();
    H.trapdoor = () => seq(['The cellar hatch. Chained from the other side.']);
    // simple examinations
    const ex = (obj, label, lines, o = {}) => { const it = g.interact.add({ object: obj, offset: o.offset, pos: o.pos, radius: o.radius ?? 0.5, maxDist: o.maxDist ?? 2.4, label, icon: 'eye', onUse: () => { it.used = false; seq(typeof lines === 'function' ? lines() : lines); } }); return it; };
    ex(G.objs.yellowCoat, 'Jo’s raincoat', ['His raincoat.', 'It’s wet. It’s dripping on the floor.'], { offset: [0, -0.5, 0], radius: 0.6 });
    ex(G.objs.hallClock.group, 'The clock', ['Stopped at 3:12.', 'Dad wound it every Sunday.'], { radius: 0.4 });
    ex(G.objs.calendar, 'The calendar', ['February. The twelfth is circled.', 'MAR!! — in red. Three exclamation marks.'], { radius: 0.3 });
    ex(G.objs.banner, 'The banner', ['HAPPY BIRTHDAY MAR.', 'The letters are coming down. One by one.'], { offset: [1.4, -0.2, 0], radius: 1.2, maxDist: 3.5 });
    const gi = g.interact.add({ object: G.objs.gift, radius: 0.32, maxDist: 2.4, label: 'The gift', icon: 'hand', onUse: () => { gi.used = false; this.gift(); } });
    ex(G.objs.fire.logs, 'The fire', () => this.w.game.flags.wokeByFire ? ['The embers are never out.', 'They’re never out.'] : ['Embers. Still hot.', 'Someone banked this fire.'], { radius: 0.8, maxDist: 3 });
    ex(G.objs.radio.group, 'The radio', ['Dad’s radio. Static, mostly.']);
    this.mantel = g.interact.add({ pos: V(-6.9, 1.7, -2.6), radius: 1.0, maxDist: 3.2, label: 'The photographs', icon: 'eye', onUse: () => { this.mantel.used = false; seq(['Dad. Me. Jo at every age.', 'He blinked in every single one.']); } });
    // the kettle — memory trigger
    this.kettleIt = g.interact.add({ object: G.objs.kettle, radius: 0.28, maxDist: 2.4, label: 'The kettle', icon: 'hand', onUse: () => this.touchKettle() });
    // the cookie jar
    this.jarIt = g.interact.add({ object: G.objs.cookieJar, offset: [0, 0.12, 0], radius: 0.28, maxDist: 2.3, label: () => (g.flags.joKey ? 'The cookie jar' : (this.memory1Done ? 'Look in the jar' : 'The cookie jar')), icon: 'hand', onUse: () => this.jar() });
    // piano
    this.pianoIt = g.interact.add({ pos: G.objs.piano.center.clone().add(V(0.35, 0.1, 0)), radius: 0.9, maxDist: 2.5, label: 'The piano', icon: 'hand', onUse: () => this.playPiano() });
    // study phone & radio handled when the study opens
    this.phoneIt = g.interact.add({ object: G.objs.phone.group, radius: 0.3, maxDist: 2.2, label: () => (this.ringing ? 'Answer' : 'The phone'), icon: 'hand', onUse: () => this.answerPhone() });
    // study door gets unlocked by flag studyKey inside Door; add a hook for the first entry
    L.doors.study.def.onOpen = () => this.onStudyOpened();
    L.doors.study.def.onUnlock = () => { g.ui.objective('Dad’s study.'); };
    L.doors.joDoor = L.doors.jo; L.doors.jo.def.onOpen = () => this.onJoOpened();
    L.doors.back.def.onUnlock = () => { g.ui.objective('Follow the trail to the boathouse.'); };
    L.doors.back.def.onOpen = () => this.leaveHouse();
    // a muffled footstep upstairs now and then, only while she is on the ground floor and before the intrusion
    this.stepsT = 40;
    g.on && 0;
  }

  async afterRead(fn) { const g = this.g; await new Promise((res) => { const off = g.on('noteClose', () => { off(); res(); }); }); await g.wait(0.4); return fn(); }

  coatDrip() {
    const w = this.w, g = this.g; const p = V(-2.85, 1.0, 4.5);
    const drip = () => { if (this.disposed) return; g.audio.at(V(-2.7, 0.06, 4.5), 'drip', { vol: 0.7 }); g.wait(2.2 + Math.random() * 1.5).then(drip); }; drip();
  }

  // ---- kitchen -------------------------------------------------------------------------------------------------------
  async touchKettle() {
    const w = this.w, g = this.g; this.kettleIt.used = false;
    if (this.memory1Done || this.inMemory) { g.ui.say('Cold.', { style: 'thought', speaker: 'MARA', dur: 1.8 }); return; }
    g.hands.gesture('grab', w.ground.objs.kettle.getWorldPosition(new THREE.Vector3()), 'R');
    g.audio.sfx('ceramic', { pos: V(3.9, 0.9, -5.1), vol: 0.6 });
    await g.wait(0.4);
    await w.think('It’s warm.');
    await g.wait(0.3);
    kitchenMemory(this);
  }
  jar() {
    const w = this.w, g = this.g; const lid = w.ground.objs.cookieJarLid; this.jarIt.used = false;
    if (g.flags.joKey) { g.ui.say('Empty. A few crumbs.', { style: 'thought', speaker: 'MARA', dur: 2.2 }); return; }
    if (!this.memory1Done) { g.ui.say('Dad’s cookie jar. It’s been empty since before I left.', { style: 'thought', speaker: 'MARA', dur: 3.2 }); return; }
    g.hands.gesture('grab', w.ground.objs.cookieJar.getWorldPosition(new THREE.Vector3()).add(V(0, 0.2, 0)), 'R');
    g.audio.sfx('ceramic', { pos: V(2.4, 1.0, -5.2), vol: 0.8 });
    g.wait(0.5).then(async () => {
      g.flags.joKey = true; g.audio.sfx('keys', { vol: 0.9 });
      await w.think('A brass key. An owl on the tag.');
      g.ui.objective('Jo’s room, upstairs.');
      await g.wait(0.6);
      await w.think('Her bedroom key, he’d call it. Jo’s room.');
      g.saveCheckpoint('lodge:joKey');
    });
  }
  async gift() {
    const w = this.w, g = this.g;
    await w.think('Don’t open it till tomorrow.'); await g.wait(0.4); await w.think('I know.');
  }

  // ---- upstairs ------------------------------------------------------------------------------------------------------
  keepsake() {
    const w = this.w, g = this.g; this.w.upper.interact.keepsake.used = false;
    g.audio.sfx('drawer', { vol: 0.5 }); g.journal.add('bracelet');
    g.ui.read('bracelet', { silent: false }).then(async () => { await w.think('His hospital bracelet.'); await g.wait(0.6); await w.think('Dad let me hold him before they’d even cleaned him up.'); g.flags.braceletSeen = true; });
  }
  onJoOpened() {
    const g = this.g, w = this.w; if (this.fired.joOpen) return; this.fired.joOpen = true;
    g.audio.setDuck({ music: 1 }); g.audio.music.pianoPhrase({ root: 62, tempo: 46, vel: 0.35, mode: 'minor' });
    g.wait(1.4).then(() => w.think('It’s exactly how he left it.'));
    g.ui.objective('Jo’s room.');
    // the owl score: on the desk
    if (!this.score) {
      const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), new THREE.MeshStandardMaterial({ color: 0xf1e8cf, roughness: 0.9 }));
      sheet.rotation.x = -Math.PI / 2; sheet.position.set(-2.1, 2.85 + 0.785, -1.3); sheet.rotation.z = 0.25; g.root.add(sheet); this.score = sheet;
      this.scoreIt = g.interact.add({ object: sheet, radius: 0.3, maxDist: 2.2, label: 'A sheet of owls', icon: 'eye', onUse: () => { this.scoreIt.used = false; g.ui.read('owl_keys').then(() => this.afterScore()); } });
    }
  }
  async afterScore() {
    const w = this.w, g = this.g; if (this.fired.score) return; this.fired.score = true; g.flags.sawScore = true;
    await w.think('Owls on the piano keys. Numbered.'); await g.wait(0.5); await w.think('Seven. And an empty branch for the eighth.');
    g.ui.objective('Play it on the piano downstairs.');
  }
  async readComics() {
    const w = this.w, g = this.g, order = ['comic_pun', 'comic_night', 'comic_unfinished']; const id = order[Math.min(this.comicsRead, 2)];
    this.w.upper.interact.comics.used = false;
    this.comicsRead++;
    await g.ui.read(id);
    if (id === 'comic_pun') { await g.wait(0.4); await w.think('He thought he was so funny.'); await g.wait(0.5); await w.think('He was funny.'); }
    else if (id === 'comic_night') { await g.wait(0.4); await w.think('It’s stretching. Pay attention.'); }
    else if (!this.intrusion && !this.fired.intrusionStarted) {
      await g.wait(0.5); await w.think('“Ask Mar for the ending.”'); await g.wait(1.4);
      this.startIntrusion();
    }
  }
  async startIntrusion() {
    const w = this.w, g = this.g; if (this.fired.intrusionStarted || this.disposed) return; this.fired.intrusionStarted = true;
    const res = await searcherInHouse(this);
    if (res === 'survived') {
      g.flags.intrusionSurvived = true;
      await g.wait(1.2);
      await w.think('It was looking for him.'); await g.wait(0.8);
      await w.think('It said his name. …In a voice I know.');
      g.ui.objective('Play Jo’s tune on the piano.');
      g.saveCheckpoint('lodge:intrusion', { x: 0.1, z: -3.0 });
    }
  }
  /** respawn: she wakes in Dad's chair by the fire. The porch light is on. */
  async wakeByFire(how) {
    const w = this.w, g = this.g, P = g.player, S = w.searcher; this.deaths++; g.flags.wokeByFire = true;
    g.mode = 'locked'; g.ui.clearSubs(); g.audio.setDuck({ amb: 1 });
    await g.fadeTo(1, 0.8); S.vanish(); this.intrusion = null; this.fired.intrusionStarted = false;
    const W = this.wardrobe; W.hidden = false; W.target = 0; W.open = 0; P.lookLimit = null; P.eyeOverride = 1.12; P.frozen = true; P.noclip = false;
    g.audio.sfx('splash', { vol: 0.8, big: true }); g.audio.muffleTarget = 900; g.gfx.fx.eyes = 1;
    // power back; doors as they were
    this.powerOut = false; this.w.baseFear = 0.1;
    Object.values(w.ground.lamps).concat(Object.values(w.upper.lamps)).forEach((l) => { if (l.interact) l.interact.enabled = true; });
    Object.values(w.ground.switches).concat(Object.values(w.upper.switches)).forEach((sw) => { if (sw.interact) sw.interact.enabled = true; });
    w.lodge.doors.front.toggle(false);
    P.teleport(-4.0, 0, -3.5, Math.PI / 2); P.pitch = -0.3; g.hands.setVisible(true);
    await g.wait(0.8); g.audio.amb.setBed('wind', 0.4);
    g.tweenFx('eyes', 0, 3.5); await g.fadeTo(0, 2.4); g.audio.muffleTarget = 22000;
    P.pitch = -0.1; P.eyeOverride = null;
    P.frozen = false; g.mode = 'free';
    const line = this.deaths === 1 ? ['…I fell asleep in Dad’s chair.', 'That’s all.'] : (this.deaths === 2 ? ['Again.', 'I know this fireplace.'] : ['When it listens — hold still.', 'Don’t breathe.']);
    await w.think(line[0]); await g.wait(0.6); await w.think(line[1]);
    g.ui.hint('still', 'Hold your breath when it listens', 7);
    g.saveCheckpoint('lodge:fire', { x: P.pos.x, z: P.pos.z });
    this.fired.joOpen = true;
    // going back to Jo's room starts it over
    this.retryWatch = true;
  }

  // ---- piano ----------------------------------------------------------------------------------------------------------
  async playPiano() {
    const w = this.w, g = this.g, pn = w.ground.objs.piano; this.pianoIt.used = false;
    if (this.piano && this.piano.active) return;
    if (!g.flags.sawScore && !this.fired.pianoHint) { this.fired.pianoHint = true; w.think('Dad’s piano. Out of tune since the funeral.'); }
    this.piano = new PianoSession(g, pn, { onSolved: () => this.pianoSolved(), onExit: () => {} });
    this.piano.start();
  }
  async pianoSolved() {
    const w = this.w, g = this.g, dr = w.ground.objs.pianoDrawer; if (g.flags.studyKey) return;
    await g.wait(1.4);
    // the little drawer slides open with a click, the way Dad built it
    g.audio.sfx('drawer', { pos: V(0.8, 0.5, -0.75), vol: 0.9 });
    const home = w.ground.objs.pianoDrawerHome.clone(); let t = 0; const off = g.on('update', (dt) => { t = Math.min(1, t + dt * 1.2); dr.position.x = home.x - 0.22 * t; if (t >= 1) off(); });
    this.piano.stop();
    await g.wait(1.0);
    g.mode = 'locked'; await w.think('A drawer.');
    g.flags.studyKey = true; g.audio.sfx('keys', { vol: 0.9 });
    await g.wait(0.4);
    await w.think('A key. “STUDY” in Dad’s pencil.'); await g.wait(0.4);
    await w.think('And no eighth note. …Did he ever finish it?');
    g.mode = 'free'; g.ui.objective('Dad’s study.');
    g.saveCheckpoint('lodge:piano');
  }

  // ---- study ----------------------------------------------------------------------------------------------------------
  onStudyOpened() {
    const g = this.g, w = this.w; if (this.fired.study) return; this.fired.study = true;
    g.wait(5).then(() => { if (!this.disposed) this.ringPhone(); });
  }
  ringPhone() {
    const g = this.g, w = this.w; if (this.ringing || g.flags.phoneAnswered) return; this.ringing = true;
    const pos = V(-6.3, 0.9, 3.7);
    const ring = () => { if (!this.ringing || this.disposed) return; g.audio.at(pos, 'phone_ring', { vol: 1, rings: 1, reverb: 0.5 }); g.wait(3.3).then(ring); }; ring();
    g.audio.music.setDread(0.3);
  }
  async answerPhone() {
    const w = this.w, g = this.g; this.phoneIt.used = false;
    if (!this.ringing) { g.ui.say('The line’s dead.', { style: 'thought', speaker: 'MARA', dur: 2 }); return; }
    this.ringing = false; g.flags.phoneAnswered = true;
    g.audio.sfx('handset', { pos: V(-6.3, 0.9, 3.7), vol: 1 });
    g.mode = 'locked'; g.hands.gesture('grab', V(-6.3, 0.9, 3.7), 'R');
    await g.wait(0.7);
    // the line: static, the lake singing, and someone humming seven notes
    const src = g.audio.out('voice', null, { reverb: 0.1 }); const t = g.audio.ctx.currentTime + 0.1;
    const k = g.audio.kit; const hp = k.filt('highpass', 300, 0.7), lp = k.filt('lowpass', 3000, 0.8); hp.connect(lp); lp.connect(src.input);
    k.hiss(hp, { t, dur: 14, gain: 0.07 });
    for (let i = 0; i < 7; i++) k.icePew(hp, { t: t + 0.5 + i * 1.3, gain: 0.07, f0: 1700 + Math.random() * 1500, dur: 0.6 });
    g.audio.voice.hum(hp, { t: t + 3.2, notes: [[0, 1], [3, 1], [7, 2], [5, 1], [3, 1], [2, 1], [0, 2]], root: 50, tempo: 60, gain: 0.16 });
    src.dispose(16);
    await w.think('Jo?');
    await g.wait(6.5);
    await w.think('Jo, is that you?');
    await g.wait(5);
    g.audio.sfx('static', { dur: 1.5, vol: 0.4 });
    await g.wait(1.4);
    g.audio.sfx('dialtone', { dur: 3, vol: 0.8 });
    await g.wait(3.2);
    g.audio.sfx('handset', { vol: 1, up: false });
    g.mode = 'free';
    await w.think('He hums when he’s nervous.'); await g.wait(0.4); await w.think('He hums when he’s happy, too.');
    g.audio.music.setDread(0.15);
    g.ui.objective('Open Dad’s tin.');
  }
  async tin() {
    const w = this.w, g = this.g; this.w.ground.interact.tin.used = false;
    if (g.flags.tinOpen) { g.ui.say('Empty now.', { style: 'thought', speaker: 'MARA', dur: 1.8 }); return; }
    if (!g.journal.has('tin_note')) { g.journal.add('tin_note'); await g.ui.read('tin_note'); await g.wait(0.2); }
    g.mode = 'locked'; g.ui.setPrompt(null);
    const code = await askCode(g, { title: 'Dad’s tin', hint: g.flags.braceletSeen ? 'Month first, then the day.' : 'He locked it with something only he would think of.' });
    g.requestLock(); g.mode = 'free';
    if (code === null) return;
    if (code === '0312') {
      g.flags.tinOpen = true; g.audio.sfx('unlock', { vol: 0.9 });
      await g.wait(0.8);
      g.mode = 'locked';
      await w.think('Of course. His birthday.'); await g.wait(0.4);
      g.audio.sfx('keys', { vol: 0.9 });
      g.flags.backKey = true; g.flags.boatKey = true;
      await w.think('Two keys. A brass one tagged BOAT, and one on a little owl.'); await g.wait(0.5);
      await w.think('The owl’s Jo’s. He lost it years ago.');
      g.mode = 'free'; g.ui.objective('The back door. Then the trail to the boathouse.');
      g.saveCheckpoint('lodge:tin');
    } else {
      g.audio.sfx('click', { vol: 0.8 }); g.audio.sfx('rattle', { vol: 0.5 });
      w.think('Nothing.');
    }
  }

  // ---- leaving the house ------------------------------------------------------------------------------------------------
  leaveHouse() {
    const w = this.w, g = this.g; if (this.fired.leave) return; this.fired.leave = true;
    g.wait(2.2).then(() => { w.setPhase('search'); });
  }

  skipTo(step) {
    const g = this.g, w = this.w;
    const steps = ['memory', 'piano', 'tin'];
    const idx = steps.indexOf(step);
    if (idx >= 0) { this.memory1Done = true; g.flags.joKey = true; w.lodge.doors.jo.unlock(); }
    if (idx >= 1) { g.flags.studyKey = true; w.lodge.doors.study.unlock(); }
    if (idx >= 2) { g.flags.backKey = true; g.flags.boatKey = true; w.lodge.doors.back.unlock(); }
  }

  // ------------------------------------------------------------------------------------------------------------------
  dispose() { this.disposed = true; this.ringing = false; if (this.ghost) this.ghost.root.visible = false; }

  update(dt) {
    const w = this.w, g = this.g, P = g.player;
    updateMirror(this, dt); updateWardrobe(this, dt);
    if (this.piano && this.piano.active) this.piano.update(dt);
    // retrigger the intrusion if she goes back to Jo's room after waking by the fire
    if (this.retryWatch && !this.fired.intrusionStarted && P.pos.y > 2 && roomAt(P.pos.x, P.pos.y, P.pos.z) === 'jo' && !g.flags.intrusionSurvived) { this.retryWatch = false; g.wait(5).then(() => this.startIntrusion()); }
    // the phone keeps ringing until answered; rings die if she leaves the house
    // wardrobe door left ajar after leaving
  }
}
