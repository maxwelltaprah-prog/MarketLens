import Link from 'next/link'
import { Suspense } from 'react'
import { Icon, type IconName } from '@/components/icons'
import { FilterBar } from '@/components/filter-bar'
import { AreaChart, BarChart, BarLabels, Donut, Meter } from '@/components/charts'
import { DashboardSkeleton } from '@/components/admin-skeletons'
import { EntryTable } from '@/components/entry-table'
import { PageHeader, cx } from '@/components/ui'
import { getDashboard, getFilterOptions, parseFilters } from '@/lib/admin-queries'
import { getSettings } from '@/lib/settings'
import { getCatalog, totalPricePoints } from '@/lib/catalog'
import { currencySymbol, money, todayISO } from '@/lib/format'

export const metadata = { title: 'Dashboard' }

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const { f, raw } = parseFilters(sp)
  const opts = await getFilterOptions()
  const today = todayISO()
  const qs = new URLSearchParams({ from: f.from, to: f.to, ...(f.outletId ? { outlet: f.outletId } : {}) }).toString()
  return (
    <div className="rise">
      <PageHeader eyebrow="Overview" title="Market pulse" sub="Track field coverage and competitive pricing across your network."
        action={<a href={`/admin/export?${qs}`} className="btn btn-primary"><Icon name="download" size={16} /> Export report</a>} />
      <FilterBar defaults={{ from: `${today.slice(0, 8)}01`, to: today }}
        fields={{ outlet: opts.outlets.map((o) => ({ id: o.id, name: o.name })), sku: opts.skus.map((s) => ({ id: s.id, name: s.label })), brand: opts.brands.map((b) => ({ id: b.id, name: b.name, skuId: b.skuId })) }} />
      <Suspense key={JSON.stringify(raw)} fallback={<DashboardSkeleton />}><DashboardBody f={f} /></Suspense>
    </div>
  )
}

function Delta({ d, light }: { d: number | null; light?: boolean }) {
  if (d == null) return <span className={cx('text-sm', light ? 'text-white/70' : 'text-muted')}>No previous data</span>
  return (
    <span className="text-sm"><span className={cx('font-semibold', light ? 'text-white' : d >= 0 ? 'text-success' : 'text-danger')}>{d >= 0 ? '+' : ''}{d.toFixed(1)}%</span>
      <span className={light ? 'text-white/70' : 'text-muted'}> vs. previous period</span></span>
  )
}

function Kpi({ icon, label, value, children, hot }: { icon: IconName; label: string; value: string; children: React.ReactNode; hot?: boolean }) {
  return (
    <div className={cx('rounded-2xl p-5 border transition-transform hover:-translate-y-0.5', hot ? 'bg-brand text-white border-brand shadow-glow' : 'card')}>
      <div className={cx('grid place-items-center size-10 rounded-xl', hot ? 'bg-white/15 text-white' : 'bg-mint text-brand-ink')}><Icon name={icon} /></div>
      <div className={cx('text-xs mt-5', hot ? 'text-white/75' : 'text-muted')}>{label}</div>
      <div className="text-3xl font-semibold tabular-nums mt-1 tracking-tight">{value}</div>
      <div className="mt-3">{children}</div>
    </div>
  )
}

async function DashboardBody({ f }: { f: Awaited<ReturnType<typeof parseFilters>>['f'] }) {
  const [d, settings, catalog] = await Promise.all([getDashboard(f), getSettings(), getCatalog()])
  const total = totalPricePoints(catalog)
  const fmt = (n: number) => money(n, settings.currency)
  const sym = currencySymbol(settings.currency)
  const skuLabel = d.sku?.label ?? 'SKU'
  const brandName = f.brandId ? d.opts.brands.find((b) => b.id === f.brandId)?.name : null
  const pct = d.kpi.reporting.of ? (d.kpi.reporting.v / d.kpi.reporting.of) * 100 : 0
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi icon="bars" label="Total submissions" value={d.kpi.submissions.v.toLocaleString()}><Delta d={d.kpi.submissions.d} /></Kpi>
        <Kpi hot icon="building" label="Reporting today" value={`${d.kpi.reporting.v} / ${d.kpi.reporting.of}`}><span className="text-sm"><span className="font-semibold text-white">{pct.toFixed(1)}%</span> <span className="text-white/70">of outlets submitted</span></span></Kpi>
        <Kpi icon="check" label="Price points" value={d.kpi.points.v.toLocaleString()}><Delta d={d.kpi.points.d} /></Kpi>
        <Kpi icon="trend" label={`Avg. ${skuLabel} price`} value={d.kpi.avg.v == null ? '-' : fmt(d.kpi.avg.v)}><Delta d={d.kpi.avg.d} /></Kpi>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <section className="card p-6">
          <h2 className="font-semibold text-lg">Average price by brand</h2>
          <p className="text-xs text-muted mb-4">{skuLabel} · market range comparison</p>
          <BarChart data={d.bars} fmt={fmt} /><BarLabels names={d.bars.map((b) => b.name)} />
        </section>
        <section className="card p-6">
          <h2 className="font-semibold text-lg">Today’s compliance</h2>
          <p className="text-xs text-muted mb-4">{d.kpi.reporting.v} of {d.kpi.reporting.of} outlets reporting</p>
          <Donut value={d.kpi.reporting.v} total={d.kpi.reporting.of} label="complete" />
          <div className="flex justify-center gap-6 text-xs mt-4 text-muted">
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-brand" />Submitted <b className="text-ink">{d.kpi.reporting.v}</b></span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-amber" />Pending <b className="text-ink">{d.pending.length}</b></span>
          </div>
          {d.pending.length > 0 && (
            <Link href={`/admin/entries?status=draft&from=${d.today}&to=${d.today}`} className="mt-4 flex items-center gap-3 rounded-xl bg-amber-soft p-3 hover:brightness-95 transition">
              <Icon name="building" className="text-amber-ink" />
              <span className="min-w-0 flex-1 leading-tight"><span className="block text-sm font-semibold">{d.pending.length} outlet{d.pending.length === 1 ? '' : 's'} pending</span><span className="block text-xs text-amber-ink truncate">{d.pending.map((p) => p.name).join(', ')}</span></span>
              <Icon name="chevronR" size={16} />
            </Link>
          )}
        </section>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <section className="card p-6">
          <h2 className="font-semibold text-lg">Price trend</h2>
          <p className="text-xs text-muted mb-4">{brandName ?? 'All brands'} · {skuLabel} · selected period ({sym})</p>
          <AreaChart points={d.trend} fmt={fmt} />
        </section>
        <section className="card p-6">
          <h2 className="font-semibold text-lg">Brand availability</h2>
          <p className="text-xs text-muted mb-5">% of captures with a shelf price · {skuLabel}</p>
          <div className="space-y-4">{d.avail.length ? d.avail.map((a) => <Meter key={a.name} name={a.name} pct={a.pct} />) : <p className="text-sm text-muted py-8 text-center">No captures in this range.</p>}</div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <div className="p-6 pb-4 flex items-start justify-between gap-4">
          <div><h2 className="font-semibold text-lg">Recent submissions</h2><p className="text-xs text-muted">Latest activity from your field team</p></div>
          <Link href="/admin/entries" className="text-sm font-semibold text-brand-ink hover:underline">View all</Link>
        </div>
        <EntryTable rows={d.recent} total={total} />
      </section>
    </div>
  )
}
