// Servidor estático mínimo para los tests E2E.
// Sirve los archivos reales del repo, PERO reemplaza firebase-config.js por una config vacía:
// así store.js entra en "modo local" (localStorage) y la app no intenta hablar con Firebase/emulador.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = normalize(join(fileURLToPath(import.meta.url), '..', '..', '..'));
const PORT = Number(process.env.E2E_PORT) || 5173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/') path = '/index.html';

    // Forzar modo local: config de Firebase vacía.
    if (path === '/firebase-config.js') {
      res.writeHead(200, { 'Content-Type': TYPES['.js'] });
      res.end('window.firebaseConfig = {}; /* E2E: modo local */');
      return;
    }

    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  }
});

server.listen(PORT, () => console.log(`E2E static server on http://localhost:${PORT}`));
