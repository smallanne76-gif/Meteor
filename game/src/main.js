// Entry point.
import { Game } from './core/engine.js';
import { UI } from './ui/ui.js';
import { Journal } from './story/journal.js';
import { AudioEngine } from './audio/engine.js';
import { Flow } from './flow.js';

const canvas = document.getElementById('game');

const game = new Game(canvas);
game.journal = new Journal();
game.ui = new UI(game);
game.audio = new AudioEngine(game);
const unlock = () => { game.audio.resume(); };
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
window.__game = game;

await game.init();
const q = new URLSearchParams(location.search);
if (q.get('test') === 'lodge') { const { TestLodge } = await import('./levels/test_lodge.js'); await game.loadChapter(new TestLodge()); }
else if (q.get('test') === 'halden') { const { Halden } = await import('./levels/halden.js'); await game.loadChapter(new Halden(q.get('phase') || 'prologue', { skipIntro: q.has('skipintro'), season: q.get('season') || 'winter' })); }
else if (q.get('test') === 'icehouse') { const { IceHouse } = await import('./levels/icehouse.js'); await game.loadChapter(new IceHouse()); }
else if (q.get('test') === 'loop') { const { Loop } = await import('./levels/loop.js'); await game.loadChapter(new Loop()); }
else if (q.get('test') === 'char') { const { TestChar } = await import('./levels/test_char.js'); await game.loadChapter(new TestChar()); }
else { game.gfx.fx.fade = 1; }
const flow = new Flow(game);
if (!q.get('test')) { game.mode = 'locked'; if (!/[?&]manual/.test(location.search)) game.start(); window.__ready = true; await flow.boot(); }
else { game.mode = 'free'; game.gfx.fx.fade = 0; }
if (q.get('test')) { if (!/[?&]manual/.test(location.search)) game.start(); window.__ready = true; }
