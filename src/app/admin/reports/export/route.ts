import { getCurrentUser } from '@/lib/session'
import { getReport, parseReportFilters } from '@/lib/reports'
import { toCsv } from '@/lib/csv'
import { logSecurity } from '@/lib/security'

export const dynamic = 'force-dynamic'

/** CSV of the brand × outlet matrix exactly as displayed, plus row statistics. */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') { await logSecurity('authz.denied', { path: '/admin/reports/export' }, user?.id ?? null); return new Response('Unauthorized', { status: 401 }) }
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries())
  const { f } = parseReportFilters(sp)
  const r = await getReport(f)
  const rows: (string | number | null)[][] = [
    ['sku', 'brand', ...r.outlets.map((o) => o.name), 'min', 'avg', 'max', 'spread'],
    ['', 'region', ...r.outlets.map((o) => o.region), '', '', '', ''],
  ]
  for (const g of r.groups) for (const row of g.rows)
    rows.push([g.sku.label, row.brand.name, ...r.outlets.map((o) => { const c = row.cells[o.id]; return c.v != null ? c.v : c.na ? 'N/A' : '' }),
      row.min, row.avg, row.max, row.min != null && row.max != null ? Math.round((row.max - row.min) * 100) / 100 : null])
  rows.push(['', 'outlet price index (100 = avg)', ...r.outlets.map((o) => o.avgIndex), '', '', '', ''])
  return new Response(toCsv(rows), { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="marketlens-price-matrix_${f.from}_to_${f.to}_${f.agg}.csv"`,
    'Cache-Control': 'no-store',
  } })
}
