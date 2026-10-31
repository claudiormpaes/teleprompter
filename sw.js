/* Service worker do Teleprompter: cache primeiro, com rede como reserva.
   Suba o valor de V a cada alteracao de arquivo para forcar a atualizacao. */
const V = 'v9.4';
const CACHE = 'teleprompter-' + V;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './privacidade.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './fonts/atkinson-next.woff2',
  './fonts/atkinson-next-italic.woff2',
  './fonts/space-grotesk.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // cache: 'reload' fura o cache HTTP do GitHub Pages (max-age=600): versao nova nunca grava arquivo velho
      .then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // sem rede: para navegacao, devolve a pagina principal do cache
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});
