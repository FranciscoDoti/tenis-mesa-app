/* Service worker — hace la app instalable (PWA) y cachea el "shell" para abrir rápido / offline. */
const CACHE = 'ttmesa-v22';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './store.js', './firebase-config.js',
  './manifest.json', './icons/icon-192-v2.png', './icons/icon-512-v2.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // Solo manejamos lo de nuestro propio origen; Firebase/SDK (otros orígenes) pasan directo a la red.
  if (new URL(req.url).origin !== location.origin) return;
  // Network-first con REVALIDACIÓN forzada: { cache: 'no-cache' } obliga a revalidar contra el
  // servidor (permite 304) y evita que la caché HTTP del navegador (GitHub Pages cachea ~10 min)
  // devuelva una versión vieja del app.js/index.html. Estando online se ve lo último; sin red, cae al cache.
  e.respondWith(
    fetch(req.url, { cache: 'no-cache' }).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
