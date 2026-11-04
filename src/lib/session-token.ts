import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'ml_session'
export type Role = 'admin' | 'promoter'
export type SessionPayload = { uid: string; role: Role }

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
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL[p.role]}s`)
    .sign(key())
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] })
    if (typeof payload.uid === 'string' && (payload.role === 'admin' || payload.role === 'promoter'))
      return { uid: payload.uid, role: payload.role }
  } catch {}
  return null
}
