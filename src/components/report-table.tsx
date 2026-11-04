import { Icon } from './icons'
import { Empty, cx } from './ui'
import type { Report } from '@/lib/reports'
import { fmtDate } from '@/lib/format'

const fmtN = (n: number) => n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Brand × outlet price matrix. Rows: brands grouped by SKU. Columns: outlets. Cheapest / dearest per row are tinted. */
export function ReportTable({ r, symbol, agg }: { r: Report; symbol: string; agg: string }) {
  if (!r.groups.length || !r.outlets.length) return <Empty icon="table" title="Nothing to report for these filters" hint="Widen the date range, or pick a different SKU, region or outlet." />
  const hasData = r.totals.points > 0
  return (
    <div className="scroll-x max-h-[70vh] overflow-auto">
      <table className="pivot w-full text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky-col th text-left px-4 py-3 border-b border-line min-w-[13rem]">Brand</th>
            {r.outlets.map((o) => (
              <th key={o.id} className="th text-right px-3 py-2 border-b border-l border-line min-w-[7.5rem] align-bottom">
                <span className="block normal-case tracking-normal text-[0.8rem] font-semibold text-ink truncate max-w-[9rem]" title={o.name}>{o.name}</span>
                <span className="block text-[0.62rem] font-medium text-muted truncate">{o.region}</span>
              </th>
            ))}
            <th className="th text-right px-3 py-3 border-b border-l-2 border-line bg-mint/60">Min</th>
            <th className="th text-right px-3 py-3 border-b border-line bg-mint/60">Avg</th>
            <th className="th text-right px-3 py-3 border-b border-line bg-mint/60">Max</th>
            <th className="th text-right px-3 py-3 border-b border-line bg-mint/60">Spread</th>
          </tr>
        </thead>
        <tbody>
          {r.groups.map((g) => (
            <GroupRows key={g.sku.id} g={g} outlets={r.outlets} symbol={symbol} />
          ))}
          {hasData && (
            <tr className="bg-[#faf9f6]">
              <td className="sticky-col px-4 py-3 border-t-2 border-line font-semibold text-xs" style={{ background: '#faf9f6' }}>
                Outlet price index <span className="block text-[0.65rem] font-normal text-muted">100 = network average</span>
              </td>
              {r.outlets.map((o) => (
                <td key={o.id} className={cx('px-3 py-3 border-t-2 border-l border-line text-right tabular-nums font-semibold', o.avgIndex == null ? 'text-muted' : o.avgIndex < 99 ? 'text-success' : o.avgIndex > 101 ? 'text-brand-ink' : '')}>
                  {o.avgIndex == null ? '—' : o.avgIndex.toFixed(1)}
                </td>
              ))}
              <td colSpan={4} className="border-t-2 border-l-2 border-line bg-mint/60" />
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 border-t border-line text-[0.7rem] text-muted">
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-success-soft border border-success/40" /> Cheapest on the row</span>
        <span className="flex items-center gap-1.5"><i className="size-2.5 rounded-sm bg-mint border border-brand/40" /> Dearest on the row</span>
        <span>N/A = brand not on shelf · — = no capture · Values: {agg === 'latest' ? 'latest capture in range' : `${agg} of captures in range`}</span>
      </div>
    </div>
  )
}

function GroupRows({ g, outlets, symbol }: { g: Report['groups'][number]; outlets: Report['outlets']; symbol: string }) {
  return (
    <>
      <tr>
        <td colSpan={outlets.length + 5} className="px-4 py-2 border-b border-line bg-forest text-white">
          <span className="inline-flex items-center gap-2 text-xs font-semibold"><span className="grid place-items-center size-6 rounded-md bg-brand text-white text-[0.6rem] font-bold">{g.sku.code}</span>{g.sku.label}<span className="text-white/50 font-normal">· {g.rows.length} brands</span></span>
        </td>
      </tr>
      {g.rows.map((row, i) => (
        <tr key={row.brand.id} className={cx('group', i % 2 ? 'bg-[#fcfbf9]' : 'bg-white')}>
          <td className="sticky-col px-4 py-2.5 border-b border-line font-medium" style={{ background: i % 2 ? '#fcfbf9' : '#fff' }}>
            <span className="flex items-center gap-2"><span className="grid place-items-center size-6 rounded-full bg-mint text-brand-ink text-[0.6rem] font-bold shrink-0">{row.brand.name[0]}</span><span className="truncate max-w-[11rem]" title={row.brand.name}>{row.brand.name}</span></span>
          </td>
          {outlets.map((o) => {
            const c = row.cells[o.id]
            const isMin = c.v != null && c.v === row.min && row.n > 1
            const isMax = c.v != null && c.v === row.max && row.n > 1 && row.min !== row.max
            return (
              <td key={o.id} title={c.date ? `${c.n} capture${c.n === 1 ? '' : 's'} · last ${fmtDate(c.date)}` : undefined}
                className={cx('px-3 py-2.5 border-b border-l border-line text-right tabular-nums', isMin && 'bg-success-soft text-success font-semibold', isMax && 'bg-mint text-brand-ink font-semibold', c.v == null && 'text-muted')}>
                {c.v != null ? fmtN(c.v) : c.na ? <span className="text-[0.7rem] font-semibold">N/A</span> : '—'}
              </td>
            )
          })}
          <td className="px-3 py-2.5 border-b border-l-2 border-line text-right tabular-nums bg-mint/30">{row.min != null ? fmtN(row.min) : '—'}</td>
          <td className="px-3 py-2.5 border-b border-line text-right tabular-nums bg-mint/30 font-semibold">{row.avg != null ? fmtN(row.avg) : '—'}</td>
          <td className="px-3 py-2.5 border-b border-line text-right tabular-nums bg-mint/30">{row.max != null ? fmtN(row.max) : '—'}</td>
          <td className="px-3 py-2.5 border-b border-line text-right tabular-nums bg-mint/30 text-muted">{row.min != null && row.max != null ? `${symbol} ${fmtN(row.max - row.min)}` : '—'}</td>
        </tr>
      ))}
    </>
  )
}

export function PrintHint() {
  return <p className="hidden print:block text-xs text-muted mt-2 flex items-center gap-1"><Icon name="info" size={12} /> Generated by MarketLens · Olam Agri</p>
}
