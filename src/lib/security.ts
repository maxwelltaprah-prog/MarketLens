import 'server-only'
import { headers } from 'next/headers'
import { and, gte, eq, sql } from 'drizzle-orm'
import { db, auditLog, loginAttempts } from '@/db'

/* ------------------------------------------------------------------
   Request identity
------------------------------------------------------------------- */
export async function clientIp(): Promise<string> {
  const h = await headers()
  // Vercel sets x-real-ip from the edge; x-forwarded-for's first hop is the client.
  return (h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0] ?? 'unknown').trim().slice(0, 64)
}
export async function userAgent(): Promise<string> {
  const h = await headers()
  return (h.get('user-agent') ?? '').slice(0, 200)
}

/** Same-origin guard for JSON endpoints (defence in depth on top of SameSite cookies). */
export function isSameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.get('origin')
  if (!origin) return true // service workers / same-origin fetches may omit it; sec-fetch-site already checked
  try {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    return new URL(origin).host === host
  } catch { return false }
}

/* ------------------------------------------------------------------
   Rate limiting
   1) In-memory sliding window: cheap, per server instance, good for bursts.
   2) Database window for sign-in: survives across serverless instances.
------------------------------------------------------------------- */
const buckets = new Map<string, number[]>()
export function memoryLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  const xs = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (xs.length >= max) return { ok: false, retryAfter: Math.ceil((xs[0] + windowMs - now) / 1000) }
  xs.push(now); buckets.set(key, xs)
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.every((t) => now - t > windowMs)) buckets.delete(k)
  return { ok: true, retryAfter: 0 }
}

export const LOGIN_IP_MAX = 20            // attempts per IP…
export const LOGIN_IP_WINDOW_MIN = 15     // …per window

export async function loginAttemptsFrom(ip: string): Promise<number> {
  const since = new Date(Date.now() - LOGIN_IP_WINDOW_MIN * 60_000)
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gte(loginAttempts.createdAt, since), eq(loginAttempts.success, false)))
  return n
}
export async function recordLoginAttempt(ip: string, success: boolean, identifier: string) {
  await db.insert(loginAttempts).values({ ip, success, identifier: identifier.slice(0, 120) })
  // Opportunistic cleanup, roughly 1 in 50 calls.
  if (Math.random() < 0.02) await db.delete(loginAttempts).where(sql`${loginAttempts.createdAt} < now() - interval '2 days'`)
}

/* ------------------------------------------------------------------
   Security event log (surfaces in Admin → Settings)
------------------------------------------------------------------- */
export type SecurityEvent = 'login.failed' | 'login.locked' | 'login.ratelimited' | 'login.success' | 'csrf.rejected' | 'authz.denied' | 'sync.rejected' | 'session.revoked'
export async function logSecurity(action: SecurityEvent, meta: Record<string, unknown> = {}, actorId: string | null = null) {
  try {
    const [ip, ua] = await Promise.all([clientIp(), userAgent()])
    await db.insert(auditLog).values({ actorId, action: `security.${action}`, entity: 'security', entityId: ip, meta: { ...meta, ua } })
  } catch { /* never let logging break a request */ }
}
