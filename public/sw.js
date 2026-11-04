/* MarketLens service worker — offline-first for the field team.
 *
 * Caching
 *  - Static build assets (/_next/static, /brand): cache-first; content-hashed or immutable.
 *  - Promoter pages (/capture/*): network-first with a 4s timeout, falling back to the last good copy so the
 *    app opens with no signal. Each visited page is cached; /capture and /capture/submissions are warmed on sign-in.
 *  - Admin pages, API routes, POSTs and auth are never cached.
 *  - The page cache is wiped when the user signs out (navigates to /login) or on a "logout" message.
 *
 * Background Sync
 *  - The page writes unsynced prices into IndexedDB ("outbox"). When the device regains connectivity, the browser
 *    fires the "ml-outbox" sync event even if the app is closed, and we replay the outbox to /api/capture/sync.
 */
const VERSION = 'v3'
const STATIC = `ml-static-${VERSION}`
const PAGES = `ml-pages-${VERSION}`
const OFFLINE_URL = '/offline.html'
const WARM = ['/capture', '/capture/submissions']
const NET_TIMEOUT = 4000

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(STATIC).then((c) => c.addAll([OFFLINE_URL, '/brand/logo.png', '/brand/mark.png'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => ![STATIC, PAGES].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== location.origin) return

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/brand/')) {
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
        const res = await withTimeout(fetch(req), cacheable ? NET_TIMEOUT : 15000)
        if (cacheable && res.ok && res.type === 'basic' && !res.redirected) { const c = await caches.open(PAGES); c.put(req, res.clone()) }
        return res
      } catch {
        const hit = cacheable ? await caches.match(req, { cacheName: PAGES, ignoreSearch: true }) : undefined
        return hit || (await caches.match(OFFLINE_URL)) || Response.error()
      }
    })())
  }
})

/* ---- Outbox replay (shared IndexedDB with the page) ---- */
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('marketlens', 1)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('outbox')) r.result.createObjectStore('outbox', { keyPath: 'key' }) }
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
function store(db, mode, fn) {
  return new Promise((res, rej) => { const t = db.transaction('outbox', mode); const q = fn(t.objectStore('outbox')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error) })
}
async function replayOutbox() {
  const db = await openDb()
  const items = await store(db, 'readonly', (s) => s.getAll())
  if (!items.length) return []
  const res = await fetch('/api/capture/sync', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'marketlens-sw' },
    body: JSON.stringify({ items: items.map((i) => ({ userId: i.userId, date: i.date, cells: i.cells, submit: i.submit })) }),
  })
  if (!res.ok) throw new Error('sync failed ' + res.status)
  const { results } = await res.json()
  for (const r of results) {
    const it = items.find((i) => i.date === r.date)
    if (!it) continue
    if (r.ok) {
      // Only clear cells that are unchanged since we sent them (the page may have edited meanwhile).
      const fresh = await store(db, 'readonly', (s) => s.get(it.key))
      if (!fresh) continue
      const cells = {}
      for (const [k, v] of Object.entries(fresh.cells)) if (!it.cells[k] || JSON.stringify(it.cells[k]) !== JSON.stringify(v)) cells[k] = v
      const submit = r.submitted ? false : fresh.submit
      if (Object.keys(cells).length === 0 && !submit) await store(db, 'readwrite', (s) => s.delete(it.key))
      else await store(db, 'readwrite', (s) => s.put({ ...fresh, cells, submit }))
    } else if (r.permanent) await store(db, 'readwrite', (s) => s.delete(it.key))
  }
  const clients = await self.clients.matchAll({ type: 'window' })
  clients.forEach((c) => c.postMessage({ type: 'ml-synced', results }))
  return results
}

self.addEventListener('sync', (e) => { if (e.tag === 'ml-outbox') e.waitUntil(replayOutbox().catch(() => { throw new Error('retry') })) })

self.addEventListener('message', (e) => {
  const d = e.data || {}
  if (d.type === 'warm') e.waitUntil(caches.open(PAGES).then((c) => Promise.all(WARM.map((u) => fetch(u, { credentials: 'same-origin' }).then((r) => { if (r.ok && !r.redirected) c.put(u, r) }).catch(() => {})))))
  if (d.type === 'logout') e.waitUntil(caches.delete(PAGES))
  if (d.type === 'flush') e.waitUntil(replayOutbox().catch(() => {}))
})
