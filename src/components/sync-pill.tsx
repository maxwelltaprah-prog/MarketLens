'use client'
import { useEffect, useState } from 'react'
import { cx } from './ui'

type S = 'saved' | 'saving' | 'dirty' | 'offline' | 'error'
const LABEL: Record<S, string> = { saved: 'Synced', saving: 'Saving…', dirty: 'Saving…', offline: 'Offline', error: 'Sync issue' }

export function SyncPill() {
  const [s, setS] = useState<S>('saved')
  useEffect(() => {
    const h = (e: Event) => setS((e as CustomEvent<S>).detail)
    const off = () => setS('offline')
    const on = () => setS((p) => (p === 'offline' ? 'saved' : p))
    window.addEventListener('ml-sync', h); window.addEventListener('offline', off); window.addEventListener('online', on)
    if (!navigator.onLine) setS('offline')
    return () => { window.removeEventListener('ml-sync', h); window.removeEventListener('offline', off); window.removeEventListener('online', on) }
  }, [])
  const color = s === 'saved' ? 'bg-emerald-500' : s === 'offline' || s === 'error' ? 'bg-amber' : 'bg-brand-soft animate-pulse'
  return (
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-brand" role="status">
      <span className={cx('size-2 rounded-full', color)} />{LABEL[s]}
    </span>
  )
}
