import 'server-only'
import { and, asc, eq, gte, lte, type SQL } from 'drizzle-orm'
import { db, entries, entryPrices, outlets, skus, brands, skuBrands } from '@/db'
import { addDaysISO, todayISO } from './format'
import { isIso, isUuid } from './admin-queries'

export type Agg = 'latest' | 'avg' | 'min' | 'max'
export type ReportFilters = { from: string; to: string; skuId?: string; brandId?: string; region?: string; outletId?: string; agg: Agg; clamped: boolean }
export const MAX_DAYS = 92

export function parseReportFilters(sp: Record<string, string | string[] | undefined>): { f: ReportFilters; raw: Record<string, string> } {
  const g = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) as string | undefined
  const today = todayISO()
  let from = isIso(g('from')) ? g('from')! : addDaysISO(today, -6)
  let to = isIso(g('to')) ? g('to')! : today
  if (from > to) [from, to] = [to, from]
  let clamped = false
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_DAYS) { from = addDaysISO(to, -MAX_DAYS); clamped = true }
  const agg = (['latest', 'avg', 'min', 'max'] as const).find((a) => a === g('agg')) ?? (from === to ? 'latest' : 'avg')
  const raw: Record<string, string> = {}
  for (const k of ['from', 'to', 'sku', 'brand', 'region', 'outlet', 'agg']) if (g(k)) raw[k] = g(k)!.slice(0, 80)
  return {
    f: { from, to, agg, clamped, skuId: isUuid(g('sku')) ? g('sku') : undefined, brandId: isUuid(g('brand')) ? g('brand') : undefined,
      outletId: isUuid(g('outlet')) ? g('outlet') : undefined, region: g('region')?.slice(0, 60) || undefined },
    raw,
  }
}

export type CellStat = { v: number | null; na: boolean; date: string; n: number }
export type ReportRow = { brand: { id: string; name: string }; cells: Record<string, CellStat>; min: number | null; avg: number | null; max: number | null; n: number }
export type ReportGroup = { sku: { id: string; label: string; code: string }; rows: ReportRow[] }
export type Report = {
  outlets: { id: string; name: string; region: string; avgIndex: number | null; n: number }[]
  groups: ReportGroup[]
  trend: { d: string; v: number }[]
  brandAvg: { sku: string; data: { name: string; v: number }[] } | null
  regions: string[]
  totals: { points: number; captures: number; brands: number }
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function getReport(f: ReportFilters): Promise<Report> {
  const outletWhere: SQL[] = [eq(outlets.active, true)]
  if (f.region) outletWhere.push(eq(outlets.region, f.region))
  if (f.outletId) outletWhere.push(eq(outlets.id, f.outletId))

  const [cols, regionRows, catalog] = await Promise.all([
    db.select({ id: outlets.id, name: outlets.name, region: outlets.region }).from(outlets).where(and(...outletWhere)).orderBy(asc(outlets.region), asc(outlets.name)),
    db.selectDistinct({ region: outlets.region }).from(outlets).where(eq(outlets.active, true)).orderBy(asc(outlets.region)),
    db.select({ skuId: skus.id, label: skus.label, code: skus.code, brandId: brands.id, brandName: brands.name })
      .from(skuBrands).innerJoin(skus, eq(skus.id, skuBrands.skuId)).innerJoin(brands, eq(brands.id, skuBrands.brandId))
      .where(and(eq(skus.active, true), eq(brands.active, true), ...(f.skuId ? [eq(skus.id, f.skuId)] : []), ...(f.brandId ? [eq(brands.id, f.brandId)] : [])))
      .orderBy(asc(skus.sortOrder), asc(skuBrands.sortOrder)),
  ])
  const colIds = new Set(cols.map((c) => c.id))

  const where: SQL[] = [eq(entries.status, 'submitted'), gte(entries.entryDate, f.from), lte(entries.entryDate, f.to)]
  if (f.skuId) where.push(eq(entryPrices.skuId, f.skuId))
  if (f.brandId) where.push(eq(entryPrices.brandId, f.brandId))
  if (f.outletId) where.push(eq(entries.outletId, f.outletId))
  const raw = await db.select({ d: entries.entryDate, o: entries.outletId, s: entryPrices.skuId, b: entryPrices.brandId, p: entryPrices.price, na: entryPrices.notAvailable })
    .from(entryPrices).innerJoin(entries, eq(entries.id, entryPrices.entryId)).where(and(...where)).orderBy(asc(entries.entryDate))

  // Fold observations into (sku, brand, outlet) cells using the chosen aggregation.
  type Acc = { sum: number; n: number; min: number; max: number; latest: number | null; latestDate: string; na: boolean }
  const acc = new Map<string, Acc>()
  const dayAcc = new Map<string, { sum: number; n: number }>()
  const captures = new Set<string>()
  let points = 0
  for (const r of raw) {
    if (!colIds.has(r.o)) continue
    captures.add(`${r.o}:${r.d}`)
    const k = `${r.s}:${r.b}:${r.o}`
    const a = acc.get(k) ?? { sum: 0, n: 0, min: Infinity, max: -Infinity, latest: null, latestDate: '', na: false }
    if (r.p != null) {
      const v = Number(r.p); points++
      a.sum += v; a.n++; a.min = Math.min(a.min, v); a.max = Math.max(a.max, v)
      if (r.d >= a.latestDate) { a.latest = v; a.latestDate = r.d }
      const dd = dayAcc.get(r.d) ?? { sum: 0, n: 0 }; dd.sum += v; dd.n++; dayAcc.set(r.d, dd)
    } else if (r.na && r.d >= a.latestDate) { a.na = true; a.latestDate = r.d; if (f.agg === 'latest') a.latest = null }
    acc.set(k, a)
  }
  const pick = (a: Acc): number | null => {
    if (!a.n) return null
    if (f.agg === 'latest') return a.latest
    if (f.agg === 'min') return round2(a.min)
    if (f.agg === 'max') return round2(a.max)
    return round2(a.sum / a.n)
  }

  const groups: ReportGroup[] = []
  for (const c of catalog) {
    let g = groups.find((x) => x.sku.id === c.skuId)
    if (!g) groups.push((g = { sku: { id: c.skuId, label: c.label, code: c.code }, rows: [] }))
    const cells: Record<string, CellStat> = {}
    const vals: number[] = []
    for (const o of cols) {
      const a = acc.get(`${c.skuId}:${c.brandId}:${o.id}`)
      const v = a ? pick(a) : null
      cells[o.id] = { v, na: !!a?.na && v == null, date: a?.latestDate ?? '', n: a?.n ?? 0 }
      if (v != null) vals.push(v)
    }
    const row: ReportRow = { brand: { id: c.brandId, name: c.brandName }, cells, n: vals.length,
      min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null, avg: vals.length ? round2(vals.reduce((s, v) => s + v, 0) / vals.length) : null }
    g.rows.push(row)
  }

  // Outlet price index: outlet's average cell value ÷ row average, across all rows it has a value for. 100 = network average.
  const outletsOut = cols.map((o) => {
    let sum = 0, n = 0
    for (const g of groups) for (const r of g.rows) { const v = r.cells[o.id]?.v; if (v != null && r.avg) { sum += v / r.avg; n++ } }
    return { ...o, avgIndex: n ? Math.round((sum / n) * 1000) / 10 : null, n }
  })

  return {
    outlets: outletsOut,
    groups: groups.filter((g) => g.rows.length),
    trend: [...dayAcc.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, x]) => ({ d, v: round2(x.sum / x.n) })),
    brandAvg: (() => { const g = groups.find((x) => x.rows.some((r) => r.avg != null)); return g ? { sku: g.sku.label, data: g.rows.filter((r) => r.avg != null).map((r) => ({ name: r.brand.name, v: r.avg! })).sort((a, b) => a.v - b.v) } : null })(),
    regions: regionRows.map((r) => r.region),
    totals: { points, captures: captures.size, brands: groups.reduce((n, g) => n + g.rows.length, 0) },
  }
}
