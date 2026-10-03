// HTML UI layer: menus, settings, prompts, subtitles, notes reader, journal, chapter cards, credits.
import { settings, PRESETS } from '../core/settings.js';
import { clamp } from '../core/util.js';
import { NOTES } from '../story/notes.js';
import { installEndUI } from './endUI.js';

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const KEYNAME = { interact: 'E', flashlight: 'F', still: 'SPACE', run: 'SHIFT', crouch: 'C', journal: 'TAB', recorder: 'Q' };

const TIPS = [
  'The porch light was always on.', 'It isn’t breaking. It’s stretching.', 'Call me back. No rush.', 'Everything’s singing if you wait.',
  'Light is how you find your way home.',
];

export class UI {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById('ui');
    this.subsQueue = []; this.activeSubs = [];
    this.readerOpen = false; this.journalOpen = false; this.settingsOpen = false;
    this.promptKey = ''; this.build();
    settings.on('change', () => this.applySettings());
    this.applySettings();
    this.closeReaderCb = null;
  }

  build() {
    const r = this.root;
    r.innerHTML = '';
    this.hud = el('div', 'hud');
    this.hud.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    this.reticle = el('div'); this.reticle.id = 'reticle';
    this.promptEl = el('div'); this.promptEl.id = 'prompt';
    this.promptEl.innerHTML = '<span class="key">E</span><span class="lbl"></span><span class="ring"></span>';
    this.subsEl = el('div'); this.subsEl.id = 'subs';
    this.hintEl = el('div'); this.hintEl.id = 'hint';
    this.clickLook = el('div'); this.clickLook.id = 'clicklook'; this.clickLook.textContent = 'Click to look around';
    this.toastEl = el('div'); this.toastEl.id = 'toast';
    this.objEl = el('div'); this.objEl.id = 'objective';
    this.cardEl = el('div'); this.cardEl.id = 'chapterCard';
    this.fpsEl = el('div'); this.fpsEl.id = 'fps';
    this.bars = el('div'); this.bars.id = 'bars'; this.bars.innerHTML = '<div class="bar top"></div><div class="bar bot"></div>';
    this.hud.append(this.reticle, this.promptEl, this.subsEl, this.hintEl, this.clickLook, this.toastEl, this.objEl, this.cardEl, this.bars, this.fpsEl);
    r.appendChild(this.hud);

    this.loading = el('div', 'layer'); this.loading.id = 'loading';
    this.loading.innerHTML = '<div class="t">Loading</div><div class="b"><i></i></div><div class="tip"></div>';
    this.layers = {};
    r.appendChild(this.loading);
    this.loadBar = this.loading.querySelector('i'); this.loadT = this.loading.querySelector('.t'); this.loadTip = this.loading.querySelector('.tip');

    this._buildWarning(); this._buildTitle(); this._buildPause(); this._buildSettings(); this._buildReader(); this._buildJournal();
  }

  applySettings() {
    document.documentElement.style.setProperty('--sub-scale', settings.get('subtitleSize'));
    this.fpsEl.style.display = settings.get('showFps') ? 'block' : 'none';
  }

  // ---- loading ---------------------------------------------------------------------------------------------------
  showLoading(on, title = '') {
    if (on) { this.loading.classList.remove('hidden'); this.loading.style.opacity = 1; this.loadT.textContent = title ? title : 'Loading'; this.loadTip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; }
    else { this.loading.style.opacity = 0; setTimeout(() => this.loading.classList.add('hidden'), 800); }
  }
  setProgress(p) { this.loadBar.style.width = `${Math.round(p * 100)}%`; }

  // ---- content warning -------------------------------------------------------------------------------------------
  _buildWarning() {
    const w = el('div', 'layer hidden'); w.id = 'warning';
    w.innerHTML = `<h2>Before you begin</h2>
      <p>This is a story about grief, loss and a death by drowning. It contains frightening imagery, a pursuing figure, sudden loud sounds and flashing light.</p>
      <p>It is meant to be played alone, at night, with headphones.<br><span style="color:#8d887c;font-size:18px">Take your time. Nothing here is in a hurry.</span></p>
      <button class="btn go">Continue</button>`;
    this.layers.warning = w; this.root.appendChild(w);
    w.querySelector('.go').onclick = () => { settings.set('contentWarningSeen', true); this.hideLayer('warning'); this.onWarningDone && this.onWarningDone(); };
  }
  showWarning() { return new Promise((res) => { this.onWarningDone = res; this.showLayer('warning'); }); }

  // ---- title -----------------------------------------------------------------------------------------------------
  _buildTitle() {
    const t = el('div', 'layer hidden'); t.id = 'title';
    t.innerHTML = `<h1>Leave the<br><span>Light</span> On</h1><p class="tag">A story about a missed call.</p>
      <div class="menu"><button class="btn" data-a="continue">Continue</button><button class="btn" data-a="new">New Game</button>
      <button class="btn" data-a="settings">Settings</button><button class="btn small" data-a="credits">Credits</button></div><div id="ver">v1.0 · headphones recommended</div>`;
    this.layers.title = t; this.root.appendChild(t);
    t.querySelectorAll('.btn').forEach((b) => b.onclick = () => this.onTitle && this.onTitle(b.dataset.a));
  }
  showTitle(hasSave) {
    this.showLayer('title');
    const c = this.layers.title.querySelector('[data-a=continue]'); c.classList.toggle('dis', !hasSave);
    this.hud.style.display = 'none';
    setTimeout(() => (hasSave ? c : this.layers.title.querySelector('[data-a=new]')).focus(), 50);
  }
  hideTitle() { this.hideLayer('title'); this.hud.style.display = ''; }

  // ---- pause -----------------------------------------------------------------------------------------------------
  _buildPause() {
    const p = el('div', 'layer hidden'); p.id = 'pause';
    p.innerHTML = `<div class="panel"><h2>Paused</h2><button class="btn" data-a="resume">Resume</button><button class="btn" data-a="journal">Journal</button>
      <button class="btn" data-a="settings">Settings</button><button class="btn" data-a="title">Quit to title</button></div>`;
    this.layers.pause = p; this.root.appendChild(p);
    p.querySelectorAll('.btn').forEach((b) => b.onclick = () => {
      const a = b.dataset.a;
      if (a === 'resume') this.game.pause(false);
      else if (a === 'settings') this.showSettings(true, 'pause');
      else if (a === 'journal') { this.hideLayer('pause'); this.showJournal(true, true); }
      else if (a === 'title') { this.game.pause(false); this.game.emit('quitToTitle'); }
    });
  }
  showPause(on) {
    if (on) { this.showLayer('pause'); this.hud.style.opacity = 0.0; setTimeout(() => this.layers.pause.querySelector('.btn').focus(), 30); }
    else { this.hideLayer('pause'); this.hideLayer('settings'); this.settingsOpen = false; this.hud.style.opacity = 1; }
  }

  // ---- settings --------------------------------------------------------------------------------------------------
  _buildSettings() {
    const s = el('div', 'layer hidden'); s.id = 'settings';
    s.innerHTML = `<div class="panel"><h2>Settings</h2><div class="tabs"></div><div class="rows"></div><div class="foot"><button class="btn small" data-a="reset">Reset</button><button class="btn small" data-a="back">Back</button></div></div>`;
    this.layers.settings = s; this.root.appendChild(s);
    this.tabsEl = s.querySelector('.tabs'); this.rowsEl = s.querySelector('.rows');
    s.querySelector('[data-a=back]').onclick = () => this.showSettings(false);
    s.querySelector('[data-a=reset]').onclick = () => { settings.reset(); this.renderTab(this.tab); };
    this.tab = 'Graphics';
    ['Graphics', 'Audio', 'Controls', 'Accessibility'].forEach((t) => { const b = el('button', '', t); b.onclick = () => { this.tab = t; this.renderTab(t); }; this.tabsEl.appendChild(b); });
  }
  showSettings(on, from) {
    if (on) { this.settingsFrom = from || 'title'; this.showLayer('settings'); this.settingsOpen = true; if (from === 'pause') this.hideLayer('pause'); this.renderTab(this.tab); }
    else { this.hideLayer('settings'); this.settingsOpen = false; if (this.settingsFrom === 'pause') this.showLayer('pause'); }
  }
  renderTab(t) {
    [...this.tabsEl.children].forEach((b) => b.classList.toggle('on', b.textContent === t));
    const rows = this.rowsEl; rows.innerHTML = '';
    const slider = (label, key, min, max, step, fmt = (v) => v.toFixed(2), hint) => {
      const r = el('div', 'row', `<label>${label}${hint ? `<span class="hintx">${hint}</span>` : ''}</label>`);
      const wrap = el('div'); wrap.style.cssText = 'display:flex;align-items:center;gap:12px';
      const inp = el('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step; inp.value = settings.get(key);
      const val = el('span', 'val', fmt(+inp.value));
      inp.oninput = () => { settings.set(key, +inp.value); val.textContent = fmt(+inp.value); };
      wrap.append(inp, val); r.appendChild(wrap); rows.appendChild(r);
    };
    const toggle = (label, key, hint) => {
      const r = el('div', 'row', `<label>${label}${hint ? `<span class="hintx">${hint}</span>` : ''}</label>`);
      const sw = el('div', 'sw' + (settings.get(key) ? ' on' : '')); sw.tabIndex = 0; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', String(!!settings.get(key))); sw.setAttribute('aria-label', label);
      const flip = () => { settings.set(key, !settings.get(key)); sw.classList.toggle('on', !!settings.get(key)); sw.setAttribute('aria-checked', String(!!settings.get(key))); };
      sw.onclick = flip; sw.onkeydown = (e) => { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); flip(); } };
      r.appendChild(sw); rows.appendChild(r);
    };
    const select = (label, key, opts, hint) => {
      const r = el('div', 'row', `<label>${label}${hint ? `<span class="hintx">${hint}</span>` : ''}</label>`);
      const sel = el('select'); opts.forEach((o) => { const op = el('option', '', o); op.value = o; if (settings.get(key) === o) op.selected = true; sel.appendChild(op); });
      sel.onchange = () => settings.set(key, sel.value); r.appendChild(sel); rows.appendChild(r);
    };
    if (t === 'Graphics') {
      select('Quality preset', 'preset', Object.keys(PRESETS), 'ULTRA is the intended look. CINEMATIC is a showcase mode and needs a strong GPU.');
      slider('Resolution scale', 'resolutionScale', 0.5, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`);
      slider('Field of view', 'fov', 55, 100, 1, (v) => `${v}°`);
      slider('Brightness', 'brightness', 0.6, 1.6, 0.02, (v) => v.toFixed(2), 'Raise it if the dark is too dark. The game is meant to be dim, not black.');
      toggle('Compatibility renderer', 'compatRenderer', 'If the picture flashes, flickers or looks wrong, turn this on (or press F9 at any time). Simpler look, works on more GPUs.');
      toggle('Fullscreen', 'fullscreen', 'Also switches right now. F11 works too.');
      toggle('Motion blur', 'motionBlur', 'Only applied on ULTRA / CINEMATIC.');
      toggle('Show FPS', 'showFps');
    } else if (t === 'Audio') {
      slider('Master', 'volMaster', 0, 1, 0.02, (v) => `${Math.round(v * 100)}`);
      slider('Music', 'volMusic', 0, 1, 0.02, (v) => `${Math.round(v * 100)}`);
      slider('Effects', 'volSfx', 0, 1, 0.02, (v) => `${Math.round(v * 100)}`);
      slider('Ambience', 'volAmbience', 0, 1, 0.02, (v) => `${Math.round(v * 100)}`);
      slider('Voices & calls', 'volVoice', 0, 1, 0.02, (v) => `${Math.round(v * 100)}`);
      toggle('Voice murmur', 'voiceMurmur', 'Soft synthesised murmur under spoken captions.');
    } else if (t === 'Controls') {
      slider('Mouse sensitivity', 'mouseSens', 0.2, 3, 0.05, (v) => v.toFixed(2));
      toggle('Invert Y axis', 'invertY'); toggle('Crouch is a toggle', 'crouchToggle');
      const k = el('div', 'keys');
      [['Move', 'W A S D'], ['Look', 'Mouse'], ['Interact / use', 'E · Click'], ['Flashlight', 'F'], ['Run', 'Shift'], ['Crouch', 'C'], ['Be still — hold breath / close eyes', 'Space'], ['Field recorder', 'Q'], ['Journal', 'Tab'], ['Pause', 'Esc']]
        .forEach(([a, b]) => k.appendChild(el('div', '', `<span>${a}</span><kbd>${b}</kbd>`)));
      rows.appendChild(k);
    } else {
      toggle('Subtitles', 'subtitles', 'When off, only story-critical captions are shown.');
      slider('Subtitle size', 'subtitleSize', 0.8, 1.7, 0.05, (v) => `${Math.round(v * 100)}%`);
      toggle('Subtitle background', 'subtitleBackground'); toggle('Speaker names', 'speakerNames');
      toggle('Camera shake', 'cameraShake'); toggle('Head bob', 'headBob');
      toggle('Be still (Space) is a toggle', 'holdBreathToggle', 'Press Space once to hold your breath / close your eyes, again to stop — no need to hold the key.');
      toggle('Reduce flashing & sudden effects', 'reduceFlash', 'Replaces strobing lights and white flashes with slow, gentle dips. Camera shake has its own switch.');
    }
  }

  // ---- layers ----------------------------------------------------------------------------------------------------
  showLayer(n) { this.layers[n].classList.remove('hidden'); }
  hideLayer(n) { this.layers[n].classList.add('hidden'); }

  // ---- HUD -------------------------------------------------------------------------------------------------------
  setPrompt(label, icon, progress = 0) {
    const p = this.promptEl;
    if (!label) { if (this.promptKey !== '') { p.classList.remove('show', 'holding'); this.promptKey = ''; this.reticle.classList.remove('target'); } return; }
    if (this.promptKey !== label) { p.querySelector('.lbl').textContent = label; this.promptKey = label; }
    p.classList.add('show'); this.reticle.classList.add('target');
    p.classList.toggle('holding', progress > 0.001); p.style.setProperty('--p', progress);
    p.querySelector('.ring').style.setProperty('--p', progress);
  }
  setReticle(on) { this.reticle.classList.toggle('show', on); }

  /** show a caption; resolves when it has finished. opts: { speaker, style, dur, crit } */
  say(text, opts = {}) {
    const g = this.game;
    if (!settings.get('subtitles') && !opts.crit) return Promise.resolve();
    const d = el('div', 'sub ' + (opts.style || '') + (settings.get('subtitleBackground') ? ' bg' : ''));
    d.innerHTML = (opts.speaker && settings.get('speakerNames') ? `<span class="who">${opts.speaker}</span>` : '') + text;
    this.subsEl.appendChild(d);
    requestAnimationFrame(() => d.classList.add('show'));
    const dur = opts.dur ?? Math.max(2.4, 1.3 + text.replace(/<[^>]+>/g, '').length * 0.058);
    return new Promise((res) => {
      g.timers.wait(dur).then(() => { d.classList.remove('show'); setTimeout(() => d.remove(), 500); g.timers.wait(0.25).then(res); });
    });
  }
  /** sequential lines: [{ t, speaker, style, dur, gap }] */
  async sayAll(lines) { for (const l of lines) { await this.say(l.t, l); if (l.gap) await this.game.wait(l.gap); } }
  clearSubs() { this.subsEl.innerHTML = ''; }

  hint(keyAction, text, dur = 5) {
    const k = KEYNAME[keyAction] || keyAction;
    this.hintEl.innerHTML = `<span class="key">${k}</span><span>${text}</span>`;
    this.hintEl.classList.add('show');
    clearTimeout(this._ht); const g = this.game;
    this._hintTok = (this._hintTok || 0) + 1; const tok = this._hintTok;
    g.timers.wait(dur).then(() => { if (this._hintTok === tok) this.hintEl.classList.remove('show'); });
  }
  hideHint() { this.hintEl.classList.remove('show'); }
  toast(text, dur = 3.2) {
    this.toastEl.textContent = text; this.toastEl.classList.add('show');
    this._toastTok = (this._toastTok || 0) + 1; const tok = this._toastTok;
    this.game.timers.wait(dur).then(() => { if (this._toastTok === tok) this.toastEl.classList.remove('show'); });
  }
  objective(text, quiet = false) {
    this.game.journal.objective = text; this.objEl.textContent = text;
    if (!text) { this.objEl.classList.remove('show'); return; }
    if (!quiet) { this.objEl.classList.add('show'); this._objTok = (this._objTok || 0) + 1; const tok = this._objTok; this.game.timers.wait(8).then(() => { if (this._objTok === tok) this.objEl.classList.remove('show'); }); }
  }
  async chapterCard(num, title, sub = '', dur = 5) {
    this.cardEl.innerHTML = `<div class="num">${num}</div><div class="ttl">${title}</div>${sub ? `<div class="sub2">${sub}</div>` : ''}`;
    this.cardEl.classList.add('show');
    await this.game.wait(dur);
    this.cardEl.classList.remove('show');
    await this.game.wait(1.6);
  }
  cinema(on) { this.bars.classList.toggle('on', on); }
  setReticleVisible(v) { this.reticle.style.display = v ? '' : 'none'; }

  // ---- reader ---------------------------------------------------------------------------------------------------
  _buildReader() {
    const r = el('div', 'layer hidden'); r.id = 'reader'; this.layers.reader = r; this.root.appendChild(r);
    r.onclick = () => this.closeReader();
  }
  /** open a note/photo by id (adds to journal) */
  read(id, opts = {}) {
    const n = NOTES[id]; if (!n) { console.warn('missing note', id); return Promise.resolve(); }
    const g = this.game; const first = g.journal.add(id);
    if (first && !opts.silent) this.toast('Added to journal');
    if (n.kind === 'recording' && !opts.force) return Promise.resolve();
    this.layers.reader.innerHTML = ''; this.renderNote(this.layers.reader, n, true);
    const hint = el('div', 'reader-hint', 'E · close'); this.layers.reader.appendChild(hint);
    this.showLayer('reader'); this.readerOpen = true; this._rOpen = g.time;
    this.prevModeReader = g.mode; g.mode = 'locked'; g.input.unlock && 0;
    g.audio && g.audio.sfx(n.kind === 'photo' ? 'photo' : 'paper', { vol: 0.8 });
    if (n.audio && g.audio) g.audio.playNoteAudio && g.audio.playNoteAudio(n.audio);
    g.emit('noteOpen', id);
    return new Promise((res) => { this.closeReaderCb = res; });
  }
  closeReader() {
    if (!this.readerOpen) return;
    this.hideLayer('reader'); this.readerOpen = false;
    const g = this.game; g.mode = this.prevModeReader === 'locked' ? 'free' : (this.prevModeReader || 'free');
    g.audio && g.audio.sfx('paper', { vol: 0.5 });
    const cb = this.closeReaderCb; this.closeReaderCb = null; cb && cb();
    g.emit('noteClose');
  }
  /** render a note definition into a container */
  renderNote(host, n, big) {
    if (n.kind === 'photo' || n.kind === 'drawing') {
      const ph = el('div', n.kind === 'photo' ? 'photo' : 'paper hand');
      const cv = el('canvas'); cv.width = n.w || 1024; cv.height = n.h || 768;
      if (n.kind === 'drawing') { ph.style.setProperty('--rot', (n.rot ?? 0.5) + 'deg'); ph.style.padding = '30px'; }
      ph.appendChild(cv);
      if (n.render) n.render(cv.getContext('2d'), cv.width, cv.height, this.game);
      if (n.caption) ph.appendChild(el('div', n.kind === 'photo' ? 'cap' : 'sig', n.caption));
      host.appendChild(ph); return;
    }
    const p = el('div', `paper ${n.style || 'hand'}`); p.style.setProperty('--rot', (n.rot ?? -0.8) + 'deg');
    let html = n.title ? `<h3>${n.title}</h3>` : '';
    html += n.html || '';
    p.innerHTML = html;
    if (n.render) { const cv = el('canvas'); cv.width = n.w || 900; cv.height = n.h || 500; p.appendChild(cv); n.render(cv.getContext('2d'), cv.width, cv.height, this.game); }
    if (n.stain) p.appendChild(el('div', 'stain'));
    host.appendChild(p);
  }

  // ---- journal --------------------------------------------------------------------------------------------------
  _buildJournal() {
    const j = el('div', 'layer hidden'); j.id = 'journal'; this.layers.journal = j; this.root.appendChild(j);
    j.innerHTML = `<div class="panel book"><div class="side"></div><div class="page"></div></div>`;
    this.jSide = j.querySelector('.side'); this.jPage = j.querySelector('.page');
    j.addEventListener('mousedown', (e) => { if (e.target === j) this.showJournal(false); });
  }
  toggleJournal() { this.showJournal(!this.journalOpen); }
  showJournal(on, fromPause) {
    const g = this.game;
    if (on) {
      if (this.readerOpen) return;
      this.journalOpen = true; this.journalFromPause = !!fromPause; this._jOpen = g.time;
      if (!fromPause) { this.prevModeJ = g.mode; g.mode = 'locked'; g.input.unlock(); }
      this.hud.style.opacity = 0; this.showLayer('journal'); this.renderJournal();
    } else {
      this.journalOpen = false; this.hideLayer('journal');
      if (this.journalFromPause) { this.showLayer('pause'); }
      else { g.mode = this.prevModeJ === 'locked' ? 'free' : (this.prevModeJ || 'free'); this.hud.style.opacity = 1; g.requestLock(); }
    }
  }
  renderJournal(selId) {
    const g = this.game; const items = g.journal.items.filter((id) => NOTES[id]);
    this.jSide.innerHTML = '';
    const obj = el('div', 'obj', g.journal.objective ? g.journal.objective : 'Find Jo.'); this.jSide.appendChild(obj);
    const cats = { Documents: [], Photographs: [], Recordings: [] };
    for (const id of items) { const n = NOTES[id]; const c = n.kind === 'photo' ? 'Photographs' : (n.kind === 'recording' ? 'Recordings' : 'Documents'); cats[c].push(id); }
    let first = selId;
    for (const [c, ids] of Object.entries(cats)) {
      if (!ids.length) continue; this.jSide.appendChild(el('h4', '', c));
      for (const id of ids) {
        const it = el('div', 'it', NOTES[id].list || NOTES[id].title || id); it.dataset.id = id;
        it.onclick = () => this.renderJournal(id); if (id === selId) it.classList.add('on'); this.jSide.appendChild(it); if (!first) first = id;
      }
    }
    this.jPage.innerHTML = '';
    if (!first) { this.jPage.appendChild(el('div', 'empty', 'Nothing yet.')); return; }
    if (!selId) { const it = this.jSide.querySelector(`[data-id="${first}"]`); it && it.classList.add('on'); }
    const n = NOTES[first];
    const box = el('div'); box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px';
    this.renderNote(box, n, false);
    if (n.kind === 'recording') {
      const t = el('div', 'paper type'); t.innerHTML = `<h3>${n.title}</h3>${n.html || ''}`; box.appendChild(t);
      if (n.audio) { const p = el('div', 'play', 'Play'); p.onclick = () => g.audio && g.audio.playNoteAudio && g.audio.playNoteAudio(n.audio); box.appendChild(p); }
    }
    this.jPage.appendChild(box);
  }

  // ---- misc -----------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.game;
    if (this.readerOpen && g.time - this._rOpen > 0.35 && (g.input.wasPressed('interact') || g.input.wasPressed('pause') || g.input.wasPressed('journal'))) this.closeReader();
    else if (this.journalOpen && g.time - this._jOpen > 0.35 && (g.input.wasPressed('journal') || g.input.wasPressed('pause'))) { this.showJournal(false); }
    if (settings.get('showFps')) this.fpsEl.textContent = `${g.fps.toFixed(0)} fps · ${g.gfx.info.render.calls} calls · ${(g.gfx.info.render.triangles / 1000).toFixed(0)}k tris`;
    this.setReticle(g.mode === 'free' && !this.readerOpen && !this.reticleOff);
    // the mouse isn't captured (the browser refused, or the window lost focus): say how to get it back
    const needClick = !g.debug && !g.input.locked && (g.mode === 'free' || g.mode === 'hide') && !this.readerOpen && !this.journalOpen;
    if (needClick !== this._needClick) { this._needClick = needClick; this.clickLook.classList.toggle('show', needClick); }
  }
}

installEndUI(UI);
