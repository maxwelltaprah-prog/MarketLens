import { notFound } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { db, entries } from '@/db'
import { requireUser } from '@/lib/session'
import { todayISO } from '@/lib/format'
import { CaptureView } from '@/lib/capture-page'

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser('promoter')
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  // Promoters only see their own outlet's entries.
  const [e] = user.outletId ? await db.select().from(entries).where(and(eq(entries.id, id), eq(entries.outletId, user.outletId))).limit(1) : []
  if (!e) notFound()
  return <CaptureView user={user} date={e.entryDate} mode={e.entryDate === todayISO() ? 'today' : 'past'} />
}
