// Local server for development and end-to-end tests: serves dist/ and runs the real Worker
// against in-memory D1/KV (Node's built-in SQLite).
// Usage: node scripts/serve.ts [port] [setupCode]

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { type Env } from '../worker/src/index.ts';
import { makeD1, makeKV } from '../tests/d1-shim.ts';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff': 'font/woff',
};

export function startServer(port = 8787, setupCode = 'TEST-SETUP-CODE'): Promise<{ url: string; close: () => Promise<void>; env: Env }> {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  const DB = makeD1();
  DB.raw.prepare("INSERT INTO meta(key, value) VALUES ('setup_code_sha256', ?)").run(createHash('sha256').update(setupCode.toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex'));
  const ASSETS = {
    fetch: async (req: Request): Promise<Response> => {
      let p = decodeURIComponent(new URL(req.url).pathname);
      // Behave like Cloudflare's default html_handling: /index.html redirects to /.
      if (p.endsWith('/index.html')) return new Response(null, { status: 307, headers: { location: p.slice(0, -'index.html'.length) } });
      if (p.endsWith('/')) p += 'index.html';
      const file = normalize(join(dist, p));
      if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) return new Response('Not found', { status: 404 });
      return new Response(readFileSync(file), { headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' } });
    },
  };
  const env: Env = { DB, BACKUPS: makeKV(), ASSETS };
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method,
      headers: Object.entries(req.headers).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
      ...(body && req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {}),
    });
    try {
      const r = await worker.fetch(request, env);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(500);
      res.end(String(e));
    }
  });
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({ url: `http://127.0.0.1:${port}`, env, close: () => new Promise<void>((r) => server.close(() => r())) }),
    ),
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const s = await startServer(Number(process.argv[2] ?? 8787), process.argv[3] ?? 'TEST-SETUP-CODE');
  console.log(`Serving ${s.url}`);
}
