/* Client-side outbox in IndexedDB. One record per (user, date) with the cells that still need to reach the server.
 * IndexedDB (not localStorage) so the service worker can replay the queue with Background Sync even when the page is closed. */
export type Cell = { price: string; na: boolean }
export type CellMap = Record<string, Cell>
export type QueueItem = { key: string; userId: string; date: string; cells: CellMap; submit: boolean; updatedAt: number; lastError?: string }

const DB = 'marketlens', STORE = 'outbox', VERSION = 1
const hasIdb = () => typeof indexedDB !== 'undefined'

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION)
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'key' }) }
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE))
    req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error)
    t.oncomplete = () => db.close()
  }))
}

export const keyFor = (userId: string, date: string) => `${userId}:${date}`

export async function getItem(userId: string, date: string): Promise<QueueItem | undefined> {
  if (!hasIdb()) return undefined
  try { return await tx<QueueItem | undefined>('readonly', (s) => s.get(keyFor(userId, date))) } catch { return undefined }
}
export async function listItems(): Promise<QueueItem[]> {
  if (!hasIdb()) return []
  try { return await tx<QueueItem[]>('readonly', (s) => s.getAll()) } catch { return [] }
}
/** Merge cells into the outbox record for this date. */
export async function enqueue(userId: string, date: string, cells: CellMap, submit?: boolean): Promise<QueueItem | undefined> {
  if (!hasIdb()) return undefined
  const cur = await getItem(userId, date)
  const next: QueueItem = { key: keyFor(userId, date), userId, date, cells: { ...(cur?.cells ?? {}), ...cells }, submit: submit ?? cur?.submit ?? false, updatedAt: Date.now() }
  try { await tx('readwrite', (s) => s.put(next)) } catch {}
  notify()
  return next
}
/** Remove synced cells (only those whose value is unchanged since they were sent). */
export async function ack(userId: string, date: string, sent: CellMap, submitted: boolean) {
  if (!hasIdb()) return
  const cur = await getItem(userId, date)
  if (!cur) return
  const cells: CellMap = {}
  for (const [k, v] of Object.entries(cur.cells)) if (!sent[k] || JSON.stringify(sent[k]) !== JSON.stringify(v)) cells[k] = v
  const submit = submitted ? false : cur.submit
  try {
    if (Object.keys(cells).length === 0 && !submit) await tx('readwrite', (s) => s.delete(cur.key))
    else await tx('readwrite', (s) => s.put({ ...cur, cells, submit, lastError: undefined }))
  } catch {}
  notify()
}
export async function drop(key: string) { if (!hasIdb()) return; try { await tx('readwrite', (s) => s.delete(key)) } catch {}; notify() }
export async function markError(key: string, lastError: string) {
  if (!hasIdb()) return
  const cur = await tx<QueueItem | undefined>('readonly', (s) => s.get(key)).catch(() => undefined)
  if (cur) { try { await tx('readwrite', (s) => s.put({ ...cur, lastError })) } catch {} }
}
export async function clearAll() { if (!hasIdb()) return; try { await tx('readwrite', (s) => s.clear()) } catch {}; notify() }

export async function pendingCount() {
  const xs = await listItems()
  return xs.reduce((n, x) => n + Object.keys(x.cells).length + (x.submit ? 1 : 0), 0)
}
async function notify() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('ml-queue', { detail: await pendingCount() }))
}
