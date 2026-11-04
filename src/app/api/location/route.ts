import { z } from 'zod'
import { getCurrentUser } from '@/lib/session'
import { pingSchema, recordPings } from '@/lib/location'
import { attachPings } from '@/lib/capture-core'
import { isSameOrigin, logSecurity, memoryLimit, clientIp, userAgent } from '@/lib/security'

/* Live location pings (sign-in, heartbeats) for both roles. Promoter pings are tied to today's entry when one exists. */
export const dynamic = 'force-dynamic'
const bodySchema = z.object({ pings: z.array(pingSchema).min(1).max(100), entryDate: z.iso.date().optional() })

export async function POST(req: Request) {
  if (!isSameOrigin(req)) { await logSecurity('csrf.rejected', { path: '/api/location' }); return Response.json({ error: 'forbidden' }, { status: 403 }) }
  const user = await getCurrentUser()
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 })
  const ip = await clientIp()
  const rl = memoryLimit(`loc:${user.id}:${ip}`, 120, 60_000)
  if (!rl.ok) return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })
  let json: unknown
  try { json = await req.json() } catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return Response.json({ error: 'invalid' }, { status: 400 })
  const ctx = { ip, userAgent: await userAgent() }
  if (user.role === 'promoter' && parsed.data.entryDate) await attachPings(user, parsed.data.entryDate, parsed.data.pings, ctx)
  else await recordPings(user.id, parsed.data.pings, { ...ctx, outletId: user.outletId })
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
}
