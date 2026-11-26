'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveTargetsAction, copyTargetsAction, importTargetsAction } from '@/actions/admin'
import type { TargetGrid } from '@/lib/targets'
import { Icon } from './icons'
import { cx } from './ui'
import { toast } from './toast'
import { ImportButton } from './import-dialog'

type Draft = Record<string, string> // `${promoterId}:${brandId|inc}` → raw input
const k = (p: string, b: string) => `${p}:${b}`
const pct = (a: number, t: number) => (t > 0 ? Math.round((a / t) * 100) : null)
const tone = (p: number | null, pace: number) => p == null ? 'text-muted' : p >= 100 ? 'text-success' : p >= pace ? 'text-brand-ink' : 'text-danger'

export function TargetsGrid({ grid, symbol, editable }: { grid: TargetGrid; symbol: string; editable: boolean }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>({})
  const [pending, start] = useTransition()
  const [region, setRegion] = useState<string>('')
  const pace = grid.range.days ? Math.round((grid.elapsed / grid.range.days) * 100) : 0
  const rows = useMemo(() => grid.rows.filter((r) => !region || (r.region ?? 'Unassigned') === region), [grid.rows, region])
  const val = (p: string, b: string, fallback: number | null) => draft[k(p, b)] ?? (fallback == null ? '' : String(fallback))
  const dirty = Object.keys(draft).length

  const save = () => start(async () => {
    const items = Object.entries(draft).map(([key, raw]) => {
      const [promoterId, b] = key.split(':'); const n = raw.trim() === '' ? 0 : Number(raw)
      return b === 'inc' ? { promoterId, brandId: null, units: 0, incentive: raw.trim() === '' ? null : n } : { promoterId, brandId: b, units: Number.isFinite(n) ? Math.floor(n) : 0, incentive: null }
    })
    const r = await saveTargetsAction({ month: grid.month, items })
    if (r.ok) { setDraft({}); router.refresh(); toast(`${items.length} target${items.length === 1 ? '' : 's'} saved`) } else toast('Could not save', { body: r.error, tone: 'error' })
  })
  const copy = () => start(async () => { const r = await copyTargetsAction({ month: grid.month }); if (r.ok) { router.refresh(); toast(r.copied ? `${r.copied} targets copied from last month` : 'Nothing to copy', { tone: r.copied ? 'ok' : 'info' }) } else toast('Could not copy', { body: r.error, tone: 'error' }) })

  // Totals per column
  const colT = (b: string) => rows.reduce((n, r) => n + (Number(val(r.promoterId, b, r.targets[b] ?? null)) || 0), 0)
  const colA = (b: string) => rows.reduce((n, r) => n + (r.actual[b] ?? 0), 0)
  const grandT = grid.brands.reduce((n, b) => n + colT(b.id), 0), grandA = grid.brands.reduce((n, b) => n + colA(b.id), 0)

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl bg-surface-2 p-1 border border-line">
          {['', ...grid.regions].map((r) => <button key={r || 'all'} onClick={() => setRegion(r)} className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', region === r ? 'bg-white text-brand-ink shadow-card' : 'text-muted hover:text-ink')}>{r || 'All regions'}</button>)}
        </div>
        <span className="text-xs text-muted ml-1">Day {grid.elapsed} of {grid.range.days} · on-pace line is {pace}%</span>
        {editable && (
          <div className="ml-auto flex items-center gap-2">
            <ImportButton label="Import CSV" title="Import targets" columns="promoter,brand,units,incentive" example={`0200000001,Royal Aroma,250,700`} action={(t) => importTargetsAction(grid.month, t)} />
            <button className="btn btn-outline" onClick={copy} disabled={pending}><Icon name="copy" size={14} /> Copy last month</button>
            <button className="btn btn-primary" onClick={save} disabled={pending || !dirty}><Icon name="check" size={14} /> {pending ? 'Saving…' : dirty ? `Save ${dirty} change${dirty === 1 ? '' : 's'}` : 'Saved'}</button>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="scroll-x max-h-[70vh] overflow-auto">
          <table className="pivot w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky-col th text-left px-4 py-3 border-b border-line min-w-[14rem]">Promoter</th>
                {grid.brands.map((b) => <th key={b.id} colSpan={2} className="th text-center px-3 py-3 border-b border-l border-line min-w-[11rem]"><span className="block normal-case tracking-normal text-[0.8rem] font-semibold text-ink">{b.name}</span><span className="text-[0.6rem]">target · sold</span></th>)}
                <th className="th text-right px-3 py-3 border-b border-l-2 border-line bg-mint/60 min-w-[7rem]">Total</th>
                <th className="th text-right px-3 py-3 border-b border-line bg-mint/60 min-w-[6rem]">Achieved</th>
                <th className="th text-right px-3 py-3 border-b border-line bg-mint/60 min-w-[7rem]">Incentive ({symbol})</th>
              </tr>
            </thead>
            <tbody>
              {grid.regions.filter((rg) => !region || rg === region).map((rg) => (
                <RegionRows key={rg} region={rg} rows={rows.filter((r) => (r.region ?? 'Unassigned') === rg)} grid={grid} draft={draft} setDraft={setDraft} editable={editable} pace={pace} val={val} />
              ))}
              <tr className="bg-[#faf9f6] font-semibold">
                <td className="sticky-col px-4 py-3 border-t-2 border-line" style={{ background: '#faf9f6' }}>Total{region ? ` · ${region}` : ''}</td>
                {grid.brands.map((b) => <td key={b.id} colSpan={2} className="px-3 py-3 border-t-2 border-l border-line text-right tabular-nums">{colT(b.id).toLocaleString()} <span className="text-muted font-normal">· {colA(b.id).toLocaleString()}</span></td>)}
                <td className="px-3 py-3 border-t-2 border-l-2 border-line text-right tabular-nums bg-mint/40">{grandT.toLocaleString()} <span className="text-muted font-normal">· {grandA.toLocaleString()}</span></td>
                <td className={cx('px-3 py-3 border-t-2 border-line text-right tabular-nums bg-mint/40', tone(pct(grandA, grandT), pace))}>{pct(grandA, grandT) == null ? '—' : `${pct(grandA, grandT)}%`}</td>
                <td className="px-3 py-3 border-t-2 border-line bg-mint/40" />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-3 border-t border-line text-[0.7rem] text-muted">
          <span className="text-success font-semibold">Green</span> target met <span className="text-brand-ink font-semibold">Orange</span> on pace for the month <span className="text-danger font-semibold">Red</span> behind pace · Incentive is paid when the promoter’s total target is met.
        </div>
      </div>
    </div>
  )
}

function RegionRows({ region, rows, grid, draft, setDraft, editable, pace, val }: { region: string; rows: TargetGrid['rows']; grid: TargetGrid; draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; editable: boolean; pace: number; val: (p: string, b: string, f: number | null) => string }) {
  const set = (key: string, v: string) => setDraft((d) => ({ ...d, [key]: v }))
  return (
    <>
      <tr><td colSpan={grid.brands.length * 2 + 4} className="px-4 py-2 border-b border-line bg-forest text-white text-xs font-semibold">{region} <span className="text-white/50 font-normal">· {rows.length} promoter{rows.length === 1 ? '' : 's'}</span></td></tr>
      {rows.map((r, i) => {
        const total = grid.brands.reduce((n, b) => n + (Number(val(r.promoterId, b.id, r.targets[b.id] ?? null)) || 0), 0)
        const achieved = pct(r.totalActual, total)
        const bg = i % 2 ? '#fcfbf9' : '#fff'
        return (
          <tr key={r.promoterId} style={{ background: bg }}>
            <td className="sticky-col px-4 py-2 border-b border-line" style={{ background: bg }}>
              <div className="font-medium truncate max-w-[13rem]" title={r.name}>{r.name}</div>
              <div className="text-[0.68rem] text-muted truncate">{r.outlet ?? 'No outlet'}</div>
            </td>
            {grid.brands.map((b) => {
              const key = `${r.promoterId}:${b.id}`
              const t = Number(val(r.promoterId, b.id, r.targets[b.id] ?? null)) || 0, a = r.actual[b.id] ?? 0, p = pct(a, t)
              return (
                <td key={b.id} colSpan={2} className="px-2 py-1.5 border-b border-l border-line">
                  <div className="flex items-center gap-2 justify-end">
                    {editable
                      ? <input aria-label={`${r.name} ${b.name} target`} inputMode="numeric" className={cx('w-20 rounded-lg border px-2 py-1.5 text-right tabular-nums text-sm outline-none focus:border-brand focus:ring-[3px] focus:ring-brand/20', key in draft ? 'border-brand bg-mint/40' : 'border-line bg-white')} value={val(r.promoterId, b.id, r.targets[b.id] ?? null)} placeholder="0" onChange={(e) => set(key, e.target.value.replace(/[^\d]/g, ''))} />
                      : <span className="tabular-nums w-16 text-right">{t.toLocaleString()}</span>}
                    <span className={cx('tabular-nums text-xs w-16 text-right font-semibold', tone(p, pace))} title={p == null ? 'No target' : `${p}% of target`}>{a.toLocaleString()}{p != null && <span className="block text-[0.6rem] font-normal">{p}%</span>}</span>
                  </div>
                </td>
              )
            })}
            <td className="px-3 py-2 border-b border-l-2 border-line text-right tabular-nums bg-mint/30 font-semibold">{total.toLocaleString()} <span className="text-muted font-normal text-xs">· {r.totalActual.toLocaleString()}</span></td>
            <td className={cx('px-3 py-2 border-b border-line text-right tabular-nums bg-mint/30 font-semibold', tone(achieved, pace))}>{achieved == null ? '—' : `${achieved}%`}{achieved != null && achieved >= 100 && <Icon name="check" size={12} className="inline ml-1" />}</td>
            <td className="px-2 py-1.5 border-b border-line bg-mint/30 text-right">
              {editable
                ? <input aria-label={`${r.name} incentive`} inputMode="decimal" className={cx('w-24 rounded-lg border px-2 py-1.5 text-right tabular-nums text-sm outline-none focus:border-brand', `${r.promoterId}:inc` in draft ? 'border-brand bg-mint/40' : 'border-line bg-white')} value={val(r.promoterId, 'inc', r.incentive)} placeholder="—" onChange={(e) => set(`${r.promoterId}:inc`, e.target.value.replace(/[^\d.]/g, ''))} />
                : <span className="tabular-nums">{r.incentive == null ? '—' : r.incentive.toLocaleString('en-GH', { minimumFractionDigits: 2 })}</span>}
            </td>
          </tr>
        )
      })}
    </>
  )
}
