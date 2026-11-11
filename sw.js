/* Service worker do RONDA (página de reporte dos colaboradores).
   Só cuida de reportar.html e dos arquivos do Firebase; o app da equipe (index.html) NÃO é tocado. */
const CACHE = 'ronda-reportar-v1';
const SCOPE = self.registration.scope;
const PAGE = new URL('reportar.html', SCOPE).href;
const PAGE_PATH = new URL(PAGE).pathname;
const PRE = [PAGE, new URL('reportar.webmanifest', SCOPE).href, new URL('icon-192.png', SCOPE).href];
const FB = 'https://www.gstatic.com/firebasejs/';
const FB_ENTRIES = [
  FB + '10.13.2/firebase-app.js',
  FB + '10.13.2/firebase-firestore.js',
  FB + '10.13.2/firebase-auth.js'
];

async function cacheModuleTree(cache, url, seen){
  if(seen.has(url)) return;
  seen.add(url);
  let res;
  try{ res = await fetch(url, { mode:'cors' }); }catch(e){ return; }
  if(!res || !res.ok) return;
  await cache.put(url, res.clone());
  const text = await res.text();
  const re = /(?:from|import)\s*\(?\s*["']([^"']+\.js)["']/g;
  let m;
  while((m = re.exec(text))){
    let dep;
    try{ dep = new URL(m[1], url).href; }catch(e){ continue; }
    if(dep.startsWith(FB)) await cacheModuleTree(cache, dep, seen);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(PRE.map(u => cache.add(u).catch(() => {})));
    const seen = new Set();
    for(const u of FB_ENTRIES) await cacheModuleTree(cache, u, seen);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k.startsWith('ronda-reportar-')).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

async function pageHandler(req){
  const cache = await caches.open(CACHE);
  try{
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
    ]);
    if(res && res.ok) cache.put(PAGE, res.clone());
    return res;
  }catch(e){
    const hit = await cache.match(PAGE);
    if(hit) return hit;
    throw e;
  }
}

async function firebaseHandler(req){
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req.url);
  if(hit) return hit;
  const res = await fetch(req);
  if(res && res.ok) cache.put(req.url, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin === location.origin && url.pathname === PAGE_PATH){
    event.respondWith(pageHandler(req));
  }else if(req.url.startsWith(FB)){
    event.respondWith(firebaseHandler(req));
  }
  /* qualquer outra coisa (incluindo index.html da equipe) segue direto para a rede */
});
