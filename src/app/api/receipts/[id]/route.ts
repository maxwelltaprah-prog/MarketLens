import { eq } from 'drizzle-orm'
import { db, receipts } from '@/db'
import { getCurrentUser } from '@/lib/session'
import { logSecurity } from '@/lib/security'

/* Serves a receipt image. Admins can see all; a promoter only their own. Private cache so the browser keeps it. */
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response('Not found', { status: 404 })
  const [r] = await db.select({ mime: receipts.mime, data: receipts.data, promoterId: receipts.promoterId }).from(receipts).where(eq(receipts.id, id))
  if (!r) return new Response('Not found', { status: 404 })
  if (user.role !== 'admin' && r.promoterId !== user.id) { await logSecurity('authz.denied', { path: '/api/receipts' }, user.id); return new Response('Not found', { status: 404 }) }
  return new Response(Buffer.from(r.data, 'base64'), { headers: { 'Content-Type': r.mime, 'Cache-Control': 'private, max-age=86400', 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' } })
}
