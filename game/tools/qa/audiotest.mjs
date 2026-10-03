// Renders audio recipes offline in headless Chromium and reports peak / RMS / spectral centroid / silence.
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage();
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.text().slice(0, 300)); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 500)));
await p.goto('http://localhost:8080/tools/qa/blank.html');
const res = await p.evaluate(async () => {
  const THREE = await import('three');
  const { Emitter } = await import('/src/core/util.js');
  const { AudioEngine } = await import('/src/audio/engine.js');
  const SR = 44100;
  const mkGame = () => { const g = new Emitter(); g.collision = { los: () => true }; g.player = { holdingBreath: false, eyesClosed: false, fear: 0 }; g.camera = new THREE.PerspectiveCamera(); g.indoor = 0; return g; };
  const analyze = (buf) => {
    const L = buf.getChannelData(0), Rr = buf.getChannelData(1); let peak = 0, sum = 0, nan = 0, nz = 0;
    for (let i = 0; i < L.length; i++) { const v = Math.max(Math.abs(L[i]), Math.abs(Rr[i])); if (!(v === v)) nan++; if (v > peak) peak = v; sum += L[i] * L[i] + Rr[i] * Rr[i]; if (v > 0.0005) nz++; }
    // spectral centroid over the loudest 8192 window
    let bestI = 0, bestE = 0; for (let i = 0; i + 8192 < L.length; i += 4096) { let e = 0; for (let k = 0; k < 8192; k += 8) e += L[i + k] * L[i + k]; if (e > bestE) { bestE = e; bestI = i; } }
    const N = 2048; let num = 0, den = 0;
    for (let k = 1; k < N / 2; k += 2) { let re = 0, im = 0; for (let n = 0; n < N; n++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * n / N); const x = L[bestI + n] * w; const a = 2 * Math.PI * k * n / N; re += x * Math.cos(a); im -= x * Math.sin(a); } const mag = Math.hypot(re, im); num += mag * k * SR / N; den += mag; }
    return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / (2 * L.length)).toFixed(4), nan, active: +(nz / L.length).toFixed(3), centroid: Math.round(den > 0 ? num / den : 0) };
  };
  const run = async (name, secs, fn) => {
    const ctx = new OfflineAudioContext(2, Math.floor(SR * secs), SR);
    const g = mkGame(); const eng = new AudioEngine(g, ctx);
    try { fn(eng, g); } catch (e) { return { name, error: String(e.stack || e).slice(0, 300) }; }
    const buf = await ctx.startRendering(); return { name, ...analyze(buf) };
  };
  const out = [];
  const surf = ['snow', 'road', 'wood', 'concrete', 'gravel', 'ice', 'grass', 'water', 'carpet', 'tile', 'dock'];
  out.push(await run('steps-all', 8, (e) => surf.forEach((s, i) => e.kit.step(e.buses.sfx, s, { t: 0.1 + i * 0.6, loud: 0.6 }))));
  for (const s of ['snow', 'wood', 'concrete', 'ice']) out.push(await run('step-' + s, 1.2, (e) => e.kit.step(e.buses.sfx, s, { t: 0.05, loud: 0.6 })));
  const sf = (name, secs, o = {}) => run('sfx-' + name, secs, (e) => e.sfx(name, o));
  for (const [n, s] of [['door_open', 3], ['door_close', 2], ['door_slam', 2], ['drawer', 2], ['keys', 1.5], ['unlock', 1.5], ['knock', 2], ['glass', 2], ['paper', 1.5], ['ice_pew', 3], ['ice_crack', 3], ['ice_boom', 5], ['owl', 8], ['loon', 4], ['cricket', 1], ['frog', 1.5], ['bird', 2], ['phone_ring', 8], ['dialtone', 4], ['static', 2], ['gasp', 2], ['heartbeat', 1], ['splash', 3], ['wet_step', 1], ['snow_whump', 2], ['wood_crack', 2], ['creak', 2], ['lantern', 1.5], ['tape', 1]]) out.push(await sf(n, s, { vol: 1 }));
  for (const [n, sec] of [['paddle', 2], ['match', 2], ['lantern', 2], ['reel', 3], ['tape', 2], ['handset', 2], ['phone_ring', 4], ['static', 2], ['switch', 1], ['ceramic', 2], ['pickup', 1.5], ['thud', 1.5], ['hiss', 2], ['splash', 3], ['loon', 5], ['frog', 2], ['bird', 2], ['wood_crack', 2], ['ice_boom', 5]]) out.push(await sf(n, sec, { vol: 1 }));
  out.push(await run('note-search-tape', 30, (e) => e.playNoteAudio('search_tape')));
  out.push(await run('note-voicemail', 16, (e) => e.playNoteAudio('voicemail_corrupt')));
  out.push(await run('amb-loop', 8, (e) => e.amb.set('loop', { fade: 0.1 })));
  out.push(await run('amb-dawn', 8, (e) => e.amb.set('dawn', { fade: 0.1 })));
  out.push(await run('sfx-door_open@pos', 3, (e) => e.sfx('door_open', { vol: 1, pos: [3, 1.5, -2] })));
  out.push(await run('breath', 4, (e) => e.kit.breath(e.buses.sfx, { t: 0.1, fear: 0.6, exert: 0.4, gain: 1.1 })));
  out.push(await run('voice-hum', 8, (e) => e.voice.hum(e.buses.voice, { t: 0.1, notes: [[0, 1], [3, 1], [7, 2], [5, 1], [3, 1], [2, 1], [0, 3]], root: 50, tempo: 70, gain: 0.12 })));
  out.push(await run('voice-search-call', 5, (e) => e.voice.searcherCall(e.buses.voice, { t: 0.1, gain: 0.25 })));
  out.push(await run('voice-mara-call', 9, (e) => e.voice.maraCall(e.buses.voice, { t: 0.1, gain: 0.25 })));
  out.push(await run('voice-murmur', 6, (e) => e.voice.murmur(e.buses.voice, { t: 0.1, text: "Hey. You're late. Kidding. No rush.", gender: 'm', gain: 0.12 })));
  out.push(await run('music-box', 20, (e) => e.music.boxPhrase({ root: 74, tempo: 58 })));
  out.push(await run('music-piano', 20, (e) => e.music.pianoPhrase({ root: 62, tempo: 54, answer: true })));
  out.push(await run('music-title', 26, (e) => e.music.titleBox()));
  out.push(await run('music-memory', 30, (e) => e.music.memory()));
  out.push(await run('music-summer', 30, (e) => e.music.summer()));
  out.push(await run('music-thinice', 24, (e) => e.music.thinIce()));
  out.push(await run('music-dread', 6, (e) => { e.music.setDread(1); e.music.dread = 1; e.music.update(0.016); }));
  out.push(await run('music-final-wait', 25, (e) => e.music.finalWait()));
  out.push(await run('music-final-answer', 60, (e) => e.music.finalAnswer()));
  out.push(await run('music-credits', 60, (e) => e.music.credits()));
  out.push(await run('amb-winterNight', 8, (e) => e.amb.set('winterNight', { fade: 0.1 })));
  out.push(await run('amb-house', 8, (e) => e.amb.set('house', { fade: 0.1 })));
  out.push(await run('amb-cellar', 8, (e) => e.amb.set('cellar', { fade: 0.1 })));
  out.push(await run('amb-lake', 8, (e) => e.amb.set('lakeNight', { fade: 0.1 })));
  out.push(await run('amb-summer', 8, (e) => e.amb.set('summer', { fade: 0.1 })));
  out.push(await run('amb-iceSong', 6, (e) => e.amb.iceSong(new THREE.Vector3(10, 1, -20), 1)));
  return out;
});
let bad = 0;
for (const r of res) {
  const flag = r.error ? 'ERROR' : (r.nan ? 'NAN' : (r.peak > 0.98 ? 'CLIP?' : (r.rms < 0.0003 ? 'SILENT' : 'ok')));
  if (flag !== 'ok') bad++;
  console.log(flag.padEnd(7), r.name.padEnd(22), r.error ? r.error : `peak ${r.peak}  rms ${r.rms}  centroid ${r.centroid}Hz  active ${r.active}`);
}
console.log(bad ? `\n${bad} problem(s)` : '\nall recipes produced healthy audio');
await b.close();
