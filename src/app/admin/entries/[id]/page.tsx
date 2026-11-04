import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, entries, outlets, users } from '@/db'
import { Icon } from '@/components/icons'
import { StatusPill } from '@/components/ui'
import { AdminEntryEditor } from '@/components/admin-entry-editor'
import { getCatalog, totalPricePoints } from '@/lib/catalog'
import { getEntryWithPrices, countFilled } from '@/lib/entries'
import { currencySymbol, fmtDate, fmtTime } from '@/lib/format'
import { getSettings } from '@/lib/settings'

export const metadata = { title: 'Entry' }

export default async function EntryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [data, catalog, settings] = await Promise.all([getEntryWithPrices(eq(entries.id, id)), getCatalog(), getSettings()])
  if (!data) notFound()
  const [meta] = await db.select({ outlet: outlets.name, region: outlets.region, promoter: users.name }).from(entries)
    .innerJoin(outlets, eq(outlets.id, entries.outletId)).innerJoin(users, eq(users.id, entries.promoterId)).where(eq(entries.id, id))
  const total = totalPricePoints(catalog), filled = countFilled(data.prices)
  const e = data.entry
  return (
    <div className="rise">
      <Link href="/admin/entries" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand mb-4 hover:underline"><Icon name="chevronR" size={14} className="rotate-180" /> All entries</Link>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="eyebrow">Price entry</div>
          <h1 className="text-3xl md:text-4xl font-medium mt-1">{meta.outlet}</h1>
          <p className="text-muted text-sm mt-2">{meta.region} · {fmtDate(e.entryDate, { day: 'numeric', month: 'long', year: 'numeric' })} · by {meta.promoter}{e.submittedAt ? ` at ${fmtTime(e.submittedAt)}` : ''}</p>
        </div>
        <div className="flex items-center gap-3"><StatusPill status={e.status} />{e.lockedAt && <span className="pill pill-off">Locked</span>}</div>
      </div>
      <div className="grid grid-cols-3 gap-3 mb-6 max-w-lg">
        {[['Filled', `${filled} / ${total}`], ['Completion', `${total ? Math.round((filled / total) * 100) : 0}%`], ['N/A', String(Object.values(data.prices).filter((c) => c.na).length)]].map(([l, v]) => (
          <div key={l} className="card p-4"><div className="text-xs text-muted">{l}</div><div className="text-2xl font-semibold tabular-nums mt-1">{v}</div></div>
        ))}
      </div>
      <AdminEntryEditor entryId={id} catalog={catalog} initial={data.prices} symbol={currencySymbol(settings.currency)} locked={!!e.lockedAt} status={e.status} />
    </div>
  )
}
