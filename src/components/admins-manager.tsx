'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveAdminAction, changeOwnPasswordAction } from '@/actions/admin'
import { toast } from './toast'
import { Icon } from './icons'
import { Modal, Toggle } from './modal'
import { Field, StatusPill, cx } from './ui'

export type AdminRow = { id: string; name: string; email: string | null; active: boolean; lastLoginAt: Date | null }
type Draft = { id?: string; name: string; email: string; active: boolean; resetPassword?: boolean }

export function AdminsManager({ admins, meId }: { admins: AdminRow[]; meId: string }) {
  const router = useRouter()
  const [edit, setEdit] = useState<Draft | null>(null)
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [pw, setPw] = useState<{ current: string; next: string; confirm: string } | null>(null)

  const save = (e: React.FormEvent) => { e.preventDefault(); if (!edit) return; setErr(null)
    start(async () => {
      const r = await saveAdminAction(edit)
      if (!r.ok) { setErr(r.error); return }
      setEdit(null); router.refresh()
      if (r.password) setIssued({ email: edit.email.trim().toLowerCase(), password: r.password }); else toast('Administrator updated')
    }) }
  const changePw = (e: React.FormEvent) => { e.preventDefault(); if (!pw) return; setErr(null)
    if (pw.next !== pw.confirm) { setErr('The two new passwords don’t match.'); return }
    start(async () => { const r = await changeOwnPasswordAction({ current: pw.current, next: pw.next }); if (r.ok) { setPw(null); toast('Password changed') } else setErr(r.error) }) }

  return (
    <section className="card max-w-3xl overflow-hidden">
      <div className="px-6 py-5 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold text-lg flex items-center gap-2"><Icon name="shield" size={18} className="text-brand" /> Administrators</h2><p className="text-sm text-muted">People who can see every outlet, manage master data and export reports. New accounts get a temporary password shown once.</p></div>
        <div className="flex gap-2">
          <button className="btn btn-outline btn-sm" onClick={() => { setErr(null); setPw({ current: '', next: '', confirm: '' }) }}><Icon name="key" size={14} /> Change my password</button>
          <button className="btn btn-primary btn-sm" onClick={() => { setErr(null); setEdit({ name: '', email: '', active: true }) }}><Icon name="plus" size={14} /> Add administrator</button>
        </div>
      </div>
      <ul className="divide-y divide-line border-t border-line">
        {admins.map((a) => (
          <li key={a.id} className="px-6 py-3 flex items-center gap-4">
            <span className="grid place-items-center size-9 rounded-full bg-forest text-white text-xs font-bold shrink-0">{a.name.slice(0, 2).toUpperCase()}</span>
            <div className="min-w-0 flex-1"><div className="font-semibold text-sm truncate">{a.name}{a.id === meId && <span className="ml-2 text-xs text-muted font-normal">(you)</span>}</div><div className="text-xs text-muted truncate">{a.email} · {a.lastLoginAt ? `last sign-in ${a.lastLoginAt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : 'never signed in'}</div></div>
            <StatusPill status={a.active ? 'active' : 'inactive'} />
            <button className="icon-btn" aria-label={`Edit ${a.name}`} onClick={() => { setErr(null); setEdit({ id: a.id, name: a.name, email: a.email ?? '', active: a.active }) }}><Icon name="edit" size={16} /></button>
          </li>
        ))}
      </ul>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Edit administrator' : 'Add administrator'}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Full name"><input className="input" required maxLength={60} value={edit?.name ?? ''} onChange={(e) => setEdit(edit && { ...edit, name: e.target.value })} /></Field>
          <Field label="Work email" hint="They sign in with this on the Administrator tab."><input className="input" type="email" required maxLength={120} value={edit?.email ?? ''} onChange={(e) => setEdit(edit && { ...edit, email: e.target.value })} placeholder="name@olamagri.com" /></Field>
          {edit?.id && (
            <div className="flex items-center justify-between rounded-xl bg-canvas p-3"><div><div className="text-sm font-semibold">Reset password</div><div className="text-xs text-muted">Issues a new temporary password and signs them out everywhere.</div></div><Toggle label="Reset password" checked={!!edit.resetPassword} onChange={(v) => setEdit({ ...edit, resetPassword: v })} /></div>
          )}
          <div className="flex items-center justify-between rounded-xl bg-canvas p-3"><div><div className="text-sm font-semibold">Active</div><div className="text-xs text-muted">Inactive administrators can’t sign in. You can’t deactivate yourself or the last admin.</div></div><Toggle label="Active" checked={edit?.active ?? true} onChange={(v) => setEdit(edit && { ...edit, active: v })} /></div>
          {err && <div role="alert" className="text-sm text-danger bg-danger-soft rounded-xl p-3">{err}</div>}
          <div className="grid grid-cols-2 gap-3 pt-1"><button type="button" className="btn btn-outline" onClick={() => setEdit(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : edit?.id ? 'Save changes' : 'Create account'}</button></div>
        </form>
      </Modal>

      <Modal open={!!issued} onClose={() => setIssued(null)} title="Temporary password">
        <p className="text-sm text-muted">Share this with <b className="text-ink">{issued?.email}</b> through a private channel. It is shown only once; ask them to change it under Settings after their first sign-in.</p>
        <div className="mt-4 rounded-xl bg-forest text-white p-4 font-mono text-xl tracking-wider text-center select-all break-all">{issued?.password}</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button className="btn btn-outline" onClick={() => { navigator.clipboard?.writeText(issued?.password ?? ''); toast('Copied') }}><Icon name="copy" size={14} /> Copy</button>
          <button className="btn btn-primary" onClick={() => setIssued(null)}>Done</button>
        </div>
      </Modal>

      <Modal open={!!pw} onClose={() => setPw(null)} title="Change my password">
        <form onSubmit={changePw} className="space-y-4">
          <Field label="Current password"><input className="input" type="password" autoComplete="current-password" required value={pw?.current ?? ''} onChange={(e) => setPw(pw && { ...pw, current: e.target.value })} /></Field>
          <Field label="New password" hint="At least 12 characters."><input className="input" type="password" autoComplete="new-password" required minLength={12} value={pw?.next ?? ''} onChange={(e) => setPw(pw && { ...pw, next: e.target.value })} /></Field>
          <Field label="Confirm new password"><input className={cx('input', pw && pw.confirm && pw.confirm !== pw.next && '!border-danger')} type="password" autoComplete="new-password" required value={pw?.confirm ?? ''} onChange={(e) => setPw(pw && { ...pw, confirm: e.target.value })} /></Field>
          {err && <div role="alert" className="text-sm text-danger bg-danger-soft rounded-xl p-3">{err}</div>}
          <div className="grid grid-cols-2 gap-3 pt-1"><button type="button" className="btn btn-outline" onClick={() => setPw(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={pending}>{pending ? 'Saving…' : 'Change password'}</button></div>
        </form>
      </Modal>
    </section>
  )
}
