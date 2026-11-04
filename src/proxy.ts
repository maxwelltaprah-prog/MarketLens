import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session-token'

/* Runs before every request (except static assets).
 * 1. Route gate: /admin needs an admin session, /capture a promoter session. Every page and action ALSO
 *    re-checks the user against the database, so this is the outer wall, not the only one.
 * 2. Burst limiter: per-IP, in memory (per instance). The sign-in action has its own database-backed limit.
 * 3. Security headers incl. a nonce-based Content-Security-Policy. */

const isProd = process.env.NODE_ENV === 'production'

const buckets = new Map<string, number[]>()
function burst(key: string, max: number, windowMs: number) {
  const now = Date.now()
  const xs = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (xs.length >= max) return false
  xs.push(now); buckets.set(key, xs)
  if (buckets.size > 5000) buckets.clear()
  return true
}

function csp(nonce: string) {
  const dev = !isProd
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,      // Tailwind runtime styles + inline style attributes on charts
    `img-src 'self' data: blob: https://*.tile.openstreetmap.org`,   // map tiles on the field map
    `font-src 'self' data:`,
    `connect-src 'self'${dev ? ' ws: wss:' : ''}`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    ...(isProd ? ['upgrade-insecure-requests'] : []),
  ].join('; ')
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'

  // Burst protection: 300 requests / minute per IP for pages, 40 / minute for POSTs to the sign-in page.
  const isPost = req.method === 'POST'
  if (pathname === '/login' && isPost && !burst(`login:${ip}`, 40, 60_000)) return new NextResponse('Too many requests', { status: 429, headers: { 'Retry-After': '60' } })
  if (!burst(`all:${ip}`, 300, 60_000)) return new NextResponse('Too many requests', { status: 429, headers: { 'Retry-After': '60' } })

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  const isAdminArea = pathname.startsWith('/admin')
  const isCaptureArea = pathname.startsWith('/capture')
  const isApi = pathname.startsWith('/api/')

  if ((isAdminArea || isCaptureArea) && !session) {
    if (isApi) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (isApi && !session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (session && isAdminArea && session.role !== 'admin') return NextResponse.redirect(new URL('/capture', req.url))
  if (session && isCaptureArea && session.role !== 'promoter') return NextResponse.redirect(new URL('/admin', req.url))
  if (session && pathname === '/login' && !isPost)
    return NextResponse.redirect(new URL(session.role === 'admin' ? '/admin' : '/capture', req.url))

  // Nonce-based CSP: Next.js reads the nonce from this request header and applies it to its own inline scripts.
  const nonce = btoa(crypto.getRandomValues(new Uint8Array(16)).reduce((s, b) => s + String.fromCharCode(b), ''))
  const policy = csp(nonce)
  const reqHeaders = new Headers(req.headers)
  reqHeaders.set('x-nonce', nonce)
  reqHeaders.set('content-security-policy', policy)
  const res = NextResponse.next({ request: { headers: reqHeaders } })
  res.headers.set('Content-Security-Policy', policy)
  if (isAdminArea || isCaptureArea || isApi) res.headers.set('Cache-Control', 'private, no-store')
  return res
}

export const config = {
  matcher: [
    // Everything except Next internals and static files.
    '/((?!_next/static|_next/image|brand/|sw\\.js|offline\\.html|favicon\\.ico|robots\\.txt).*)',
  ],
}
