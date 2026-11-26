'use server'
import { z } from 'zod'
import { requireUser } from '@/lib/session'
import { cellsSchema, saveDraft, submitEntry, type SaveResult } from '@/lib/capture-core'
import { pingSchema } from '@/lib/location'
import { clientIp, userAgent } from '@/lib/security'
import { db, auditLog } from '@/db'
import { updateSale, deleteSale } from '@/lib/sales-core'
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

export async function updateSaleAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser('promoter')
  const parsed = z.object({ id: z.string().uuid(), quantity: z.number().int().min(1).max(1_000_000).optional(), unitPrice: z.string().max(14).regex(/^(\d{0,9}(\.\d{0,2})?)?$/).nullable().optional() }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid values.' }
  return (await updateSale(user, parsed.data.id, parsed.data)) ? { ok: true } : { ok: false, error: 'Only today’s sales can be changed.' }
}
export async function deleteSaleAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser('promoter')
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid sale.' }
  if (!(await deleteSale(user, parsed.data.id))) return { ok: false, error: 'Only today’s sales can be removed.' }
  await db.insert(auditLog).values({ actorId: user.id, action: 'sales.delete', entity: 'sales', entityId: parsed.data.id })
  return { ok: true }
}
