import { requireUser } from '@/lib/session'
import { AdminShell } from '@/components/admin-nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('admin')
  return <AdminShell name={user.name}>{children}</AdminShell>
}
