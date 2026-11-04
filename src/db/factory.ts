import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export type Db = NeonHttpDatabase<typeof schema>

/** Neon in production (HTTP driver, ideal for serverless). Plain Postgres when the URL points at localhost (local dev / CI). */
export const isLocalUrl = (url: string) => /@(localhost|127\.0\.0\.1|\[::1\])(:|\/)/.test(url)

export async function createDb(url: string): Promise<Db> {
  if (isLocalUrl(url)) {
    const { drizzle } = await import('drizzle-orm/node-postgres')
    return drizzle(url, { schema }) as unknown as Db
  }
  const { neon } = await import('@neondatabase/serverless')
  const { drizzle } = await import('drizzle-orm/neon-http')
  return drizzle({ client: neon(url), schema })
}
