import { asc, eq } from 'drizzle-orm'
import { db, outlets, users } from '@/db'
import { requireUser } from '@/lib/session'
import { AdminShell, type QuickLink } from '@/components/admin-nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('admin')
  const [o, p] = await Promise.all([
    db.select({ id: outlets.id, name: outlets.name, region: outlets.region }).from(outlets).where(eq(outlets.active, true)).orderBy(asc(outlets.name)).limit(200),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.role, 'promoter')).orderBy(asc(users.name)).limit(200),
  ])
  const quick: QuickLink[] = [
    ...o.map((x) => ({ label: x.name, hint: `Outlet · ${x.region}`, href: `/admin/entries?outlet=${x.id}`, kind: 'outlet' as const })),
    ...p.map((x) => ({ label: x.name, hint: 'Promoter', href: `/admin/entries?q=${encodeURIComponent(x.name)}`, kind: 'promoter' as const })),
  ]
  return <AdminShell name={user.name} quick={quick}>{children}</AdminShell>
}
