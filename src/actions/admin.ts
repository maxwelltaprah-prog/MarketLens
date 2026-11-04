'use server'
import { revalidatePath } from 'next/cache'
import { and, eq, inArray, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { randomInt } from 'node:crypto'
import { z } from 'zod'
import { db, entries, entryPrices, outlets, users, skus, brands, skuBrands, settings, auditLog } from '@/db'
import { requireUser } from '@/lib/session'
import { settingsSchema } from '@/lib/settings'
import { normalizePhone } from '@/lib/format'
import { parseCsv } from '@/lib/csv'

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }
const uuid = z.string().uuid()
const isUnique = (e: unknown) => JSON.stringify(e, Object.getOwnPropertyNames(e as object)).includes('23505') || String((e as Error)?.message).includes('duplicate key')
const audit = (actorId: string, action: string, entity: string, entityId?: string, meta?: object) =>
  db.insert(auditLog).values({ actorId, action, entity, entityId, meta })
const genPin = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

/* ---------------- Entries ---------------- */
const adminPrices = z.object({
  entryId: uuid,
  cells: z.record(z.string().regex(/^[0-9a-f-]{36}:[0-9a-f-]{36}$/), z.object({ price: z.string().regex(/^(\d{0,9}(\.\d{0,2})?)?$/), na: z.boolean() })),
})
export async function adminSavePricesAction(input: unknown): Promise<Result<{ changed: number }>> {
  const admin = await requireUser('admin')
  const p = adminPrices.safeParse(input)
  if (!p.success) return { ok: false, error: 'Some prices are invalid (up to 2 decimals).' }
  const keys = Object.keys(p.data.cells)
  if (!keys.length) return { ok: true, changed: 0 }
  const rows = keys.map((k) => {
    const [skuId, brandId] = k.split(':'); const c = p.data.cells[k]; const n = c.price === '' ? null : Number(c.price)
    return { entryId: p.data.entryId, skuId, brandId, notAvailable: c.na, price: c.na || !n || n <= 0 ? null : n.toFixed(2) }
  })
  await db.insert(entryPrices).values(rows).onConflictDoUpdate({
    target: [entryPrices.entryId, entryPrices.skuId, entryPrices.brandId],
    set: { price: sql`excluded.price`, notAvailable: sql`excluded.not_available` },
  })
  await db.update(entries).set({ updatedAt: new Date() }).where(eq(entries.id, p.data.entryId))
  await audit(admin.id, 'entry.correct', 'entry', p.data.entryId, { cells: keys.length })
  revalidatePath('/admin', 'layout')
  return { ok: true, changed: keys.length }
}

export async function setEntryStateAction(input: unknown): Promise<Result> {
  const admin = await requireUser('admin')
  const p = z.object({ entryId: uuid, op: z.enum(['lock', 'unlock', 'reopen']) }).safeParse(input)
  if (!p.success) return { ok: false, error: 'Invalid request.' }
  const set = p.data.op === 'lock' ? { lockedAt: new Date() } : p.data.op === 'unlock' ? { lockedAt: null }
    : { status: 'draft' as const, submittedAt: null, lockedAt: null }
  await db.update(entries).set({ ...set, updatedAt: new Date() }).where(eq(entries.id, p.data.entryId))
  await audit(admin.id, `entry.${p.data.op}`, 'entry', p.data.entryId)
  revalidatePath('/admin', 'layout')
  return { ok: true }
}

/* ---------------- Outlets ---------------- */
const coord = (lim: number) => z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(-lim).max(lim).nullable())
const outletSchema = z.object({ id: uuid.optional(), name: z.string().trim().min(2).max(80), region: z.string().trim().min(2).max(60), active: z.boolean(), lat: coord(90).optional(), lng: coord(180).optional() })
export async function saveOutletAction(input: unknown): Promise<Result> {
  const admin = await requireUser('admin')
  const p = outletSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'Enter an outlet name and region. Coordinates must be decimal degrees.' }
  if ((p.data.lat == null) !== (p.data.lng == null)) return { ok: false, error: 'Enter both latitude and longitude, or neither.' }
  try {
    if (p.data.id) {
      await db.update(outlets).set({ name: p.data.name, region: p.data.region, active: p.data.active, lat: p.data.lat ?? null, lng: p.data.lng ?? null }).where(eq(outlets.id, p.data.id))
      if (!p.data.active) await db.update(users).set({ outletId: null }).where(and(eq(users.outletId, p.data.id), eq(users.role, 'promoter')))
    } else await db.insert(outlets).values({ name: p.data.name, region: p.data.region, active: p.data.active, lat: p.data.lat ?? null, lng: p.data.lng ?? null })
  } catch (e) { return { ok: false, error: isUnique(e) ? 'An outlet with that name already exists.' : 'Could not save the outlet.' } }
  await audit(admin.id, p.data.id ? 'outlet.update' : 'outlet.create', 'outlet', p.data.id, { name: p.data.name })
  revalidatePath('/admin', 'layout')
  return { ok: true }
}

/* ---------------- Promoters ---------------- */
const promoterSchema = z.object({
  id: uuid.optional(), name: z.string().trim().min(2).max(60), phone: z.string().min(1), outletId: uuid.nullable(), active: z.boolean(),
  pin: z.string().regex(/^\d{4,8}$/).optional().or(z.literal('')), generatePin: z.boolean().default(false),
})
export async function savePromoterAction(input: unknown): Promise<Result<{ pin?: string }>> {
  const admin = await requireUser('admin')
  const p = promoterSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'Check the name and PIN (4 to 8 digits).' }
  const phone = normalizePhone(p.data.phone)
  if (!phone) return { ok: false, error: 'Enter a valid 10-digit Ghana mobile number.' }
  let pin = p.data.pin || undefined
  if (p.data.generatePin) pin = genPin()
  if (!p.data.id && !pin) return { ok: false, error: 'Set a PIN, or choose “Generate PIN”.' }
  try {
    const base = { name: p.data.name, phone, outletId: p.data.outletId, active: p.data.active }
    if (p.data.id) {
      await db.update(users).set({ ...base, ...(pin ? { secretHash: await bcrypt.hash(pin, 10), failedAttempts: 0, lockedUntil: null } : {}), ...(pin || !p.data.active ? { tokenVersion: sql`${users.tokenVersion} + 1` } : {}) })
        .where(and(eq(users.id, p.data.id), eq(users.role, 'promoter')))
    } else await db.insert(users).values({ ...base, role: 'promoter', secretHash: await bcrypt.hash(pin!, 10) })
  } catch (e) { return { ok: false, error: isUnique(e) ? 'That mobile number is already in use.' : 'Could not save the promoter.' } }
  await audit(admin.id, p.data.id ? 'promoter.update' : 'promoter.create', 'user', p.data.id, { name: p.data.name, pinReset: !!pin })
  revalidatePath('/admin', 'layout')
  return { ok: true, pin: p.data.generatePin ? pin : undefined }
}

/* ---------------- SKUs & brands ---------------- */
const skuSchema = z.object({
  id: uuid.optional(), label: z.string().trim().min(1).max(40), code: z.string().trim().min(1).max(8), active: z.boolean(),
  brandIds: z.array(uuid).max(100), newBrands: z.array(z.string().trim().min(1).max(60)).max(50),
})
export async function saveSkuAction(input: unknown): Promise<Result> {
  const admin = await requireUser('admin')
  const p = skuSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'Enter a pack size label and a short code.' }
  try {
    let skuId = p.data.id
    if (skuId) await db.update(skus).set({ label: p.data.label, code: p.data.code, active: p.data.active }).where(eq(skus.id, skuId))
    else {
      const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${skus.sortOrder}), -1) + 1` }).from(skus)
      ;[{ id: skuId }] = await db.insert(skus).values({ label: p.data.label, code: p.data.code, active: p.data.active, sortOrder: n }).returning({ id: skus.id })
    }
    const created = p.data.newBrands.length
      ? await db.insert(brands).values([...new Set(p.data.newBrands)].map((name) => ({ name }))).onConflictDoUpdate({ target: brands.name, set: { active: true } }).returning({ id: brands.id })
      : []
    const ids = [...new Set([...p.data.brandIds, ...created.map((c) => c.id)])]
    // Replace the pack's brand list, keeping display order as given.
    await db.delete(skuBrands).where(eq(skuBrands.skuId, skuId!))
    if (ids.length) await db.insert(skuBrands).values(ids.map((brandId, i) => ({ skuId: skuId!, brandId, sortOrder: i })))
  } catch (e) { return { ok: false, error: isUnique(e) ? 'A pack size with that label already exists.' : 'Could not save the SKU.' } }
  await audit(admin.id, p.data.id ? 'sku.update' : 'sku.create', 'sku', p.data.id, { label: p.data.label })
  revalidatePath('/admin', 'layout'); revalidatePath('/capture', 'layout')
  return { ok: true }
}

/* ---------------- Settings ---------------- */
export async function saveSettingsAction(input: unknown): Promise<Result> {
  const admin = await requireUser('admin')
  const p = settingsSchema.safeParse(input)
  if (!p.success) return { ok: false, error: 'Check the values: variance must be 1 to 500%, edit window 0 to 720 hours.' }
  for (const [key, value] of Object.entries(p.data))
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } })
  await audit(admin.id, 'settings.update', 'settings', undefined, p.data)
  revalidatePath('/admin', 'layout'); revalidatePath('/capture', 'layout')
  return { ok: true }
}

/* ---------------- CSV imports ---------------- */
export type ImportResult = Result<{ created: number; updated: number; skipped: string[] }>
const cap = (rows: string[][]) => rows.slice(0, 2001)

export async function importOutletsAction(text: string): Promise<ImportResult> {
  const admin = await requireUser('admin')
  const rows = cap(parseCsv(String(text).slice(0, 1_000_000)))
  const body = /^name$/i.test(rows[0]?.[0] ?? '') ? rows.slice(1) : rows
  if (!body.length) return { ok: false, error: 'The file is empty. Expected columns: name,region,lat,lng (lat/lng optional)' }
  let created = 0, updated = 0; const skipped: string[] = []
  const existing = new Map((await db.select().from(outlets)).map((o) => [o.name.toLowerCase(), o.id]))
  for (const [i, r] of body.entries()) {
    const [name, region] = [r[0]?.slice(0, 80), r[1]?.slice(0, 60)]
    if (!name || !region) { skipped.push(`Row ${i + 1}: needs name and region`); continue }
    const lat = r[2] ? Number(r[2]) : null, lng = r[3] ? Number(r[3]) : null
    const hasPin = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    if ((r[2] || r[3]) && !hasPin) { skipped.push(`Row ${i + 1}: lat/lng must be decimal degrees`); continue }
    const pin = hasPin ? { lat, lng } : {}
    const id = existing.get(name.toLowerCase())
    if (id) { await db.update(outlets).set({ region, active: true, ...pin }).where(eq(outlets.id, id)); updated++ }
    else { const [o] = await db.insert(outlets).values({ name, region, ...pin }).returning({ id: outlets.id }); existing.set(name.toLowerCase(), o.id); created++ }
  }
  await audit(admin.id, 'outlet.import', 'outlet', undefined, { created, updated })
  revalidatePath('/admin', 'layout')
  return { ok: true, created, updated, skipped: skipped.slice(0, 20) }
}

export async function importPromotersAction(text: string): Promise<ImportResult> {
  const admin = await requireUser('admin')
  const rows = cap(parseCsv(String(text).slice(0, 1_000_000)))
  const body = /^name$/i.test(rows[0]?.[0] ?? '') ? rows.slice(1) : rows
  if (!body.length) return { ok: false, error: 'The file is empty. Expected columns: name,phone,pin,outlet' }
  const outletByName = new Map((await db.select().from(outlets)).map((o) => [o.name.toLowerCase(), o.id]))
  const existing = new Map((await db.select({ id: users.id, phone: users.phone }).from(users).where(eq(users.role, 'promoter'))).map((u) => [u.phone, u.id]))
  let created = 0, updated = 0; const skipped: string[] = []
  for (const [i, r] of body.entries()) {
    const [name, rawPhone, pin, outletName] = r
    const phone = normalizePhone(rawPhone ?? '')
    if (!name || !phone) { skipped.push(`Row ${i + 1}: needs a name and valid mobile number`); continue }
    const outletId = outletName ? outletByName.get(outletName.toLowerCase()) : undefined
    if (outletName && !outletId) { skipped.push(`Row ${i + 1}: outlet “${outletName}” not found`); continue }
    const id = existing.get(phone)
    if (id) {
      await db.update(users).set({ name: name.slice(0, 60), outletId: outletId ?? null, ...(pin && /^\d{4,8}$/.test(pin) ? { secretHash: await bcrypt.hash(pin, 10), tokenVersion: sql`${users.tokenVersion} + 1` } : {}) }).where(eq(users.id, id)); updated++
    } else {
      if (!/^\d{4,8}$/.test(pin ?? '')) { skipped.push(`Row ${i + 1}: new promoters need a 4 to 8 digit PIN`); continue }
      const [u] = await db.insert(users).values({ role: 'promoter', name: name.slice(0, 60), phone, outletId: outletId ?? null, secretHash: await bcrypt.hash(pin, 10) }).returning({ id: users.id })
      existing.set(phone, u.id); created++
    }
  }
  await audit(admin.id, 'promoter.import', 'user', undefined, { created, updated })
  revalidatePath('/admin', 'layout')
  return { ok: true, created, updated, skipped: skipped.slice(0, 20) }
}

/** CSV columns: sku,brand  (one row per pack-size/brand pair) */
export async function importSkusAction(text: string): Promise<ImportResult> {
  const admin = await requireUser('admin')
  const rows = cap(parseCsv(String(text).slice(0, 1_000_000)))
  const body = /^sku$/i.test(rows[0]?.[0] ?? '') ? rows.slice(1) : rows
  if (!body.length) return { ok: false, error: 'The file is empty. Expected columns: sku,brand' }
  const skuMap = new Map((await db.select().from(skus)).map((k) => [k.label.toLowerCase(), k]))
  const brandMap = new Map((await db.select().from(brands)).map((b) => [b.name.toLowerCase(), b.id]))
  let created = 0, updated = 0; const skipped: string[] = []
  let order = skuMap.size
  for (const [i, r] of body.entries()) {
    const [sku, brand] = [r[0]?.slice(0, 40), r[1]?.slice(0, 60)]
    if (!sku || !brand) { skipped.push(`Row ${i + 1}: needs sku and brand`); continue }
    let k = skuMap.get(sku.toLowerCase())
    if (!k) {
      const code = (sku.match(/[\d.]+/)?.[0] ?? sku).slice(0, 8)
      const [row] = await db.insert(skus).values({ label: sku, code, sortOrder: order++ }).returning(); k = row; skuMap.set(sku.toLowerCase(), row); created++
    }
    let bid = brandMap.get(brand.toLowerCase())
    if (!bid) { const [b] = await db.insert(brands).values({ name: brand }).returning({ id: brands.id }); bid = b.id; brandMap.set(brand.toLowerCase(), bid) }
    const ins = await db.insert(skuBrands).values({ skuId: k.id, brandId: bid, sortOrder: i }).onConflictDoNothing().returning({ b: skuBrands.brandId })
    if (ins.length) updated++
  }
  await audit(admin.id, 'sku.import', 'sku', undefined, { created, pairs: updated })
  revalidatePath('/admin', 'layout'); revalidatePath('/capture', 'layout')
  return { ok: true, created, updated, skipped: skipped.slice(0, 20) }
}
