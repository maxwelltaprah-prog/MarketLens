'use client'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminSavePricesAction, setEntryStateAction } from '@/actions/admin'
import { Icon } from './icons'
import { cx } from './ui'

type Cell = { price: string; na: boolean }
type Sku = { id: string; label: string; code: string; brands: { id: string; name: string }[] }

export function AdminEntryEditor({ entryId, catalog, initial, symbol, locked, status }: {
  entryId: string; catalog: Sku[]; initial: Record<string, Cell>; symbol: string; locked: boolean; status: 'draft' | 'submitted'
}) {
  const router = useRouter()
  const [cells, setCells] = useState(initial)
  const changed = useRef<Set<string>>(new Set())
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, start] = useTransition()
  const [version, setVersion] = useState(0)
  const dirtyCount = useMemo(() => changed.current.size, [version]) // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (key: string, c: Cell) => { setCells((p) => ({ ...p, [key]: c })); changed.current.add(key); setVersion((v) => v + 1); setMsg(null) }
  const save = () => start(async () => {
    const payload = Object.fromEntries([...changed.current].map((k) => [k, cells[k] ?? { price: '', na: false }]))
    const r = await adminSavePricesAction({ entryId, cells: payload })
    if (r.ok) { changed.current.clear(); setVersion((v) => v + 1); setMsg({ ok: true, text: `Saved ${r.changed} correction${r.changed === 1 ? '' : 's'}.` }); router.refresh() }
    else setMsg({ ok: false, text: r.error })
  })
  const op = (o: 'lock' | 'unlock' | 'reopen') => {
    if (o === 'reopen' && !confirm('Return this entry to draft so the promoter can edit and resubmit?')) return
    start(async () => { const r = await setEntryStateAction({ entryId, op: o }); setMsg(r.ok ? { ok: true, text: 'Updated.' } : { ok: false, text: r.error }); router.refresh() })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {locked ? <button className="btn btn-outline" disabled={pending} onClick={() => op('unlock')}><Icon name="lock" size={16} /> Unlock entry</button>
          : <button className="btn btn-outline" disabled={pending || status !== 'submitted'} onClick={() => op('lock')}><Icon name="lock" size={16} /> Lock entry</button>}
        {status === 'submitted' && <button className="btn btn-ghost" disabled={pending} onClick={() => op('reopen')}>Return to draft</button>}
        <div className="ml-auto flex items-center gap-3">
          {msg && <span role="status" className={cx('text-sm font-medium', msg.ok ? 'text-brand' : 'text-danger')}>{msg.text}</span>}
          <button className="btn btn-primary" disabled={pending || dirtyCount === 0} onClick={save}>{pending ? 'Saving…' : `Save corrections${dirtyCount ? ` (${dirtyCount})` : ''}`}</button>
        </div>
      </div>
      <div className="space-y-3">
        {catalog.map((k, idx) => (
          <details key={k.id} open={idx === 0} className="card group overflow-hidden">
            <summary className="flex items-center gap-4 p-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-[#fafbf8]">
              <span className="grid place-items-center size-11 rounded-xl bg-mint text-brand text-xs font-bold">{k.code}</span>
              <span className="flex-1 font-semibold">{k.label}<span className="block text-xs font-normal text-muted">{k.brands.filter((b) => { const c = cells[`${k.id}:${b.id}`]; return c && (c.na || c.price) }).length} of {k.brands.length} captured</span></span>
              <Icon name="chevronD" className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="divide-y divide-line border-t border-line">
              {k.brands.map((b) => {
                const key = `${k.id}:${b.id}`, c = cells[key] ?? { price: '', na: false }
                return (
                  <div key={key} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={cx('flex-1 text-sm font-medium truncate', c.na && 'text-muted line-through')}>{b.name}</span>
                    <div className="flex w-40 rounded-xl border border-line overflow-hidden focus-within:border-brand focus-within:ring-[3px] focus-within:ring-brand/15">
                      <span className="grid place-items-center px-2.5 text-xs font-semibold text-muted bg-[#f3f4f0] border-r border-line">{symbol}</span>
                      <input inputMode="decimal" aria-label={`${b.name} price`} value={c.price} disabled={c.na} placeholder="0.00"
                        onChange={(e) => { let v = e.target.value.replace(/[^\d.]/g, ''); const [a, ...r] = v.split('.'); v = r.length ? `${a.slice(0, 9)}.${r.join('').slice(0, 2)}` : a.slice(0, 9); edit(key, { price: v, na: false }) }}
                        className="w-full min-w-0 px-3 py-2 text-right tabular-nums bg-transparent outline-none disabled:bg-[#f3f4f0]" />
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-muted w-14 cursor-pointer"><input type="checkbox" className="size-4 accent-[#14603f]" checked={c.na} onChange={(e) => edit(key, { price: '', na: e.target.checked })} />N/A</label>
                  </div>
                )
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
