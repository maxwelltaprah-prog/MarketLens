'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveOutletAction, importOutletsAction } from '@/actions/admin'
import { toast } from './toast'
import { Icon } from './icons'
import { Modal, Toggle } from './modal'
import { ImportButton } from './import-dialog'
import { Empty, Field, StatusPill } from './ui'

type Outlet = { id: string; name: string; region: string; active: boolean; lat: number | null; lng: number | null }

export function OutletsManager({ outlets }: { outlets: Outlet[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  type Draft = Partial<Omit<Outlet, 'lat' | 'lng'>> & { lat?: number | string | null; lng?: number | string | null }
  const [edit, setEdit] = useState<Draft | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const list = useMemo(() => outlets.filter((o) => `${o.name} ${o.region}`.toLowerCase().includes(q.toLowerCase())), [outlets, q])
  const save = (e: React.FormEvent) => { e.preventDefault(); setErr(null)
    start(async () => { const r = await saveOutletAction({ id: edit?.id, name: edit?.name ?? '', region: edit?.region ?? '', active: edit?.active ?? true, lat: edit?.lat ?? null, lng: edit?.lng ?? null }); if (r.ok) { setEdit(null); router.refresh(); toast(edit?.id ? 'Outlet updated' : 'Outlet added') } else setErr(r.error) }) }
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div><div className="eyebrow">Configuration</div><h1 className="text-3xl md:text-4xl font-medium mt-1">Outlet directory</h1><p className="text-muted text-sm mt-2">Manage the locations in your reporting network.</p></div>
        <button className="btn btn-primary" onClick={() => { setErr(null); setEdit({ active: true }) }}><Icon name="plus" size={16} /> Add outlet</button>
      </div>
      <div className="card overflow-hidden">
        <div className="p-4 flex flex-wrap gap-3 justify-between border-b border-line">
          <div className="relative flex-1 max-w-md"><Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-10" type="search" placeholder="Search outlets" aria-label="Search outlets" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <ImportButton title="Import outlets" columns="name,region,lat,lng" example="Example Store,Accra,5.6037,-0.1870" action={importOutletsAction} />
        </div>
        {list.length === 0 ? <Empty icon="building" title="No outlets found" hint={q ? 'Try a different search.' : 'Add your first outlet to get started.'} /> : (
          <ul className="grid md:grid-cols-2 [&>li]:border-b [&>li]:border-line md:[&>li:nth-child(odd)]:border-r">
            {list.map((o) => (
              <li key={o.id} className="flex items-center gap-4 p-4 hover:bg-[#fafbf8] transition-colors">
                <span className="grid place-items-center size-11 rounded-xl bg-mint text-brand-ink shrink-0"><Icon name="building" /></span>
                <div className="min-w-0 flex-1"><div className="font-semibold truncate">{o.name}</div><div className="text-xs text-muted flex items-center gap-1.5">{o.region}{o.lat != null ? <span className="inline-flex items-center gap-0.5 text-success"><Icon name="pin" size={11} /> pinned</span> : <span className="text-amber-ink">· no pin</span>}</div></div>
                <StatusPill status={o.active ? 'active' : 'inactive'} />
                <button className="icon-btn" aria-label={`Edit ${o.name}`} onClick={() => { setErr(null); setEdit(o) }}><Icon name="edit" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit outlet' : 'Add outlet'}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Outlet name"><input className="input" required maxLength={80} value={edit?.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Region / city"><input className="input" required maxLength={60} value={edit?.region ?? ''} onChange={(e) => setEdit({ ...edit, region: e.target.value })} placeholder="e.g. Kumasi" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" hint="Decimal degrees"><input className="input tabular-nums" inputMode="decimal" placeholder="5.6037" value={edit?.lat ?? ''} onChange={(e) => setEdit({ ...edit, lat: e.target.value })} /></Field>
            <Field label="Longitude" hint="e.g. -0.1870"><input className="input tabular-nums" inputMode="decimal" placeholder="-0.1870" value={edit?.lng ?? ''} onChange={(e) => setEdit({ ...edit, lng: e.target.value })} /></Field>
          </div>
          <p className="text-xs text-muted -mt-2">The pin powers the geofence. Tip: open the Field map, click a promoter’s last position at this outlet and choose “Use as outlet pin”.</p>
          <div className="flex items-center justify-between rounded-xl bg-canvas p-3"><div><div className="text-sm font-semibold">Active</div><div className="text-xs text-muted">Inactive outlets are hidden from reporting and unassigned from promoters.</div></div><Toggle label="Active" checked={edit?.active ?? true} onChange={(v) => setEdit({ ...edit, active: v })} /></div>
          {err && <div role="alert" className="text-sm text-danger bg-danger-soft rounded-xl p-3">{err}</div>}
          <div className="grid grid-cols-2 gap-3 pt-1"><button type="button" className="btn btn-outline" onClick={() => setEdit(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save outlet'}</button></div>
        </form>
      </Modal>
    </>
  )
}
