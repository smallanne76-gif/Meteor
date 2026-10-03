// Entry point.
import { Game } from './core/engine.js';
import { Prologue } from './levels/prologue.js';
import { UI } from './ui/ui.js';
import { Journal } from './story/journal.js';
import { AudioEngine } from './audio/engine.js';

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
else if (q.get('test') === 'halden') { const { Halden } = await import('./levels/halden.js'); await game.loadChapter(new Halden(q.get('phase') || 'prologue', { skipIntro: q.has('skipintro') })); }
else if (q.get('test') === 'char') { const { TestChar } = await import('./levels/test_char.js'); await game.loadChapter(new TestChar()); }
else await game.loadChapter(new Prologue());
game.mode = 'free';
game.gfx.fx.fade = 0;
if (!/[?&]manual/.test(location.search)) game.start();
window.__ready = true;
