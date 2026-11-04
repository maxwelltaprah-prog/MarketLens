'use client'
import { useEffect, useState } from 'react'
import { Icon } from './icons'
import { cx } from './ui'

/** Global connectivity strip. Shows the queue size so field users know their work is safe. */
export function OfflineBar() {
  const [online, setOnline] = useState(true)
  const [pending, setPending] = useState(0)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine)
    const q = (e: Event) => setPending((e as CustomEvent<number>).detail)
    const back = () => { setOnline(true); setFlash(true); setTimeout(() => setFlash(false), 2500) }
    sync()
    window.addEventListener('online', back); window.addEventListener('offline', sync); window.addEventListener('ml-queue', q)
    return () => { window.removeEventListener('online', back); window.removeEventListener('offline', sync); window.removeEventListener('ml-queue', q) }
  }, [])
  if (online && !flash) return null
  return (
    <div className={cx('no-print sticky top-0 z-[60] text-xs font-semibold text-center py-1.5 px-4 flex items-center justify-center gap-2 transition-colors',
      online ? 'bg-success text-white' : 'bg-ink text-white')} role="status" aria-live="polite">
      <Icon name={online ? 'cloud' : 'cloudOff'} size={14} />
      {online ? 'Back online. Syncing your changes…' : pending ? `You’re offline. ${pending} change${pending === 1 ? '' : 's'} saved on this device and will sync automatically.` : 'You’re offline. Your work is saved on this device.'}
    </div>
  )
}
