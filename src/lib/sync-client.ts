'use client'
import { ack, drop, listItems, markError, pendingCount, type CellMap, type QueueItem } from './offline-db'

export type SyncOutcome = { date: string; ok: boolean; submitted?: boolean; error?: string; permanent?: boolean; status?: 'draft' | 'submitted' }
export type FlushResult = { reached: boolean; outcomes: SyncOutcome[] }

let inflight: Promise<FlushResult> | null = null

/** Push every queued change to the server. Safe to call often: concurrent calls share one request. */
export function flushOutbox(): Promise<FlushResult> {
  if (inflight) return inflight
  inflight = run().finally(() => { inflight = null })
  return inflight
}

async function run(): Promise<FlushResult> {
  const items = await listItems()
  if (!items.length) return { reached: true, outcomes: [] }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { reached: false, outcomes: [] }
  const payload = items.map((i) => ({ userId: i.userId, date: i.date, cells: i.cells, sales: i.sales ?? {}, submit: i.submit, pings: (i.pings ?? []).slice(0, 300) }))
  let res: Response
  try {
    res = await fetch('/api/capture/sync', { method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'marketlens' }, body: JSON.stringify({ items: payload }), credentials: 'same-origin' })
  } catch { return { reached: false, outcomes: [] } }
  if (res.status === 401) { window.location.assign('/login'); return { reached: true, outcomes: [] } }
  if (!res.ok) return { reached: false, outcomes: [] }
  const data = (await res.json()) as { results: SyncOutcome[] }
  const byDate = new Map(items.map((i) => [i.date, i]))
  for (const r of data.results) {
    const it = byDate.get(r.date) as QueueItem | undefined
    if (!it) continue
    if (r.ok) await ack(it.userId, it.date, it.cells as CellMap, !!r.submitted, Math.min(300, (it.pings ?? []).length), it.sales ?? {})
    else if (r.permanent) await drop(it.key)
    else await markError(it.key, r.error ?? 'Sync failed')
  }
  window.dispatchEvent(new CustomEvent('ml-synced', { detail: data.results }))
  return { reached: true, outcomes: data.results }
}

export async function requestBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready
    const sync = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } })?.sync
    if (sync) await sync.register('ml-outbox')
  } catch {}
}

export { pendingCount }
