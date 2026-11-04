import { config } from 'dotenv'
config({ path: ['.env.local', '.env'], quiet: true })
import { isLocalUrl } from '../src/db/factory'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  if (isLocalUrl(url)) {
    const { drizzle } = await import('drizzle-orm/node-postgres')
    const { migrate } = await import('drizzle-orm/node-postgres/migrator')
    await migrate(drizzle(url), { migrationsFolder: './drizzle' })
  } else {
    const { neon } = await import('@neondatabase/serverless')
    const { drizzle } = await import('drizzle-orm/neon-http')
    const { migrate } = await import('drizzle-orm/neon-http/migrator')
    await migrate(drizzle({ client: neon(url) }), { migrationsFolder: './drizzle' })
  }
  console.log('Migrations applied.')
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
