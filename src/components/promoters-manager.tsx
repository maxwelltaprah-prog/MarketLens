'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { savePromoterAction, importPromotersAction } from '@/actions/admin'
import { toast } from './toast'
import { Icon } from './icons'
import { Modal, Toggle } from './modal'
import { ImportButton } from './import-dialog'
import { Avatar, Empty, Field, StatusPill } from './ui'

type P = { id: string; name: string; phone: string | null; outletId: string | null; outletName: string | null; active: boolean }
type Draft = Partial<P> & { pin?: string; generatePin?: boolean }

export function PromotersManager({ promoters, outlets }: { promoters: P[]; outlets: { id: string; name: string }[] }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Draft | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ name: string; pin: string } | null>(null)
  const [pending, start] = useTransition()
  const list = useMemo(() => promoters.filter((p) => `${p.name} ${p.outletName ?? ''} ${p.phone ?? ''}`.toLowerCase().includes(q.toLowerCase())), [promoters, q])
  const save = (e: React.FormEvent) => { e.preventDefault(); setErr(null)
    start(async () => {
      const r = await savePromoterAction({ id: edit?.id, name: edit?.name ?? '', phone: edit?.phone ?? '', outletId: edit?.outletId || null, active: edit?.active ?? true, pin: edit?.pin ?? '', generatePin: !!edit?.generatePin })
      if (r.ok) { if (r.pin) setIssued({ name: edit?.name ?? '', pin: r.pin }); setEdit(null); router.refresh(); toast(edit?.id ? 'Promoter updated' : 'Promoter added', r.pin ? { body: 'A new PIN was issued. Any existing sessions were signed out.' } : {}) } else setErr(r.error)
    }) }
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div><div className="eyebrow">Configuration</div><h1 className="text-3xl md:text-4xl font-medium mt-1">Promoter team</h1><p className="text-muted text-sm mt-2">Manage access and outlet assignments for your field team.</p></div>
        <button className="btn btn-primary" onClick={() => { setErr(null); setEdit({ active: true, generatePin: true }) }}><Icon name="plus" size={16} /> Add promoter</button>
      </div>
      <div className="card overflow-hidden">
        <div className="p-4 flex flex-wrap gap-3 justify-between border-b border-line">
          <div className="relative flex-1 max-w-md"><Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input className="input pl-10" type="search" placeholder="Search promoters" aria-label="Search promoters" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <ImportButton title="Import promoters" columns="name,phone,pin,outlet" example="Ama@111,0241234567,482913,Lord Cares" action={importPromotersAction} />
        </div>
        {list.length === 0 ? <Empty icon="user" title="No promoters found" /> : (
          <ul className="grid md:grid-cols-2 [&>li]:border-b [&>li]:border-line md:[&>li:nth-child(odd)]:border-r">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-4 p-4 hover:bg-[#fafbf8] transition-colors">
                <Avatar text={p.name} />
                <div className="min-w-0 flex-1"><div className="font-semibold truncate">{p.name}</div><div className="text-xs text-muted truncate">{p.outletName ?? 'Unassigned'} · {p.phone}</div></div>
                <StatusPill status={p.active ? 'active' : 'inactive'} />
                <button className="icon-btn" aria-label={`Edit ${p.name}`} onClick={() => { setErr(null); setEdit({ ...p, pin: '' }) }}><Icon name="edit" size={16} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit promoter' : 'Add promoter'}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Name / handle"><input className="input" required maxLength={60} value={edit?.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Ama@111" /></Field>
          <Field label="Mobile number" hint="Used to sign in."><input className="input" required type="tel" inputMode="tel" value={edit?.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} placeholder="054 123 4567" /></Field>
          <Field label="Assigned outlet">
            <select className="input" value={edit?.outletId ?? ''} onChange={(e) => setEdit({ ...edit, outletId: e.target.value || null })}>
              <option value="">Unassigned</option>{outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <div className="rounded-xl bg-canvas p-3 space-y-3">
            <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-semibold">{edit?.id ? 'Reset PIN' : 'Sign-in PIN'}</div><div className="text-xs text-muted">{edit?.id ? 'Leave as is to keep the current PIN.' : 'Share it with the promoter privately.'}</div></div>
              <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" className="size-4 accent-[#14603f]" checked={!!edit?.generatePin} onChange={(e) => setEdit({ ...edit, generatePin: e.target.checked, pin: '' })} />Generate</label></div>
            {!edit?.generatePin && <input className="input" inputMode="numeric" pattern="\d{4,8}" maxLength={8} placeholder="4 to 8 digits" value={edit?.pin ?? ''} onChange={(e) => setEdit({ ...edit, pin: e.target.value.replace(/\D/g, '') })} aria-label="PIN" />}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-canvas p-3"><div><div className="text-sm font-semibold">Active</div><div className="text-xs text-muted">Inactive promoters can’t sign in.</div></div><Toggle label="Active" checked={edit?.active ?? true} onChange={(v) => setEdit({ ...edit, active: v })} /></div>
          {err && <div role="alert" className="text-sm text-danger bg-danger-soft rounded-xl p-3">{err}</div>}
          <div className="grid grid-cols-2 gap-3 pt-1"><button type="button" className="btn btn-outline" onClick={() => setEdit(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Save promoter'}</button></div>
        </form>
      </Modal>

      <Modal open={!!issued} onClose={() => setIssued(null)} title="PIN generated">
        <p className="text-sm text-muted">Share this PIN with <b className="text-ink">{issued?.name}</b> now. For security it won’t be shown again.</p>
        <div className="my-5 rounded-2xl bg-mint text-brand-ink text-center text-4xl font-semibold tracking-[0.3em] py-6 tabular-nums select-all">{issued?.pin}</div>
        <button className="btn btn-primary w-full" onClick={() => setIssued(null)}>Done</button>
      </Modal>
    </>
  )
}
