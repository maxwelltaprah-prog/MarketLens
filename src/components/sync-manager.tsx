'use client'
import { useEffect } from 'react'
import { flushOutbox, pendingCount, requestBackgroundSync, type SyncOutcome } from '@/lib/sync-client'
import { listItems } from '@/lib/offline-db'
import { toast } from './toast'

/** Lives in the promoter layout. Drains the offline outbox whenever the app is open, online, or gets focus. */
export function SyncManager() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined
    const announce = async () => window.dispatchEvent(new CustomEvent('ml-queue', { detail: await pendingCount() }))
    const flush = async () => {
      if (!(await listItems()).length) return
      const r = await flushOutbox()
      if (!r.reached) { void requestBackgroundSync(); return }
      const subs = r.outcomes.filter((o) => o.ok && o.submitted).length
      const fails = r.outcomes.filter((o) => !o.ok)
      if (subs) toast(subs === 1 ? 'Submission delivered' : `${subs} submissions delivered`, { body: 'Your offline work has reached the server.' })
      fails.forEach((f: SyncOutcome) => toast('Could not sync one change', { body: `${f.date}: ${f.error}`, tone: 'warn', ttl: 7000 }))
      void announce()
    }
    void announce(); void flush()
    const onOnline = () => { void flush() }
    const onVisible = () => { if (document.visibilityState === 'visible') void flush() }
    const onMsg = (e: MessageEvent) => { if (e.data?.type === 'ml-synced') { void announce(); window.dispatchEvent(new CustomEvent('ml-synced', { detail: e.data.results ?? [] })) } }
    window.addEventListener('online', onOnline); document.addEventListener('visibilitychange', onVisible)
    navigator.serviceWorker?.addEventListener('message', onMsg)
    timer = setInterval(() => { void flush() }, 20_000)
    return () => { window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisible); navigator.serviceWorker?.removeEventListener('message', onMsg); clearInterval(timer) }
  }, [])
  return null
}
