import { asc } from 'drizzle-orm'
import { db, outlets } from '@/db'
import { OutletsManager } from '@/components/outlets-manager'
export const metadata = { title: 'Outlets' }
export default async function Page() {
  const rows = await db.select({ id: outlets.id, name: outlets.name, region: outlets.region, active: outlets.active, lat: outlets.lat, lng: outlets.lng }).from(outlets).orderBy(asc(outlets.name))
  return <div className="rise"><OutletsManager outlets={rows} /></div>
}
