'use client'
import { useEffect, useState } from 'react'
import { cx } from './ui'
import { Icon } from './icons'
import type { GeoState } from './location-tracker'

type S = 'saved' | 'saving' | 'dirty' | 'offline' | 'error'
const LABEL: Record<S, string> = { saved: 'Synced', saving: 'Saving…', dirty: 'Saving…', offline: 'Offline', error: 'Sync issue' }

export function SyncPill() {
  const [s, setS] = useState<S>('saved')
  const [geo, setGeo] = useState<GeoState>('off')
  useEffect(() => {
    const h = (e: Event) => setS((e as CustomEvent<S>).detail)
    const off = () => setS('offline')
    const on = () => setS((p) => (p === 'offline' ? 'saved' : p))
    const g = (e: Event) => setGeo((e as CustomEvent<GeoState>).detail)
    window.addEventListener('ml-sync', h); window.addEventListener('offline', off); window.addEventListener('online', on); window.addEventListener('ml-geo', g)
    if (!navigator.onLine) setS('offline')
    return () => { window.removeEventListener('ml-sync', h); window.removeEventListener('offline', off); window.removeEventListener('online', on); window.removeEventListener('ml-geo', g) }
  }, [])
  const color = s === 'saved' ? 'bg-emerald-500' : s === 'offline' || s === 'error' ? 'bg-amber' : 'bg-brand-soft animate-pulse'
  return (
    <span className="inline-flex items-center gap-3 text-xs font-semibold text-brand-ink" role="status">
      {geo !== 'off' && geo !== 'unsupported' && (
        <span className={cx('inline-flex items-center gap-1', geo === 'on' ? 'text-success' : geo === 'denied' ? 'text-amber-ink' : 'text-muted')} title={geo === 'on' ? 'Location sharing on' : geo === 'denied' ? 'Location blocked' : 'Finding GPS…'}>
          <Icon name="pin" size={13} className={cx(geo === 'searching' && 'animate-pulse')} /><span className="hidden sm:inline">{geo === 'on' ? 'Location on' : geo === 'denied' ? 'No location' : 'GPS…'}</span>
        </span>
      )}
      <span className="inline-flex items-center gap-2"><span className={cx('size-2 rounded-full', color)} />{LABEL[s]}</span>
    </span>
  )
}
