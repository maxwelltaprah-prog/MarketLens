import { and, asc, eq } from 'drizzle-orm'
import { db, entries, entryPrices, outlets, users, skus, brands } from '@/db'
import { getCurrentUser } from '@/lib/session'
import { entryWhere, isIso, isUuid } from '@/lib/admin-queries'
import { toCsv } from '@/lib/csv'
import { todayISO } from '@/lib/format'

export const dynamic = 'force-dynamic'
const MAX_ROWS = 300_000

export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') return new Response('Unauthorized', { status: 401 })
  const sp = new URL(req.url).searchParams
  const today = todayISO()
  const from = isIso(sp.get('from') ?? undefined) ? sp.get('from')! : `${today.slice(0, 8)}01`
  const to = isIso(sp.get('to') ?? undefined) ? sp.get('to')! : today
  const status = sp.get('status') === 'draft' || sp.get('status') === 'submitted' ? (sp.get('status') as 'draft' | 'submitted') : undefined
  const where = entryWhere({ from, to, outletId: isUuid(sp.get('outlet') ?? undefined) ? sp.get('outlet')! : undefined, status, q: sp.get('q')?.slice(0, 80) || undefined })

  const rows = await db.select({
    date: entries.entryDate, outlet: outlets.name, region: outlets.region, promoter: users.name, status: entries.status, submitted: entries.submittedAt,
    sku: skus.label, brand: brands.name, price: entryPrices.price, na: entryPrices.notAvailable,
  }).from(entryPrices)
    .innerJoin(entries, eq(entries.id, entryPrices.entryId)).innerJoin(outlets, eq(outlets.id, entries.outletId))
    .innerJoin(users, eq(users.id, entries.promoterId)).innerJoin(skus, eq(skus.id, entryPrices.skuId)).innerJoin(brands, eq(brands.id, entryPrices.brandId))
    .where(and(where)).orderBy(asc(entries.entryDate), asc(outlets.name), asc(skus.sortOrder), asc(brands.name)).limit(MAX_ROWS)

  const csv = toCsv([
    ['date', 'outlet', 'region', 'promoter', 'status', 'submitted_at', 'sku', 'brand', 'price', 'not_available'],
    ...rows.map((r) => [r.date, r.outlet, r.region, r.promoter, r.status, r.submitted?.toISOString() ?? '', r.sku, r.brand, r.price, r.na ? 'yes' : '']),
  ])
  return new Response(csv, { headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="marketlens-prices_${from}_to_${to}.csv"`,
    'Cache-Control': 'no-store',
  } })
}
