import Link from 'next/link'
import { Icon } from '@/components/icons'
import { PageHeader, cx } from '@/components/ui'
import { TargetsGrid } from '@/components/targets-grid'
import { HBarChart } from '@/components/charts'
import { getTargetGrid, thisMonth, MONTH, addMonths, monthLabel } from '@/lib/targets'
import { getSettings } from '@/lib/settings'
import { currencySymbol } from '@/lib/format'

export const metadata = { title: 'Targets' }

export default async function TargetsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const raw = Array.isArray(sp.month) ? sp.month[0] : sp.month
  const month = raw && MONTH.test(raw) ? raw : thisMonth()
  const [grid, settings] = await Promise.all([getTargetGrid(month), getSettings()])
  const sym = currencySymbol(settings.currency)
  const withT = grid.rows.filter((r) => r.totalTarget > 0)
  const met = withT.filter((r) => r.totalActual >= r.totalTarget).length
  const totalT = withT.reduce((n, r) => n + r.totalTarget, 0), totalA = withT.reduce((n, r) => n + r.totalActual, 0)
  const incentiveDue = withT.filter((r) => r.totalActual >= r.totalTarget && r.incentive).reduce((n, r) => n + (r.incentive ?? 0), 0)
  const ranking = withT.map((r) => ({ name: r.name, v: r.totalTarget ? Math.round((r.totalActual / r.totalTarget) * 100) : 0 })).sort((a, b) => b.v - a.v).slice(0, 12)
  const byRegion = grid.regions.map((rg) => { const rs = withT.filter((r) => (r.region ?? 'Unassigned') === rg); const t = rs.reduce((n, r) => n + r.totalTarget, 0), a = rs.reduce((n, r) => n + r.totalActual, 0); return { name: rg, v: t ? Math.round((a / t) * 100) : 0 } }).filter((x) => x.v || true)
  return (
    <div className="rise">
      <PageHeader eyebrow="Incentives" title="Monthly targets" sub="Set each promoter’s target per brand and the incentive for hitting the total. Progress updates the moment a promoter records a sale."
        action={<a href={`/admin/targets/export?month=${month}`} className="btn btn-primary"><Icon name="download" size={16} /> Export to Excel</a>} />
      <div className="no-print flex items-center gap-2 mb-5">
        <Link href={`/admin/targets?month=${addMonths(month, -1)}`} className="icon-btn" aria-label="Previous month"><Icon name="chevronL" size={16} /></Link>
        <span className="text-lg font-semibold min-w-[12rem] text-center">{monthLabel(month)}</span>
        <Link href={`/admin/targets?month=${addMonths(month, 1)}`} className="icon-btn" aria-label="Next month"><Icon name="chevronR" size={16} /></Link>
        {month !== thisMonth() && <Link href="/admin/targets" className="text-sm font-semibold text-brand-ink hover:underline ml-2">This month</Link>}
      </div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {[
          ['Network attainment', totalT ? `${Math.round((totalA / totalT) * 100)}%` : '—', `${totalA.toLocaleString()} of ${totalT.toLocaleString()} units`, true],
          ['Promoters with targets', String(withT.length), `of ${grid.rows.length} active`, false],
          ['Targets met', String(met), withT.length ? `${Math.round((met / withT.length) * 100)}% of promoters` : 'No targets yet', false],
          ['Incentives earned', `${sym} ${incentiveDue.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`, 'for targets met so far', false],
        ].map(([l, v, s, hot]) => (
          <div key={String(l)} className={cx('rounded-2xl p-5 border', hot ? 'bg-brand text-white border-brand shadow-glow' : 'card')}><div className={cx('text-xs', hot ? 'text-white/75' : 'text-muted')}>{l}</div><div className="text-3xl font-semibold tabular-nums mt-1 truncate">{v}</div><div className={cx('text-xs mt-2', hot ? 'text-white/80' : 'text-muted')}>{s}</div></div>
        ))}
      </div>
      <TargetsGrid grid={grid} symbol={sym} editable />
      {withT.length > 0 && (
        <div className="grid xl:grid-cols-2 gap-4 mt-4">
          <section className="card p-6"><h2 className="font-semibold text-lg">Promoter leaderboard</h2><p className="text-xs text-muted mb-5">% of total target achieved</p><HBarChart data={ranking} fmt={(n) => `${Math.round(n)}%`} highlight="high" /></section>
          <section className="card p-6"><h2 className="font-semibold text-lg">By region</h2><p className="text-xs text-muted mb-5">% of regional target achieved</p><HBarChart data={byRegion} fmt={(n) => `${Math.round(n)}%`} highlight="high" /></section>
        </div>
      )}
    </div>
  )
}
