'use server'
import { z } from 'zod'
import { requireUser } from '@/lib/session'
import { cellsSchema, saveDraft, submitEntry, type SaveResult } from '@/lib/capture-core'

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
  const parsed = z.object({ date: z.iso.date() }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Invalid date.', permanent: true }
  return submitEntry(user, parsed.data.date)
}
