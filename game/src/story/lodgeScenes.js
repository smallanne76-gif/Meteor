// Set pieces inside the lodge: Memory 1 (the kitchen, Jo and the pancakes), the bathroom mirror, the Searcher in the house (hide in the wardrobe).
import * as THREE from 'three';
import { Humanoid } from '../chars/humanoid.js';
import { Mirror, GHOST_LAYER } from '../gfx/mirror.js';
import { clamp, damp, lerp, RNG } from '../core/util.js';
import { LODGE } from '../world/lodge.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ======================================================================================================================
// MEMORY 1 — the kitchen
// ======================================================================================================================
export async function kitchenMemory(ph) {
  const w = ph.w, g = ph.g, P = g.player, G = w.ground;
  if (ph.inMemory) return; ph.inMemory = true; g.flags.memory1 = true;
  g.ui.setPrompt(null); P.frozen = true; P.lookMul = 0.55; g.mode = 'free';
  g.lights.flashOn = false;
  const origSky = 'nightSnow';
  // ---- slip into memory: warmth, light, sound ------------------------------------------------------------------------
  g.audio.sfx('creak', { pos: V(4, 2.2, -2.8), vol: 0.5 });
  g.tweenFx('memory', 1, 3.0); g.setGrade('memory', false, 0.9);
  g.audio.setDuck({ amb: 0.35 }); g.audio.music.memory({ gain: 0.7 });
  g.audio.amb.set('house', { fade: 0.1 });
  await g.wait(1.4);
  g.setSky('morning'); g.audio.setSpace && g.audio.setSpace('room');
  w.snow.setIntensity(0.25);
  // clean, alive: kitchen lamp on, steam, pan, plates
  G.lamps.kitchen.set(true);
  const room = new THREE.Group(); g.root.add(room);
  const steam = makeSteam(g, room, V(3.95, 0.95, -5.1)); ph.memoryCleanup = [() => { g.root.remove(room); steam.dispose(); }];
  const pan = new THREE.Group(); pan.position.set(4.0, 0.88, -5.12); room.add(pan);
  pan.add(Object.assign(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.035, 20), new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.5, metalness: 0.6 })), { castShadow: true }));
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.025), new THREE.MeshStandardMaterial({ color: 0x1b1b1b })); handle.position.set(0.19, 0.005, 0); pan.add(handle);
  const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 7), new THREE.MeshStandardMaterial({ color: 0xb8803c, roughness: 0.7 })); cake.position.y = 0.022; pan.add(cake);
  const stack = new THREE.Group(); stack.position.set(5.05, 0.8, -2.0); room.add(stack);
  for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.014, 7), new THREE.MeshStandardMaterial({ color: 0xb98a46, roughness: 0.7 })); c.position.y = 0.012 + i * 0.016; c.rotation.y = i; stack.add(c); }
  // Jo — from behind, backlit by the window beside the stove
  const jo = new Humanoid({ kind: 'jo', outfit: 'flannel', shirt: 0xc27a62, pants: 0x3b4560, boots: 0x2a2018 });
  jo.setPos(4.0, 0, -4.5); jo.faceYaw(Math.PI); g.root.add(jo.root); ph.jo = jo; ph.memoryCleanup.push(() => { g.root.remove(jo.root); jo.dispose(); });
  jo.stirPos = V(4.0, 0.95, -5.12); jo.stir = 1; jo.reachTo('L', V(3.4, 1.0, -5.0));
  jo.setFeel({ smile: 0.4 });
  const joEar = () => V(jo.root.position.x, 1.7, jo.root.position.z);
  let tt = 0; const upd = (dt) => { jo.update(dt); steam.update(dt); };
  const off = g.on('update', upd); ph.memoryCleanup.push(off);
  const voice = (text, dur = null) => { const src = g.audio.out('voice', joEar(), { reverb: 0.4, ref: 1.5 }); const t = g.audio.ctx.currentTime + 0.03; g.audio.voice.murmur(src.input, { t, text, gender: 'm', gain: 0.17, rate: 0.95 }); src.dispose(6); };
  const maraVoice = (text) => { const src = g.audio.out('voice', null, { reverb: 0.2 }); const t = g.audio.ctx.currentTime + 0.03; g.audio.voice.murmur(src.input, { t, text, gender: 'f', gain: 0.1, rate: 0.95 }); src.dispose(6); };
  const joSays = async (text, o = {}) => { if (g.settings?.voiceMurmur !== false) voice(text); await g.ui.say(text, { speaker: 'JO', style: 'memory', crit: true, ...o }); };
  const maraSays = async (text, o = {}) => { maraVoice(text); await g.ui.say(text, { speaker: 'MARA', style: 'memory', crit: true, ...o }); };
  g.audio.sfx('ceramic', { pos: V(4, 0.9, -5), vol: 0.5 });
  await g.wait(1.8);
  await joSays('Don’t look. It’s a surprise.');
  jo.face.set('smile', 0.55);
  await maraSays('It’s pancakes, Jo. I can smell them from the stairs.');
  await g.wait(0.4);
  await joSays('It’s Ohio.');
  await g.wait(0.5);
  g.audio.sfx('cloth', { pos: V(4, 1, -5), vol: 0.5 });
  await maraSays('That’s not Ohio.');
  await joSays('Ohio is what I say it is.');
  g.audio.sfx('ceramic', { pos: V(4, 0.9, -5), vol: 0.5 });
  await g.wait(0.8);
  // he hums: the seven notes, stopping before the eighth
  jo.stir = 0.6;
  const hsrc = g.audio.out('voice', joEar(), { reverb: 0.5, ref: 1.5 });
  const t0 = g.audio.ctx.currentTime + 0.05;
  g.audio.voice.hum(hsrc.input, { t: t0, notes: [[0, 1], [3, 1], [7, 2], [5, 1], [3, 1], [2, 1], [0, 2]], root: 50, tempo: 64, gain: 0.2 }); hsrc.dispose(9);
  jo.face.set('smile', 0.2);
  await g.wait(7.0);
  await joSays('…and then I don’t know.', { dur: 3 });
  await maraSays('Don’t know what?');
  await joSays('The end of it. Seven notes. Always seven.');
  await joSays('I keep waiting for the eighth one to just — show up.', { dur: 4 });
  await maraSays('It’ll come.');
  // he turns his head, a half-smile in profile (never the full face), says it quietly
  jo.lookAt(V(3.6, 1.55, -3.0), 0.9); jo.face.set('smile', 0.7);
  await g.wait(1.2);
  await joSays('No rush.', { dur: 2.6 });
  await g.wait(0.6);
  // OBSERVATION: he walks to the counter and puts something in the blue jar by the sink
  jo.stir = 0; jo.lookAt(null);
  const jarPos = V(2.4, 1.0, -5.2);
  jo.walking = true; jo.walkSpeed = 1.1;
  const startX = jo.root.position.x; const startZ = jo.root.position.z;
  await new Promise((res) => { let k = 0; const h = (dt) => { k += dt * 0.55; jo.root.position.x = lerp(startX, 2.7, Math.min(1, k)); jo.root.position.z = lerp(startZ, -4.6, Math.min(1, k)); jo.faceYaw(Math.PI + Math.atan2(2.4 - jo.root.position.x, -5.2 - jo.root.position.z) * 0 + 0.9 * Math.min(1, k)); if (k >= 1) { off2(); res(); } }; const off2 = g.on('update', h); });
  jo.walking = false; jo.faceYaw(Math.PI - 0.15);
  jo.reachTo('R', V(2.4, 1.15, -5.1), V(0, -1, 0)); jo.lookAt(V(2.4, 1.1, -5.1), 0.8);
  await g.wait(0.9);
  const lid = G.objs.cookieJarLid; lid.position.y = 0.22 + 0.06; lid.rotation.z = 0.5; lid.position.x = -0.07;
  g.audio.sfx('ceramic', { pos: V(2.4, 1.0, -5.2), vol: 0.9 });
  const keyG = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 0.012), new THREE.MeshStandardMaterial({ color: 0xd7a844, metalness: 1, roughness: 0.25, emissive: 0xaa7a20, emissiveIntensity: 0.6 })); keyG.position.set(2.43, 1.17, -5.12); room.add(keyG);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.004, 6, 12), keyG.material); ring.position.x = -0.026; keyG.add(ring);
  await g.wait(0.7);
  keyG.position.y = 1.08; await g.wait(0.15); keyG.position.set(2.4, 1.0, -5.2); g.audio.sfx('keys', { pos: V(2.4, 1.0, -5.2), vol: 0.9 });
  await g.wait(0.5); keyG.visible = false;
  g.ui.say('She’ll look in the jar. She always looks in the jar.', { speaker: 'JO', style: 'memory', dur: 4, crit: true });
  voice('She’ll look in the jar. She always looks in the jar.');
  await g.wait(1.6);
  lid.rotation.z = 0.35; lid.position.set(-0.05, 0.22 + 0.02, 0);          // left slightly ajar — a detail the present keeps
  jo.reachTo('R', null); jo.lookAt(null);
  await g.wait(2.2);
  // ---- the kettle begins to scream and the memory comes apart -----------------------------------------------------------
  g.audio.sfx('static', { dur: 0.8, vol: 0.3 });
  jo.root.rotation.y += 0.0;
  g.audio.music.setDread(0.5);
  const kettleSrc = g.audio.out('sfx', V(3.9, 1.0, -5.1), { reverb: 0.3 }); const kt = g.audio.ctx.currentTime;
  g.audio.kit.tone(kettleSrc.input, { t: kt, f0: 1500, f1: 2300, dur: 3.4, gain: 0.1, attack: 0.6, release: 1.2, glide: 'lin', vibRate: 12, vibDepth: 40 }); kettleSrc.dispose(6);
  jo.walking = true; jo.faceYaw(Math.PI - 0.15);
  await g.wait(1.4);
  // Jo turns toward the player…
  jo.lookAt(P.pos.clone().setY(1.6), 1); jo.walking = false;
  g.tweenFx('flash', 0.0, 0.01);
  await g.wait(1.2);
  g.tweenFx('memory', 0, 1.6); g.tweenFx('dread', 0.8, 1.4);
  g.audio.sfx('static', { dur: 1.2, vol: 0.45, bright: 1.5 });
  await g.wait(0.5);
  // collapse: sun goes out, Jo is gone
  G.lamps.kitchen.set(false);
  for (const c of ph.memoryCleanup) { try { c(); } catch (e) { /* ok */ } } ph.memoryCleanup = [];
  ph.jo = null;
  g.setSky(origSky); g.setGrade('nightSnow', false, 1.2); w.snow.setIntensity(1);
  g.audio.setDuck({ amb: 1 }); g.audio.music.stop('memory', 2.5); g.audio.music.setDread(0.12);
  g.audio.sfx('door_close', { pos: V(4, 1, -2.9), vol: 0.5 });
  await g.wait(1.0);
  g.tweenFx('dread', 0, 3);
  P.frozen = false; P.lookMul = 1; ph.inMemory = false; ph.memory1Done = true; g.flags.memory1Done = true;
  g.audio.amb.set('house', { fade: 2 });
  await w.think('…It was right here.');
  await g.wait(0.6);
  await w.think('He hid something. In the jar.');
  g.ui.objective('Look in the cookie jar.');
  g.saveCheckpoint('lodge:memory1', { x: P.pos.x, z: P.pos.z });
}

function makeSteam(game, parent, pos) {
  const N = 26; const g = new THREE.BufferGeometry(); const p = new Float32Array(N * 3), st = new Float32Array(N * 2);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aState', new THREE.BufferAttribute(st, 2));
  const age = new Float32Array(N); for (let i = 0; i < N; i++) age[i] = Math.random() * 2;
  const mat = new THREE.ShaderMaterial({ uniforms: { uMap: { value: game.chapter && null }, uScale: { value: 600 } }, vertexShader: 'attribute vec2 aState; uniform float uScale; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aState.x * uScale / max(-mv.z, 0.05), 1.0, 90.0); vA = aState.y; }', fragmentShader: 'varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)) * vA; gl_FragColor = vec4(vec3(1.0,0.97,0.92), a); }', transparent: true, depthWrite: false });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; parent.add(pts);
  return { update(dt) { mat.uniforms.uScale.value = game.gfx.size.h / (2 * Math.tan(game.camera.fov * Math.PI / 360)); for (let i = 0; i < N; i++) { age[i] += dt; if (age[i] > 2.4) age[i] = 0; const t = age[i] / 2.4; p[i * 3] = pos.x + Math.sin(i * 7.1 + t * 3) * 0.05 * t; p[i * 3 + 1] = pos.y + t * 0.9; p[i * 3 + 2] = pos.z + Math.cos(i * 5.3 + t * 2) * 0.05 * t; st[i * 2] = 0.04 + t * 0.2; st[i * 2 + 1] = Math.sin(t * Math.PI) * 0.22; } g.attributes.position.needsUpdate = true; g.attributes.aState.needsUpdate = true; }, dispose() { parent.remove(pts); g.dispose(); mat.dispose(); } };
}

// ======================================================================================================================
// THE MIRROR — your reflection is not you
// ======================================================================================================================
export function setupMirror(ph) {
  const w = ph.w, g = ph.g; const y = 2.85;
  const m = new Mirror(g, { pos: V(4.2, y + 1.55, 1.13), yaw: 0, w: 0.52, h: 0.72, res: 512 });
  ph.mirror = m; w.cleanup(() => m.dispose());
  const ghost = new Humanoid({ kind: 'searcher', outfit: 'parka', hood: true, gloves: true, hunch: 0.1, pants: 0x2e332f, boots: 0x1c1f1a });
  ghost.root.traverse((o) => { o.layers.set(GHOST_LAYER); }); ghost.root.visible = false; g.root.add(ghost.root); ph.ghost = ghost; w.cleanup(() => ghost.dispose());
  ph.mirrorState = { t: 0, phase: 'idle', look: 0, done: false };
}
export function updateMirror(ph, dt) {
  const w = ph.w, g = ph.g, P = g.player, st = ph.mirrorState; if (!st) return;
  const m = ph.mirror, ghost = ph.ghost; ghost.update(dt);
  const mp = m.mesh.position; const d = Math.hypot(P.pos.x - mp.x, P.pos.z - mp.z);
  const inBath = P.pos.y > 2 && P.pos.x > 3.3 && P.pos.z > 1.0 && P.pos.z < 5.4;
  const toM = V(mp.x - P.pos.x, mp.y - (P.pos.y + P.eye), mp.z - P.pos.z).normalize();
  const looking = inBath && d < 2.6 && toM.dot(P.forward) > 0.9;
  if (st.phase === 'idle') {
    if (looking && !st.done) { st.look += dt; if (st.look > 1.1) { st.phase = 'show'; st.t = 0; reveal(ph); } } else st.look = Math.max(0, st.look - dt);
  } else if (st.phase === 'show') {
    st.t += dt;
    // the reflection stands where you stand, but it does not move when you do
    m.setFog(clamp(st.t / 3) * 0.55);
    if (st.t > 5.2) { ghost.root.visible = false; st.phase = 'done'; st.done = true; m.setFog(0); }
  }
}
async function reveal(ph) {
  const w = ph.w, g = ph.g, P = g.player, ghost = ph.ghost;
  // place a hooded figure exactly where the reflection of the player would be
  const mp = ph.mirror.mesh.position; ghost.setPos(P.pos.x, P.pos.y, P.pos.z + 0.2); ghost.faceYaw(0); // faces +z? the mirror is north of the player: ghost must face the mirror (north = -z): yaw = PI
  ghost.faceYaw(Math.PI); ghost.root.visible = true;
  ghost.lookAt(V(P.pos.x, P.pos.y + 1.6, P.pos.z - 3), 1);
  g.audio.music.sting('low', 0.9); g.audio.sfx('static', { dur: 0.6, vol: 0.25 });
  g.player.addKick(0.0, 0.0);
  await g.wait(1.3);
  ghost.reachTo('R', V(P.pos.x - 0.1, P.pos.y + 1.4, P.pos.z - 0.9));
  await g.wait(2.4);
  await w.think('…That wasn’t me.');
  await g.wait(0.7);
  await w.think('That wasn’t me.');
}

// ======================================================================================================================
// THE SEARCHER IN THE HOUSE — hide in the wardrobe, hold your breath
// ======================================================================================================================
export function setupWardrobe(ph) {
  const w = ph.w, g = ph.g; const U = w.upper; const wd = U.objs.wardrobe; const doors = U.objs.wardrobeDoors;
  ph.wardrobe = { doors, open: 0, target: 0, hidden: false };
  ph.hideIt = g.interact.add({ pos: V(0.55, 2.85 + 1.2, -3.0), radius: 0.7, maxDist: 2.4, label: 'Hide', icon: 'door', enabled: () => ph.intrusion && !ph.wardrobe.hidden && !ph.intrusion.over, onUse: () => enterWardrobe(ph) });
  ph.leaveIt = g.interact.add({ pos: V(0.55, 2.85 + 1.2, -3.0), radius: 0.7, maxDist: 2.6, label: 'Step out', icon: 'door', enabled: () => false, onUse: () => leaveWardrobe(ph) });
}
export function updateWardrobe(ph, dt) {
  const W = ph.wardrobe; if (!W) return; W.open = damp(W.open, W.target, 5, dt);
  const [dl, dr] = W.doors.children; dl.rotation.y = -W.open * 1.7; dr.rotation.y = W.open * 1.7;
}
async function enterWardrobe(ph) {
  const w = ph.w, g = ph.g, P = g.player, W = ph.wardrobe; const y = 2.85;
  g.mode = 'locked'; g.lights.flashOn = false; g.audio.sfx('door_open', { pos: V(0.6, y + 1, -3), vol: 0.7, creaky: false });
  W.target = 1; await g.wait(0.45);
  P.pos.set(1.0, y, -3.0); P.eyeOverride = 1.5; P.yaw = Math.PI / 2; P.pitch = 0.02; P.syncCamera();
  W.target = 0; g.audio.sfx('door_close', { pos: V(0.6, y + 1, -3), vol: 0.4 });
  await g.wait(0.35);
  W.hidden = true; g.mode = 'hide'; P.lookLimit = { yaw0: Math.PI / 2, yawRange: 0.5, pitchMin: -0.25, pitchMax: 0.3 };
  g.hands.setVisible(false); g.audio.muffleTarget = 3500; P.setFear(0.8);
  g.ui.hint('still', 'Hold your breath', 8);
  g.emit('hide', true);
}
async function leaveWardrobe(ph) {
  const g = ph.g, P = g.player, W = ph.wardrobe; const y = 2.85;
  W.target = 1; g.audio.sfx('door_open', { pos: V(0.6, y + 1, -3), vol: 0.7, creaky: false });
  await g.wait(0.5); P.pos.set(0.1, y, -3.0); P.yaw = Math.PI / 2; P.eyeOverride = null; P.lookLimit = null; P.syncCamera();
  g.mode = 'free'; W.hidden = false; g.hands.setVisible(true); g.audio.muffleTarget = 22000; W.target = 0; g.emit('hide', false);
}

/** The whole sequence. Resolves 'survived' | 'caught'. */
export async function searcherInHouse(ph) {
  const w = ph.w, g = ph.g, P = g.player, S = w.searcher, G = w.ground, U = w.upper, D = w.lodge.doors; const y = 2.85;
  const I = ph.intrusion = { over: false, caught: false, listening: false, hiddenFail: 0 };
  // ---- power cut
  const lamps = [...Object.values(G.lamps), ...Object.values(U.lamps)];
  const prevOn = lamps.map((l) => l.on);
  for (let k = 0; k < 4; k++) { lamps.forEach((l) => l.set(prevOn[0] ? k % 2 === 0 : false)); await g.wait(0.07 + Math.random() * 0.1); }
  lamps.forEach((l) => { l.set(false); if (l.interact) l.interact.enabled = false; });
  Object.values(G.switches).concat(Object.values(U.switches)).forEach((sw) => { if (sw.interact) sw.interact.enabled = false; });
  ph.powerOut = true; g.audio.sfx('switch', { vol: 1 }); g.audio.music.setDread(0.5); g.audio.music.sting('low', 0.7);
  g.lights.setTag && g.lights.setTag('fire', true);
  w.baseFear = 0.5;
  await g.wait(1.2);
  await w.think('The power.');
  await g.wait(1.6);
  // ---- the front door opens, far below
  D.front.toggle(true);
  g.audio.amb.setBed('wind', 0.75); g.audio.amb.gust && 0;
  await g.wait(2.2);
  S.setPos(-0.3, 0, 6.6, Math.PI); S.opts.noHunt = true; S.opts.prints = true; S.setLantern(true); S.show(true); S.state = 'script'; S.callT = 99;
  S.call();
  await g.wait(2.8);
  await w.think('Someone’s in the house.');
  g.ui.hint('interact', 'Find somewhere to hide', 7);
  if (!ph.hideIt.enabled) ph.hideIt.enabled = () => ph.intrusion && !ph.wardrobe.hidden && !I.over;
  // ---- route through the house
  const walk = (pts, speed = 1) => new Promise((res) => { S.state = 'patrol'; S.path = pts.map((p) => V(p[0], 0, p[1])); S.pathI = 0; S.loop = false; S.speedMul = speed; S.body.walking = true; S.opts.stopOnWaypoints = false; S.onPathEnd = res; });
  const listen = async (sec) => { S.state = 'standing'; S.body.walking = false; S.body.opts.headTilt = 0.2; await g.wait(sec); S.body.opts.headTilt = 0; };
  if (I.caught) return 'caught';
  await walk([[-0.3, 4.2], [-0.4, 2.2], [-0.5, 0.2]], 1.0); if (I.caught) return 'caught';
  g.audio.at(V(-1.5, 1.2, -1), 'creak', { vol: 0.6 });
  await walk([[-1.8, -1.2], [-0.6, -2.4]], 0.9); await listen(2.0);
  await walk([[0.2, -0.9]], 0.9); await listen(1.5);          // by the piano
  await walk([[-0.1, 0.6], [-0.2, 2.8], [2.3, 4.9]], 1.1);
  g.audio.at(S.pos.clone().setY(1.2), 'creak', { vol: 0.5 });
  await walk([[2.3, 4.9], [2.3, 1.2], [0.9, 0.2]], 0.95); if (I.caught) return 'caught';
  // ---- upstairs: Jo's door
  const joDoor = D.jo; if (joDoor.locked) joDoor.unlock(); joDoor.toggle(true);
  await walk([[-0.2, 0.2], [-0.8, -0.1]], 0.9);
  await walk([[-0.8, -1.6]], 0.9);
  // if she's not hidden, it knows
  if (!ph.wardrobe.hidden) { I.caught = true; await caught(ph, 'room'); return 'caught'; }
  await walk([[-1.3, -2.6], [-1.6, -3.6]], 0.8); await listen(1.2);
  await walk([[-1.7, -2.0]], 0.8); await listen(1.0);
  await walk([[-0.6, -3.0], [0.0, -3.0]], 0.7);
  S.yaw = Math.PI / 2; S.state = 'standing'; S.body.walking = false; S.syncRoot();
  // ---- three listening windows at the wardrobe doors
  const windows = [3.4, 4.8, 3.0];
  for (let i = 0; i < windows.length; i++) {
    if (I.caught) return 'caught';
    await g.wait(1.3 + i * 0.4);
    // quiet: the house stops breathing; the lantern light bars slide across the slats
    I.listening = true; S.body.opts.headTilt = 0.28; g.audio.setDuck({ amb: 0.25 }); g.audio.sfx('creak', { pos: S.pos.clone().setY(1), vol: 0.35 });
    S.body.reachTo('R', V(0.7, y + 1.0, -3.0));
    let grace = 0.7, t = 0; const dur = windows[i];
    while (t < dur && !I.caught) {
      await g.wait(0.1); t += 0.1;
      if (!P.holdingBreath) { grace -= 0.1; if (grace <= 0) { I.caught = true; } } else grace = Math.min(0.7, grace + 0.05);
    }
    I.listening = false; S.body.opts.headTilt = 0; S.body.reachTo('R', null); g.audio.setDuck({ amb: 1 });
    if (I.caught) { await caught(ph, 'doors'); return 'caught'; }
    if (i === 1) { S.call(); }
  }
  // ---- it leaves
  await g.wait(1.6);
  await walk([[-0.4, -1.8], [-0.7, -0.2], [0.6, 0.3], [2.3, 1.2], [2.3, 4.9], [-0.3, 4.6], [-0.3, 6.8]], 0.95);
  S.vanish(); S.callT = 12; S.body.walking = false; D.front.slam && D.front.slam();
  I.over = true;
  // power returns
  lamps.forEach((l, i) => { if (l.interact) l.interact.enabled = true; });
  Object.values(G.switches).concat(Object.values(U.switches)).forEach((sw) => { if (sw.interact) sw.interact.enabled = true; });
  ph.powerOut = false; w.baseFear = 0.15; g.audio.music.setDread(0.18);
  ph.leaveIt.enabled = () => ph.wardrobe.hidden;
  g.ui.hint('interact', 'Step out of the wardrobe', 6);
  g.emit('hide', false);
  return 'survived';
}

async function caught(ph, how) {
  const w = ph.w, g = ph.g, P = g.player, S = w.searcher, W = ph.wardrobe; const y = 2.85;
  if (how === 'doors') {
    // it opens the wardrobe: light floods in; a long gloved hand and a hood with nothing in it
    S.state = 'script'; W.target = 1; g.audio.sfx('door_open', { pos: V(0.6, y + 1, -3), vol: 1.1, creaky: true });
    g.audio.music.sting('high', 1); P.addShake(0.8);
    await g.wait(0.9);
  }
  await ph.wakeByFire(how);
}
