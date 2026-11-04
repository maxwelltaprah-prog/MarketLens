import { SignJWT, jwtVerify } from 'jose'

/* Stateless, signed session. Runs in the proxy (edge-compatible) and on the server.
 * `__Host-` prefix (production only): the browser refuses the cookie unless it is Secure, Path=/ and has no Domain,
 * so a subdomain or an insecure origin can never plant one. */
const isProd = process.env.NODE_ENV === 'production'
export const SESSION_COOKIE = isProd ? '__Host-ml_session' : 'ml_session'
export type Role = 'admin' | 'promoter'
export type SessionPayload = { uid: string; role: Role; v: number }

function key() {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)')
  return new TextEncoder().encode(secret)
}

export const SESSION_TTL: Record<Role, number> = {
  admin: 60 * 60 * 12,          // 12 hours
  promoter: 60 * 60 * 24 * 14,  // 14 days: field devices stay signed in
}

export async function signSession(p: SessionPayload) {
  return new SignJWT({ uid: p.uid, role: p.role, v: p.v })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt().setIssuer('marketlens').setAudience('marketlens')
    .setExpirationTime(`${SESSION_TTL[p.role]}s`)
    .sign(key())
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'], issuer: 'marketlens', audience: 'marketlens' })
    if (typeof payload.uid === 'string' && (payload.role === 'admin' || payload.role === 'promoter'))
      return { uid: payload.uid, role: payload.role, v: typeof payload.v === 'number' ? payload.v : 0 }
  } catch {}
  return null
}
