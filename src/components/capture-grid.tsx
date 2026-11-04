'use client'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { enqueue, getItem, type Cell, type CellMap } from '@/lib/offline-db'
import { flushOutbox, requestBackgroundSync, type SyncOutcome } from '@/lib/sync-client'
import { getFix, getLastFix } from '@/lib/geo-client'
import { Icon } from './icons'
import { cx } from './ui'
import { toast } from './toast'

export type { Cell, CellMap }
type Sku = { id: string; label: string; code: string; brands: { id: string; name: string }[] }
type Sync = 'saved' | 'saving' | 'dirty' | 'offline' | 'error'

type Props = {
  userId: string
  date: string
  catalog: Sku[]
  initial: CellMap
  /** Last submitted capture for this outlet (any earlier date), for one-tap prefill. */
  previous: CellMap | null
  previousDate: string | null
  averages: Record<string, number>
  symbol: string
  variancePct: number
  status: 'new' | 'draft' | 'submitted'
  editable: boolean
  lockedNote?: string
}

const empty: Cell = { price: '', na: false }
const isFilled = (c?: Cell) => !!c && (c.na || (c.price !== '' && Number(c.price) > 0))
const emit = (state: Sync) => { window.dispatchEvent(new CustomEvent('ml-sync', { detail: state })) }
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms) } catch {} }

export function CaptureGrid({ userId, date, catalog, initial, previous, previousDate, averages, symbol, variancePct, status: initialStatus, editable, lockedNote }: Props) {
  const router = useRouter()
  const [cells, setCells] = useState<CellMap>(initial)
  const [status, setStatus] = useState(initialStatus)
  const [sync, setSyncState] = useState<Sync>('saved')
  const [open, setOpen] = useState<string | null>(catalog[0]?.id ?? null)
  const [version, setVersion] = useState(0)
  const [review, setReview] = useState<null | 'review' | 'submitting' | 'done' | 'queued'>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(cells); latest.current = cells
  const root = useRef<HTMLDivElement>(null)
  const sections = useRef<Record<string, HTMLElement | null>>({})

  const setSync = useCallback((s: Sync) => { setSyncState(s); emit(s) }, [])
  const total = useMemo(() => catalog.reduce((n, k) => n + k.brands.length, 0), [catalog])
  const filled = useMemo(() => catalog.reduce((n, k) => n + k.brands.filter((b) => isFilled(cells[`${k.id}:${b.id}`])).length, 0), [catalog, cells])
  const pct = total ? Math.round((filled / total) * 100) : 0

  // Overlay anything still waiting in the outbox (captured offline, or the app was closed before syncing).
  useEffect(() => {
    if (!editable) return
    let alive = true
    getItem(userId, date).then((q) => {
      if (!alive || !q) return
      if (Object.keys(q.cells).length) { setCells((c) => ({ ...c, ...q.cells })); setVersion((v) => v + 1) }
      setSync(navigator.onLine ? 'dirty' : 'offline')
      if (q.submit) setReview('queued')
    })
    if (!navigator.onLine) setSync('offline')
    return () => { alive = false; emit('saved') }
  }, [editable, userId, date, setSync])

  const flush = useCallback(async (): Promise<SyncOutcome | null> => {
    const q = await getItem(userId, date)
    if (!q) { setSync('saved'); return { date, ok: true } }
    if (!navigator.onLine) { setSync('offline'); void requestBackgroundSync(); return null }
    setSync('saving')
    const r = await flushOutbox()
    if (!r.reached) { setSync('offline'); void requestBackgroundSync(); return null }
    const mine = r.outcomes.find((o) => o.date === date) ?? null
    if (mine && !mine.ok) { setError(mine.error ?? 'Sync failed'); setSync('error'); return mine }
    setError(null)
    if (mine?.status && status === 'new') setStatus('draft')
    const left = await getItem(userId, date)
    setSync(left && Object.keys(left.cells).length ? 'dirty' : 'saved')
    return mine
  }, [userId, date, setSync, status])

  // Debounced autosave after edits
  useEffect(() => {
    if (!editable || version === 0) return
    const t = setTimeout(() => { void flush() }, 800)
    return () => clearTimeout(t)
  }, [version, editable, flush])

  // Background sync completed elsewhere (service worker / SyncManager)
  useEffect(() => {
    const on = (e: Event) => {
      const outcomes = (e as CustomEvent<SyncOutcome[]>).detail ?? []
      const mine = outcomes.find((o) => o.date === date)
      if (!mine) return
      if (mine.ok) { setSync('saved'); setError(null); if (mine.submitted) { setStatus('submitted'); setReview((r) => (r === 'queued' ? 'done' : r)); router.refresh() } }
      else if (mine.permanent) { setError(mine.error ?? null); setReview((r) => (r === 'queued' ? 'review' : r)) }
    }
    window.addEventListener('ml-synced', on)
    return () => window.removeEventListener('ml-synced', on)
  }, [date, router, setSync])

  const lastSavePing = useRef(0)
  const change = useCallback((key: string, next: Cell) => {
    setCells((c) => ({ ...c, [key]: next }))
    latest.current = { ...latest.current, [key]: next }
    // Attach a location to edits at most once a minute so the trail shows where prices were typed.
    const f = getLastFix(); const now = Date.now()
    const pings = f && now - lastSavePing.current > 60_000 ? [{ ...f, kind: 'save' as const, capturedAt: new Date().toISOString() }] : []
    if (pings.length) lastSavePing.current = now
    void enqueue(userId, date, { [key]: next }, undefined, pings)
    setSync(navigator.onLine ? 'dirty' : 'offline')
    setVersion((v) => v + 1)
  }, [userId, date, setSync])

  const prefill = useCallback(() => {
    if (!previous) return
    const patch: CellMap = {}
    for (const k of catalog) for (const b of k.brands) {
      const key = `${k.id}:${b.id}`
      if (!isFilled(latest.current[key]) && isFilled(previous[key])) patch[key] = previous[key]
    }
    const n = Object.keys(patch).length
    if (!n) { toast('Nothing to prefill', { body: 'Every brand already has a value.', tone: 'info' }); return }
    setCells((c) => ({ ...c, ...patch })); latest.current = { ...latest.current, ...patch }
    void enqueue(userId, date, patch)
    setSync(navigator.onLine ? 'dirty' : 'offline'); setVersion((v) => v + 1); buzz(12)
    toast(`${n} price${n === 1 ? '' : 's'} copied from your last capture`, { body: 'Check each shelf tag and change anything that moved.', tone: 'info' })
  }, [previous, catalog, userId, date, setSync])

  const doSubmit = useCallback(async () => {
    setReview('submitting'); setError(null)
    const f = await getFix(8_000)   // fresh fix for the geofence check; falls back to the last known one
    await enqueue(userId, date, {}, true, f ? [{ ...f, kind: 'submit' }] : [])
    const r = await flush()
    if (r === null) { setReview('queued'); return }
    if (!r.ok) { setReview('review'); return }
    if (r.submitted) { setStatus('submitted'); setReview('done'); buzz(20); router.refresh() }
    else setReview('queued')
  }, [userId, date, flush, router])

  const onEnter = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const inputs = Array.from(root.current?.querySelectorAll<HTMLInputElement>('input[data-price]:not(:disabled)') ?? [])
    const i = inputs.indexOf(e.currentTarget)
    inputs[i + 1]?.focus()
  }, [])

  const goNext = useCallback((id: string) => {
    const i = catalog.findIndex((k) => k.id === id)
    const next = catalog[i + 1]
    setOpen(next?.id ?? null)
    if (next) setTimeout(() => sections.current[next.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [catalog])

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
      <div className="relative overflow-hidden rounded-2xl bg-forest text-white p-5 flex items-center gap-5 shadow-pop mb-6" role="status" aria-live="polite">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-brand/30 blur-2xl" aria-hidden />
        <div className="shrink-0 relative">
          <div className="text-[0.65rem] tracking-[0.14em] uppercase text-white/60">Capture progress</div>
          <div className="mt-1"><span className="text-3xl font-semibold tabular-nums">{filled}</span> <span className="text-sm text-white/70">of {total} prices</span></div>
        </div>
        <div className="flex-1 h-2.5 rounded-full bg-white/15 overflow-hidden min-w-12 relative">
          <div className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
        <div className="text-3xl font-semibold tabular-nums w-16 text-right relative">{pct}%</div>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-2xl font-medium">Price grid</h2>
          <p className="text-sm text-muted mt-1">Tap a pack size to enter the shelf prices you can see.</p>
        </div>
        {editable && previous && (
          <button type="button" onClick={prefill} className="btn btn-outline btn-sm" title={previousDate ? `From ${previousDate}` : undefined}>
            <Icon name="copy" size={14} /> Prefill from last capture
          </button>
        )}
      </div>

      {!editable && (
        <div className="flex gap-2 items-start rounded-xl bg-amber-soft text-amber-ink text-sm p-3 mb-4">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0" /> <span>{lockedNote ?? 'This entry is read-only.'}</span>
        </div>
      )}
      {error && <div role="alert" className="flex gap-2 rounded-xl bg-danger-soft text-danger text-sm p-3 mb-4"><Icon name="alert" size={16} className="mt-0.5" />{error}</div>}

      <div className="space-y-3 pb-32">
        {catalog.map((k, idx) => {
          const done = k.brands.filter((b) => isFilled(cells[`${k.id}:${b.id}`])).length
          const isOpen = open === k.id
          const complete = done === k.brands.length
          return (
            <section key={k.id} ref={(el) => { sections.current[k.id] = el }} className={cx('card overflow-hidden transition-colors scroll-mt-24', isOpen && 'border-brand-soft')}>
              <button type="button" onClick={() => { setOpen(isOpen ? null : k.id); buzz(5) }} aria-expanded={isOpen}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-[#fbfaf7] transition-colors">
                <span className={cx('grid place-items-center size-12 rounded-xl text-xs font-bold shrink-0 transition-colors', complete ? 'bg-brand text-white' : 'bg-mint text-brand-ink')}>{complete ? <Icon name="check" size={20} /> : k.code}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold">{k.label}</span>
                  <span className="block text-xs text-muted">{k.brands.length} brands</span>
                </span>
                <span className={cx('rounded-full px-2.5 py-1 text-xs font-bold tabular-nums', complete ? 'bg-success-soft text-success' : 'bg-surface-2 text-muted')}>{done}/{k.brands.length}</span>
                <Icon name="chevronD" className={cx('text-ink transition-transform duration-200', isOpen && 'rotate-180')} />
              </button>
              <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                <div className="overflow-hidden">
                  <div className="border-t border-line bg-[#fbfaf7] px-4 py-2 flex th"><span className="flex-1">Brand</span><span className="w-36 sm:w-48">Shelf price</span><span className="w-12 text-center">N/A</span></div>
                  {isOpen && k.brands.map((b) => {
                    const key = `${k.id}:${b.id}`
                    return <BrandRow key={key} id={key} name={b.name} cell={cells[key] ?? empty} avg={averages[key]} symbol={symbol}
                      variancePct={variancePct} disabled={!editable} onChange={change} onEnter={onEnter} />
                  })}
                  {isOpen && editable && (
                    <div className="border-t border-line bg-[#fbfaf7] px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-xs text-muted">{complete ? 'All brands captured.' : `${k.brands.length - done} left in this pack size.`}</span>
                      {idx < catalog.length - 1
                        ? <button type="button" className="btn btn-sm btn-dark" onClick={() => goNext(k.id)}>Next: {catalog[idx + 1].label} <Icon name="arrowR" size={14} /></button>
                        : <button type="button" className="btn btn-sm btn-primary" onClick={() => { setError(null); setReview('review') }} disabled={filled === 0}>Review all <Icon name="arrowR" size={14} /></button>}
                    </div>
                  )}
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
          <div className="slide-up sm:pop bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-6 max-h-[88dvh] overflow-y-auto safe-b">
            <div className="sm:hidden mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" aria-hidden />
            {review === 'done' || review === 'queued' ? (
              <div className="text-center py-6">
                <div className={cx('mx-auto mb-4 grid place-items-center size-16 rounded-full', review === 'done' ? 'bg-success-soft text-success' : 'bg-mint text-brand-ink')}><Icon name={review === 'done' ? 'check' : 'cloudOff'} size={30} /></div>
                <h3 className="text-2xl font-medium">{review === 'done' ? 'Prices submitted' : 'Saved. Waiting for signal'}</h3>
                <p className="text-muted text-sm mt-2">{review === 'done' ? 'Thank you. Your administrator can now see these prices.' : 'Your submission is stored on this phone and will be delivered automatically the moment you have a connection, even if the app is closed.'}</p>
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
  if (state === 'offline') return <>Offline. Saved on this phone, syncs automatically.</>
  if (state === 'saving') return <>Saving…</>
  if (state === 'error') return <>Couldn’t sync. We’ll keep retrying.</>
  if (state === 'dirty') return <>Saved on this phone. Syncing…</>
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
  const filled = isFilled(cell)
  return (
    <div className={cx('px-4 py-3 border-t border-line transition-colors', filled ? 'bg-white' : 'bg-white')}>
      <div className="flex items-center gap-3">
        <span className={cx('hidden sm:grid place-items-center size-7 rounded-full text-[0.65rem] font-bold shrink-0 transition-colors', filled ? 'bg-brand text-white' : 'bg-mint text-brand-ink')}>{filled && !cell.na ? <Icon name="check" size={12} /> : name[0]}</span>
        <span className={cx('flex-1 min-w-0 text-sm font-medium leading-tight line-clamp-2 break-words', cell.na && 'text-muted line-through')}>{name}</span>
        <div className={cx('flex w-36 sm:w-48 rounded-xl border bg-white overflow-hidden transition-shadow focus-within:ring-[3px] focus-within:ring-brand/20 focus-within:border-brand',
          unusual || invalid ? 'border-amber' : 'border-line', (cell.na || disabled) && 'bg-surface-2')}>
          <span className="grid place-items-center px-2.5 text-xs font-semibold text-muted bg-surface-2 border-r border-line">{symbol}</span>
          <input data-price inputMode="decimal" autoComplete="off" enterKeyHint="next" placeholder="0.00" aria-label={`${name} price`}
            disabled={disabled || cell.na} value={cell.price} onKeyDown={onEnter}
            onChange={(e) => {
              let v = e.target.value.replace(/[^\d.]/g, '')
              const [a, ...rest] = v.split('.')
              v = rest.length ? `${a.slice(0, 9)}.${rest.join('').slice(0, 2)}` : a.slice(0, 9)
              onChange(id, { price: v, na: false })
            }}
            className="w-full min-w-0 px-3 py-2.5 text-right tabular-nums text-lg bg-transparent outline-none placeholder:text-[#c3beb5]" />
        </div>
        <button type="button" role="switch" aria-checked={cell.na} aria-label={`${name} not available`} disabled={disabled}
          onClick={() => { onChange(id, { price: '', na: !cell.na }); buzz() }}
          className={cx('relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50', cell.na ? 'bg-ink' : 'bg-[#dcd8d0]')}>
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
