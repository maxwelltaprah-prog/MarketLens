import { getCurrentUser } from '@/lib/session'
import { allSales, getSalesAnalytics, parseSalesFilters } from '@/lib/sales-core'
import { buildXlsx, XLSX_MIME } from '@/lib/xlsx'
import { logSecurity } from '@/lib/security'

export const dynamic = 'force-dynamic'

/** Excel workbook: every sales line plus summary sheets by brand, outlet, pack size and day. */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') { await logSecurity('authz.denied', { path: '/admin/sales/export' }, user?.id ?? null); return new Response('Unauthorized', { status: 401 }) }
  const { f } = parseSalesFilters(Object.fromEntries(new URL(req.url).searchParams.entries()))
  const [rows, a] = await Promise.all([allSales(f), getSalesAnalytics(f)])
  const wb = buildXlsx([
    { name: 'Sales', header: ['Date', 'Outlet', 'Region', 'Promoter', 'Brand', 'Pack size', 'Units', 'Unit price', 'Value', 'Last updated'],
      rows: rows.map((r) => [r.date, r.outlet, r.region, r.promoter, r.brand, r.sku, r.quantity, r.unitPrice == null ? null : Number(r.unitPrice), r.value, r.updatedAt.toISOString()]) },
    { name: 'By brand', header: ['Brand', 'Units', 'Value'], rows: a.byBrand.map((b) => [b.name, b.v, b.value]) },
    { name: 'By outlet', header: ['Outlet', 'Region', 'Units', 'Value'], rows: a.byOutlet.map((o) => [o.name, o.region, o.v, o.value]) },
    { name: 'By pack size', header: ['Pack size', 'Units'], rows: a.bySku.map((s) => [s.name, s.v]) },
    { name: 'By day', header: ['Date', 'Units'], rows: a.byDay.map((d) => [d.d, d.v]) },
    { name: 'By promoter', header: ['Promoter', 'Units'], rows: a.byPromoter.map((p) => [p.name, p.v]) },
    { name: 'Filters', header: ['Setting', 'Value'], rows: [['From', f.from], ['To', f.to], ['Exported', new Date().toISOString()], ['Exported by', user.name]] },
  ])
  return new Response(new Uint8Array(wb), { headers: {
    'Content-Type': XLSX_MIME,
    'Content-Disposition': `attachment; filename="marketlens-sales_${f.from}_to_${f.to}.xlsx"`,
    'Cache-Control': 'no-store',
  } })
}
