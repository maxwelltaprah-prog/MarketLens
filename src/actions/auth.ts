'use server'
import { redirect } from 'next/navigation'
import { and, eq, sql } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db, users, auditLog } from '@/db'
import { createSession, destroySession } from '@/lib/session'
import { normalizePhone } from '@/lib/format'

export type LoginState = { error?: string; mode?: 'promoter' | 'admin' }

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15
// Compared against when the account does not exist so response time doesn't reveal valid logins.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-secret', 10)
const GENERIC = 'Those details don’t match our records. Please check and try again.'

const promoterSchema = z.object({ phone: z.string().min(1), secret: z.string().regex(/^\d{4,8}$/) })
const adminSchema = z.object({ email: z.email(), secret: z.string().min(1).max(200) })

export async function loginAction(_: LoginState, form: FormData): Promise<LoginState> {
  const mode = form.get('mode') === 'admin' ? 'admin' : 'promoter'
  const secretRaw = String(form.get('secret') ?? '')

  let where
  if (mode === 'promoter') {
    const parsed = promoterSchema.safeParse({ phone: String(form.get('phone') ?? ''), secret: secretRaw })
    const phone = normalizePhone(String(form.get('phone') ?? ''))
    if (!parsed.success || !phone) return { mode, error: 'Enter your 10-digit mobile number and your PIN (4 to 8 digits).' }
    where = and(eq(users.phone, phone), eq(users.role, 'promoter'))
  } else {
    const parsed = adminSchema.safeParse({ email: String(form.get('email') ?? '').trim().toLowerCase(), secret: secretRaw })
    if (!parsed.success) return { mode, error: 'Enter your work email and password.' }
    where = and(eq(users.email, parsed.data.email), eq(users.role, 'admin'))
  }

  const [user] = await db.select().from(users).where(where).limit(1)
  if (!user || !user.active) {
    await bcrypt.compare(secretRaw, DUMMY_HASH)
    return { mode, error: GENERIC }
  }
  if (user.lockedUntil && user.lockedUntil > new Date())
    return { mode, error: `Too many attempts. Try again in a few minutes, or ask your administrator to reset your access.` }

  const ok = await bcrypt.compare(secretRaw, user.secretHash)
  if (!ok) {
    const attempts = user.failedAttempts + 1
    await db.update(users).set({
      failedAttempts: attempts >= MAX_ATTEMPTS ? 0 : attempts,
      lockedUntil: attempts >= MAX_ATTEMPTS ? sql`now() + interval '${sql.raw(String(LOCK_MINUTES))} minutes'` : user.lockedUntil,
    }).where(eq(users.id, user.id))
    if (attempts >= MAX_ATTEMPTS)
      await db.insert(auditLog).values({ actorId: user.id, action: 'login.locked', entity: 'user', entityId: user.id })
    return { mode, error: GENERIC }
  }

  await db.update(users).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id))
  await createSession(user.id, user.role)
  redirect(user.role === 'admin' ? '/admin' : '/capture')
}

export async function logoutAction() {
  await destroySession()
  redirect('/login')
}
