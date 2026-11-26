'use client'
import { useEffect, useMemo, useState } from 'react'
import { Icon } from './icons'
import { cx } from './ui'

export type ProgressLine = { brandId: string; name: string; target: number; soldBeforeToday: number }
type Props = { label: string; days: number; elapsed: number; lines: ProgressLine[]; incentive: number | null; symbol: string; hasTargets: boolean }

/** Monthly target progress. Listens to today's sales lines (dispatched by SalesEntry) so bars move as units are typed. */
export function TargetCard({ label, days, elapsed, lines, incentive, symbol, hasTargets }: Props) {
  const [today, setToday] = useState<Record<string, number>>({})
  useEffect(() => {
    const on = (e: Event) => setToday((e as CustomEvent<Record<string, number>>).detail)
    window.addEventListener('ml-sales-today', on)
    return () => window.removeEventListener('ml-sales-today', on)
  }, [])
  const rows = useMemo(() => lines.map((l) => { const sold = l.soldBeforeToday + (today[l.brandId] ?? 0); return { ...l, sold, pct: l.target ? Math.min(999, Math.round((sold / l.target) * 100)) : null } }), [lines, today])
  const totalT = rows.reduce((n, r) => n + r.target, 0), totalS = rows.reduce((n, r) => n + r.sold, 0)
  const totalPct = totalT ? Math.round((totalS / totalT) * 100) : null
  const pace = Math.round((elapsed / days) * 100)
  const left = Math.max(0, days - elapsed)
  const remaining = Math.max(0, totalT - totalS)
  const perDay = left > 0 ? Math.ceil(remaining / left) : remaining
  const met = totalT > 0 && totalS >= totalT

  if (!hasTargets) return null
  return (
    <section className={cx('card p-4 sm:p-5 mb-6 border-l-4', met ? 'border-l-success' : totalPct != null && totalPct >= pace ? 'border-l-brand' : 'border-l-amber')} aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow flex items-center gap-1.5"><Icon name="target" size={13} /> {label} target</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{totalS.toLocaleString()} <span className="text-base text-muted font-normal">of {totalT.toLocaleString()} units</span></div>
        </div>
        <div className="text-right">
          <div className={cx('text-3xl font-semibold tabular-nums', met ? 'text-success' : totalPct != null && totalPct >= pace ? 'text-brand-ink' : 'text-amber-ink')}>{totalPct == null ? '—' : `${totalPct}%`}</div>
          <div className="text-[0.65rem] text-muted uppercase tracking-wider">achieved</div>
        </div>
      </div>
      <div className="relative mt-3 h-2.5 rounded-full bg-surface-2 overflow-hidden">
        <div className={cx('h-full rounded-full transition-[width] duration-500', met ? 'bg-success' : 'bg-brand')} style={{ width: `${Math.min(100, totalPct ?? 0)}%` }} />
        <span className="absolute top-0 h-full w-0.5 bg-ink/40" style={{ left: `${pace}%` }} title={`Day ${elapsed} of ${days}`} aria-hidden />
      </div>
      <p className="mt-2 text-xs text-muted">
        {met ? <span className="text-success font-semibold">Target met. Well done!{incentive != null ? ` Incentive ${symbol} ${incentive.toLocaleString('en-GH', { minimumFractionDigits: 2 })} earned.` : ''}</span>
          : <>Day {elapsed} of {days}. {left > 0 ? <>Sell <b className="text-ink">{perDay.toLocaleString()}</b> a day for the remaining {left} day{left === 1 ? '' : 's'} to hit it{incentive != null ? ` and earn ${symbol} ${incentive.toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : ''}.</> : `${remaining.toLocaleString()} units short.`}</>}
      </p>
      {rows.length > 1 && (
        <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-3">
          {rows.map((r) => (
            <li key={r.brandId}>
              <div className="flex justify-between text-xs"><span className="font-semibold truncate">{r.name}</span><span className="tabular-nums text-muted">{r.sold.toLocaleString()} / {r.target.toLocaleString()}{r.pct != null && <b className={cx('ml-1.5', r.pct >= 100 ? 'text-success' : r.pct >= pace ? 'text-brand-ink' : 'text-amber-ink')}>{r.pct}%</b>}</span></div>
              <div className="h-1.5 rounded-full bg-surface-2 mt-1 overflow-hidden"><div className={cx('h-full rounded-full transition-[width] duration-500', r.pct != null && r.pct >= 100 ? 'bg-success' : 'bg-brand')} style={{ width: `${Math.min(100, r.pct ?? 0)}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
