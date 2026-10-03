// Game flow: boot → content warning → title → new game / continue → chapters; quit to title; chapter router.
import { Save } from './core/save.js';
import { settings } from './core/settings.js';

const HALDEN_PHASES = ['title', 'prologue', 'lodge', 'search', 'summer', 'lake', 'final'];
const OTHER = { icehouse: () => import('./levels/icehouse.js').then((m) => new m.IceHouse()), loop: () => import('./levels/loop.js').then((m) => new m.Loop()) };

export class Flow {
  constructor(game) {
    this.g = game; this.busy = false;
    game.goto = (name, opts) => this.goto(name, opts);
    game.flow = this;
    game.on('quitToTitle', () => this.showTitle());
    game.ui.onTitle = (a) => this.onTitle(a);
  }

  async boot() {
    const g = this.g, ui = g.ui;
    if (!settings.get('contentWarningSeen') && !/[?&]skipwarn/.test(location.search)) await ui.showWarning();
    await this.showTitle(true);
  }

  resetPlayer() {
    const g = this.g, P = g.player;
    P.frozen = false; P.lookLimit = null; P.noResolve = false; P.fovScale = 1; P.eyeOverride = null; P.walkMul = 1; P.canRun = true; P.noclip = false; P.lookMul = 1; P.holdingBreath = false;
    P.setFear && P.setFear(0); g.hands.setVisible(true); g.hands.hold('L', null); g.hands.holdFlashlight(); g.lights.flashOn = false; g.allowEyesClosed = false;
    g.director.active && g.director.release(); g.ui.cinema(false); g.ui.objective('', true); g.ui.clearSubs(); g.ui.hideHint();
    const fx = g.gfx.fx; fx.eyes = 0; fx.dof = 0; fx.memory = 0; fx.dread = 0; fx.cold = 0; fx.flash = 0; fx.blink = 0;
    g.audio.setDuck && g.audio.setDuck({ amb: 1, music: 1 }); g.audio.muffleTarget = 22000; g.camera.fov = settings.get('fov'); g.camera.updateProjectionMatrix();
  }

  async enter(name, opts = {}) {
    const g = this.g;
    if (HALDEN_PHASES.includes(name)) {
      const { Halden } = await import('./levels/halden.js');
      const wantSummer = name === 'summer'; if (wantSummer) opts = { ...opts, season: 'summer' };
      if (g.chapter && g.chapter.id === 'halden' && !!g.chapter.summer === wantSummer) { this.resetPlayer(); g.timers.clear(); g.chapter.setPhase(name, opts); }
      else await g.loadChapter(new Halden(name, opts));
    } else if (OTHER[name]) {
      const ch = await OTHER[name](); ch.opts = opts; await g.loadChapter(ch, opts);
    } else throw new Error('unknown chapter ' + name);
  }

  /** used by story code to move between chapters; the fade is the caller's job */
  async goto(name, opts = {}) {
    const g = this.g; g.flags.phase = name; await this.enter(name, opts); g.mode = 'free'; g.requestLock && g.requestLock();
  }

  async showTitle(first = false) {
    const g = this.g, ui = g.ui; if (this.busy) return; this.busy = true;
    try {
      ui.hideLayer && ['pause', 'settings', 'journal', 'reader'].forEach((l) => { try { ui.hideLayer(l); } catch (e) { /* ok */ } });
      ui.hud.style.opacity = 1; ui.hud.style.display = 'none';
      g.paused = false; g.input.unlock && g.input.unlock();
      await g.fadeTo(1, first ? 0.01 : 0.8, 0x000000);
      await this.enter('title'); g.mode = 'title';
      ui.showTitle(Save.has());
      g.fadeTo(0, 2.5);
    } finally { this.busy = false; }
  }

  async onTitle(a) {
    const g = this.g, ui = g.ui; if (this.busy) return;
    g.audio.resume && g.audio.resume();
    if ((a === 'new' || a === 'continue') && settings.get('fullscreen') && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => { /* refused: stay windowed */ });
    if (a === 'settings') return ui.showSettings(true, 'title');
    if (a === 'credits') { ui.hideLayer('title'); g.audio.music.credits && g.audio.music.credits(); await ui.playCredits(); g.audio.music.stopAll && g.audio.music.stopAll(3); g.audio.music.titleBox && g.audio.music.titleBox(); ui.showLayer('title'); return; }
    if (a === 'continue' && !Save.has()) return;
    this.busy = true;
    try {
      ui.hideLayer('title');
      await g.fadeTo(1, 1.4, 0x000000);
      g.audio.music.stopAll && g.audio.music.stopAll(1.5);
      ui.hud.style.display = '';
      if (a === 'new') {
        Save.clear(); g.flags = {}; g.journal.clear(); g.playTime = 0; g.lastCheckpoint = null;
        await this.enter('prologue', {});
      } else {
        const sv = Save.read(); g.flags = sv.flags || {}; g.journal.load(sv.journal); g.playTime = sv.playTime || 0;
        await this.enter(sv.phase === 'title' ? 'prologue' : (sv.phase || 'prologue'), { resumeAt: sv.checkpoint });
      }
      g.mode = 'free'; g.requestLock && g.requestLock();
    } finally { this.busy = false; }
  }
}
