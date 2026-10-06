import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.mp4': 'video/mp4' };
export function previewServer() {
  return createServer(async (request, response) => {
    try {
      const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (!path.startsWith('/preview/')) { response.writeHead(404); response.end(); return; }
      const file = resolve(dist, path.slice('/preview/'.length) || 'index.html');
      if (!file.startsWith(dist)) throw new Error('Invalid path');
      const body = await readFile(file);
      const extension = file.slice(file.lastIndexOf('.'));
      response.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      response.end(body);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = previewServer();
  server.listen(4173, '0.0.0.0', () => console.log('Static export preview: http://localhost:4173/preview/'));
  const shutdown = () => server.close(() => process.exit());
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
