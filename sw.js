/* Service worker — hace la app instalable (PWA) y cachea el "shell" para abrir rápido / offline. */
const CACHE = 'ttmesa-v1';
const ASSETS = [
  './', './index.html', './styles.css', './app.js', './store.js', './firebase-config.js',
  './manifest.json', './icons/icon-192.png', './icons/icon-512.png'
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
  // Network-first: trae lo último y actualiza cache; si no hay red, cae al cache.
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
