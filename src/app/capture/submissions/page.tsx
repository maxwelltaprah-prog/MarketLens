import Link from 'next/link'
import { eq, desc, sql } from 'drizzle-orm'
import { db, entries, entryPrices } from '@/db'
import { requireUser } from '@/lib/session'
import { Icon } from '@/components/icons'
import { Empty, StatusPill } from '@/components/ui'
import { addDaysISO, fmtDate, todayISO } from '@/lib/format'
import { getCatalog, totalPricePoints } from '@/lib/catalog'

export const metadata = { title: 'My submissions' }

export default async function SubmissionsPage() {
  const user = await requireUser('promoter')
  const [catalog, rows] = await Promise.all([
    getCatalog(),
    user.outletId
      ? db.select({
          id: entries.id, date: entries.entryDate, status: entries.status,
          filled: sql<number>`count(${entryPrices.id}) filter (where ${entryPrices.price} is not null or ${entryPrices.notAvailable})::int`,
        }).from(entries).leftJoin(entryPrices, eq(entryPrices.entryId, entries.id))
          .where(eq(entries.outletId, user.outletId)).groupBy(entries.id).orderBy(desc(entries.entryDate)).limit(45)
      : Promise.resolve([]),
  ])
  const total = totalPricePoints(catalog)
  const today = todayISO()

  return (
    <div className="rise">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="eyebrow">Price capture</div>
          <h1 className="text-4xl font-medium mt-1">My submissions</h1>
          <p className="text-muted text-sm mt-2">Your recent price capture activity.</p>
        </div>
        <Link href="/capture" className="btn btn-outline"><Icon name="plus" size={16} /> New capture</Link>
      </div>
      <div className="card divide-y divide-line">
        {rows.length === 0 && <Empty icon="calendar" title="No captures yet" hint="Start today’s capture to see it here." />}
        {rows.map((r) => {
          const d = new Date(`${r.date}T00:00:00Z`)
          const label = r.date === today ? 'Today' : r.date === addDaysISO(today, -1) ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
          return (
            <Link key={r.id} href={`/capture/submissions/${r.id}`} className="flex items-center gap-4 p-4 hover:bg-[#fafbf8] transition-colors first:rounded-t-2xl last:rounded-b-2xl">
              <div className="grid place-items-center size-12 rounded-xl bg-mint text-brand leading-none text-center shrink-0">
                <div><div className="text-lg font-bold">{d.toLocaleDateString('en-GB', { day: '2-digit', timeZone: 'UTC' })}</div>
                <div className="text-[0.6rem] font-semibold tracking-wider">{d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()}</div></div>
              </div>
              <div className="flex-1 min-w-0"><div className="font-semibold">{label}</div><div className="text-sm text-muted">{r.filled} / {total} prices captured</div></div>
              <StatusPill status={r.status} />
              <span className="icon-btn" aria-hidden><Icon name={r.status === 'draft' ? 'edit' : 'eye'} size={16} /></span>
            </Link>
          )
        })}
      </div>
      <p className="text-xs text-muted mt-4">Showing the last 45 captures for {user.outletName}. {fmtDate(today)}</p>
    </div>
  )
}
