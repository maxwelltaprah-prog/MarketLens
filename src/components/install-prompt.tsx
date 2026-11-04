'use client'
import { useEffect, useState } from 'react'
import { Icon } from './icons'

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
const KEY = 'ml:install:dismissed'

/** Gentle "add to home screen" card for promoters. Chrome/Android gets a one-tap install; iOS gets instructions. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<BIP | null>(null)
  const [ios, setIos] = useState(false)
  const [show, setShow] = useState(false)
  useEffect(() => {
    try { if (localStorage.getItem(KEY)) return } catch {}
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone
    if (standalone) return
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (isIos) { setIos(true); setShow(true) }
    const on = (e: Event) => { e.preventDefault(); setEvt(e as BIP); setShow(true) }
    window.addEventListener('beforeinstallprompt', on)
    return () => window.removeEventListener('beforeinstallprompt', on)
  }, [])
  const dismiss = () => { setShow(false); try { localStorage.setItem(KEY, '1') } catch {} }
  if (!show) return null
  return (
    <div className="no-print pop card p-4 mb-6 flex items-center gap-3 border-brand-soft bg-gradient-to-r from-mint to-white">
      <span className="grid place-items-center size-10 rounded-xl bg-brand text-white shrink-0"><Icon name="mobile" /></span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">Install MarketLens on this phone</div>
        <div className="text-xs text-muted">{ios ? 'Tap Share, then “Add to Home Screen”. It opens instantly and works offline.' : 'One tap. Opens instantly and works without signal.'}</div>
      </div>
      {evt && <button className="btn btn-primary btn-sm" onClick={async () => { await evt.prompt(); dismiss() }}>Install</button>}
      <button className="icon-btn !size-9" aria-label="Not now" onClick={dismiss}><Icon name="x" size={14} /></button>
    </div>
  )
}
