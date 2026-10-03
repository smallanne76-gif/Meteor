// multi-shot: node multi.mjs <outprefix> <json array of {name, script, frames}>
import { chromium } from 'playwright-core';
const [prefix, spec, W = '1280', H = '720'] = process.argv.slice(2);
const shots = JSON.parse(spec);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--autoplay-policy=no-user-gesture-required'] });
const p = await b.newPage({ viewport: { width: +W, height: +H } });
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text().slice(0, 500)); });
p.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 800)));
await p.addInitScript(() => { addEventListener('unhandledrejection', (e) => console.error('UNHANDLED', (e.reason && e.reason.stack) || e.reason)); });
await p.goto('http://localhost:8080/index.html?debug&manual&preset=' + (process.env.PRESET || 'MEDIUM') + (process.env.TEST ? '&test=' + process.env.TEST : '') + (process.env.EXTRA || ''));
await p.waitForFunction(() => window.__ready, null, { timeout: 240000 });
for (const s of shots) {
  const r = await p.evaluate(`(async()=>{ const game = window.__game; ${s.script || ''} })()`);
  if (r !== undefined) console.log(s.name, 'result:', JSON.stringify(r));
  await p.evaluate(async (n) => { const g = window.__game; await g.advance((n - 1) / 30, 1 / 30, false); g.tick(1 / 30, true); await new Promise((r) => setTimeout(r, 30)); }, s.frames || 8);
  await p.screenshot({ path: `${prefix}_${s.name}.png`, timeout: 120000 });
  console.log('saved', s.name);
}
await b.close();
