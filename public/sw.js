/* MarketLens service worker
 * - Static build assets: cache-first (they are content-hashed).
 * - Promoter pages (/capture/*): network-first, falling back to the last copy so the app opens offline.
 * - Admin pages, API routes, server actions (POST) and auth are NEVER cached.
 * - Cached pages are wiped when the user lands on /login (i.e. after signing out).
 */
const STATIC = 'ml-static-v1'
const PAGES = 'ml-pages-v1'
const OFFLINE_URL = '/offline.html'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.add(OFFLINE_URL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/pwa-icon/')) {
    e.respondWith(caches.open(STATIC).then(async (c) => {
      const hit = await c.match(req)
      if (hit) return hit
      const res = await fetch(req)
      if (res.ok) c.put(req, res.clone())
      return res
    }))
    return
  }

  if (req.mode === 'navigate') {
    if (url.pathname === '/login') caches.delete(PAGES)
    const cacheable = url.pathname.startsWith('/capture')
    e.respondWith((async () => {
      try {
        const res = await fetch(req)
        if (cacheable && res.ok && res.type === 'basic' && !res.redirected) { const c = await caches.open(PAGES); c.put(req, res.clone()) }
        return res
      } catch {
        const hit = cacheable ? await caches.match(req, { cacheName: PAGES }) : undefined
        return hit || (await caches.match(OFFLINE_URL)) || Response.error()
      }
    })())
  }
})
