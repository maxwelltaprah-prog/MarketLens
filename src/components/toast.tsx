'use client'
import { useEffect, useState } from 'react'
import { Icon, type IconName } from './icons'
import { cx } from './ui'

type Tone = 'ok' | 'info' | 'warn' | 'error'
type T = { id: number; title: string; body?: string; tone: Tone; ttl: number }
let seq = 0

/** Fire-and-forget notifications from anywhere (client or after a server action resolves). */
export function toast(title: string, opts: { body?: string; tone?: Tone; ttl?: number } = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<T>('ml-toast', { detail: { id: ++seq, title, body: opts.body, tone: opts.tone ?? 'ok', ttl: opts.ttl ?? 3800 } }))
}

const ICON: Record<Tone, IconName> = { ok: 'check', info: 'info', warn: 'alert', error: 'alert' }
const TONE: Record<Tone, string> = {
  ok: 'bg-ink text-white', info: 'bg-ink text-white',
  warn: 'bg-amber-soft text-amber-ink border border-amber/40', error: 'bg-danger text-white',
}

export function Toaster() {
  const [items, setItems] = useState<T[]>([])
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<T>).detail
      setItems((xs) => [...xs.slice(-3), t])
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), t.ttl)
    }
    window.addEventListener('ml-toast', on)
    return () => window.removeEventListener('ml-toast', on)
  }, [])
  if (!items.length) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 pointer-events-none safe-b" aria-live="polite" role="status">
      {items.map((t) => (
        <div key={t.id} className={cx('toast pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 shadow-pop max-w-md w-full sm:w-auto', TONE[t.tone])}>
          <span className={cx('mt-0.5 grid place-items-center size-5 rounded-full shrink-0', t.tone === 'warn' ? 'bg-amber/30' : 'bg-white/15')}><Icon name={ICON[t.tone]} size={12} /></span>
          <span className="min-w-0 text-sm leading-snug"><span className="font-semibold">{t.title}</span>{t.body && <span className="block opacity-80 text-xs mt-0.5">{t.body}</span>}</span>
          <button className="ml-auto opacity-60 hover:opacity-100 -mr-1" aria-label="Dismiss" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  )
}
