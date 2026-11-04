'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { enqueue, getItem, type SalesMap } from '@/lib/offline-db'
import { flushOutbox, requestBackgroundSync, type SyncOutcome } from '@/lib/sync-client'
import { getLastFix } from '@/lib/geo-client'
import type { CompanyCatalog } from '@/lib/sales-core'
import { Icon } from './icons'
import { cx } from './ui'
import { toast } from './toast'

type Sync = 'saved' | 'saving' | 'dirty' | 'offline' | 'error'
const emit = (state: Sync) => { window.dispatchEvent(new CustomEvent('ml-sync', { detail: state })) }
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms) } catch {} }

export function SalesEntry({ userId, date, catalog, initial, symbol, editable }: { userId: string; date: string; catalog: CompanyCatalog; initial: SalesMap; symbol: string; editable: boolean }) {
  const [lines, setLines] = useState<SalesMap>(initial)
  const [brandId, setBrandId] = useState(catalog.brands[0]?.id ?? '')
  const brand = catalog.brands.find((b) => b.id === brandId)
  const [skuId, setSkuId] = useState(brand?.skus[0]?.id ?? '')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [sync, setSyncState] = useState<Sync>('saved')
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const qtyRef = useRef<HTMLInputElement>(null)
  const setSync = useCallback((s: Sync) => { setSyncState(s); emit(s) }, [])

  useEffect(() => { if (brand && !brand.skus.some((k) => k.id === skuId)) setSkuId(brand.skus[0]?.id ?? '') }, [brand, skuId])

  // Overlay unsynced lines from the outbox
  useEffect(() => {
    let alive = true
    getItem(userId, date).then((q) => { if (alive && q?.sales && Object.keys(q.sales).length) { setLines((l) => ({ ...l, ...q.sales })); setSync(navigator.onLine ? 'dirty' : 'offline') } })
    if (!navigator.onLine) setSync('offline')
    return () => { alive = false; emit('saved') }
  }, [userId, date, setSync])

  const flush = useCallback(async () => {
    const q = await getItem(userId, date)
    if (!q || !Object.keys(q.sales ?? {}).length) { setSync('saved'); return }
    if (!navigator.onLine) { setSync('offline'); void requestBackgroundSync(); return }
    setSync('saving')
    const r = await flushOutbox()
    if (!r.reached) { setSync('offline'); void requestBackgroundSync(); return }
    const mine = r.outcomes.find((o: SyncOutcome) => o.date === date)
    if (mine && !mine.ok) { setError(mine.error ?? 'Sync failed'); setSync('error'); return }
    setError(null)
    const left = await getItem(userId, date)
    setSync(left && Object.keys(left.sales ?? {}).length ? 'dirty' : 'saved')
  }, [userId, date, setSync])
  useEffect(() => { if (version === 0) return; const t = setTimeout(() => { void flush() }, 700); return () => clearTimeout(t) }, [version, flush])

  const write = useCallback((patch: SalesMap) => {
    setLines((l) => { const n = { ...l, ...patch }; for (const k of Object.keys(patch)) if (patch[k].quantity <= 0) delete n[k]; return n })
    const f = getLastFix()
    void enqueue(userId, date, {}, undefined, f ? [{ ...f, kind: 'save', capturedAt: new Date().toISOString() }] : [], patch)
    setSync(navigator.onLine ? 'dirty' : 'offline'); setVersion((v) => v + 1)
  }, [userId, date, setSync])

  const add = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Math.floor(Number(qty))
    if (!brand || !skuId || !(n > 0)) { setError('Choose a brand and pack size, then enter the units sold.'); return }
    setError(null)
    const key = `${skuId}:${brandId}`
    const existing = lines[key]
    const total = (existing?.quantity ?? 0) + n
    write({ [key]: { quantity: total, unitPrice: price.trim() ? Number(price).toFixed(2) : existing?.unitPrice ?? null } })
    const sku = brand.skus.find((k) => k.id === skuId)
    toast(`${n} × ${brand.name} ${sku?.label ?? ''} added`, { body: existing ? `Day total for this line: ${total}` : undefined, tone: 'ok', ttl: 2500 })
    setQty(''); buzz(10); qtyRef.current?.focus()
  }

  const rows = useMemo(() => Object.entries(lines).map(([k, v]) => {
    const [sId, bId] = k.split(':'); const b = catalog.brands.find((x) => x.id === bId); const s = b?.skus.find((x) => x.id === sId)
    return { key: k, brand: b?.name ?? 'Brand', sku: s?.label ?? '', code: s?.code ?? '', ...v }
  }).sort((a, b) => a.brand.localeCompare(b.brand) || a.sku.localeCompare(b.sku)), [lines, catalog])
  const units = rows.reduce((n, r) => n + r.quantity, 0)
  const value = rows.reduce((n, r) => n + (r.unitPrice ? r.quantity * Number(r.unitPrice) : 0), 0)
  const priced = rows.every((r) => r.unitPrice)

  if (!catalog.brands.length) return <div className="card p-8 text-center"><h2 className="text-xl font-medium">No company brands set up yet</h2><p className="text-muted text-sm mt-2">Ask your administrator to mark your brands as “Company” under SKUs &amp; Brands.</p></div>

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-forest text-white p-5 grid grid-cols-2 sm:grid-cols-3 gap-3 shadow-pop mb-6" role="status" aria-live="polite">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-brand/30 blur-2xl" aria-hidden />
        <div className="relative"><div className="text-[0.65rem] tracking-[0.14em] uppercase text-white/60">Units today</div><div className="text-3xl font-semibold tabular-nums mt-1">{units}</div></div>
        <div className="relative"><div className="text-[0.65rem] tracking-[0.14em] uppercase text-white/60">Lines</div><div className="text-3xl font-semibold tabular-nums mt-1">{rows.length}</div></div>
        <div className="relative col-span-2 sm:col-span-1 border-t border-white/10 pt-3 sm:border-0 sm:pt-0"><div className="text-[0.65rem] tracking-[0.14em] uppercase text-white/60">Value</div><div className="text-2xl sm:text-xl font-semibold tabular-nums mt-1 sm:mt-2">{priced && rows.length ? `${symbol} ${value.toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : value ? `${symbol} ${value.toLocaleString('en-GH', { minimumFractionDigits: 2 })}+` : '—'}</div></div>
      </div>

      {editable && (
        <form onSubmit={add} className="card p-4 sm:p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Add a sale</h2><span className="text-xs text-muted">Company brands only</span></div>
          <div>
            <span className="block text-sm font-semibold mb-2">Brand</span>
            <div className="flex flex-wrap gap-2">
              {catalog.brands.map((b) => <button type="button" key={b.id} aria-pressed={brandId === b.id} onClick={() => { setBrandId(b.id); buzz(5) }} className={cx('rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors', brandId === b.id ? 'bg-brand text-white border-brand' : 'bg-white border-line text-ink hover:border-brand-soft')}>{b.name}</button>)}
            </div>
          </div>
          <div>
            <span className="block text-sm font-semibold mb-2">Pack size</span>
            <div className="flex flex-wrap gap-2">
              {brand?.skus.map((k) => <button type="button" key={k.id} aria-pressed={skuId === k.id} onClick={() => { setSkuId(k.id); buzz(5); qtyRef.current?.focus() }} className={cx('rounded-xl border px-3 py-2 text-sm font-semibold transition-colors min-w-16', skuId === k.id ? 'bg-ink text-white border-ink' : 'bg-white border-line text-ink hover:border-brand-soft')}>{k.label}</button>)}
            </div>
          </div>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <label className="block"><span className="block text-sm font-semibold mb-1.5">Units sold</span><input ref={qtyRef} className="input text-lg tabular-nums" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, '').slice(0, 7))} enterKeyHint="done" /></label>
            <label className="block"><span className="block text-sm font-semibold mb-1.5">Unit price <span className="text-muted font-normal">(optional)</span></span>
              <div className="flex rounded-xl border border-line overflow-hidden focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/20"><span className="grid place-items-center px-2.5 text-xs font-semibold text-muted bg-surface-2 border-r border-line">{symbol}</span><input className="w-full min-w-0 px-3 py-2.5 text-lg tabular-nums outline-none" inputMode="decimal" placeholder="0.00" value={price} onChange={(e) => { let v = e.target.value.replace(/[^\d.]/g, ''); const [a, ...r] = v.split('.'); v = r.length ? `${a.slice(0, 9)}.${r.join('').slice(0, 2)}` : a.slice(0, 9); setPrice(v) }} /></div></label>
            <button className="btn btn-primary" type="submit"><Icon name="plus" size={16} /> Add</button>
          </div>
          {error && <div role="alert" className="text-sm text-danger bg-danger-soft rounded-xl p-3">{error}</div>}
        </form>
      )}

      <div className="flex items-end justify-between mb-3"><h2 className="text-2xl font-medium">Today’s sales</h2><span className="text-xs text-muted"><SyncText state={sync} editable={editable} /></span></div>
      <div className="card divide-y divide-line pb-0">
        {rows.length === 0 && <div className="py-12 text-center text-sm text-muted">Nothing recorded yet. Add your first sale above.</div>}
        {rows.map((r) => (
          <div key={r.key} className="flex flex-wrap items-center gap-3 p-4">
            <span className="grid place-items-center size-11 rounded-xl bg-mint text-brand-ink text-xs font-bold shrink-0">{r.code}</span>
            <div className="min-w-0 flex-1 basis-40"><div className="font-semibold">{r.brand} <span className="text-muted font-normal whitespace-nowrap">· {r.sku}</span></div><div className="text-xs text-muted">{r.unitPrice ? `${symbol} ${r.unitPrice} each · ${symbol} ${(r.quantity * Number(r.unitPrice)).toFixed(2)}` : 'No unit price'}</div></div>
            {editable ? (
              <div className="flex items-center gap-1 ml-auto">
                <button type="button" className="icon-btn !size-9" aria-label={`Remove one ${r.brand}`} onClick={() => write({ [r.key]: { quantity: r.quantity - 1, unitPrice: r.unitPrice } })}><Icon name="chevronD" size={14} /></button>
                <input aria-label={`${r.brand} ${r.sku} units`} className="w-16 text-center text-lg font-semibold tabular-nums bg-transparent outline-none border-b border-line focus:border-brand" inputMode="numeric" value={r.quantity} onChange={(e) => { const n = Math.floor(Number(e.target.value.replace(/\D/g, '') || 0)); write({ [r.key]: { quantity: n, unitPrice: r.unitPrice } }) }} />
                <button type="button" className="icon-btn !size-9" aria-label={`Add one ${r.brand}`} onClick={() => write({ [r.key]: { quantity: r.quantity + 1, unitPrice: r.unitPrice } })}><Icon name="chevronU" size={14} /></button>
                <button type="button" className="icon-btn !size-9 text-danger" aria-label={`Delete ${r.brand} ${r.sku}`} onClick={() => { if (confirm(`Remove ${r.brand} ${r.sku} from today’s sales?`)) write({ [r.key]: { quantity: 0, unitPrice: r.unitPrice } }) }}><Icon name="x" size={14} /></button>
              </div>
            ) : <span className="text-lg font-semibold tabular-nums">{r.quantity}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function SyncText({ state, editable }: { state: Sync; editable: boolean }) {
  if (!editable) return <>Read-only</>
  if (state === 'offline') return <>Offline. Saved on this phone, syncs automatically.</>
  if (state === 'saving') return <>Saving…</>
  if (state === 'error') return <>Couldn’t sync. We’ll keep retrying.</>
  if (state === 'dirty') return <>Saved on this phone. Syncing…</>
  return <>Saved automatically.</>
}
