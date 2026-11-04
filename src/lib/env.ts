import { z } from 'zod'

/* Validates runtime configuration once, at startup. Fails fast with a clear message rather than
 * limping along with a weak secret or a missing database. Never logs secret values. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().refine((u) => /^postgres(ql)?:\/\//.test(u), 'DATABASE_URL must be a postgres:// URL'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters (try: openssl rand -base64 48)'),
})

function load() {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment: ${msg}`)
  }
  const env = parsed.data
  if (env.NODE_ENV === 'production') {
    // A localhost database is fine for a local production build/test, never on a deployed host.
    if (process.env.VERCEL && /localhost|127\.0\.0\.1/.test(env.DATABASE_URL)) throw new Error('DATABASE_URL points at localhost in production')
    if (!/sslmode=require/.test(env.DATABASE_URL) && !/neon\.tech/.test(env.DATABASE_URL)) console.warn('[env] DATABASE_URL has no sslmode=require')
    if (/^(secret|changeme|password)/i.test(env.SESSION_SECRET) || new Set(env.SESSION_SECRET).size < 12) throw new Error('SESSION_SECRET is too weak')
    for (const k of ['SEED_ADMIN_PASSWORD', 'SEED_DEMO']) if (process.env[k]) console.warn(`[env] ${k} is set in production; seed variables are only needed when running npm run db:seed locally`)
  }
  return env
}

export const env = load()
export const isProd = env.NODE_ENV === 'production'
