import { asc, eq } from 'drizzle-orm'
import { db, users, outlets } from '@/db'
import { PromotersManager } from '@/components/promoters-manager'
export const metadata = { title: 'Promoters' }
export default async function Page() {
  const [rows, outletRows] = await Promise.all([
    db.select({ id: users.id, name: users.name, phone: users.phone, outletId: users.outletId, outletName: outlets.name, active: users.active })
      .from(users).leftJoin(outlets, eq(outlets.id, users.outletId)).where(eq(users.role, 'promoter')).orderBy(asc(users.name)),
    db.select({ id: outlets.id, name: outlets.name }).from(outlets).where(eq(outlets.active, true)).orderBy(asc(outlets.name)),
  ])
  return <div className="rise"><PromotersManager promoters={rows} outlets={outletRows} /></div>
}
