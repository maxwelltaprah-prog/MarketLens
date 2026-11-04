'use client'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveDraftAction, submitEntryAction } from '@/actions/capture'
import { Icon } from './icons'
import { cx } from './ui'

export type Cell = { price: string; na: boolean }
export type CellMap = Record<string, Cell>
type Sku = { id: string; label: string; code: string; brands: { id: string; name: string }[] }
type Sync = 'saved' | 'saving' | 'dirty' | 'offline' | 'error'

type Props = {
  userId: string
  date: string
  catalog: Sku[]
  initial: CellMap
  averages: Record<string, number>
  symbol: string
  variancePct: number
  /** 'new' = nothing saved yet */
  status: 'new' | 'draft' | 'submitted'
  editable: boolean
  lockedNote?: string
}

const empty: Cell = { price: '', na: false }
const isFilled = (c?: Cell) => !!c && (c.na || (c.price !== '' && Number(c.price) > 0))
const emit = (state: Sync) => { window.dispatchEvent(new CustomEvent('ml-sync', { detail: state })) }

export function CaptureGrid({ userId, date, catalog, initial, averages, symbol, variancePct, status: initialStatus, editable, lockedNote }: Props) {
  const router = useRouter()
  const storageKey = `ml:draft:${userId}:${date}`
  const submitKey = `ml:submit:${userId}:${date}`
  const [cells, setCells] = useState<CellMap>(initial)
  const [status, setStatus] = useState(initialStatus)
  const [sync, setSyncState] = useState<Sync>('saved')
  const [open, setOpen] = useState<string | null>(catalog[0]?.id ?? null)
  const [version, setVersion] = useState(0)
  const [review, setReview] = useState<null | 'review' | 'submitting' | 'done' | 'queued'>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(cells); latest.current = cells
  const dirty = useRef<Set<string>>(new Set())
  const flushing = useRef(false)
  const root = useRef<HTMLDivElement>(null)

  const setSync = useCallback((s: Sync) => { setSyncState(s); emit(s) }, [])
  const total = useMemo(() => catalog.reduce((n, k) => n + k.brands.length, 0), [catalog])
  const filled = useMemo(() => catalog.reduce((n, k) => n + k.brands.filter((b) => isFilled(cells[`${k.id}:${b.id}`])).length, 0), [catalog, cells])
  const pct = total ? Math.round((filled / total) * 100) : 0

  const persist = useCallback(() => {
    try {
      if (dirty.current.size === 0) { localStorage.removeItem(storageKey); return }
      const out: CellMap = {}
      dirty.current.forEach((k) => { out[k] = latest.current[k] ?? empty })
      localStorage.setItem(storageKey, JSON.stringify(out))
    } catch {}
  }, [storageKey])

  // Restore unsynced local edits (e.g. captured offline, or the tab was closed before syncing).
  useEffect(() => {
    if (!editable) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const local = JSON.parse(raw) as CellMap
        const keys = Object.keys(local)
        if (keys.length) {
          keys.forEach((k) => dirty.current.add(k))
          setCells((c) => ({ ...c, ...local }))
          setSync(navigator.onLine ? 'dirty' : 'offline')
          setVersion((v) => v + 1)
        }
      }
    } catch {}
    if (!navigator.onLine) setSync('offline')
    return () => emit('saved')
  }, [editable, storageKey, setSync])

  const flush = useCallback(async (): Promise<boolean> => {
    if (dirty.current.size === 0) return true
    if (!navigator.onLine) { setSync('offline'); return false }
    if (flushing.current) return false
    flushing.current = true; setSync('saving')
    const keys = [...dirty.current]
    const payload: CellMap = Object.fromEntries(keys.map((k) => [k, latest.current[k] ?? empty]))
    try {
      const res = await saveDraftAction({ date, cells: payload })
      if (!res.ok) { setError(res.error); setSync('error'); return false }
      keys.forEach((k) => { if (JSON.stringify(latest.current[k] ?? empty) === JSON.stringify(payload[k])) dirty.current.delete(k) })
      persist(); setError(null)
      if (status === 'new') setStatus('draft')
      setSync(dirty.current.size ? 'dirty' : 'saved')
      return dirty.current.size === 0
    } catch { setSync('offline'); return false } finally { flushing.current = false }
  }, [date, persist, setSync, status])

  // Debounced autosave + retry loops
  useEffect(() => {
    if (!editable || version === 0) return
    const t = setTimeout(() => { void flush() }, 900)
    return () => clearTimeout(t)
  }, [version, editable, flush])
  useEffect(() => {
    if (!editable) return
    const id = setInterval(() => { if (dirty.current.size) void flush() }, 15000)
    return () => clearInterval(id)
  }, [editable, flush])

  const doSubmit = useCallback(async () => {
    setReview('submitting'); setError(null)
    let tries = 0
    while (dirty.current.size && tries++ < 4) { if (!(await flush())) break; }
    if (dirty.current.size) {
      if (!navigator.onLine) { try { localStorage.setItem(submitKey, '1') } catch {}; setReview('queued'); return }
      setReview('review'); setError('We couldn’t save your latest changes. Please try again.'); return
    }
    try {
      const res = await submitEntryAction({ date })
      if (!res.ok) { setReview('review'); setError(res.error); return }
      try { localStorage.removeItem(submitKey) } catch {}
      setStatus('submitted'); setReview('done'); router.refresh()
    } catch {
      try { localStorage.setItem(submitKey, '1') } catch {}
      setReview('queued')
    }
  }, [date, flush, router, submitKey])

  // Reconnect: flush drafts, then complete any queued submission.
  useEffect(() => {
    if (!editable) return
    const onOnline = async () => {
      let queued = false
      try { queued = localStorage.getItem(submitKey) === '1' } catch {}
      if (queued) await doSubmit(); else await flush()
    }
    const onOffline = () => setSync('offline')
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline)
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline) }
  }, [editable, flush, doSubmit, submitKey, setSync])

  const change = useCallback((key: string, next: Cell) => {
    setCells((c) => ({ ...c, [key]: next }))
    latest.current = { ...latest.current, [key]: next }
    dirty.current.add(key); persist()
    setSync(navigator.onLine ? 'dirty' : 'offline')
    setVersion((v) => v + 1)
  }, [persist, setSync])

  const onEnter = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const inputs = Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[data-price]:not(:disabled)') ?? [])
    const i = inputs.indexOf(e.currentTarget)
    inputs[i + 1]?.focus()
  }, [])

  // Warnings for review
  const warnings = useMemo(() => {
    const out: { sku: string; brand: string; price: number; avg: number; diff: number }[] = []
    for (const k of catalog) for (const b of k.brands) {
      const key = `${k.id}:${b.id}`, c = cells[key], avg = averages[key]
      if (c && !c.na && c.price && avg) {
        const diff = ((Number(c.price) - avg) / avg) * 100
        if (Math.abs(diff) > variancePct) out.push({ sku: k.label, brand: b.name, price: Number(c.price), avg, diff })
      }
    }
    return out
  }, [catalog, cells, averages, variancePct])

  const missing = total - filled
  const naCount = Object.values(cells).filter((c) => c.na).length

  return (
    <div ref={root}>
      {/* Progress */}
      <div className="rounded-2xl bg-brand text-white p-5 flex items-center gap-5 shadow-pop mb-8" role="status" aria-live="polite">
        <div className="shrink-0">
          <div className="text-[0.65rem] tracking-[0.14em] uppercase text-white/70">Capture progress</div>
          <div className="mt-1"><span className="text-3xl font-semibold tabular-nums">{filled}</span> <span className="text-sm text-white/75">of {total} prices filled</span></div>
        </div>
        <div className="flex-1 h-2.5 rounded-full bg-white/20 overflow-hidden min-w-12">
          <div className="h-full rounded-full bg-lime transition-[width] duration-500 ease-out" style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
        <div className="text-3xl font-semibold tabular-nums w-16 text-right">{pct}%</div>
      </div>

      <div className="flex items-end justify-between mb-3">
        <div>
          <h2 className="text-2xl font-medium">Price grid</h2>
          <p className="text-sm text-muted mt-1">Tap a pack size to enter available shelf prices.</p>
        </div>
        <span className="text-sm font-semibold text-muted hidden sm:block">{symbol} · {symbol === 'GH₵' ? 'Ghana Cedi' : 'Local currency'}</span>
      </div>

      {!editable && (
        <div className="flex gap-2 items-start rounded-xl bg-amber-soft text-amber-ink text-sm p-3 mb-4">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0" /> <span>{lockedNote ?? 'This entry is read-only.'}</span>
        </div>
      )}
      {error && <div role="alert" className="flex gap-2 rounded-xl bg-danger-soft text-danger text-sm p-3 mb-4"><Icon name="alert" size={16} className="mt-0.5" />{error}</div>}

      <div className="space-y-3 pb-32">
        {catalog.map((k) => {
          const done = k.brands.filter((b) => isFilled(cells[`${k.id}:${b.id}`])).length
          const isOpen = open === k.id
          return (
            <section key={k.id} className={cx('card overflow-hidden transition-colors', isOpen && 'border-brand-soft')}>
              <button type="button" onClick={() => setOpen(isOpen ? null : k.id)} aria-expanded={isOpen}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-[#fafbf8] transition-colors">
                <span className="grid place-items-center size-12 rounded-xl bg-mint text-brand text-xs font-bold shrink-0">{k.code}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold">{k.label}</span>
                  <span className="block text-xs text-muted">{k.brands.length} brands</span>
                </span>
                <span className={cx('rounded-full px-2.5 py-1 text-xs font-bold tabular-nums', done === k.brands.length ? 'bg-brand text-white' : 'bg-[#eef0eb] text-muted')}>{done}/{k.brands.length}</span>
                <Icon name="chevronD" className={cx('text-ink transition-transform duration-200', isOpen && 'rotate-180')} />
              </button>
              <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                <div className="overflow-hidden">
                  <div className="border-t border-line bg-[#fafbf8] px-4 py-2 flex th"><span className="flex-1">Brand</span><span className="w-36 sm:w-48">Sales price</span><span className="w-12 text-center">N/A</span></div>
                  {isOpen && k.brands.map((b) => {
                    const key = `${k.id}:${b.id}`
                    return <BrandRow key={key} id={key} name={b.name} cell={cells[key] ?? empty} avg={averages[key]} symbol={symbol}
                      variancePct={variancePct} disabled={!editable} onChange={change} onEnter={onEnter} />
                  })}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur safe-b">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="font-semibold text-sm tabular-nums">{filled} of {total} captured</div>
            <div className="text-xs text-muted truncate"><SyncText state={sync} editable={editable} status={status} /></div>
          </div>
          {editable && (
            <button className="btn btn-primary" onClick={() => { setError(null); setReview('review') }} disabled={filled === 0}>
              {status === 'submitted' ? 'Update submission' : 'Review & submit'} <Icon name="arrowR" size={16} />
            </button>
          )}
        </div>
      </div>

      {review && (
        <div className="fixed inset-0 z-40 grid items-end sm:place-items-center bg-forest-deep/50 backdrop-blur-sm p-0 sm:p-6" role="dialog" aria-modal="true" aria-label="Review and submit"
          onClick={(e) => { if (e.target === e.currentTarget && review === 'review') setReview(null) }}>
          <div className="pop bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-6 max-h-[88dvh] overflow-y-auto safe-b">
            {review === 'done' || review === 'queued' ? (
              <div className="text-center py-6">
                <div className="mx-auto mb-4 grid place-items-center size-16 rounded-full bg-mint text-brand"><Icon name={review === 'done' ? 'check' : 'wifiOff'} size={30} /></div>
                <h3 className="text-2xl font-medium">{review === 'done' ? 'Prices submitted' : 'Saved, waiting for signal'}</h3>
                <p className="text-muted text-sm mt-2">{review === 'done' ? 'Thank you. Your administrator can now see today’s prices.' : 'You’re offline. We’ll submit automatically the moment you reconnect. Keep this app open or installed.'}</p>
                <div className="mt-6 flex flex-col gap-2">
                  <button className="btn btn-primary" onClick={() => router.push('/capture/submissions')}>View my submissions</button>
                  <button className="btn btn-ghost" onClick={() => setReview(null)}>Back to grid</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <div><div className="eyebrow">Almost there</div><h3 className="text-2xl font-medium mt-1">Review &amp; submit</h3></div>
                  <button className="icon-btn" aria-label="Close" onClick={() => setReview(null)} disabled={review === 'submitting'}><Icon name="x" /></button>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-5 text-center">
                  {[['Prices', filled - naCount], ['N/A', naCount], ['Missing', missing]].map(([l, v]) => (
                    <div key={l} className="rounded-2xl bg-canvas p-3"><div className="text-2xl font-semibold tabular-nums">{v}</div><div className="text-xs text-muted">{l}</div></div>
                  ))}
                </div>
                {missing > 0 && <p className="text-sm text-amber-ink bg-amber-soft rounded-xl p-3 mt-4">{missing} price{missing === 1 ? ' is' : 's are'} still blank. Mark items N/A if the brand isn’t on the shelf, or submit as is.</p>}
                {warnings.length > 0 && (
                  <div className="mt-4">
                    <div className="text-sm font-semibold mb-2 flex items-center gap-2"><Icon name="alert" size={16} className="text-amber-ink" />{warnings.length} price{warnings.length === 1 ? '' : 's'} look unusual</div>
                    <ul className="space-y-1.5 max-h-40 overflow-y-auto text-sm">
                      {warnings.map((w) => (
                        <li key={w.sku + w.brand} className="flex justify-between gap-3 rounded-lg bg-amber-soft/60 px-3 py-2">
                          <span>{w.brand} <span className="text-muted">· {w.sku}</span></span>
                          <span className="tabular-nums font-medium">{symbol} {w.price.toFixed(2)} <span className="text-amber-ink">({w.diff > 0 ? '+' : ''}{Math.round(w.diff)}%)</span></span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted mt-2">Compared with the 30-day network average. Double-check the shelf tag before you submit.</p>
                  </div>
                )}
                {error && <div role="alert" className="text-sm text-danger bg-danger-soft rounded-xl p-3 mt-4">{error}</div>}
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <button className="btn btn-outline" onClick={() => setReview(null)} disabled={review === 'submitting'}>Keep editing</button>
                  <button className="btn btn-primary" onClick={doSubmit} disabled={review === 'submitting'}>
                    {review === 'submitting' ? <><span className="size-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />Submitting</> : 'Submit prices'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function SyncText({ state, editable, status }: { state: Sync; editable: boolean; status: string }) {
  if (!editable) return <>Read-only</>
  if (state === 'offline') return <>Offline. Saved on this device and will sync automatically.</>
  if (state === 'saving') return <>Saving…</>
  if (state === 'error') return <>Couldn’t sync. We’ll keep retrying.</>
  if (state === 'dirty') return <>Saved on this device. Syncing…</>
  return <>{status === 'submitted' ? 'Submitted. Changes sync automatically.' : 'Your draft is saved automatically.'}</>
}

const BrandRow = memo(function BrandRow({ id, name, cell, avg, symbol, variancePct, disabled, onChange, onEnter }: {
  id: string; name: string; cell: Cell; avg?: number; symbol: string; variancePct: number; disabled: boolean
  onChange: (key: string, c: Cell) => void; onEnter: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const n = Number(cell.price)
  const diff = avg && cell.price && !cell.na ? ((n - avg) / avg) * 100 : 0
  const unusual = Math.abs(diff) > variancePct
  const invalid = cell.price !== '' && !(n > 0) && !cell.na
  return (
    <div className="px-4 py-3 border-t border-line bg-white">
      <div className="flex items-center gap-3">
        <span className="hidden sm:grid place-items-center size-7 rounded-full bg-mint text-brand text-[0.65rem] font-bold shrink-0">{name[0]}</span>
        <span className={cx('flex-1 min-w-0 text-sm font-medium leading-tight line-clamp-2 break-words', cell.na && 'text-muted line-through')}>{name}</span>
        <div className={cx('flex w-36 sm:w-48 rounded-xl border bg-white overflow-hidden transition-shadow focus-within:ring-[3px] focus-within:ring-brand/15 focus-within:border-brand',
          unusual || invalid ? 'border-amber' : 'border-line', (cell.na || disabled) && 'bg-[#f3f4f0]')}>
          <span className="grid place-items-center px-2.5 text-xs font-semibold text-muted bg-[#f3f4f0] border-r border-line">{symbol}</span>
          <input data-price inputMode="decimal" autoComplete="off" placeholder="0.00" aria-label={`${name} price`}
            disabled={disabled || cell.na} value={cell.price} onKeyDown={onEnter}
            onChange={(e) => {
              let v = e.target.value.replace(/[^\d.]/g, '')
              const [a, ...rest] = v.split('.')
              v = rest.length ? `${a.slice(0, 9)}.${rest.join('').slice(0, 2)}` : a.slice(0, 9)
              onChange(id, { price: v, na: false })
            }}
            className="w-full min-w-0 px-3 py-2.5 text-right tabular-nums text-lg bg-transparent outline-none placeholder:text-[#b6c0ba]" />
        </div>
        <button type="button" role="switch" aria-checked={cell.na} aria-label={`${name} not available`} disabled={disabled}
          onClick={() => onChange(id, { price: '', na: !cell.na })}
          className={cx('relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50', cell.na ? 'bg-brand' : 'bg-[#d9ddd6]')}>
          <span className={cx('absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform', cell.na && 'translate-x-5')} />
        </button>
      </div>
      {(unusual || invalid) && (
        <p className="mt-1.5 sm:ml-10 text-xs text-amber-ink flex items-center gap-1.5">
          <Icon name="alert" size={13} />
          {invalid ? 'Enter a price above 0, or mark N/A.' : <>{Math.abs(Math.round(diff))}% {diff > 0 ? 'above' : 'below'} the 30-day average ({symbol} {avg!.toFixed(2)}). Check the shelf tag.</>}
        </p>
      )}
    </div>
  )
})
