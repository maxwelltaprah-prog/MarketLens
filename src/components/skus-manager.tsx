'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveSkuAction, importSkusAction, setBrandTypeAction, saveBrandAction, deleteBrandAction } from '@/actions/admin'
import { toast } from './toast'
import { Icon } from './icons'
import { Modal, Toggle } from './modal'
import { ImportButton } from './import-dialog'
import { Field, cx } from './ui'

type Sku = { id: string; label: string; code: string; active: boolean; brandIds: string[] }
type Brand = { id: string; name: string; isCompany: boolean; active: boolean }
type Draft = { id?: string; label: string; code: string; active: boolean; brandIds: string[]; newBrands: string[] }

export function SkusManager({ skus, brands }: { skus: Sku[]; brands: Brand[] }) {
  const router = useRouter()
  const [edit, setEdit] = useState<Draft | null>(null)
  const [nb, setNb] = useState('')
  const [bq, setBq] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const bName = new Map(brands.map((b) => [b.id, b.name]))
  const toggleBrand = (id: string) => setEdit((d) => d && ({ ...d, brandIds: d.brandIds.includes(id) ? d.brandIds.filter((x) => x !== id) : [...d.brandIds, id] }))
  const addNew = () => { const v = nb.trim(); if (!v) return; setEdit((d) => d && !d.newBrands.includes(v) ? { ...d, newBrands: [...d.newBrands, v] } : d); setNb('') }
  const save = (e: React.FormEvent) => { e.preventDefault(); setErr(null)
    start(async () => { const r = await saveSkuAction(edit); if (r.ok) { setEdit(null); router.refresh(); toast('Saved') } else setErr(r.error) }) }
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div><div className="eyebrow">Master data</div><h1 className="text-3xl md:text-4xl font-medium mt-1">SKUs &amp; Brands</h1><p className="text-muted text-sm mt-2">Control the pack sizes and brands available during price capture.</p></div>
        <div className="flex gap-3">
          <ImportButton title="Import SKUs & brands" columns="sku,brand,type" example="5 kg,Royal Aroma,company" action={importSkusAction} />
          <button className="btn btn-primary" onClick={() => { setErr(null); setEdit({ label: '', code: '', active: true, brandIds: [], newBrands: [] }) }}><Icon name="plus" size={16} /> Add SKU</button>
        </div>
      </div>
      <BrandTypes brands={brands} />
      <h2 className="text-xl font-medium mt-8 mb-3">Pack sizes</h2>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {skus.map((k) => (
          <article key={k.id} className={cx('card p-5 hover:shadow-pop transition-shadow', !k.active && 'opacity-60')}>
            <div className="flex items-center gap-4">
              <span className="grid place-items-center size-12 rounded-xl bg-mint text-brand-ink text-xs font-bold">{k.code}</span>
              <div className="flex-1 min-w-0"><div className="font-semibold">{k.label}{!k.active && <span className="pill pill-off ml-2">Inactive</span>}</div><div className="text-xs text-muted">{k.brandIds.length} active brands</div></div>
              <button className="icon-btn" aria-label={`Edit ${k.label}`} onClick={() => { setErr(null); setEdit({ ...k, newBrands: [] }) }}><Icon name="edit" size={16} /></button>
            </div>
            <div className="mt-4 pt-4 border-t border-line flex flex-wrap gap-1.5">
              {k.brandIds.slice(0, 6).map((id) => { const b = brands.find((x) => x.id === id); return <span key={id} className={cx('rounded-lg border px-2.5 py-1 text-xs', b?.isCompany ? 'bg-mint border-brand-soft text-brand-ink font-semibold' : 'bg-canvas border-line text-muted')}>{bName.get(id)}</span> })}
              {k.brandIds.length > 6 && <span className="rounded-lg bg-canvas border border-line px-2.5 py-1 text-xs text-muted">+{k.brandIds.length - 6} more</span>}
            </div>
          </article>
        ))}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit SKU' : 'Add SKU'} wide>
        <form onSubmit={save} className="space-y-4">
          <div className="grid sm:grid-cols-[1fr_8rem] gap-4">
            <Field label="Pack size label"><input className="input" required maxLength={40} value={edit?.label ?? ''} onChange={(e) => setEdit({ ...edit!, label: e.target.value })} placeholder="e.g. 5 kg" /></Field>
            <Field label="Badge" hint="Short code"><input className="input" required maxLength={8} value={edit?.code ?? ''} onChange={(e) => setEdit({ ...edit!, code: e.target.value })} placeholder="5" /></Field>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-canvas p-3"><div><div className="text-sm font-semibold">Active</div><div className="text-xs text-muted">Inactive pack sizes disappear from capture.</div></div><Toggle label="Active" checked={edit?.active ?? true} onChange={(v) => setEdit({ ...edit!, active: v })} /></div>
          <div>
            <div className="flex items-center justify-between mb-2"><span className="text-sm font-semibold">Brands in this pack size</span><span className="text-xs text-muted">{(edit?.brandIds.length ?? 0) + (edit?.newBrands.length ?? 0)} selected</span></div>
            <input className="input mb-2" type="search" placeholder="Filter brands" aria-label="Filter brands" value={bq} onChange={(e) => setBq(e.target.value)} />
            <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto p-1">
              {brands.filter((b) => b.name.toLowerCase().includes(bq.toLowerCase())).map((b) => {
                const on = edit?.brandIds.includes(b.id)
                return <button type="button" key={b.id} aria-pressed={on} onClick={() => toggleBrand(b.id)} className={cx('rounded-full border px-3 py-1.5 text-sm transition-colors', on ? 'bg-brand text-white border-brand' : 'bg-white border-line text-muted hover:border-brand-soft')}>{b.name}</button>
              })}
              {edit?.newBrands.map((n) => <button type="button" key={n} onClick={() => setEdit({ ...edit, newBrands: edit.newBrands.filter((x) => x !== n) })} className="rounded-full border border-lime bg-lime/40 px-3 py-1.5 text-sm">{n} <span aria-hidden>×</span></button>)}
            </div>
            <div className="flex gap-2 mt-3"><input className="input" placeholder="Add a new brand" aria-label="New brand name" maxLength={60} value={nb} onChange={(e) => setNb(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew() } }} /><button type="button" className="btn btn-outline" onClick={addNew}>Add</button></div>
          </div>
          {err && <div role="alert" className="text-sm text-danger bg-danger-soft rounded-xl p-3">{err}</div>}
          <div className="grid grid-cols-2 gap-3 pt-1"><button type="button" className="btn btn-outline" onClick={() => setEdit(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save SKU'}</button></div>
        </form>
      </Modal>
    </>
  )
}

/** Brand directory: rename, mark Company / Competitor, deactivate or delete. Only company brands appear on the Sales screen. */
function BrandTypes({ brands }: { brands: Brand[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [edit, setEdit] = useState<Brand | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const list = brands.filter((b) => (showInactive || b.active) && b.name.toLowerCase().includes(q.toLowerCase()))
  const company = brands.filter((b) => b.isCompany && b.active)
  const flip = async (b: Brand) => {
    setBusy(b.id)
    const r = await setBrandTypeAction({ id: b.id, isCompany: !b.isCompany })
    setBusy(null)
    if (r.ok) { router.refresh(); toast(`${b.name} is now a ${b.isCompany ? 'competitor' : 'company'} brand`) } else toast('Could not update brand', { body: r.error, tone: 'error' })
  }
  const save = (e: React.FormEvent) => { e.preventDefault(); if (!edit) return; setErr(null)
    start(async () => { const r = await saveBrandAction(edit); if (r.ok) { setEdit(null); router.refresh(); toast('Brand saved') } else setErr(r.error) }) }
  const remove = () => { if (!edit || !confirm(`Delete ${edit.name}? If it has price or sales history it will be deactivated instead.`)) return
    start(async () => { const r = await deleteBrandAction({ id: edit.id }); if (r.ok) { setEdit(null); router.refresh(); toast(r.deactivated ? `${edit.name} deactivated (it has history)` : `${edit.name} deleted`) } else setErr(r.error) }) }
  return (
    <section className="card overflow-hidden">
      <div className="p-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold text-lg">Brands</h2><p className="text-sm text-muted">Click the tick to switch a brand between <b className="text-brand-ink">Company</b> (Olam Agri, sales are recorded) and Competitor (prices only). Click the pencil to rename, deactivate or delete. {company.length} company brand{company.length === 1 ? '' : 's'}.</p></div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive</label>
          <input className="input !w-56" type="search" placeholder="Filter brands" aria-label="Filter brands" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <ul className="px-5 pb-5 flex flex-wrap gap-2">
        {list.map((b) => (
          <li key={b.id} className={cx('inline-flex items-center rounded-full border overflow-hidden text-sm', !b.active && 'opacity-50', b.isCompany ? 'bg-brand text-white border-brand' : 'bg-white border-line text-ink')}>
            <button type="button" aria-pressed={b.isCompany} disabled={busy === b.id || !b.active} onClick={() => flip(b)} title={b.isCompany ? 'Company brand — click to mark as competitor' : 'Competitor — click to mark as company brand'}
              className={cx('inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 disabled:opacity-60', b.isCompany ? 'hover:bg-brand-dark' : 'hover:bg-mint')}>
              <span className={cx('grid place-items-center size-4 rounded-full border', b.isCompany ? 'bg-white text-brand border-white' : 'border-line text-transparent')}><Icon name="check" size={10} /></span>{b.name}{!b.active && <span className="text-[0.6rem] uppercase tracking-wider opacity-70">inactive</span>}
            </button>
            <button type="button" aria-label={`Edit ${b.name}`} onClick={() => { setErr(null); setEdit(b) }} className={cx('px-2 py-1.5 border-l', b.isCompany ? 'border-white/30 hover:bg-brand-dark' : 'border-line hover:bg-surface-2 text-muted')}><Icon name="edit" size={13} /></button>
          </li>
        ))}
        {list.length === 0 && <li className="text-sm text-muted">No brands match.</li>}
      </ul>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Edit brand">
        <form onSubmit={save} className="space-y-4">
          <Field label="Brand name"><input className="input" required maxLength={60} value={edit?.name ?? ''} onChange={(e) => setEdit(edit && { ...edit, name: e.target.value })} /></Field>
          <div className="flex items-center justify-between rounded-xl bg-canvas p-3"><div><div className="text-sm font-semibold">Company brand</div><div className="text-xs text-muted">Shown on the promoters’ Sales screen. Competitors are prices only.</div></div><Toggle label="Company brand" checked={edit?.isCompany ?? false} onChange={(v) => setEdit(edit && { ...edit, isCompany: v })} /></div>
          <div className="flex items-center justify-between rounded-xl bg-canvas p-3"><div><div className="text-sm font-semibold">Active</div><div className="text-xs text-muted">Inactive brands disappear from capture and sales but keep their history.</div></div><Toggle label="Active" checked={edit?.active ?? true} onChange={(v) => setEdit(edit && { ...edit, active: v })} /></div>
          {err && <div role="alert" className="text-sm text-danger bg-danger-soft rounded-xl p-3">{err}</div>}
          <div className="grid grid-cols-[auto_1fr_1fr] gap-3 pt-1">
            <button type="button" className="btn btn-ghost text-danger" onClick={remove} disabled={pending}><Icon name="x" size={14} /> Delete</button>
            <button type="button" className="btn btn-outline" onClick={() => setEdit(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save brand'}</button>
          </div>
        </form>
      </Modal>
    </section>
  )
}
