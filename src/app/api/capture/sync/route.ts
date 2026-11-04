import { z } from 'zod'
import { getCurrentUser } from '@/lib/session'
import { attachPings, cellsSchema, saveDraft, submitEntry } from '@/lib/capture-core'
import { pingSchema } from '@/lib/location'
import { salesMapSchema, saveSales } from '@/lib/sales-core'
import { isSameOrigin, logSecurity, memoryLimit, clientIp, userAgent } from '@/lib/security'

/* Offline replay endpoint. The service worker (Background Sync) and the page both POST the outbox here.
 * Auth: session cookie (checked in the proxy and again here). CSRF: SameSite=Strict cookie + same-origin check.
 * Idempotent: saving the same cells twice is harmless (upsert), submitting twice is a no-op re-submit. */
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  items: z.array(z.object({ userId: z.string().uuid(), date: z.iso.date(), cells: cellsSchema, sales: salesMapSchema.default({}), submit: z.boolean(), pings: z.array(pingSchema).max(300).default([]) })).max(60),
})

export async function POST(req: Request) {
  if (!isSameOrigin(req)) { await logSecurity('csrf.rejected', { path: '/api/capture/sync' }); return Response.json({ error: 'forbidden' }, { status: 403 }) }
  const user = await getCurrentUser()
  if (!user || user.role !== 'promoter') { await logSecurity('authz.denied', { path: '/api/capture/sync' }, user?.id ?? null); return Response.json({ error: 'unauthorized' }, { status: 401 }) }
  const rl = memoryLimit(`sync:${user.id}:${await clientIp()}`, 60, 60_000)
  if (!rl.ok) return Response.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } })

  let json: unknown
  try { json = await req.json() } catch { return Response.json({ error: 'bad_json' }, { status: 400 }) }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) return Response.json({ error: 'invalid', detail: 'Payload failed validation' }, { status: 400 })

  const ctx = { ip: await clientIp(), userAgent: await userAgent() }
  const results = []
  for (const item of parsed.data.items) {
    // A queue written by another account on a shared device is never replayed into this account.
    if (item.userId !== user.id) { results.push({ date: item.date, ok: false, permanent: true, error: 'This change belongs to a different account and was discarded.' }); continue }
    const saved = Object.keys(item.cells).length || item.submit ? await saveDraft(user, item.date, item.cells) : { ok: true as const, status: 'draft' as const, savedAt: new Date().toISOString() }
    if (!saved.ok) { results.push({ date: item.date, ...saved }); continue }
    if (Object.keys(item.sales).length) {
      const latestFix = [...item.pings].sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())[0] ?? null
      const sv = await saveSales(user, item.date, item.sales, latestFix ? { lat: latestFix.lat, lng: latestFix.lng } : null)
      if (!sv.ok) { results.push({ date: item.date, ...sv }); continue }
    }
    // Location: the most recent fix in the batch is the one bound to the submission; the rest are the trail.
    const sorted = [...item.pings].sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
    const latest = sorted.at(-1) ?? null
    try { await attachPings(user, item.date, sorted.filter((p) => p.kind !== 'submit'), ctx) } catch { await logSecurity('sync.rejected', { reason: 'pings' }, user.id) }
    if (item.submit) {
      const sub = await submitEntry(user, item.date, latest ? { ...latest, kind: 'submit' } : null, ctx)
      results.push({ date: item.date, ...sub, submitted: sub.ok })
    } else results.push({ date: item.date, ...saved, submitted: false })
  }
  return Response.json({ results }, { headers: { 'Cache-Control': 'no-store' } })
}
