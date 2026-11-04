import 'server-only'
import { cache } from 'react'
import { and, asc, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { db, skus, brands, skuBrands, entries, entryPrices } from '@/db'
import { addDaysISO, todayISO } from './format'

export type CatalogSku = { id: string; label: string; code: string; brands: { id: string; name: string }[] }

/** Active pack sizes with their active brands, in display order. */
export const getCatalog = cache(async (): Promise<CatalogSku[]> => {
  const rows = await db
    .select({ skuId: skus.id, label: skus.label, code: skus.code, skuOrder: skus.sortOrder, brandId: brands.id, brandName: brands.name, bOrder: skuBrands.sortOrder })
    .from(skuBrands)
    .innerJoin(skus, eq(skus.id, skuBrands.skuId))
    .innerJoin(brands, eq(brands.id, skuBrands.brandId))
    .where(and(eq(skus.active, true), eq(brands.active, true)))
    .orderBy(asc(skus.sortOrder), asc(skuBrands.sortOrder))
  const out: CatalogSku[] = []
  for (const r of rows) {
    let k = out.find((x) => x.id === r.skuId)
    if (!k) out.push((k = { id: r.skuId, label: r.label, code: r.code, brands: [] }))
    k.brands.push({ id: r.brandId, name: r.brandName })
  }
  return out
})
export const totalPricePoints = (c: CatalogSku[]) => c.reduce((n, k) => n + k.brands.length, 0)

/** Network-wide 30-day average per sku:brand, used for variance warnings. */
export async function getAverages(): Promise<Record<string, number>> {
  const since = addDaysISO(todayISO(), -30)
  const rows = await db
    .select({ skuId: entryPrices.skuId, brandId: entryPrices.brandId, avg: sql<string>`avg(${entryPrices.price})` })
    .from(entryPrices)
    .innerJoin(entries, eq(entries.id, entryPrices.entryId))
    .where(and(eq(entries.status, 'submitted'), gte(entries.entryDate, since), isNotNull(entryPrices.price)))
    .groupBy(entryPrices.skuId, entryPrices.brandId)
  return Object.fromEntries(rows.map((r) => [`${r.skuId}:${r.brandId}`, Number(r.avg)]))
}
