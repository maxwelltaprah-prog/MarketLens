import 'server-only'
import { and, asc, eq, gte, lte, sql, inArray } from 'drizzle-orm'
import { db, targets, users, outlets, brands, sales } from '@/db'
import { todayISO } from './format'

export const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
export const thisMonth = () => todayISO().slice(0, 7)
export const monthRange = (m: string) => { const [y, mo] = m.split('-').map(Number); const last = new Date(Date.UTC(y, mo, 0)).getUTCDate(); return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}`, days: last } }
export const addMonths = (m: string, n: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7) }
export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export type TargetCell = { units: number }
export type GridRow = {
  promoterId: string; name: string; phone: string | null; outlet: string | null; region: string | null
  targets: Record<string, number>        // brandId → units
  actual: Record<string, number>         // brandId → units sold this month
  incentive: number | null
  totalTarget: number; totalActual: number
}
export type TargetGrid = { month: string; brands: { id: string; name: string }[]; rows: GridRow[]; range: { from: string; to: string; days: number }; elapsed: number; regions: string[] }

/** Everything the admin grid and the attainment report need for one month. */
export async function getTargetGrid(month: string): Promise<TargetGrid> {
  const range = monthRange(month)
  const today = todayISO()
  const elapsed = today < range.from ? 0 : today > range.to ? range.days : Number(today.slice(8, 10))
  const [people, brandRows, tRows, actualRows] = await Promise.all([
    db.select({ id: users.id, name: users.name, phone: users.phone, outlet: outlets.name, region: outlets.region }).from(users).leftJoin(outlets, eq(outlets.id, users.outletId))
      .where(and(eq(users.role, 'promoter'), eq(users.active, true))).orderBy(asc(outlets.region), asc(users.name)),
    db.select({ id: brands.id, name: brands.name }).from(brands).where(and(eq(brands.isCompany, true), eq(brands.active, true))).orderBy(asc(brands.name)),
    db.select().from(targets).where(eq(targets.month, month)),
    db.select({ promoterId: sales.promoterId, brandId: sales.brandId, units: sql<number>`sum(${sales.quantity})::int` }).from(sales)
      .where(and(gte(sales.saleDate, range.from), lte(sales.saleDate, range.to))).groupBy(sales.promoterId, sales.brandId),
  ])
  const rows: GridRow[] = people.map((p) => {
    const t: Record<string, number> = {}, a: Record<string, number> = {}
    let incentive: number | null = null
    for (const r of tRows) if (r.promoterId === p.id) { if (r.brandId) t[r.brandId] = r.units; else incentive = r.incentive == null ? null : Number(r.incentive) }
    for (const r of actualRows) if (r.promoterId === p.id) a[r.brandId] = r.units
    const totalTarget = brandRows.reduce((n, b) => n + (t[b.id] ?? 0), 0)
    const totalActual = brandRows.reduce((n, b) => n + (a[b.id] ?? 0), 0)
    return { promoterId: p.id, name: p.name, phone: p.phone, outlet: p.outlet, region: p.region, targets: t, actual: a, incentive, totalTarget, totalActual }
  })
  return { month, brands: brandRows, rows, range, elapsed, regions: [...new Set(rows.map((r) => r.region ?? 'Unassigned'))] }
}

export type TargetInput = { promoterId: string; brandId: string | null; units: number; incentive: number | null }
export async function upsertTargets(month: string, items: TargetInput[]) {
  for (const it of items) {
    const where = and(eq(targets.month, month), eq(targets.promoterId, it.promoterId), it.brandId ? eq(targets.brandId, it.brandId) : sql`${targets.brandId} is null`)
    if (it.units <= 0 && it.incentive == null) { await db.delete(targets).where(where); continue }
    const [ex] = await db.select({ id: targets.id }).from(targets).where(where)
    const vals = { units: Math.max(0, it.units), incentive: it.incentive == null ? null : it.incentive.toFixed(2), updatedAt: new Date() }
    if (ex) await db.update(targets).set(vals).where(eq(targets.id, ex.id))
    else await db.insert(targets).values({ month, promoterId: it.promoterId, brandId: it.brandId, ...vals })
  }
}

/** Promoter-facing progress for the current month. */
export async function getPromoterProgress(promoterId: string, month = thisMonth()) {
  const range = monthRange(month)
  const today = todayISO()
  const [brandRows, tRows, soldRows] = await Promise.all([
    db.select({ id: brands.id, name: brands.name }).from(brands).where(and(eq(brands.isCompany, true), eq(brands.active, true))).orderBy(asc(brands.name)),
    db.select().from(targets).where(and(eq(targets.month, month), eq(targets.promoterId, promoterId))),
    db.select({ brandId: sales.brandId, units: sql<number>`sum(${sales.quantity})::int` }).from(sales)
      .where(and(eq(sales.promoterId, promoterId), gte(sales.saleDate, range.from), lte(sales.saleDate, range.to), sql`${sales.saleDate} <> ${today}`)).groupBy(sales.brandId),
  ])
  const incentiveRow = tRows.find((r) => !r.brandId)
  const lines = brandRows.map((b) => ({ brandId: b.id, name: b.name, target: tRows.find((r) => r.brandId === b.id)?.units ?? 0, soldBeforeToday: soldRows.find((r) => r.brandId === b.id)?.units ?? 0 })).filter((l) => l.target > 0 || l.soldBeforeToday > 0)
  const hasTargets = tRows.some((r) => r.brandId && r.units > 0)
  return { month, label: monthLabel(month), days: range.days, elapsed: today > range.to ? range.days : Math.max(1, Number(today.slice(8, 10))), lines, incentive: incentiveRow?.incentive == null ? null : Number(incentiveRow.incentive), hasTargets }
}

export { inArray }
