import 'server-only'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, entries, entryPrices, skuBrands, skus, brands, auditLog } from '@/db'
import { getSettings, type AppSettings } from '@/lib/settings'
import { todayISO } from '@/lib/format'
import { canEdit, getEntryWithPrices, type EntryRow } from '@/lib/entries'

/* Shared by the server action (online path) and /api/capture/sync (offline replay). */

export const cellSchema = z.object({ price: z.string().max(14).regex(/^(\d{0,9}(\.\d{0,2})?)?$/), na: z.boolean() })
export const cellsSchema = z.record(z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/), cellSchema).refine((c) => Object.keys(c).length <= 400)
export type CellMap = z.infer<typeof cellsSchema>

/** `permanent` tells an offline client to drop the queued change instead of retrying forever. */
export type SaveResult = { ok: true; status: 'draft' | 'submitted'; savedAt: string } | { ok: false; error: string; permanent: boolean }

type Resolved = { ok: false; error: string } | { ok: true; entry: EntryRow; settings: AppSettings }

async function resolveEntry(userId: string, outletId: string, date: string): Promise<Resolved> {
  const s = await getSettings()
  const today = todayISO()
  if (date > today) return { ok: false, error: 'You can’t capture prices for a future date.' }
  const find = () => getEntryWithPrices(and(eq(entries.outletId, outletId), eq(entries.entryDate, date)))
  let existing = await find()
  if (!existing && date !== today && !s.allowBackdating) return { ok: false, error: 'Back-dated entries are turned off.' }
  if (!existing) { await db.insert(entries).values({ outletId, promoterId: userId, entryDate: date }).onConflictDoNothing(); existing = await find() }
  if (!existing) return { ok: false, error: 'Could not open this entry.' }
  if (!canEdit(existing.entry, s)) return { ok: false, error: 'This entry is locked and can no longer be edited.' }
  return { ok: true, entry: existing.entry, settings: s }
}

export async function saveDraft(user: { id: string; outletId: string | null }, date: string, cells: CellMap): Promise<SaveResult> {
  if (!user.outletId) return { ok: false, error: 'You have no outlet assigned. Contact your administrator.', permanent: true }
  const r = await resolveEntry(user.id, user.outletId, date)
  if (!r.ok) return { ok: false, error: r.error, permanent: true }

  const keys = Object.keys(cells)
  if (keys.length) {
    const valid = await db.select({ skuId: skuBrands.skuId, brandId: skuBrands.brandId }).from(skuBrands)
      .innerJoin(skus, eq(skus.id, skuBrands.skuId)).innerJoin(brands, eq(brands.id, skuBrands.brandId))
      .where(and(eq(skus.active, true), eq(brands.active, true), inArray(skuBrands.skuId, [...new Set(keys.map((k) => k.split(':')[0]))])))
    const ok = new Set(valid.map((v) => `${v.skuId}:${v.brandId}`))
    const rows = keys.filter((k) => ok.has(k)).map((k) => {
      const [skuId, brandId] = k.split(':'); const c = cells[k]; const n = c.price === '' ? null : Number(c.price)
      return { entryId: r.entry.id, skuId, brandId, notAvailable: c.na, price: c.na || !n || n <= 0 ? null : n.toFixed(2) }
    })
    if (rows.length)
      await db.insert(entryPrices).values(rows).onConflictDoUpdate({
        target: [entryPrices.entryId, entryPrices.skuId, entryPrices.brandId],
        set: { price: sql`excluded.price`, notAvailable: sql`excluded.not_available` },
      })
  }
  await db.update(entries).set({ updatedAt: new Date() }).where(eq(entries.id, r.entry.id))
  return { ok: true, status: r.entry.status, savedAt: new Date().toISOString() }
}

export async function submitEntry(user: { id: string; outletId: string | null }, date: string): Promise<SaveResult> {
  if (!user.outletId) return { ok: false, error: 'You have no outlet assigned.', permanent: true }
  const r = await resolveEntry(user.id, user.outletId, date)
  if (!r.ok) return { ok: false, error: r.error, permanent: true }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(entryPrices)
    .where(and(eq(entryPrices.entryId, r.entry.id), sql`(${entryPrices.price} is not null or ${entryPrices.notAvailable})`))
  if (n === 0) return { ok: false, error: 'Add at least one price before submitting.', permanent: true }
  const now = new Date()
  await db.update(entries).set({ status: 'submitted', submittedAt: r.entry.submittedAt ?? now, updatedAt: now }).where(eq(entries.id, r.entry.id))
  await db.insert(auditLog).values({ actorId: user.id, action: r.entry.status === 'submitted' ? 'entry.resubmit' : 'entry.submit', entity: 'entry', entityId: r.entry.id, meta: { filled: n } })
  return { ok: true, status: 'submitted', savedAt: now.toISOString() }
}
