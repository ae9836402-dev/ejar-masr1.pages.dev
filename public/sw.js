/* Minimal service worker: it only makes the installed app show a friendly page instead of the browser's "no internet" dinosaur.
   Pages and data are never cached here (listings change all the time, and the site already has its own caching), so nothing can go stale. */
const OFFLINE = '/offline.html'
const CACHE = 'ejar-offline-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return // everything except opening a page goes straight to the network, untouched
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)))
})
