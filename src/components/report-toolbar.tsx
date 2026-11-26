'use client'
import { Icon } from './icons'
import { cx } from './ui'
import { useParams } from './filter-bar'
import type { Agg } from '@/lib/reports'

const AGGS: { k: Agg; label: string; hint: string }[] = [
  { k: 'latest', label: 'Latest', hint: 'Most recent capture in the range' },
  { k: 'avg', label: 'Average', hint: 'Mean of captures in the range' },
  { k: 'min', label: 'Lowest', hint: 'Lowest capture in the range' },
  { k: 'max', label: 'Highest', hint: 'Highest capture in the range' },
]

export function ReportToolbar({ agg, exportHref, rawHref }: { agg: Agg; exportHref: string; rawHref: string }) {
  const { set, pending } = useParams()
  return (
    <div className={cx('no-print flex flex-wrap items-center gap-3 mb-4 transition-opacity', pending && 'opacity-60')}>
      <div role="radiogroup" aria-label="Value shown" className="inline-flex rounded-xl bg-surface-2 p-1 border border-line">
        {AGGS.map((a) => (
          <button key={a.k} role="radio" aria-checked={agg === a.k} title={a.hint} onClick={() => set({ agg: a.k })}
            className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all', agg === a.k ? 'bg-white text-brand-ink shadow-card' : 'text-muted hover:text-ink')}>{a.label}</button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => window.print()} className="btn btn-outline btn-sm"><Icon name="print" size={14} /> Print / PDF</button>
        <a href={exportHref} className="btn btn-outline btn-sm"><Icon name="download" size={14} /> Matrix CSV</a>
        <a href={rawHref} className="btn btn-primary btn-sm" title="One row per price and per sale, with Year / Month / Week / Weekday columns for pivot tables"><Icon name="table" size={14} /> Raw data (Excel)</a>
      </div>
    </div>
  )
}
