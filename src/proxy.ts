import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session-token'

// Coarse gate on routes. Every page and action ALSO re-checks the user against the database.
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  const isAdminArea = pathname.startsWith('/admin')
  const isCaptureArea = pathname.startsWith('/capture')

  if ((isAdminArea || isCaptureArea) && !session) {
    const url = new URL('/login', req.url)
    return NextResponse.redirect(url)
  }
  if (session && isAdminArea && session.role !== 'admin') return NextResponse.redirect(new URL('/capture', req.url))
  if (session && isCaptureArea && session.role !== 'promoter') return NextResponse.redirect(new URL('/admin', req.url))
  if (session && pathname === '/login')
    return NextResponse.redirect(new URL(session.role === 'admin' ? '/admin' : '/capture', req.url))
  return NextResponse.next()
}

export const config = { matcher: ['/admin/:path*', '/capture/:path*', '/login'] }
