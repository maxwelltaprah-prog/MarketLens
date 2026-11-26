'use server'
import { z } from 'zod'
import { requireUser } from '@/lib/session'
import { cellsSchema, saveDraft, submitEntry, type SaveResult } from '@/lib/capture-core'
import { pingSchema } from '@/lib/location'
import { clientIp, userAgent } from '@/lib/security'
import { and, eq } from 'drizzle-orm'
import { db, receipts, auditLog } from '@/db'
import { todayISO } from '@/lib/format'

export type { SaveResult }

const saveSchema = z.object({ date: z.iso.date(), cells: cellsSchema })

export async function saveDraftAction(input: unknown): Promise<SaveResult> {
  const user = await requireUser('promoter')
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Some values are invalid. Prices use up to 2 decimals.', permanent: true }
  return saveDraft(user, parsed.data.date, parsed.data.cells)
}

export async function submitEntryAction(input: unknown): Promise<SaveResult> {
  const user = await requireUser('promoter')
  const parsed = z.object({ date: z.iso.date(), fix: pingSchema.nullable().optional() }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid date.', permanent: true }
  return submitEntry(user, parsed.data.date, parsed.data.fix ? { ...parsed.data.fix, kind: 'submit' } : null, { ip: await clientIp(), userAgent: await userAgent() })
}

export async function deleteReceiptAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser('promoter')
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid receipt.' }
  const del = await db.delete(receipts).where(and(eq(receipts.id, parsed.data.id), eq(receipts.promoterId, user.id), eq(receipts.saleDate, todayISO()))).returning({ id: receipts.id })
  if (!del.length) return { ok: false, error: 'Only today’s receipts can be removed.' }
  await db.insert(auditLog).values({ actorId: user.id, action: 'receipt.delete', entity: 'receipt', entityId: parsed.data.id })
  return { ok: true }
}
