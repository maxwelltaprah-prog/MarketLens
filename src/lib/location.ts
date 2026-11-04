import 'server-only'
import { z } from 'zod'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import { db, locationPings, outlets, users, entries } from '@/db'
import { getSettings } from './settings'

/* ------------------------------------------------------------------
   Shared shapes
------------------------------------------------------------------- */
export const fixSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000).nullable().optional(),
  speedMps: z.number().min(0).max(200).nullable().optional(),
  headingDeg: z.number().min(0).max(360).nullable().optional(),
  altitudeM: z.number().min(-1000).max(10_000).nullable().optional(),
  battery: z.number().min(0).max(1).nullable().optional(),
  online: z.boolean().optional(),
  capturedAt: z.string().datetime().or(z.number()),  // ISO or epoch ms from the device
})
export type Fix = z.infer<typeof fixSchema>
export const pingSchema = fixSchema.extend({ kind: z.enum(['login', 'heartbeat', 'save', 'submit']) })
export type Ping = z.infer<typeof pingSchema>

/** Great-circle distance in metres. */
export function haversineM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6_371_000, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

export type GeoStatus = 'ok' | 'away' | 'unverified' | 'none'
export function geofence(fix: Pick<Fix, 'lat' | 'lng'> | null, outlet: { lat: number | null; lng: number | null } | null, radiusM: number): { status: GeoStatus; distanceM: number | null } {
  if (!fix) return { status: 'none', distanceM: null }
  if (!outlet || outlet.lat == null || outlet.lng == null) return { status: 'unverified', distanceM: null }
  const d = haversineM(fix.lat, fix.lng, outlet.lat, outlet.lng)
  return { status: d <= radiusM ? 'ok' : 'away', distanceM: d }
}

const toDate = (v: string | number) => { const d = new Date(v); return Number.isNaN(d.getTime()) || Math.abs(Date.now() - d.getTime()) > 30 * 86_400_000 ? new Date() : d }

/** Store pings for a user. Resolves the outlet pin for distance. Keeps at most 500 per call. */
export async function recordPings(userId: string, pings: Ping[], ctx: { ip?: string; userAgent?: string; entryId?: string | null; outletId?: string | null }) {
  if (!pings.length) return
  const s = await getSettings()
  let outlet: { lat: number | null; lng: number | null } | null = null
  if (ctx.outletId) [outlet] = await db.select({ lat: outlets.lat, lng: outlets.lng }).from(outlets).where(eq(outlets.id, ctx.outletId))
  const rows = pings.slice(0, 500).map((p) => ({
    userId, kind: p.kind, lat: p.lat, lng: p.lng,
    accuracyM: p.accuracyM ?? null, speedMps: p.speedMps ?? null, headingDeg: p.headingDeg ?? null, altitudeM: p.altitudeM ?? null,
    battery: p.battery ?? null, online: p.online ?? true, ip: ctx.ip ?? null, userAgent: ctx.userAgent?.slice(0, 200) ?? null,
    outletId: ctx.outletId ?? null, entryId: ctx.entryId ?? null,
    distanceM: geofence(p, outlet, s.geofenceMeters).distanceM,
    capturedAt: toDate(p.capturedAt),
  }))
  await db.insert(locationPings).values(rows)
  if (Math.random() < 0.02) await db.delete(locationPings).where(sql`${locationPings.capturedAt} < now() - make_interval(days => ${s.locationRetentionDays})`)
}

/* ------------------------------------------------------------------
   Admin queries
------------------------------------------------------------------- */
export type FieldUser = {
  id: string; name: string; role: 'admin' | 'promoter'; outletId: string | null; outletName: string | null
  outletLat: number | null; outletLng: number | null
  last: { lat: number; lng: number; accuracyM: number | null; kind: string; at: Date; distanceM: number | null; battery: number | null; speedMps: number | null } | null
  pingsToday: number
}

/** Latest fix per user plus today's ping count, for the live field map. */
export async function getFieldStatus(sinceHours = 24): Promise<{ users: FieldUser[]; outlets: { id: string; name: string; region: string; lat: number | null; lng: number | null }[] }> {
  const since = new Date(Date.now() - sinceHours * 3_600_000)
  const [people, latest, counts, outs] = await Promise.all([
    db.select({ id: users.id, name: users.name, role: users.role, outletId: users.outletId, outletName: outlets.name, outletLat: outlets.lat, outletLng: outlets.lng })
      .from(users).leftJoin(outlets, eq(outlets.id, users.outletId)).where(eq(users.active, true)),
    db.execute<{ user_id: string; lat: number; lng: number; accuracy_m: number | null; kind: string; captured_at: string; distance_m: number | null; battery: number | null; speed_mps: number | null }>(sql`
      select distinct on (user_id) user_id, lat, lng, accuracy_m, kind, captured_at, distance_m, battery, speed_mps
      from location_pings where captured_at >= ${since} order by user_id, captured_at desc`),
    db.select({ userId: locationPings.userId, n: sql<number>`count(*)::int` }).from(locationPings).where(gte(locationPings.capturedAt, since)).groupBy(locationPings.userId),
    db.select({ id: outlets.id, name: outlets.name, region: outlets.region, lat: outlets.lat, lng: outlets.lng }).from(outlets).where(eq(outlets.active, true)),
  ])
  const lastBy = new Map((latest.rows ?? (latest as unknown as { user_id: string }[])).map((r) => [r.user_id, r]))
  const countBy = new Map(counts.map((c) => [c.userId, c.n]))
  return {
    users: people.map((p) => {
      const l = lastBy.get(p.id)
      return { ...p, pingsToday: countBy.get(p.id) ?? 0,
        last: l ? { lat: Number(l.lat), lng: Number(l.lng), accuracyM: l.accuracy_m == null ? null : Number(l.accuracy_m), kind: l.kind, at: new Date(l.captured_at), distanceM: l.distance_m == null ? null : Number(l.distance_m), battery: l.battery == null ? null : Number(l.battery), speedMps: l.speed_mps == null ? null : Number(l.speed_mps) } : null }
    }).sort((a, b) => (b.last?.at.getTime() ?? 0) - (a.last?.at.getTime() ?? 0)),
    outlets: outs,
  }
}

/** Trail for one user over a window, oldest first. */
export async function getTrail(userId: string, sinceHours = 24, limit = 2000) {
  const since = new Date(Date.now() - sinceHours * 3_600_000)
  const rows = await db.select({ lat: locationPings.lat, lng: locationPings.lng, kind: locationPings.kind, at: locationPings.capturedAt, accuracyM: locationPings.accuracyM, distanceM: locationPings.distanceM, online: locationPings.online, entryId: locationPings.entryId })
    .from(locationPings).where(and(eq(locationPings.userId, userId), gte(locationPings.capturedAt, since))).orderBy(desc(locationPings.capturedAt)).limit(limit)
  return rows.reverse()
}

/** Pings attached to one entry (save/submit/heartbeats during that capture). */
export async function getEntryPings(entryId: string) {
  return db.select({ lat: locationPings.lat, lng: locationPings.lng, kind: locationPings.kind, at: locationPings.capturedAt, accuracyM: locationPings.accuracyM, distanceM: locationPings.distanceM, online: locationPings.online })
    .from(locationPings).where(eq(locationPings.entryId, entryId)).orderBy(desc(locationPings.capturedAt)).limit(200)
}

export async function pingsForEntries(ids: string[]) {
  if (!ids.length) return new Map<string, number>()
  const rows = await db.select({ id: locationPings.entryId, n: sql<number>`count(*)::int` }).from(locationPings).where(inArray(locationPings.entryId, ids)).groupBy(locationPings.entryId)
  return new Map(rows.map((r) => [r.id!, r.n]))
}

export { entries }
