// Usage: node tools/qa/shot.mjs out.png "<js to run after ready, may use game>" [frames] [width] [height]
import { chromium } from 'playwright-core';
const [out, script = '', frames = '6', W = '1280', H = '720'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +W, height: +H } });
const errors = [];
p.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || /\[game\]/.test(t)) console.log(`[${m.type()}]`, t.slice(0, 600)); });
p.on('pageerror', (e) => { console.log('[pageerror]', e.message.slice(0, 800)); errors.push(e); });
await p.goto('http://localhost:8080/index.html?debug&manual&preset=' + (process.env.PRESET || 'MEDIUM') + (process.env.TEST ? '&test=' + process.env.TEST : ''));
try { await p.waitForFunction(() => window.__ready, null, { timeout: 180000 }); } catch (e) { console.log('NOT READY'); await p.screenshot({ path: out }); await b.close(); process.exit(1); }
if (script) { const r = await p.evaluate(`(async()=>{ const game = window.__game; ${script} })()`); if (r !== undefined) console.log('result:', JSON.stringify(r)); }
const t0 = Date.now(); await p.evaluate(async (n) => { const g = window.__game; for (let i = 0; i < n - 1; i++) { g.tick(1 / 30, false); } g.tick(1 / 30, true); await new Promise((r) => setTimeout(r, 50)); }, +frames); console.log('frames ms:', Date.now() - t0);
await p.screenshot({ path: out, timeout: 120000 });
console.log('saved', out, 'errors:', errors.length);
await b.close();
