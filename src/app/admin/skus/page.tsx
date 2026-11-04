import { asc } from 'drizzle-orm'
import { db, skus, brands, skuBrands } from '@/db'
import { SkusManager } from '@/components/skus-manager'
export const metadata = { title: 'SKUs & Brands' }
export default async function Page() {
  const [k, b, pairs] = await Promise.all([
    db.select().from(skus).orderBy(asc(skus.sortOrder)),
    db.select({ id: brands.id, name: brands.name }).from(brands).orderBy(asc(brands.name)),
    db.select().from(skuBrands).orderBy(asc(skuBrands.sortOrder)),
  ])
  return <div className="rise"><SkusManager brands={b} skus={k.map((s) => ({ id: s.id, label: s.label, code: s.code, active: s.active, brandIds: pairs.filter((p) => p.skuId === s.id).map((p) => p.brandId) }))} /></div>
}
