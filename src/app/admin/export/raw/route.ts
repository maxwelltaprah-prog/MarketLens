import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { db, entries, entryPrices, outlets, users, skus, brands, sales } from '@/db'
import { getCurrentUser } from '@/lib/session'
import { isIso, isUuid } from '@/lib/admin-queries'
import { buildXlsx, XLSX_MIME } from '@/lib/xlsx'
import { DATE_HEADERS, dateRow } from '@/lib/date-parts'
import { todayISO } from '@/lib/format'
import { logSecurity } from '@/lib/security'

export const dynamic = 'force-dynamic'
const MAX = 200_000

/** Raw data dump for pivoting in Excel: one row per price observation and one per sale, each with date helper columns. */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') { await logSecurity('authz.denied', { path: '/admin/export/raw' }, user?.id ?? null); return new Response('Unauthorized', { status: 401 }) }
  const sp = new URL(req.url).searchParams
  const today = todayISO()
  const from = isIso(sp.get('from') ?? undefined) ? sp.get('from')! : `${today.slice(0, 8)}01`
  const to = isIso(sp.get('to') ?? undefined) ? sp.get('to')! : today
  const outletId = isUuid(sp.get('outlet') ?? undefined) ? sp.get('outlet')! : undefined
  const skuId = isUuid(sp.get('sku') ?? undefined) ? sp.get('sku')! : undefined
  const brandId = isUuid(sp.get('brand') ?? undefined) ? sp.get('brand')! : undefined
  const origin = `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host')}`

  const priceWhere = and(gte(entries.entryDate, from), lte(entries.entryDate, to), eq(entries.status, 'submitted'),
    ...(outletId ? [eq(entries.outletId, outletId)] : []), ...(skuId ? [eq(entryPrices.skuId, skuId)] : []), ...(brandId ? [eq(entryPrices.brandId, brandId)] : []))
  const salesWhere = and(gte(sales.saleDate, from), lte(sales.saleDate, to),
    ...(outletId ? [eq(sales.outletId, outletId)] : []), ...(skuId ? [eq(sales.skuId, skuId)] : []), ...(brandId ? [eq(sales.brandId, brandId)] : []))

  const [prices, salesRows] = await Promise.all([
    db.select({ date: entries.entryDate, outlet: outlets.name, region: outlets.region, promoter: users.name, sku: skus.label, brand: brands.name, company: brands.isCompany, price: entryPrices.price, na: entryPrices.notAvailable, submitted: entries.submittedAt, geo: entries.geoStatus, dist: entries.geoDistanceM })
      .from(entryPrices).innerJoin(entries, eq(entries.id, entryPrices.entryId)).innerJoin(outlets, eq(outlets.id, entries.outletId)).innerJoin(users, eq(users.id, entries.promoterId))
      .innerJoin(skus, eq(skus.id, entryPrices.skuId)).innerJoin(brands, eq(brands.id, entryPrices.brandId))
      .where(priceWhere).orderBy(asc(entries.entryDate), asc(outlets.name), asc(skus.sortOrder), asc(brands.name)).limit(MAX),
    db.select({ date: sales.saleDate, at: sales.capturedAt, outlet: outlets.name, region: outlets.region, promoter: users.name, sku: skus.label, brand: brands.name, qty: sales.quantity, price: sales.unitPrice, receiptId: sales.receiptId })
      .from(sales).innerJoin(outlets, eq(outlets.id, sales.outletId)).innerJoin(users, eq(users.id, sales.promoterId)).innerJoin(skus, eq(skus.id, sales.skuId)).innerJoin(brands, eq(brands.id, sales.brandId))
      .where(salesWhere).orderBy(asc(sales.saleDate), asc(sales.capturedAt)).limit(MAX),
  ])

  const wb = buildXlsx([
    { name: 'Prices', header: [...DATE_HEADERS, 'Outlet', 'Region', 'Promoter', 'SKU', 'Brand', 'Brand type', 'Price', 'Not available', 'Submitted at', 'Location check', 'Distance (m)'],
      rows: prices.map((r) => [...dateRow(r.date), r.outlet, r.region, r.promoter, r.sku, r.brand, r.company ? 'Company' : 'Competitor', r.price == null ? null : Number(r.price), r.na ? 'Yes' : 'No', r.submitted?.toISOString() ?? null, r.geo, r.dist]) },
    { name: 'Sales', header: [...DATE_HEADERS, 'Time', 'Outlet', 'Region', 'Promoter', 'SKU', 'Brand', 'Units', 'Unit price', 'Value', 'Receipt'],
      rows: salesRows.map((r) => [...dateRow(r.date), r.at ? r.at.toISOString().slice(11, 16) : null, r.outlet, r.region, r.promoter, r.sku, r.brand, r.qty, r.price == null ? null : Number(r.price), r.price == null ? null : Math.round(r.qty * Number(r.price) * 100) / 100, r.receiptId ? `${origin}/api/receipts/${r.receiptId}` : null]) },
    { name: 'About', header: ['Field', 'Value'], rows: [['From', from], ['To', to], ['Price rows', prices.length], ['Sales rows', salesRows.length], ['Exported', new Date().toISOString()], ['Exported by', user.name], ['Tip', 'Insert → PivotTable on the Prices or Sales sheet; use Year-Month / ISO week / Weekday as row or column fields.']] },
  ])
  return new Response(new Uint8Array(wb), { headers: { 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="marketlens-raw-data_${from}_to_${to}.xlsx"`, 'Cache-Control': 'no-store' } })
}
