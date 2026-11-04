import 'server-only'
import { and, asc, desc, eq, gte, lte, sql, isNotNull, type SQL } from 'drizzle-orm'
import { db, entries, entryPrices, outlets, users, skus, brands, skuBrands } from '@/db'
import { addDaysISO, todayISO } from './format'

export type DashFilters = { from: string; to: string; outletId?: string; skuId?: string; brandId?: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f-]{36}$/
export const isIso = (s?: string) => !!s && ISO.test(s) && !Number.isNaN(Date.parse(s))
export const isUuid = (s?: string) => !!s && UUID.test(s)

export function parseFilters(sp: Record<string, string | string[] | undefined>): { f: Omit<DashFilters, 'skuId'> & { skuId?: string }; raw: Record<string, string> } {
  const g = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined
  const today = todayISO()
  let from = isIso(g('from')) ? g('from')! : `${today.slice(0, 8)}01`
  let to = isIso(g('to')) ? g('to')! : today
  if (from > to) [from, to] = [to, from]
  const raw: Record<string, string> = {}
  for (const k of ['from', 'to', 'outlet', 'sku', 'brand']) if (g(k)) raw[k] = g(k)!
  return { f: { from, to, outletId: isUuid(g('outlet')) ? g('outlet') : undefined, skuId: isUuid(g('sku')) ? g('sku') : undefined, brandId: isUuid(g('brand')) ? g('brand') : undefined }, raw }
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1
const pctDelta = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null)

export async function getFilterOptions() {
  const [o, k, b] = await Promise.all([
    db.select({ id: outlets.id, name: outlets.name }).from(outlets).where(eq(outlets.active, true)).orderBy(asc(outlets.name)),
    db.select({ id: skus.id, label: skus.label }).from(skus).where(eq(skus.active, true)).orderBy(asc(skus.sortOrder)),
    db.select({ skuId: skuBrands.skuId, id: brands.id, name: brands.name }).from(skuBrands).innerJoin(brands, eq(brands.id, skuBrands.brandId)).where(eq(brands.active, true)).orderBy(asc(skuBrands.sortOrder)),
  ])
  return { outlets: o, skus: k, brands: b }
}

export async function getDashboard(f: DashFilters) {
  const today = todayISO()
  const opts = await getFilterOptions()
  const sku = opts.skus.find((s) => s.id === f.skuId) ?? opts.skus.find((s) => /^5\s?kg$/i.test(s.label)) ?? opts.skus[0]
  const len = dayDiff(f.from, f.to)
  const pFrom = addDaysISO(f.from, -len), pTo = addDaysISO(f.from, -1)

  const entryWhere = (from: string, to: string): SQL[] => [eq(entries.status, 'submitted'), gte(entries.entryDate, from), lte(entries.entryDate, to), ...(f.outletId ? [eq(entries.outletId, f.outletId)] : [])]
  const priceWhere = (from: string, to: string): SQL[] => [...entryWhere(from, to), isNotNull(entryPrices.price), ...(sku ? [eq(entryPrices.skuId, sku.id)] : []), ...(f.brandId ? [eq(entryPrices.brandId, f.brandId)] : [])]

  const subs = (from: string, to: string) => db.select({ n: sql<number>`count(*)::int` }).from(entries).where(and(...entryWhere(from, to)))
  const points = (from: string, to: string) => db.select({ n: sql<number>`count(*)::int` }).from(entryPrices).innerJoin(entries, eq(entries.id, entryPrices.entryId)).where(and(...entryWhere(from, to), isNotNull(entryPrices.price)))
  const avg = (from: string, to: string) => db.select({ v: sql<string | null>`avg(${entryPrices.price})` }).from(entryPrices).innerJoin(entries, eq(entries.id, entryPrices.entryId)).where(and(...priceWhere(from, to)))

  const [[s1], [s0], [p1], [p0], [a1], [a0], bars, trend, avail, doneToday, activeOutlets, recent] = await Promise.all([
    subs(f.from, f.to), subs(pFrom, pTo), points(f.from, f.to), points(pFrom, pTo), avg(f.from, f.to), avg(pFrom, pTo),
    sku ? db.select({ id: brands.id, name: brands.name, v: sql<string>`avg(${entryPrices.price})` }).from(entryPrices)
      .innerJoin(entries, eq(entries.id, entryPrices.entryId)).innerJoin(brands, eq(brands.id, entryPrices.brandId))
      .where(and(...entryWhere(f.from, f.to), isNotNull(entryPrices.price), eq(entryPrices.skuId, sku.id))).groupBy(brands.id, brands.name).orderBy(desc(sql`count(*)`)).limit(8) : Promise.resolve([]),
    sku ? db.select({ d: entries.entryDate, v: sql<string>`avg(${entryPrices.price})` }).from(entryPrices)
      .innerJoin(entries, eq(entries.id, entryPrices.entryId)).where(and(...priceWhere(f.from, f.to))).groupBy(entries.entryDate).orderBy(asc(entries.entryDate)) : Promise.resolve([]),
    sku ? db.select({ name: brands.name, total: sql<number>`count(*)::int`, have: sql<number>`count(${entryPrices.price})::int` }).from(entryPrices)
      .innerJoin(entries, eq(entries.id, entryPrices.entryId)).innerJoin(brands, eq(brands.id, entryPrices.brandId))
      .where(and(...entryWhere(f.from, f.to), eq(entryPrices.skuId, sku.id))).groupBy(brands.id, brands.name).orderBy(desc(sql`count(${entryPrices.price})::float / count(*)`)).limit(6) : Promise.resolve([]),
    db.select({ id: entries.outletId, geo: entries.geoStatus }).from(entries).where(and(eq(entries.status, 'submitted'), eq(entries.entryDate, today))),
    db.select({ id: outlets.id, name: outlets.name }).from(outlets).where(eq(outlets.active, true)).orderBy(asc(outlets.name)),
    db.select({ id: entries.id, date: entries.entryDate, outlet: outlets.name, promoter: users.name, at: entries.submittedAt, status: entries.status, geo: entries.geoStatus, geoDistance: entries.geoDistanceM,
      filled: sql<number>`(select count(*) from ${entryPrices} p where p.entry_id = ${entries.id} and (p.price is not null or p.not_available))::int` })
      .from(entries).innerJoin(outlets, eq(outlets.id, entries.outletId)).innerJoin(users, eq(users.id, entries.promoterId))
      .orderBy(desc(entries.entryDate), desc(entries.updatedAt)).limit(6),
  ])

  const doneIds = new Set(doneToday.map((d) => d.id))
  const awayToday = doneToday.filter((d) => d.geo === 'away').length
  const reporting = activeOutlets.filter((o) => doneIds.has(o.id)).length
  const pending = activeOutlets.filter((o) => !doneIds.has(o.id))
  const cur = a1?.v == null ? null : Number(a1.v), prev = a0?.v == null ? null : Number(a0.v)

  return {
    opts, sku, today,
    kpi: {
      submissions: { v: s1.n, d: pctDelta(s1.n, s0.n) },
      reporting: { v: reporting, of: activeOutlets.length },
      points: { v: p1.n, d: pctDelta(p1.n, p0.n) },
      avg: { v: cur, d: cur != null && prev != null ? pctDelta(cur, prev) : null },
    },
    bars: bars.map((b) => ({ name: b.name, v: Number(b.v) })),
    trend: trend.map((t) => ({ d: t.d, v: Number(t.v) })),
    avail: avail.map((a) => ({ name: a.name, pct: a.total ? Math.round((a.have / a.total) * 100) : 0 })),
    pending, recent, awayToday,
  }
}

export type EntryListFilters = { from: string; to: string; outletId?: string; status?: 'draft' | 'submitted'; geo?: 'ok' | 'away' | 'none' | 'unverified'; q?: string; page: number }
export const PAGE_SIZE = 12

export function entryWhere(f: Omit<EntryListFilters, 'page'>): SQL {
  const parts: SQL[] = [gte(entries.entryDate, f.from), lte(entries.entryDate, f.to)]
  if (f.outletId) parts.push(eq(entries.outletId, f.outletId))
  if (f.status) parts.push(eq(entries.status, f.status))
  if (f.geo) parts.push(eq(entries.geoStatus, f.geo))
  if (f.q) parts.push(sql`(${outlets.name} ilike ${'%' + f.q.replace(/[%_\\]/g, '\\$&') + '%'} or ${users.name} ilike ${'%' + f.q.replace(/[%_\\]/g, '\\$&') + '%'})`)
  return and(...parts)!
}

export async function listEntries(f: EntryListFilters) {
  const where = entryWhere(f)
  const base = db.select({
    id: entries.id, date: entries.entryDate, outlet: outlets.name, promoter: users.name, at: entries.submittedAt, status: entries.status, locked: entries.lockedAt,
    geo: entries.geoStatus, geoDistance: entries.geoDistanceM,
    filled: sql<number>`(select count(*) from ${entryPrices} p where p.entry_id = ${entries.id} and (p.price is not null or p.not_available))::int`,
  }).from(entries).innerJoin(outlets, eq(outlets.id, entries.outletId)).innerJoin(users, eq(users.id, entries.promoterId))
  const [rows, [c]] = await Promise.all([
    base.where(where).orderBy(desc(entries.entryDate), desc(entries.updatedAt)).limit(PAGE_SIZE).offset((f.page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(entries).innerJoin(outlets, eq(outlets.id, entries.outletId)).innerJoin(users, eq(users.id, entries.promoterId)).where(where),
  ])
  return { rows, total: c.n }
}
