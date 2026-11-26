import 'server-only'
import { z } from 'zod'
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm'
import { db, sales, skus, brands, skuBrands, outlets, users, auditLog, receipts } from '@/db'
import { getSettings } from './settings'
import { todayISO } from './format'
import { isIso, isUuid } from './admin-queries'

/* ------------------------------------------------------------------
   Promoter side
------------------------------------------------------------------- */
/** One sale transaction as captured on the device. The receipt rides along (base64, compressed on the phone). */
export const saleTxSchema = z.object({
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  skuId: z.string().uuid(), brandId: z.string().uuid(),
  quantity: z.number().int().min(1).max(1_000_000),
  unitPrice: z.string().max(14).regex(/^(\d{0,9}(\.\d{0,2})?)?$/).nullable().optional(),
  note: z.string().max(200).optional(),
  capturedAt: z.string().datetime(),
  receipt: z.lazy(() => receiptSchema).nullable().optional(),
})
export type SaleTx = z.infer<typeof saleTxSchema>

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

export type DaySale = { id: string; clientId: string | null; skuId: string; brandId: string; quantity: number; unitPrice: string | null; receiptId: string | null; capturedAt: Date | null }
export async function getSalesForDay(outletId: string, date: string): Promise<DaySale[]> {
  return db.select({ id: sales.id, clientId: sales.clientId, skuId: sales.skuId, brandId: sales.brandId, quantity: sales.quantity, unitPrice: sales.unitPrice, receiptId: sales.receiptId, capturedAt: sales.capturedAt })
    .from(sales).where(and(eq(sales.outletId, outletId), eq(sales.saleDate, date))).orderBy(asc(sales.capturedAt), asc(sales.createdAt))
}

export type SalesSaveResult = { ok: true; savedAt: string } | { ok: false; error: string; permanent: boolean }

/** Insert sale transactions (idempotent per clientId). Each receipt is stored first and linked. Only company brands are accepted. */
export async function saveSales(user: { id: string; outletId: string | null }, date: string, items: SaleTx[], fix: { lat: number; lng: number } | null = null): Promise<SalesSaveResult> {
  if (!user.outletId) return { ok: false, error: 'You have no outlet assigned. Contact your administrator.', permanent: true }
  const s = await getSettings()
  const today = todayISO()
  if (date > today) return { ok: false, error: 'You can’t record sales for a future date.', permanent: true }
  if (date !== today && !s.allowBackdating) return { ok: false, error: 'Back-dated sales are turned off.', permanent: true }
  if (!items.length) return { ok: true, savedAt: new Date().toISOString() }
  const valid = await db.select({ skuId: skuBrands.skuId, brandId: skuBrands.brandId }).from(skuBrands)
    .innerJoin(brands, eq(brands.id, skuBrands.brandId)).innerJoin(skus, eq(skus.id, skuBrands.skuId))
    .where(and(eq(brands.isCompany, true), eq(brands.active, true), eq(skus.active, true), inArray(skuBrands.brandId, [...new Set(items.map((i) => i.brandId))])))
  const ok = new Set(valid.map((v) => `${v.skuId}:${v.brandId}`))
  const now = new Date()
  let saved = 0
  for (const it of items) {
    if (!ok.has(`${it.skuId}:${it.brandId}`)) continue
    if (s.requireReceipt && !it.receipt) return { ok: false, error: 'Every sale needs a receipt or invoice photo.', permanent: true }
    let receiptId: string | null = null
    if (it.receipt) {
      const r = await saveReceipts(user, date, [it.receipt], fix)
      if (!r.ok) return r
      const [row] = await db.select({ id: receipts.id }).from(receipts).where(and(eq(receipts.promoterId, user.id), eq(receipts.clientId, it.receipt.clientId)))
      receiptId = row?.id ?? null
    }
    const price = it.unitPrice && Number(it.unitPrice) > 0 ? Number(it.unitPrice).toFixed(2) : null
    const ins = await db.insert(sales).values({ outletId: user.outletId, promoterId: user.id, saleDate: date, skuId: it.skuId, brandId: it.brandId, quantity: it.quantity, unitPrice: price, receiptId, clientId: it.clientId, note: it.note ?? null, geoLat: fix?.lat ?? null, geoLng: fix?.lng ?? null, capturedAt: new Date(it.capturedAt), updatedAt: now })
      .onConflictDoNothing().returning({ id: sales.id })
    if (ins.length) saved++
  }
  if (saved) await db.insert(auditLog).values({ actorId: user.id, action: 'sales.save', entity: 'sales', entityId: `${user.outletId}:${date}`, meta: { transactions: saved } })
  return { ok: true, savedAt: now.toISOString() }
}

/** Promoter edits to today's own sale (quantity / price). */
export async function updateSale(user: { id: string }, id: string, patch: { quantity?: number; unitPrice?: string | null }) {
  const set: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.quantity != null) set.quantity = patch.quantity
  if (patch.unitPrice !== undefined) set.unitPrice = patch.unitPrice && Number(patch.unitPrice) > 0 ? Number(patch.unitPrice).toFixed(2) : null
  const r = await db.update(sales).set(set).where(and(eq(sales.id, id), eq(sales.promoterId, user.id), eq(sales.saleDate, todayISO()))).returning({ id: sales.id })
  return r.length > 0
}
export async function deleteSale(user: { id: string }, id: string) {
  const [row] = await db.delete(sales).where(and(eq(sales.id, id), eq(sales.promoterId, user.id), eq(sales.saleDate, todayISO()))).returning({ receiptId: sales.receiptId })
  if (row?.receiptId) await db.delete(receipts).where(eq(receipts.id, row.receiptId))
  return !!row
}

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

export type SalesRow = { id: string; outletId: string; date: string; outlet: string; region: string; promoter: string; brand: string; sku: string; quantity: number; unitPrice: string | null; value: number | null; receiptId: string | null; capturedAt: Date | null; updatedAt: Date }
const base = () => db.select({
  id: sales.id, outletId: sales.outletId, date: sales.saleDate, outlet: outlets.name, region: outlets.region, promoter: users.name, brand: brands.name, sku: skus.label, skuOrder: skus.sortOrder,
  quantity: sales.quantity, unitPrice: sales.unitPrice, receiptId: sales.receiptId, capturedAt: sales.capturedAt, updatedAt: sales.updatedAt,
}).from(sales).innerJoin(outlets, eq(outlets.id, sales.outletId)).innerJoin(users, eq(users.id, sales.promoterId)).innerJoin(brands, eq(brands.id, sales.brandId)).innerJoin(skus, eq(skus.id, sales.skuId))

export const SALES_PAGE = 25
export async function listSales(f: SalesFilters, page: number) {
  const where = salesWhere(f)
  const [rows, [c]] = await Promise.all([
    base().where(where).orderBy(desc(sales.saleDate), desc(sales.capturedAt), asc(outlets.name)).limit(SALES_PAGE).offset((page - 1) * SALES_PAGE),
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

/* ------------------------------------------------------------------
   Receipts
------------------------------------------------------------------- */
export const MAX_RECEIPT_BYTES = 450_000
export const receiptSchema = z.object({
  clientId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  mime: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.string().max(Math.ceil(MAX_RECEIPT_BYTES * 1.37)).regex(/^[A-Za-z0-9+/=]+$/),
  bytes: z.number().int().min(100).max(MAX_RECEIPT_BYTES),
  width: z.number().int().min(1).max(8000), height: z.number().int().min(1).max(8000),
  capturedAt: z.string().datetime(), note: z.string().max(200).optional(),
})
export type ReceiptIn = z.infer<typeof receiptSchema>

export async function saveReceipts(user: { id: string; outletId: string | null }, date: string, items: ReceiptIn[], fix: { lat: number; lng: number } | null = null): Promise<{ ok: true; saved: number } | { ok: false; error: string; permanent: boolean }> {
  if (!user.outletId) return { ok: false, error: 'You have no outlet assigned.', permanent: true }
  if (!items.length) return { ok: true, saved: 0 }
  // Magic bytes check: the mime claim must match the first bytes.
  const rows = items.filter((r) => {
    const head = Buffer.from(r.data.slice(0, 16), 'base64')
    const jpg = head[0] === 0xff && head[1] === 0xd8, png = head[0] === 0x89 && head[1] === 0x50, webp = head.toString('latin1', 0, 4) === 'RIFF'
    return (r.mime === 'image/jpeg' && jpg) || (r.mime === 'image/png' && png) || (r.mime === 'image/webp' && webp)
  }).map((r) => ({ outletId: user.outletId!, promoterId: user.id, saleDate: date, clientId: r.clientId, mime: r.mime, data: r.data, bytes: r.bytes, width: r.width, height: r.height, note: r.note ?? null, geoLat: fix?.lat ?? null, geoLng: fix?.lng ?? null, capturedAt: new Date(r.capturedAt) }))
  if (!rows.length) return { ok: false, error: 'The image could not be read.', permanent: true }
  const ins = await db.insert(receipts).values(rows).onConflictDoNothing().returning({ id: receipts.id })
  if (ins.length) await db.insert(auditLog).values({ actorId: user.id, action: 'receipt.upload', entity: 'receipt', entityId: `${user.outletId}:${date}`, meta: { count: ins.length } })
  return { ok: true, saved: ins.length }
}

