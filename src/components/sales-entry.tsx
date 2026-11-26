'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { enqueue, getItem, dropLocalSale, type ReceiptBlob, type SaleTxLocal } from '@/lib/offline-db'
import { flushOutbox, requestBackgroundSync, type SyncOutcome } from '@/lib/sync-client'
import { getLastFix } from '@/lib/geo-client'
import { updateSaleAction, deleteSaleAction } from '@/actions/capture'
import type { CompanyCatalog, DaySale } from '@/lib/sales-core'
import { compressImage } from './receipt-capture'
import { Icon } from './icons'
import { cx } from './ui'
import { toast } from './toast'

type Sync = 'saved' | 'saving' | 'dirty' | 'offline' | 'error'
const emit = (state: Sync) => { window.dispatchEvent(new CustomEvent('ml-sync', { detail: state })) }
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms) } catch {} }
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

type Row = { key: string; id: string | null; clientId: string | null; skuId: string; brandId: string; quantity: number; unitPrice: string | null; capturedAt: string; receiptSrc: string | null; pending: boolean }
type ServerSale = Omit<DaySale, 'capturedAt'> & { capturedAt: string | null }

export function SalesEntry({ userId, date, catalog, initial, symbol, editable, requireReceipt }: { userId: string; date: string; catalog: CompanyCatalog; initial: ServerSale[]; symbol: string; editable: boolean; requireReceipt: boolean }) {
  const router = useRouter()
  const [server, setServer] = useState(initial)
  const [local, setLocal] = useState<SaleTxLocal[]>([])
  const [brandId, setBrandId] = useState(catalog.brands[0]?.id ?? '')
  const brand = catalog.brands.find((b) => b.id === brandId)
  const [skuId, setSkuId] = useState(brand?.skus[0]?.id ?? '')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [receipt, setReceipt] = useState<ReceiptBlob | null>(null)
  const [busy, setBusy] = useState(false)
  const [sync, setSyncState] = useState<Sync>('saved')
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<string | null>(null)
  const qtyRef = useRef<HTMLInputElement>(null), cam = useRef<HTMLInputElement>(null), gal = useRef<HTMLInputElement>(null)
  const setSync = useCallback((s: Sync) => { setSyncState(s); emit(s) }, [])

  useEffect(() => { setServer(initial) }, [initial])
  useEffect(() => { if (brand && !brand.skus.some((k) => k.id === skuId)) setSkuId(brand.skus[0]?.id ?? '') }, [brand, skuId])

  const reloadLocal = useCallback(async () => { const q = await getItem(userId, date); setLocal(q?.sales ?? []); return q?.sales ?? [] }, [userId, date])
  useEffect(() => {
    let alive = true
    reloadLocal().then((l) => { if (alive && l.length) setSync(navigator.onLine ? 'dirty' : 'offline') })
    if (!navigator.onLine) setSync('offline')
    const synced = () => { router.refresh(); setTimeout(() => { if (alive) void reloadLocal().then((l) => setSync(l.length ? 'dirty' : 'saved')) }, 1200) }
    window.addEventListener('ml-synced', synced)
    return () => { alive = false; window.removeEventListener('ml-synced', synced); emit('saved') }
  }, [reloadLocal, router, setSync])

  const flush = useCallback(async () => {
    const q = await getItem(userId, date)
    if (!q?.sales?.length) { setSync('saved'); return }
    if (!navigator.onLine) { setSync('offline'); void requestBackgroundSync(); return }
    setSync('saving')
    const r = await flushOutbox()
    if (!r.reached) { setSync('offline'); void requestBackgroundSync(); return }
    const mine = r.outcomes.find((o: SyncOutcome) => o.date === date)
    if (mine && !mine.ok) { setError(mine.error ?? 'Sync failed'); setSync('error'); if (mine.permanent) void reloadLocal(); return }
    setError(null)
  }, [userId, date, setSync, reloadLocal])

  const onPhoto = async (files: FileList | null) => {
    const f = files?.[0]; if (!f) return
    if (!f.type.startsWith('image/')) { toast('Only photos can be attached', { tone: 'warn' }); return }
    setBusy(true)
    try { setReceipt(await compressImage(f)); buzz(10) } catch { toast('That image could not be read', { tone: 'warn' }) }
    setBusy(false)
    if (cam.current) cam.current.value = ''; if (gal.current) gal.current.value = ''
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = Math.floor(Number(qty))
    if (!brand || !skuId || !(n > 0)) { setError('Choose a brand and pack size, then enter the units sold.'); return }
    if (requireReceipt && !receipt) { setError('Take a photo of the receipt or invoice for this sale.'); return }
    setError(null)
    const tx: SaleTxLocal = { clientId: newId(), skuId, brandId, quantity: n, unitPrice: price.trim() ? Number(price).toFixed(2) : null, capturedAt: new Date().toISOString(), receipt }
    const f = getLastFix()
    await enqueue(userId, date, {}, undefined, f ? [{ ...f, kind: 'save', capturedAt: new Date().toISOString() }] : [], [tx])
    setLocal((l) => [...l, tx]); setSync(navigator.onLine ? 'dirty' : 'offline')
    const sku = brand.skus.find((k) => k.id === skuId)
    toast(`${n} × ${brand.name} ${sku?.label ?? ''} recorded`, { body: navigator.onLine ? 'Uploading with its receipt…' : 'Saved on this phone. Uploads when you have signal.', ttl: 2500 })
    setQty(''); setReceipt(null); buzz(10); qtyRef.current?.focus()
    void flush()
  }

  const rows = useMemo<Row[]>(() => {
    const s = server.map((r) => ({ key: r.id, id: r.id, clientId: r.clientId, skuId: r.skuId, brandId: r.brandId, quantity: r.quantity, unitPrice: r.unitPrice, capturedAt: r.capturedAt ?? '', receiptSrc: r.receiptId ? `/api/receipts/${r.receiptId}` : null, pending: false }))
    const l = local.filter((t) => !server.some((r) => r.clientId === t.clientId)).map((t) => ({ key: t.clientId, id: null, clientId: t.clientId, skuId: t.skuId, brandId: t.brandId, quantity: t.quantity, unitPrice: t.unitPrice, capturedAt: t.capturedAt, receiptSrc: t.receipt ? `data:${t.receipt.mime};base64,${t.receipt.data}` : null, pending: true }))
    return [...s, ...l].sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1))
  }, [server, local])
  const name = (r: Row) => { const b = catalog.brands.find((x) => x.id === r.brandId); const k = b?.skus.find((x) => x.id === r.skuId); return { brand: b?.name ?? 'Brand', sku: k?.label ?? '', code: k?.code ?? '' } }

  useEffect(() => {
    const byBrand: Record<string, number> = {}
    for (const r of rows) byBrand[r.brandId] = (byBrand[r.brandId] ?? 0) + r.quantity
    window.dispatchEvent(new CustomEvent('ml-sales-today', { detail: byBrand }))
  }, [rows])

  const units = rows.reduce((n, r) => n + r.quantity, 0)
  const value = rows.reduce((n, r) => n + (r.unitPrice ? r.quantity * Number(r.unitPrice) : 0), 0)
  const priced = rows.length > 0 && rows.every((r) => r.unitPrice)

  const changeQty = async (r: Row, q: number) => {
    if (!(q > 0)) return
    if (r.pending) { toast('Wait for this sale to upload before changing it', { tone: 'info' }); return }
    const res = await updateSaleAction({ id: r.id!, quantity: q })
    if (res.ok) { setServer((s) => s.map((x) => (x.id === r.id ? { ...x, quantity: q } : x))); buzz(5) } else toast('Could not update', { body: res.error, tone: 'error' })
  }
  const remove = async (r: Row) => {
    const { brand: b, sku } = name(r)
    if (!confirm(`Remove ${r.quantity} × ${b} ${sku}? The receipt is removed too.`)) return
    if (r.pending) { await dropLocalSale(userId, date, r.clientId!); setLocal((l) => l.filter((t) => t.clientId !== r.clientId)); toast('Sale removed'); return }
    const res = await deleteSaleAction({ id: r.id! })
    if (res.ok) { setServer((s) => s.filter((x) => x.id !== r.id)); toast('Sale removed') } else toast('Could not remove', { body: res.error, tone: 'error' })
  }

  if (!catalog.brands.length) return <div className="card p-8 text-center"><h2 className="text-xl font-medium">No company brands set up yet</h2><p className="text-muted text-sm mt-2">Ask your administrator to mark your brands as “Company” under SKUs &amp; Brands.</p></div>

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl bg-forest text-white p-5 grid grid-cols-2 sm:grid-cols-3 gap-3 shadow-pop mb-6" role="status" aria-live="polite">
        <div className="absolute -right-10 -top-10 size-40 rounded-full bg-brand/30 blur-2xl" aria-hidden />
        <div className="relative"><div className="text-[0.65rem] tracking-[0.14em] uppercase text-white/60">Units today</div><div className="text-3xl font-semibold tabular-nums mt-1">{units}</div></div>
        <div className="relative"><div className="text-[0.65rem] tracking-[0.14em] uppercase text-white/60">Sales</div><div className="text-3xl font-semibold tabular-nums mt-1">{rows.length}</div></div>
        <div className="relative col-span-2 sm:col-span-1 border-t border-white/10 pt-3 sm:border-0 sm:pt-0"><div className="text-[0.65rem] tracking-[0.14em] uppercase text-white/60">Value</div><div className="text-2xl sm:text-xl font-semibold tabular-nums mt-1 sm:mt-2">{priced ? `${symbol} ${value.toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : value ? `${symbol} ${value.toLocaleString('en-GH', { minimumFractionDigits: 2 })}+` : '—'}</div></div>
      </div>

      {editable && (
        <form onSubmit={add} className="card p-4 sm:p-5 mb-6 space-y-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Record a sale</h2><span className="text-xs text-muted">Company brands only</span></div>
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
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="block text-sm font-semibold mb-1.5">Units sold</span><input ref={qtyRef} className="input text-lg tabular-nums" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, '').slice(0, 7))} enterKeyHint="done" /></label>
            <label className="block"><span className="block text-sm font-semibold mb-1.5">Unit price <span className="text-muted font-normal">(optional)</span></span>
              <div className="flex rounded-xl border border-line overflow-hidden focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/20"><span className="grid place-items-center px-2.5 text-xs font-semibold text-muted bg-surface-2 border-r border-line">{symbol}</span><input className="w-full min-w-0 px-3 py-2.5 text-lg tabular-nums outline-none" inputMode="decimal" placeholder="0.00" value={price} onChange={(e) => { let v = e.target.value.replace(/[^\d.]/g, ''); const [a, ...r] = v.split('.'); v = r.length ? `${a.slice(0, 9)}.${r.join('').slice(0, 2)}` : a.slice(0, 9); setPrice(v) }} /></div></label>
          </div>

          <div className={cx('rounded-xl border p-3', receipt ? 'border-success bg-success-soft/40' : requireReceipt ? 'border-brand-soft bg-mint/40' : 'border-line')}>
            <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files)} />
            <input ref={gal} type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files)} />
            <div className="flex items-center gap-3">
              {receipt
                // eslint-disable-next-line @next/next/no-img-element
                ? <button type="button" onClick={() => setView(`data:${receipt.mime};base64,${receipt.data}`)} className="size-16 rounded-lg overflow-hidden border border-line shrink-0"><img src={`data:${receipt.mime};base64,${receipt.data}`} alt="Receipt preview" className="w-full h-full object-cover" /></button>
                : <span className="grid place-items-center size-16 rounded-lg bg-white border border-dashed border-line text-muted shrink-0"><Icon name="receipt" size={22} /></span>}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{receipt ? 'Receipt attached' : `Receipt / invoice${requireReceipt ? ' (required)' : ''}`}</div>
                <div className="text-xs text-muted">{receipt ? `${Math.round(receipt.bytes / 1024)} KB · tap to view` : 'Photograph the receipt for this sale.'}</div>
              </div>
              <div className="flex flex-col gap-1.5">
                <button type="button" className="btn btn-dark btn-sm" disabled={busy} onClick={() => cam.current?.click()}><Icon name="camera" size={14} /> {busy ? '…' : receipt ? 'Retake' : 'Photo'}</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => gal.current?.click()}><Icon name="upload" size={14} /> Gallery</button>
              </div>
            </div>
          </div>

          {error && <div role="alert" className="text-sm text-danger bg-danger-soft rounded-xl p-3">{error}</div>}
          <button className="btn btn-primary w-full" type="submit" disabled={busy}><Icon name="plus" size={16} /> Add sale{receipt ? ' with receipt' : ''}</button>
        </form>
      )}

      <div className="flex items-end justify-between mb-3"><h2 className="text-2xl font-medium">Today’s sales</h2><span className="text-xs text-muted"><SyncText state={sync} editable={editable} /></span></div>
      <ul className="card divide-y divide-line">
        {rows.length === 0 && <li className="py-12 text-center text-sm text-muted">Nothing recorded yet. Record your first sale above.</li>}
        {rows.map((r) => { const { brand: b, sku, code } = name(r); return (
          <li key={r.key} className="flex items-center gap-3 p-3 sm:p-4">
            {r.receiptSrc
              // eslint-disable-next-line @next/next/no-img-element
              ? <button type="button" onClick={() => setView(r.receiptSrc)} className="relative size-14 rounded-lg overflow-hidden border border-line shrink-0" aria-label="View receipt"><img src={r.receiptSrc} alt="" className="w-full h-full object-cover" loading="lazy" />{r.pending && <span className="absolute inset-x-0 bottom-0 bg-amber text-white text-[0.55rem] text-center font-semibold">uploading</span>}</button>
              : <span className="grid place-items-center size-14 rounded-lg bg-mint text-brand-ink text-xs font-bold shrink-0">{code}</span>}
            <div className="min-w-0 flex-1">
              <div className="font-semibold leading-tight">{b} <span className="text-muted font-normal whitespace-nowrap">· {sku}</span></div>
              <div className="text-xs text-muted">{r.capturedAt ? new Date(r.capturedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}{r.unitPrice ? ` · ${symbol} ${r.unitPrice} each · ${symbol} ${(r.quantity * Number(r.unitPrice)).toFixed(2)}` : ''}{!r.receiptSrc ? ' · no receipt' : ''}</div>
            </div>
            {editable ? (
              <div className="flex items-center gap-0.5">
                <button type="button" className="icon-btn !size-8" aria-label="Remove one" onClick={() => changeQty(r, r.quantity - 1)}><Icon name="chevronD" size={13} /></button>
                <span className="w-10 text-center text-lg font-semibold tabular-nums">{r.quantity}</span>
                <button type="button" className="icon-btn !size-8" aria-label="Add one" onClick={() => changeQty(r, r.quantity + 1)}><Icon name="chevronU" size={13} /></button>
                <button type="button" className="icon-btn !size-8 text-danger ml-1" aria-label={`Delete ${b} ${sku}`} onClick={() => remove(r)}><Icon name="x" size={13} /></button>
              </div>
            ) : <span className="text-lg font-semibold tabular-nums">{r.quantity}</span>}
          </li>
        ) })}
      </ul>

      {view && (
        <div className="fixed inset-0 z-[80] bg-black/90 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Receipt" onClick={() => setView(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view} alt="Receipt" className="max-h-full max-w-full rounded-lg shadow-pop" />
          <button className="absolute top-4 right-4 icon-btn" aria-label="Close" onClick={() => setView(null)}><Icon name="x" /></button>
        </div>
      )}
    </div>
  )
}

function SyncText({ state, editable }: { state: Sync; editable: boolean }) {
  if (!editable) return <>Read-only</>
  if (state === 'offline') return <>Offline. Saved on this phone, uploads automatically.</>
  if (state === 'saving') return <>Uploading…</>
  if (state === 'error') return <>Couldn’t sync. We’ll keep retrying.</>
  if (state === 'dirty') return <>Saved on this phone. Uploading…</>
  return <>All sales uploaded.</>
}
