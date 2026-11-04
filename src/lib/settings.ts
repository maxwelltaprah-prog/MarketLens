import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { db, settings } from '@/db'

export const settingsSchema = z.object({
  currency: z.enum(['GHS', 'NGN', 'USD', 'EUR', 'GBP', 'XOF']).default('GHS'),
  allowBackdating: z.boolean().default(false),
  editWindowHours: z.number().int().min(0).max(720).default(24),
  varianceWarningPct: z.number().min(1).max(500).default(40),
  // Location tracking
  locationTracking: z.boolean().default(true),          // ask promoters for their location in the field app
  requireLocation: z.boolean().default(false),          // block submission when no fix could be obtained
  geofenceMeters: z.number().int().min(50).max(5000).default(300),
  trackingIntervalSec: z.number().int().min(30).max(900).default(120),  // heartbeat while the capture screen is open
  locationRetentionDays: z.number().int().min(7).max(730).default(90),
})
export type AppSettings = z.infer<typeof settingsSchema>

export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await db.select().from(settings)
  return settingsSchema.parse(Object.fromEntries(rows.map((r) => [r.key, r.value])))
})
