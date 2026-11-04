import { Suspense } from 'react'
import { Icon } from '@/components/icons'
import { FilterBar } from '@/components/filter-bar'
import { Pagination } from '@/components/pagination'
import { AreaChart, BarChart, BarLabels, HBarChart } from '@/components/charts'
import { DashboardSkeleton, TableSkeleton } from '@/components/admin-skeletons'
import { PageHeader, Empty, cx } from '@/components/ui'
import { getFilterOptions } from '@/lib/admin-queries'
import { getSalesAnalytics, getSalesFilterOptions, listSales, parseSalesFilters, SALES_PAGE, type SalesFilters } from '@/lib/sales-core'
import { getSettings } from '@/lib/settings'
import { currencySymbol, fmtDate, fmtTime, money, todayISO } from '@/lib/format'

export const metadata = { title: 'Sales' }
type SP = Record<string, string | string[] | undefined>

export default async function SalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const { f, raw } = parseSalesFilters(sp)
  const page = Math.max(1, Number.parseInt((Array.isArray(sp.page) ? sp.page[0] : sp.page) ?? '1', 10) || 1)
  const [opts, so] = await Promise.all([getFilterOptions(), getSalesFilterOptions()])
  const today = todayISO()
  const qs = new URLSearchParams(raw).toString()
  return (
    <div className="rise">
      <PageHeader eyebrow="Sales" title="Daily sales" sub="Units of company brands sold at every outlet, as recorded by promoters. Filter, chart and export to Excel."
        action={<a href={`/admin/sales/export?${qs}`} className="btn btn-primary"><Icon name="download" size={16} /> Export to Excel</a>} />
      <FilterBar defaults={{ from: `${today.slice(0, 8)}01`, to: today }}
        fields={{ outlet: opts.outlets.map((o) => ({ id: o.id, name: o.name })), sku: opts.skus.map((s) => ({ id: s.id, name: s.label })), brand: so.brands,
          extra: [{ k: 'region', label: 'Region', opts: so.regions.map((r) => ({ id: r, name: r })) }, { k: 'promoter', label: 'Promoter', opts: so.promoters }] }} />
      <Suspense key={JSON.stringify(raw)} fallback={<DashboardSkeleton />}><Analytics f={f} /></Suspense>
      <section className="card overflow-hidden mt-4">
        <div className="px-5 py-4 border-b border-line flex items-center justify-between"><div><h2 className="font-semibold">All sales lines</h2><p className="text-xs text-muted">One line per outlet, day, brand and pack size</p></div></div>
        <Suspense key={JSON.stringify(raw) + page} fallback={<TableSkeleton rows={8} />}><Rows f={f} page={page} /></Suspense>
      </section>
    </div>
  )
}

function Kpi({ label, value, sub, hot }: { label: string; value: string; sub?: React.ReactNode; hot?: boolean }) {
  return (
    <div className={cx('rounded-2xl p-5 border', hot ? 'bg-brand text-white border-brand shadow-glow' : 'card')}>
      <div className={cx('text-xs', hot ? 'text-white/75' : 'text-muted')}>{label}</div>
      <div className="text-3xl font-semibold tabular-nums mt-1 tracking-tight truncate">{value}</div>
      {sub && <div className={cx('text-sm mt-2', hot ? 'text-white/80' : 'text-muted')}>{sub}</div>}
    </div>
  )
}
const Delta = ({ d }: { d: number | null }) => d == null ? <span>No previous period</span> : <><span className={cx('font-semibold', d >= 0 ? 'text-success' : 'text-danger')}>{d >= 0 ? '+' : ''}{d.toFixed(1)}%</span> vs. previous period</>

async function Analytics({ f }: { f: SalesFilters }) {
  const [a, settings] = await Promise.all([getSalesAnalytics(f), getSettings()])
  const fmt = (n: number) => money(n, settings.currency)
  const sym = currencySymbol(settings.currency)
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi hot label="Units sold" value={a.kpi.units.toLocaleString()} sub={<Delta d={a.kpi.unitsDelta} />} />
        <Kpi label="Sales value" value={a.kpi.value == null ? '—' : fmt(a.kpi.value)} sub={a.kpi.value == null ? 'Add unit prices to see value' : <Delta d={a.kpi.valueDelta} />} />
        <Kpi label="Outlets selling" value={String(a.kpi.outlets)} sub={`${a.kpi.lines.toLocaleString()} lines over ${a.kpi.days} day${a.kpi.days === 1 ? '' : 's'}`} />
        <Kpi label="Units per day" value={a.kpi.perDay.toLocaleString()} sub="average across reporting days" />
      </div>
      <div className="grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
        <section className="card p-6"><h2 className="font-semibold text-lg">Units by day</h2><p className="text-xs text-muted mb-4">All filtered sales, per day</p><AreaChart points={a.byDay.map((d) => ({ d: d.d, v: d.v }))} fmt={(n) => `${Math.round(n)} units`} /></section>
        <section className="card p-6"><h2 className="font-semibold text-lg">Units by pack size</h2><p className="text-xs text-muted mb-4">Which sizes move</p><BarChart data={a.bySku.map((s) => ({ name: s.name, v: s.v }))} fmt={(n) => String(Math.round(n))} /><BarLabels names={a.bySku.map((s) => s.name)} /></section>
      </div>
      <div className="grid xl:grid-cols-3 gap-4">
        <section className="card p-6"><h2 className="font-semibold text-lg">By brand</h2><p className="text-xs text-muted mb-5">Units{a.byBrand.some((b) => b.value != null) ? ` · value in ${sym}` : ''}</p><HBarChart data={a.byBrand.map((b) => ({ name: b.name, v: b.v }))} fmt={(n) => String(Math.round(n))} highlight="high" /></section>
        <section className="card p-6"><h2 className="font-semibold text-lg">By outlet</h2><p className="text-xs text-muted mb-5">Top outlets by units</p><HBarChart data={a.byOutlet.slice(0, 12).map((o) => ({ name: o.name, v: o.v }))} fmt={(n) => String(Math.round(n))} highlight="high" /></section>
        <section className="card p-6"><h2 className="font-semibold text-lg">By promoter</h2><p className="text-xs text-muted mb-5">Units recorded</p><HBarChart data={a.byPromoter.map((p) => ({ name: p.name, v: p.v }))} fmt={(n) => String(Math.round(n))} highlight="high" /></section>
      </div>
    </div>
  )
}

async function Rows({ f, page }: { f: SalesFilters; page: number }) {
  const [{ rows, total }, settings] = await Promise.all([listSales(f, page), getSettings()])
  const sym = currencySymbol(settings.currency)
  if (!rows.length) return <Empty icon="trend" title="No sales match these filters" hint="Widen the date range or clear filters." />
  return (
    <>
      <div className="scroll-x">
        <table className="w-full text-sm min-w-[56rem]">
          <thead><tr className="bg-[#f3f4f0] text-left">{['Date', 'Outlet', 'Region', 'Promoter', 'Brand', 'Pack size', 'Units', `Unit price (${sym})`, `Value (${sym})`, 'Updated'].map((h) => <th key={h} className="th px-4 py-3 font-bold whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-[#fafbf8]">
                <td className="px-4 py-3 text-muted whitespace-nowrap">{fmtDate(r.date)}</td>
                <td className="px-4 py-3 font-semibold">{r.outlet}</td>
                <td className="px-4 py-3 text-muted">{r.region}</td>
                <td className="px-4 py-3 text-muted">{r.promoter}</td>
                <td className="px-4 py-3"><span className="pill pill-brand">{r.brand}</span></td>
                <td className="px-4 py-3">{r.sku}</td>
                <td className="px-4 py-3 tabular-nums font-semibold text-right">{r.quantity.toLocaleString()}</td>
                <td className="px-4 py-3 tabular-nums text-right text-muted">{r.unitPrice ?? '—'}</td>
                <td className="px-4 py-3 tabular-nums text-right">{r.value != null ? r.value.toLocaleString('en-GH', { minimumFractionDigits: 2 }) : '—'}</td>
                <td className="px-4 py-3 text-muted whitespace-nowrap text-xs">{fmtDate(r.updatedAt.toISOString().slice(0, 10))} {fmtTime(r.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / SALES_PAGE))} total={total} size={SALES_PAGE} />
    </>
  )
}
