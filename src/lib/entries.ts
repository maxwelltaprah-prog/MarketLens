import 'server-only'
import { and, desc, eq, type SQL } from 'drizzle-orm'
import { db, entries, entryPrices, outlets, users } from '@/db'
import type { AppSettings } from './settings'

export type PriceCell = { price: string; na: boolean }
export type PriceMap = Record<string, PriceCell>

export async function getEntryWithPrices(where: ReturnType<typeof and>, order: SQL = desc(entries.entryDate)) {
  const [entry] = await db.select().from(entries).where(where).orderBy(order).limit(1)
  if (!entry) return null
  const rows = await db.select().from(entryPrices).where(eq(entryPrices.entryId, entry.id))
  const map: PriceMap = {}
  for (const r of rows) map[`${r.skuId}:${r.brandId}`] = { price: r.price ?? '', na: r.notAvailable }
  return { entry, prices: map }
}

export type EntryRow = typeof entries.$inferSelect

/** A promoter can edit drafts freely, and submitted entries until the edit window closes (unless an admin locked it). */
export function canEdit(entry: Pick<EntryRow, 'status' | 'submittedAt' | 'lockedAt'> | null, s: AppSettings, now = new Date()) {
  if (!entry || entry.status === 'draft') return true
  if (entry.lockedAt) return false
  if (!entry.submittedAt) return true
  return now.getTime() < entry.submittedAt.getTime() + s.editWindowHours * 3_600_000
}

export async function listPromoterEntries(promoterId: string, limit = 60) {
  return db.select().from(entries).where(eq(entries.promoterId, promoterId)).orderBy(desc(entries.entryDate)).limit(limit)
}

export function countFilled(map: PriceMap) {
  let filled = 0
  for (const c of Object.values(map)) if (c.na || (c.price !== '' && Number(c.price) > 0)) filled++
  return filled
}

export { outlets, users }
