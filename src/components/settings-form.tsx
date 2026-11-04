'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveSettingsAction } from '@/actions/admin'
import { toast } from './toast'
import { Icon } from './icons'
import { Toggle } from './modal'
import type { AppSettings } from '@/lib/settings'

const CURRENCIES = [['GHS', 'GHS · Ghana Cedi'], ['NGN', 'NGN · Nigerian Naira'], ['XOF', 'XOF · West African CFA'], ['USD', 'USD · US Dollar'], ['EUR', 'EUR · Euro'], ['GBP', 'GBP · British Pound']] as const

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter()
  const [s, setS] = useState(initial)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [pending, start] = useTransition()
  const dirty = JSON.stringify(s) !== JSON.stringify(initial)
  const save = () => start(async () => { const r = await saveSettingsAction(s); setMsg(r.ok ? { ok: true, t: 'Settings saved.' } : { ok: false, t: r.error }); if (r.ok) { router.refresh(); toast('Settings saved') } })
  const Row = ({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) => (
    <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-5 border-t border-line"><div className="min-w-0"><div className="font-semibold text-sm">{title}</div><div className="text-sm text-muted">{sub}</div></div>{children}</div>
  )
  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div><div className="eyebrow">Workspace</div><h1 className="text-3xl md:text-4xl font-medium mt-1">Settings</h1><p className="text-muted text-sm mt-2">Configure capture rules and workspace defaults.</p></div>
        <div className="flex items-center gap-3">{msg && <span role="status" className={`text-sm font-medium ${msg.ok ? 'text-brand-ink' : 'text-danger'}`}>{msg.t}</span>}
          <button className="btn btn-primary" disabled={pending || !dirty} onClick={save}><Icon name="check" size={16} />{pending ? 'Saving…' : 'Save changes'}</button></div>
      </div>
      <section className="card overflow-hidden">
        <div className="px-6 py-5"><h2 className="font-semibold text-lg">Capture preferences</h2><p className="text-sm text-muted">Rules that apply to all promoter submissions.</p></div>
        <Row title="Currency" sub="Shown beside every price field."><select className="input !w-60" value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value as AppSettings['currency'] })}>{CURRENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Row>
        <Row title="Allow back-dating" sub="Let promoters create entries for a past date."><Toggle label="Allow back-dating" checked={s.allowBackdating} onChange={(v) => setS({ ...s, allowBackdating: v })} /></Row>
        <Row title="Edit window" sub="Time after submission before an entry becomes read-only.">
          <select className="input !w-60" value={s.editWindowHours} onChange={(e) => setS({ ...s, editWindowHours: Number(e.target.value) })}>
            {[[0, 'No edits after submitting'], [2, '2 hours'], [6, '6 hours'], [12, '12 hours'], [24, '24 hours'], [48, '48 hours'], [168, '7 days']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></Row>
        <Row title="Price variance warning" sub="Warn when a price differs from the 30-day average by more than:">
          <div className="relative w-40"><input className="input pr-9 text-right tabular-nums" type="number" min={1} max={500} step={1} value={s.varianceWarningPct} onChange={(e) => setS({ ...s, varianceWarningPct: Number(e.target.value) })} aria-label="Variance percent" /><span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">%</span></div></Row>
      </section>

      <section className="card overflow-hidden mt-6">
        <div className="px-6 py-5"><h2 className="font-semibold text-lg">Location tracking</h2><p className="text-sm text-muted">Where the field team is when they sign in, type prices and submit. Promoters see a clear notice and must allow location on their phone.</p></div>
        <Row title="Track locations" sub="Record a position at sign-in, on every save and submission, and at regular intervals while the capture screen is open."><Toggle label="Track locations" checked={s.locationTracking} onChange={(v) => setS({ ...s, locationTracking: v })} /></Row>
        <Row title="Require location to submit" sub="Block submissions when the phone could not provide a position."><Toggle label="Require location" checked={s.requireLocation} onChange={(v) => setS({ ...s, requireLocation: v })} /></Row>
        <Row title="Geofence radius" sub="Submissions further than this from the outlet pin are flagged “away from outlet”.">
          <div className="relative w-40"><input className="input pr-9 text-right tabular-nums" type="number" min={50} max={5000} step={10} value={s.geofenceMeters} onChange={(e) => setS({ ...s, geofenceMeters: Number(e.target.value) })} aria-label="Geofence metres" /><span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted">m</span></div></Row>
        <Row title="Heartbeat interval" sub="How often a position is recorded while the capture screen is open.">
          <select className="input !w-60" value={s.trackingIntervalSec} onChange={(e) => setS({ ...s, trackingIntervalSec: Number(e.target.value) })}>
            {[[30, 'Every 30 seconds'], [60, 'Every minute'], [120, 'Every 2 minutes'], [300, 'Every 5 minutes'], [600, 'Every 10 minutes']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></Row>
        <Row title="Keep location history for" sub="Older pings are deleted automatically.">
          <select className="input !w-60" value={s.locationRetentionDays} onChange={(e) => setS({ ...s, locationRetentionDays: Number(e.target.value) })}>
            {[[30, '30 days'], [90, '90 days'], [180, '6 months'], [365, '1 year']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></Row>
      </section>
    </div>
  )
}
