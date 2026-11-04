import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { and, eq } from 'drizzle-orm'
import { db, users, outlets } from '@/db'
import { SESSION_COOKIE, SESSION_TTL, signSession, verifySession, type Role } from './session-token'

export async function createSession(uid: string, role: Role) {
  const token = await signSession({ uid, role })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: SESSION_TTL[role],
  })
}

export async function destroySession() {
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
}

/** Current user, re-checked against the database so deactivation takes effect immediately. */
export const getCurrentUser = cache(async () => {
  const jar = await cookies()
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value)
  if (!session) return null
  const [row] = await db
    .select({
      id: users.id, role: users.role, name: users.name, email: users.email, phone: users.phone,
      outletId: users.outletId, outletName: outlets.name,
    })
    .from(users)
    .leftJoin(outlets, eq(outlets.id, users.outletId))
    .where(and(eq(users.id, session.uid), eq(users.active, true)))
    .limit(1)
  if (!row || row.role !== session.role) return null
  return row
})
export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>

export async function requireUser(role: Role): Promise<CurrentUser> {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (user.role !== role) redirect(user.role === 'admin' ? '/admin' : '/capture')
  return user
}
