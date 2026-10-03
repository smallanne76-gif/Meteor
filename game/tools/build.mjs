// Production build: bundle the ES modules with esbuild (code-split so each late chapter loads on demand),
// copy the generated assets and the stylesheet, and write a dist/index.html without the dev importmap.
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dist = path.join(root, 'dist');
await fs.promises.rm(dist, { recursive: true, force: true });
await fs.promises.mkdir(dist, { recursive: true });

await build({
  entryPoints: [path.join(root, 'src/main.js')], bundle: true, splitting: true, format: 'esm', outdir: dist, minify: true, target: 'es2022',
  legalComments: 'none', sourcemap: false, logLevel: 'info', entryNames: 'main', chunkNames: 'chunk-[hash]',
});

// stylesheet: the font URLs point at ../../assets from src/ui; in dist the assets sit next to index.html
const css = (await fs.promises.readFile(path.join(root, 'src/ui/ui.css'), 'utf8')).replaceAll('../../assets/', './assets/');
await fs.promises.writeFile(path.join(dist, 'ui.css'), css);

let html = await fs.promises.readFile(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '').replace('./src/ui/ui.css', './ui.css').replace('./src/main.js', './main.js');
await fs.promises.writeFile(path.join(dist, 'index.html'), html);

await fs.promises.cp(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });
const size = (await fs.promises.readdir(dist)).map((f) => [f, fs.statSync(path.join(dist, f)).size]).filter(([, s]) => s > 0 && !fs.statSync(path.join(dist, 'assets')).isFile());
console.log('built', size.filter(([f]) => f !== 'assets').map(([f, s]) => `${f} ${(s / 1024).toFixed(0)}k`).join(', '));
