import 'server-only'
import { z } from 'zod'
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm'
import { db, sales, skus, brands, skuBrands, outlets, users, auditLog } from '@/db'
import { getSettings } from './settings'
import { todayISO } from './format'
import { isIso, isUuid } from './admin-queries'

/* ------------------------------------------------------------------
   Promoter side
------------------------------------------------------------------- */
export const saleLineSchema = z.object({
  quantity: z.number().int().min(0).max(1_000_000),
  unitPrice: z.string().max(14).regex(/^(\d{0,9}(\.\d{0,2})?)?$/).nullable().optional(),
})
export const salesMapSchema = z.record(z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/), saleLineSchema).refine((m) => Object.keys(m).length <= 300)
export type SalesMap = z.infer<typeof salesMapSchema>

export type CompanyCatalog = { brands: { id: string; name: string; skus: { id: string; label: string; code: string }[] }[] }

/** Company brands with the pack sizes they are sold in. Competitor brands never appear here. */
export async function getCompanyCatalog(): Promise<CompanyCatalog> {
  const rows = await db.select({ brandId: brands.id, brand: brands.name, skuId: skus.id, label: skus.label, code: skus.code })
    .from(skuBrands).innerJoin(skus, eq(skus.id, skuBrands.skuId)).innerJoin(brands, eq(brands.id, skuBrands.brandId))
    .where(and(eq(brands.isCompany, true), eq(brands.active, true), eq(skus.active, true))).orderBy(asc(brands.name), asc(skus.sortOrder))
  const out: CompanyCatalog = { brands: [] }
  for (const r of rows) {
    let b = out.brands.find((x) => x.id === r.brandId)
    if (!b) out.brands.push((b = { id: r.brandId, name: r.brand, skus: [] }))
    b.skus.push({ id: r.skuId, label: r.label, code: r.code })
  }
  return out
}

export async function getSalesForDay(outletId: string, date: string): Promise<Record<string, { quantity: number; unitPrice: string | null }>> {
  const rows = await db.select().from(sales).where(and(eq(sales.outletId, outletId), eq(sales.saleDate, date)))
  return Object.fromEntries(rows.map((r) => [`${r.skuId}:${r.brandId}`, { quantity: r.quantity, unitPrice: r.unitPrice ?? null }]))
}

export type SalesSaveResult = { ok: true; savedAt: string } | { ok: false; error: string; permanent: boolean }

/** Upsert the day's sales lines. A quantity of 0 removes the line. Only company brands are accepted. */
export async function saveSales(user: { id: string; outletId: string | null }, date: string, items: SalesMap, fix: { lat: number; lng: number } | null = null): Promise<SalesSaveResult> {
  if (!user.outletId) return { ok: false, error: 'You have no outlet assigned. Contact your administrator.', permanent: true }
  const s = await getSettings()
  const today = todayISO()
  if (date > today) return { ok: false, error: 'You can’t record sales for a future date.', permanent: true }
  if (date !== today && !s.allowBackdating) return { ok: false, error: 'Back-dated sales are turned off.', permanent: true }
  const keys = Object.keys(items)
  if (!keys.length) return { ok: true, savedAt: new Date().toISOString() }
  const valid = await db.select({ skuId: skuBrands.skuId, brandId: skuBrands.brandId }).from(skuBrands)
    .innerJoin(brands, eq(brands.id, skuBrands.brandId)).innerJoin(skus, eq(skus.id, skuBrands.skuId))
    .where(and(eq(brands.isCompany, true), eq(brands.active, true), eq(skus.active, true), inArray(skuBrands.brandId, [...new Set(keys.map((k) => k.split(':')[1]))])))
  const ok = new Set(valid.map((v) => `${v.skuId}:${v.brandId}`))
  const now = new Date()
  let touched = 0
  for (const k of keys) {
    if (!ok.has(k)) continue
    const [skuId, brandId] = k.split(':'); const it = items[k]
    if (it.quantity <= 0) { await db.delete(sales).where(and(eq(sales.outletId, user.outletId), eq(sales.saleDate, date), eq(sales.skuId, skuId), eq(sales.brandId, brandId))); touched++; continue }
    const price = it.unitPrice && Number(it.unitPrice) > 0 ? Number(it.unitPrice).toFixed(2) : null
    await db.insert(sales).values({ outletId: user.outletId, promoterId: user.id, saleDate: date, skuId, brandId, quantity: it.quantity, unitPrice: price, geoLat: fix?.lat ?? null, geoLng: fix?.lng ?? null, updatedAt: now })
      .onConflictDoUpdate({ target: [sales.outletId, sales.saleDate, sales.skuId, sales.brandId], set: { quantity: it.quantity, unitPrice: price, promoterId: user.id, updatedAt: now, ...(fix ? { geoLat: fix.lat, geoLng: fix.lng } : {}) } })
    touched++
  }
  if (touched) await db.insert(auditLog).values({ actorId: user.id, action: 'sales.save', entity: 'sales', entityId: `${user.outletId}:${date}`, meta: { lines: touched } })
  return { ok: true, savedAt: now.toISOString() }
}

/** Recent daily totals for the promoter's outlet. */
export async function recentSalesDays(outletId: string, limit = 30) {
  return db.select({ date: sales.saleDate, units: sql<number>`sum(${sales.quantity})::int`, lines: sql<number>`count(*)::int`, value: sql<string | null>`sum(${sales.quantity} * ${sales.unitPrice})` })
    .from(sales).where(eq(sales.outletId, outletId)).groupBy(sales.saleDate).orderBy(desc(sales.saleDate)).limit(limit)
}

/* ------------------------------------------------------------------
   Admin analytics
------------------------------------------------------------------- */
export type SalesFilters = { from: string; to: string; outletId?: string; skuId?: string; brandId?: string; region?: string; promoterId?: string }
export function parseSalesFilters(sp: Record<string, string | string[] | undefined>): { f: SalesFilters; raw: Record<string, string> } {
  const g = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined
  const today = todayISO()
  let from = isIso(g('from')) ? g('from')! : `${today.slice(0, 8)}01`
  let to = isIso(g('to')) ? g('to')! : today
  if (from > to) [from, to] = [to, from]
  const raw: Record<string, string> = {}
  for (const k of ['from', 'to', 'outlet', 'sku', 'brand', 'region', 'promoter']) if (g(k)) raw[k] = g(k)!.slice(0, 80)
  return { f: { from, to, outletId: isUuid(g('outlet')) ? g('outlet') : undefined, skuId: isUuid(g('sku')) ? g('sku') : undefined, brandId: isUuid(g('brand')) ? g('brand') : undefined, promoterId: isUuid(g('promoter')) ? g('promoter') : undefined, region: g('region')?.slice(0, 60) || undefined }, raw }
}

function salesWhere(f: SalesFilters): SQL {
  const parts: SQL[] = [gte(sales.saleDate, f.from), lte(sales.saleDate, f.to)]
  if (f.outletId) parts.push(eq(sales.outletId, f.outletId))
  if (f.skuId) parts.push(eq(sales.skuId, f.skuId))
  if (f.brandId) parts.push(eq(sales.brandId, f.brandId))
  if (f.promoterId) parts.push(eq(sales.promoterId, f.promoterId))
  if (f.region) parts.push(eq(outlets.region, f.region))
  return and(...parts)!
}

export type SalesRow = { id: string; date: string; outlet: string; region: string; promoter: string; brand: string; sku: string; quantity: number; unitPrice: string | null; value: number | null; updatedAt: Date }
const base = () => db.select({
  id: sales.id, date: sales.saleDate, outlet: outlets.name, region: outlets.region, promoter: users.name, brand: brands.name, sku: skus.label, skuOrder: skus.sortOrder,
  quantity: sales.quantity, unitPrice: sales.unitPrice, updatedAt: sales.updatedAt,
}).from(sales).innerJoin(outlets, eq(outlets.id, sales.outletId)).innerJoin(users, eq(users.id, sales.promoterId)).innerJoin(brands, eq(brands.id, sales.brandId)).innerJoin(skus, eq(skus.id, sales.skuId))

export const SALES_PAGE = 25
export async function listSales(f: SalesFilters, page: number) {
  const where = salesWhere(f)
  const [rows, [c]] = await Promise.all([
    base().where(where).orderBy(desc(sales.saleDate), asc(outlets.name), asc(brands.name), asc(skus.sortOrder)).limit(SALES_PAGE).offset((page - 1) * SALES_PAGE),
    db.select({ n: sql<number>`count(*)::int` }).from(sales).innerJoin(outlets, eq(outlets.id, sales.outletId)).where(where),
  ])
  return { rows: rows.map(toRow), total: c.n }
}
export async function allSales(f: SalesFilters, limit = 100_000) {
  return (await base().where(salesWhere(f)).orderBy(asc(sales.saleDate), asc(outlets.name), asc(brands.name), asc(skus.sortOrder)).limit(limit)).map(toRow)
}
const toRow = (r: Omit<SalesRow, 'value'> & { skuOrder: number }): SalesRow => ({ ...r, value: r.unitPrice != null ? Math.round(r.quantity * Number(r.unitPrice) * 100) / 100 : null })

export async function getSalesAnalytics(f: SalesFilters) {
  const where = salesWhere(f)
  const len = Math.round((Date.parse(f.to) - Date.parse(f.from)) / 86_400_000) + 1
  const prevTo = new Date(Date.parse(f.from) - 86_400_000).toISOString().slice(0, 10)
  const prevFrom = new Date(Date.parse(prevTo) - (len - 1) * 86_400_000).toISOString().slice(0, 10)
  const wherePrev = salesWhere({ ...f, from: prevFrom, to: prevTo })
  const j = () => db.select({ units: sql<number>`coalesce(sum(${sales.quantity}),0)::int`, value: sql<string | null>`sum(${sales.quantity} * ${sales.unitPrice})`, outlets: sql<number>`count(distinct ${sales.outletId})::int`, days: sql<number>`count(distinct ${sales.saleDate})::int`, lines: sql<number>`count(*)::int` })
    .from(sales).innerJoin(outlets, eq(outlets.id, sales.outletId))
  const [[cur], [prev], byBrand, bySku, byOutlet, byDay, byPromoter, opts] = await Promise.all([
    j().where(where), j().where(wherePrev),
    db.select({ name: brands.name, v: sql<number>`sum(${sales.quantity})::int`, value: sql<string | null>`sum(${sales.quantity} * ${sales.unitPrice})` }).from(sales).innerJoin(outlets, eq(outlets.id, sales.outletId)).innerJoin(brands, eq(brands.id, sales.brandId)).where(where).groupBy(brands.name).orderBy(desc(sql`sum(${sales.quantity})`)).limit(12),
    db.select({ name: skus.label, v: sql<number>`sum(${sales.quantity})::int` }).from(sales).innerJoin(outlets, eq(outlets.id, sales.outletId)).innerJoin(skus, eq(skus.id, sales.skuId)).where(where).groupBy(skus.label, skus.sortOrder).orderBy(asc(skus.sortOrder)),
    db.select({ name: outlets.name, region: outlets.region, v: sql<number>`sum(${sales.quantity})::int`, value: sql<string | null>`sum(${sales.quantity} * ${sales.unitPrice})` }).from(sales).innerJoin(outlets, eq(outlets.id, sales.outletId)).where(where).groupBy(outlets.name, outlets.region).orderBy(desc(sql`sum(${sales.quantity})`)).limit(20),
    db.select({ d: sales.saleDate, v: sql<number>`sum(${sales.quantity})::int` }).from(sales).innerJoin(outlets, eq(outlets.id, sales.outletId)).where(where).groupBy(sales.saleDate).orderBy(asc(sales.saleDate)),
    db.select({ name: users.name, v: sql<number>`sum(${sales.quantity})::int` }).from(sales).innerJoin(outlets, eq(outlets.id, sales.outletId)).innerJoin(users, eq(users.id, sales.promoterId)).where(where).groupBy(users.name).orderBy(desc(sql`sum(${sales.quantity})`)).limit(12),
    Promise.all([
      db.select({ id: brands.id, name: brands.name }).from(brands).where(and(eq(brands.isCompany, true), eq(brands.active, true))).orderBy(asc(brands.name)),
      db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, 'promoter')).orderBy(asc(users.name)),
      db.selectDistinct({ region: outlets.region }).from(outlets).where(eq(outlets.active, true)).orderBy(asc(outlets.region)),
    ]),
  ])
  const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null)
  return {
    kpi: { units: cur.units, unitsDelta: pct(cur.units, prev.units), value: cur.value == null ? null : Number(cur.value), valueDelta: cur.value != null && prev.value != null ? pct(Number(cur.value), Number(prev.value)) : null, outlets: cur.outlets, days: cur.days, lines: cur.lines, perDay: cur.days ? Math.round(cur.units / cur.days) : 0 },
    byBrand: byBrand.map((b) => ({ name: b.name, v: b.v, value: b.value == null ? null : Number(b.value) })),
    bySku, byOutlet: byOutlet.map((o) => ({ name: o.name, region: o.region, v: o.v, value: o.value == null ? null : Number(o.value) })),
    byDay: byDay.map((d) => ({ d: d.d, v: d.v })), byPromoter,
    opts: { brands: opts[0], promoters: opts[1], regions: opts[2].map((r) => r.region) },
  }
}

export async function getSalesFilterOptions() {
  const [b, p, r] = await Promise.all([
    db.select({ id: brands.id, name: brands.name }).from(brands).where(and(eq(brands.isCompany, true), eq(brands.active, true))).orderBy(asc(brands.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, 'promoter')).orderBy(asc(users.name)),
    db.selectDistinct({ region: outlets.region }).from(outlets).where(eq(outlets.active, true)).orderBy(asc(outlets.region)),
  ])
  return { brands: b, promoters: p, regions: r.map((x) => x.region) }
}
