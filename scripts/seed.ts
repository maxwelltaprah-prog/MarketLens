import { config } from 'dotenv'
config({ path: ['.env.local', '.env'], quiet: true })
import { createDb } from '../src/db/factory'
import bcrypt from 'bcryptjs'
import { randomInt } from 'node:crypto'
import * as s from '../src/db/schema'
import { sql } from 'drizzle-orm'

let db: Awaited<ReturnType<typeof createDb>>

const OUTLETS: [string, string][] = [
  ['Lord Cares', 'Accra'], ['Rice City', 'Kumasi'], ['Golden Future', 'Western Region'],
  ['Many Means', 'Accra'], ['Kaysons', 'Kumasi'], ['Cepodek', 'Western Region'],
  ['Bekind - Takoradi', 'Accra'], ['Bekind - Tarkwa', 'Kumasi'], ['Nyilale', 'Western Region'],
  ['Nan Enterprise', 'Accra'], ['Dejol', 'Kumasi'], ['Koad', 'Western Region'],
]
const ph = (n: number) => Array.from({ length: n }, (_, i) => `Placeholder ${i + 1}`)

// Brand lists are taken from the design screens. Where the design shows "+N more",
// clearly named placeholders keep the counts (7/11/5/15/7/11/5/15 = 76) until real data is imported.
const SKUS: { label: string; code: string; brands: string[] }[] = [
  { label: '1 kg', code: '1', brands: ['Royal Aroma', 'Cindy', 'K 75', 'Creedplus', 'XL 95', 'Milicent', 'Dina Gold'] },
  { label: '5 kg', code: '5', brands: ['Royal Aroma', '24K Gold', 'Cindy', 'K 75', 'Creedplus', 'XL 95', ...ph(5)] },
  { label: '800 gm', code: '800', brands: ['Channel', 'Creed', 'Paris', 'Abena', 'Ginny'] },
  { label: '4.25 kg', code: '4.25', brands: ['Channel', 'Channel Black', 'Oba', 'Paris', 'Creed', 'Dina', ...ph(9)] },
  { label: '4 kg', code: '4', brands: ['Royal Aroma', 'New York', 'Cindy', 'XL 95', 'Bluestar', 'Rio', ...ph(1)] },
  { label: '50 kg', code: '50', brands: ['Royal Aroma', '24K Gold', 'Cindy', 'K 75', 'Creedplus', 'XL 95', ...ph(5)] },
  { label: '45 Kg Brokens', code: '45', brands: ['Royal Aroma', 'Channel', 'K 75', 'Abena/ Cindy', 'Dina'] },
  { label: '45 kg', code: '45', brands: ['Channel', 'Channel Black', 'Oba', 'Paris', 'Creed', 'Dina', ...ph(9)] },
]

const handleFor = (outlet: string) => `${(outlet.includes(' - ') ? outlet.split(' - ').pop()! : outlet.split(' ')[0]).trim()}@111`

async function main() {
  db = await createDb(process.env.DATABASE_URL!)
  const adminEmail = process.env.SEED_ADMIN_EMAIL
  const adminPassword = process.env.SEED_ADMIN_PASSWORD
  if (!adminEmail || !adminPassword || adminPassword.length < 10)
    throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (min 10 chars) in .env')

  // Settings
  const defaults = { currency: 'GHS', allowBackdating: false, editWindowHours: 24, varianceWarningPct: 40 }
  for (const [key, value] of Object.entries(defaults))
    await db.insert(s.settings).values({ key, value }).onConflictDoNothing()

  // Admin
  await db.insert(s.users).values({
    role: 'admin', name: 'Ama Kusi', email: adminEmail.toLowerCase(),
    secretHash: await bcrypt.hash(adminPassword, 12),
  }).onConflictDoNothing()

  // Outlets
  await db.insert(s.outlets).values(OUTLETS.map(([name, region]) => ({ name, region }))).onConflictDoNothing()
  const outletRows = await db.select().from(s.outlets)

  // SKUs / brands
  const brandNames = [...new Set(SKUS.flatMap((k) => k.brands))]
  // Royal Aroma is Olam Agri's own brand; everything else is treated as a competitor until an admin changes it.
  await db.insert(s.brands).values(brandNames.map((name) => ({ name, isCompany: /^royal aroma$/i.test(name) }))).onConflictDoNothing()
  await db.insert(s.skus).values(SKUS.map((k, i) => ({ label: k.label, code: k.code, sortOrder: i }))).onConflictDoNothing()
  const brandRows = await db.select().from(s.brands)
  const skuRows = await db.select().from(s.skus)
  const bId = new Map(brandRows.map((b) => [b.name, b.id]))
  const sId = new Map(skuRows.map((k) => [k.label, k.id]))
  await db.insert(s.skuBrands).values(
    SKUS.flatMap((k) => k.brands.map((b, i) => ({ skuId: sId.get(k.label)!, brandId: bId.get(b)!, sortOrder: i }))),
  ).onConflictDoNothing()

  // Promoters: one per outlet. PINs are random and printed once.
  const existing = await db.select({ id: s.users.id }).from(s.users).where(sql`${s.users.role} = 'promoter'`)
  if (existing.length === 0) {
    const lines: string[] = ['name,phone,pin,outlet']
    for (const [i, o] of outletRows.entries()) {
      const phone = `0200000${String(i + 1).padStart(3, '0')}` // placeholder numbers, replace in Admin > Promoters
      const pin = String(randomInt(0, 1_000_000)).padStart(6, '0')
      await db.insert(s.users).values({
        role: 'promoter', name: handleFor(o.name), phone, outletId: o.id,
        secretHash: await bcrypt.hash(pin, 10),
      })
      lines.push(`${handleFor(o.name)},${phone},${pin},${o.name}`)
    }
    console.log('\nPromoter credentials (shown once - change them in Admin > Promoters):\n' + lines.join('\n') + '\n')
  }

  // Optional demo history so the dashboard has data
  if (process.env.SEED_DEMO === '1') await seedDemo(outletRows, skuRows)
  console.log('Seed complete.')
  process.exit(0)
}

async function seedDemo(outletRows: (typeof s.outlets.$inferSelect)[], skuRows: (typeof s.skus.$inferSelect)[]) {
  const promoters = await db.select().from(s.users).where(sql`${s.users.role} = 'promoter'`)
  const pairs = await db.select().from(s.skuBrands)
  const base = new Map<string, number>()
  const rnd = (a: number, b: number) => a + Math.random() * (b - a)
  const skuBase: Record<string, number> = { '1 kg': 22, '5 kg': 96, '800 gm': 12, '4.25 kg': 82, '4 kg': 76, '50 kg': 880, '45 Kg Brokens': 740, '45 kg': 790 }
  for (const p of pairs) {
    const label = skuRows.find((k) => k.id === p.skuId)!.label
    base.set(`${p.skuId}:${p.brandId}`, skuBase[label] * rnd(0.9, 1.12))
  }
  const today = new Date()
  for (let d = 30; d >= 1; d--) {
    const day = new Date(today); day.setUTCDate(day.getUTCDate() - d)
    const iso = day.toISOString().slice(0, 10)
    const trend = 1 + (30 - d) * 0.0035
    for (const o of outletRows) {
      if (Math.random() < 0.12) continue
      const promoter = promoters.find((p) => p.outletId === o.id)!
      const [entry] = await db.insert(s.entries).values({
        outletId: o.id, promoterId: promoter.id, entryDate: iso, status: 'submitted',
        submittedAt: new Date(`${iso}T08:${String(randomInt(10, 59))}:00Z`),
      }).onConflictDoNothing().returning({ id: s.entries.id })
      if (!entry) continue
      const rows = pairs.map((p) => {
        const na = Math.random() < 0.07
        return { entryId: entry.id, skuId: p.skuId, brandId: p.brandId, notAvailable: na,
          price: na ? null : (base.get(`${p.skuId}:${p.brandId}`)! * trend * rnd(0.97, 1.03)).toFixed(2) }
      })
      for (let i = 0; i < rows.length; i += 500)
        await db.insert(s.entryPrices).values(rows.slice(i, i + 500)).onConflictDoNothing()
      // Demo sales for company brands
      const company = await db.select({ id: s.brands.id }).from(s.brands).where(sql`${s.brands.isCompany} = true`)
      const companyPairs = pairs.filter((p) => company.some((c) => c.id === p.brandId))
      const salesRows = companyPairs.filter(() => Math.random() < 0.7).map((p) => ({
        outletId: o.id, promoterId: promoter.id, saleDate: iso, skuId: p.skuId, brandId: p.brandId,
        quantity: randomInt(1, 40), unitPrice: (base.get(`${p.skuId}:${p.brandId}`)! * trend * 1.05).toFixed(2),
      }))
      if (salesRows.length) await db.insert(s.sales).values(salesRows).onConflictDoNothing()
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
