// Builds the web app into dist/ with no dependencies:
// TypeScript → JavaScript with Node's built-in type stripping, imports rewritten to .js,
// icons rendered from the SVG, and an offline cache list for the service worker.
// Usage: node scripts/build-web.ts

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as nodeModule from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const strip = (nodeModule as unknown as { stripTypeScriptTypes: (code: string, opts: { mode: string }) => string }).stripTypeScriptTypes;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

// 1. TypeScript sources used in the browser.
const sources = [...walk(join(root, 'web/src')), ...walk(join(root, 'src'))].filter((f) => f.endsWith('.ts'));
const version = createHash('sha256')
  .update(sources.map((f) => readFileSync(f, 'utf8')).join('\n') + readFileSync(join(root, 'web/styles.css'), 'utf8') + readFileSync(join(root, 'web/index.html'), 'utf8'))
  .digest('hex')
  .slice(0, 10);
const files: string[] = [];
for (const f of sources) {
  let code = readFileSync(f, 'utf8');
  if (f.endsWith('web/src/version.ts')) code = `export const APP_VERSION = '${new Date().toISOString().slice(0, 10)}-${version}';\n`;
  let js = strip(code, { mode: 'strip' });
  js = js.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1$2.js$3').replace(/(import\(\s*['"])(\.{1,2}\/[^'"]+)\.ts(['"]\s*\))/g, '$1$2.js$3');
  const out = join(dist, relative(root, f)).replace(/\.ts$/, '.js');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, js);
  files.push('./' + relative(dist, out));
}

// 2. Static files.
for (const f of ['index.html', 'styles.css', 'manifest.webmanifest']) {
  cpSync(join(root, 'web', f), join(dist, f));
  files.push(`./${f}`);
}
mkdirSync(join(dist, 'icons'), { recursive: true });
cpSync(join(root, 'web/icons/icon.svg'), join(dist, 'icons/icon.svg'));
files.push('./icons/icon.svg');

// 3. PNG icons for the Home Screen (sharp is available in the build workspace; skipped if not).
const require = createRequire(import.meta.url);
let sharp: ((input: Buffer) => { resize: (w: number, h: number) => { png: () => { toFile: (p: string) => Promise<unknown> } } }) | null = null;
for (const p of [join(root, 'node_modules/sharp'), '/home/claude/.npm-global/lib/node_modules/sharp']) {
  try {
    if (existsSync(p)) sharp = require(p);
    if (sharp) break;
  } catch {
    sharp = null;
  }
}
const svg = readFileSync(join(root, 'web/icons/icon.svg'));
for (const size of [180, 192, 512]) {
  const target = join(dist, `icons/icon-${size}.png`);
  const committed = join(root, `web/icons/icon-${size}.png`);
  if (sharp) {
    await sharp(svg).resize(size, size).png().toFile(committed);
  }
  if (existsSync(committed)) {
    cpSync(committed, target);
    files.push(`./icons/icon-${size}.png`);
  }
}

// 4. Service worker with the offline file list.
const sw = readFileSync(join(root, 'web/sw.js'), 'utf8').replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files.sort(), null, 1));
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`Built ${files.length} files into dist/ (version ${version}).`);
