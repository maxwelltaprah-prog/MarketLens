import { Suspense } from 'react'
import { Icon } from '@/components/icons'
import { FilterBar } from '@/components/filter-bar'
import { ReportToolbar } from '@/components/report-toolbar'
import { ReportTable } from '@/components/report-table'
import { AreaChart, HBarChart } from '@/components/charts'
import { ReportSkeleton } from '@/components/admin-skeletons'
import { PageHeader, cx } from '@/components/ui'
import { getFilterOptions } from '@/lib/admin-queries'
import { getReport, parseReportFilters, MAX_DAYS, type ReportFilters } from '@/lib/reports'
import { getSettings } from '@/lib/settings'
import { currencySymbol, fmtDate, money, todayISO, addDaysISO } from '@/lib/format'
import { db, outlets } from '@/db'
import { asc, eq } from 'drizzle-orm'

export const metadata = { title: 'Price report' }

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const { f, raw } = parseReportFilters(sp)
  const [opts, regions] = await Promise.all([getFilterOptions(), db.selectDistinct({ region: outlets.region }).from(outlets).where(eq(outlets.active, true)).orderBy(asc(outlets.region))])
  const today = todayISO()
  const qs = new URLSearchParams(raw).toString()
  return (
    <div className="rise">
      <PageHeader eyebrow="Reporting" title="Brand × outlet price matrix" sub="Every brand down the side, every outlet across the top. Filter by pack size, date, region or outlet. Export or print in one click." />
      <FilterBar defaults={{ from: addDaysISO(today, -6), to: today }}
        fields={{
          sku: opts.skus.map((s) => ({ id: s.id, name: s.label })), brand: opts.brands.map((b) => ({ id: b.id, name: b.name, skuId: b.skuId })),
          outlet: opts.outlets.map((o) => ({ id: o.id, name: o.name })),
          extra: [{ k: 'region', label: 'Region', opts: regions.map((r) => ({ id: r.region, name: r.region })) }],
        }} />
      <ReportToolbar agg={f.agg} exportHref={`/admin/reports/export?${qs}`} />
      {f.clamped && <p className="no-print text-xs text-amber-ink bg-amber-soft rounded-xl px-3 py-2 mb-4 inline-flex items-center gap-2"><Icon name="info" size={14} /> Showing the last {MAX_DAYS} days of the selected range.</p>}
      <Suspense key={JSON.stringify(raw)} fallback={<ReportSkeleton />}><Body f={f} /></Suspense>
    </div>
  )
}

async function Body({ f }: { f: ReportFilters }) {
  const [r, settings] = await Promise.all([getReport(f), getSettings()])
  const sym = currencySymbol(settings.currency)
  const fmt = (n: number) => money(n, settings.currency)
  const cheapest = [...r.outlets].filter((o) => o.avgIndex != null).sort((a, b) => a.avgIndex! - b.avgIndex!)
  const range = f.from === f.to ? fmtDate(f.from) : `${fmtDate(f.from)} – ${fmtDate(f.to)}`
  return (
    <div className="space-y-4">
      <div className="hidden print:block mb-2"><h1 className="text-2xl font-medium">Shelf price report · {range}</h1><p className="text-sm text-muted">{sym} · {f.agg} values · {r.outlets.length} outlets · {r.totals.brands} brand rows</p></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Period" value={range} sub={`${r.totals.captures} captures`} />
        <Stat label="Price points" value={r.totals.points.toLocaleString()} sub={`${r.totals.brands} brand rows × ${r.outlets.length} outlets`} />
        <Stat label="Cheapest outlet" value={cheapest[0]?.name ?? '—'} sub={cheapest[0] ? `Index ${cheapest[0].avgIndex} · ${cheapest[0].region}` : 'No data'} tone="ok" />
        <Stat label="Dearest outlet" value={cheapest.at(-1)?.name ?? '—'} sub={cheapest.length ? `Index ${cheapest.at(-1)!.avgIndex} · ${cheapest.at(-1)!.region}` : 'No data'} tone="hot" />
      </div>

      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
          <div><h2 className="font-semibold">Price matrix</h2><p className="text-xs text-muted">{sym} · hover a cell for capture count and last date</p></div>
          <span className="pill pill-brand">{f.agg}</span>
        </div>
        <ReportTable r={r} symbol={sym} agg={f.agg} />
      </section>

      <div className="grid xl:grid-cols-2 gap-4 print:break-before-page">
        <section className="card p-6">
          <h2 className="font-semibold text-lg">Brands, cheapest to dearest</h2>
          <p className="text-xs text-muted mb-5">{r.brandAvg ? `${r.brandAvg.sku} · average across outlets in the period` : 'No data'}{!f.skuId && r.groups.length > 1 && ' · choose a pack size above to compare another'}</p>
          <HBarChart data={r.brandAvg?.data.slice(0, 12) ?? []} fmt={fmt} highlight="low" />
        </section>
        <section className="card p-6">
          <h2 className="font-semibold text-lg">Outlet price index</h2>
          <p className="text-xs text-muted mb-5">100 = network average · lower is cheaper</p>
          <HBarChart data={cheapest.map((o) => ({ name: o.name, v: o.avgIndex! }))} fmt={(n) => n.toFixed(1)} highlight="high" />
        </section>
        <section className="card p-6 xl:col-span-2">
          <h2 className="font-semibold text-lg">Daily average</h2>
          <p className="text-xs text-muted mb-4">Mean of all filtered price points per day ({sym})</p>
          <AreaChart points={r.trend} fmt={fmt} />
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: 'ok' | 'hot' }) {
  return (
    <div className={cx('rounded-2xl p-5 border', tone === 'hot' ? 'bg-forest text-white border-forest' : 'card')}>
      <div className={cx('text-xs', tone === 'hot' ? 'text-white/60' : 'text-muted')}>{label}</div>
      <div className={cx('font-semibold mt-1 truncate', value.length > 18 ? 'text-base' : 'text-xl', tone === 'ok' && 'text-success')} title={value}>{value}</div>
      <div className={cx('text-xs mt-1', tone === 'hot' ? 'text-brand-soft' : 'text-muted')}>{sub}</div>
    </div>
  )
}
