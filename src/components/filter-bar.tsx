'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Icon } from './icons'
import { cx } from './ui'

type Opt = { id: string; name: string }
export type FilterFields = { outlet?: Opt[]; sku?: Opt[]; brand?: (Opt & { skuId?: string })[]; status?: boolean }

export function useParams() {
  const router = useRouter(), path = usePathname(), sp = useSearchParams()
  const [pending, start] = useTransition()
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k)
    if (!('page' in patch)) next.delete('page')
    start(() => router.replace(`${path}${next.size ? `?${next}` : ''}`, { scroll: false }))
  }
  const clear = () => start(() => router.replace(path, { scroll: false }))
  return { sp, set, clear, pending }
}

const sel = 'appearance-none bg-transparent pr-7 pl-3 py-2.5 text-sm min-h-11 outline-none cursor-pointer max-w-44 truncate'

export function FilterBar({ fields, defaults }: { fields: FilterFields; defaults: { from: string; to: string } }) {
  const { sp, set, clear, pending } = useParams()
  const from = sp.get('from') ?? defaults.from, to = sp.get('to') ?? defaults.to
  const skuSel = sp.get('sku') ?? ''
  const brandOpts = (fields.brand ?? []).filter((b) => !skuSel || b.skuId === skuSel)
  const dedup = [...new Map(brandOpts.map((b) => [b.id, b])).values()]
  const Select = ({ k, label, opts }: { k: string; label: string; opts: Opt[] }) => (
    <div className="relative border-l border-line first:border-0">
      <select aria-label={label} className={sel} value={sp.get(k) ?? ''} onChange={(e) => set({ [k]: e.target.value || null, ...(k === 'sku' ? { brand: null } : {}) })}>
        <option value="">All {label.toLowerCase()}s</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <Icon name="chevronD" size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-ink" />
    </div>
  )
  return (
    <div className={cx('card mb-6 flex flex-wrap items-center gap-x-1 gap-y-2 p-2 transition-opacity', pending && 'opacity-60')}>
      <div className="flex items-center gap-2 pl-3 pr-2 text-sm font-medium">
        <Icon name="calendar" size={16} className="text-brand" />
        <input type="date" aria-label="From" className="bg-transparent outline-none min-h-11 text-sm w-[8.2rem]" value={from} max={to} onChange={(e) => e.target.value && set({ from: e.target.value })} />
        <span className="text-muted">to</span>
        <input type="date" aria-label="To" className="bg-transparent outline-none min-h-11 text-sm w-[8.2rem]" value={to} min={from} onChange={(e) => e.target.value && set({ to: e.target.value })} />
      </div>
      {fields.outlet && <Select k="outlet" label="Outlet" opts={fields.outlet} />}
      {fields.sku && <Select k="sku" label="SKU" opts={fields.sku} />}
      {fields.brand && <Select k="brand" label="Brand" opts={dedup} />}
      {fields.status && (
        <div className="relative border-l border-line">
          <select aria-label="Status" className={sel} value={sp.get('status') ?? ''} onChange={(e) => set({ status: e.target.value || null })}>
            <option value="">All statuses</option><option value="submitted">Submitted</option><option value="draft">Draft</option>
          </select>
          <Icon name="chevronD" size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      )}
      <button onClick={clear} className="ml-auto px-3 py-2 text-sm font-semibold text-brand hover:underline">Clear</button>
    </div>
  )
}

export function SearchBox({ placeholder, param = 'q' }: { placeholder: string; param?: string }) {
  const { sp, set } = useParams()
  const [v, setV] = useState(sp.get(param) ?? '')
  useEffect(() => { setV(sp.get(param) ?? '') }, [sp, param])
  useEffect(() => {
    if (v === (sp.get(param) ?? '')) return
    const t = setTimeout(() => set({ [param]: v.trim() || null }), 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v])
  return (
    <div className="relative flex-1 max-w-md">
      <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input className="input pl-10" type="search" placeholder={placeholder} aria-label={placeholder} value={v} onChange={(e) => setV(e.target.value)} />
    </div>
  )
}
