import { env } from '@/lib/env'
import { createDb } from './factory'

export const db = await createDb(env.DATABASE_URL)
export * from './schema'
