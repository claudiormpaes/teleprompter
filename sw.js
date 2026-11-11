/* Service worker do Teleprompter: cache primeiro, com rede como reserva.
   Suba o valor de V a cada alteracao de arquivo para forcar a atualizacao. */
const V = 'v10.1';
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
        keys.filter((k) => k !== CACHE && k !== SHARE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* v10.1: "Compartilhar" do Android (Docs > Enviar uma copia > Word > Prompter). O sistema manda um POST
   multipart para ./compartilhar (share_target do manifesto); aqui guarda titulo, texto, link e o arquivo no
   cache 'tp-share' e manda a pagina para ./?compartilhado=1, que le e apaga (Share.take no app.js). */
const SHARE = 'tp-share';
async function receiveShare(req) {
  const scope = self.registration.scope;
  const meta = { title: '', text: '', url: '', file: null, at: Date.now() };
  try {
    const form = await req.formData();
    meta.title = String(form.get('title') || '');
    meta.text = String(form.get('text') || '');
    meta.url = String(form.get('url') || '');
    const file = form.getAll('arquivo').find((f) => f && typeof f !== 'string' && f.size > 0);
    const cache = await caches.open(SHARE);
    if (file) {
      meta.file = { name: file.name || '', type: file.type || '', size: file.size };
      await cache.put(new URL('__compartilhado/arquivo', scope).href, new Response(file, { headers: { 'Content-Type': file.type || 'application/octet-stream' } }));
    }
    await cache.put(new URL('__compartilhado/meta', scope).href, new Response(JSON.stringify(meta), { headers: { 'Content-Type': 'application/json' } }));
  } catch (e) { /* a pagina abre e avisa que nada chegou */ }
  return Response.redirect(new URL('./?compartilhado=1', scope).href, 303);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/compartilhar')) {
    event.respondWith(receiveShare(req));
    return;
  }
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
