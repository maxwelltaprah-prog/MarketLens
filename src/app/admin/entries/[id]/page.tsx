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
import { getEntryPings } from '@/lib/location'
import { EntryLocation } from '@/components/entry-location'
import { GeoBadge } from '@/components/entry-table'

export const metadata = { title: 'Entry' }

export default async function EntryDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const [data, catalog, settings] = await Promise.all([getEntryWithPrices(eq(entries.id, id)), getCatalog(), getSettings()])
  if (!data) notFound()
  const pings = await getEntryPings(id)
  const [meta] = await db.select({ outlet: outlets.name, region: outlets.region, promoter: users.name, lat: outlets.lat, lng: outlets.lng }).from(entries)
    .innerJoin(outlets, eq(outlets.id, entries.outletId)).innerJoin(users, eq(users.id, entries.promoterId)).where(eq(entries.id, id))
  const total = totalPricePoints(catalog), filled = countFilled(data.prices)
  const e = data.entry
  return (
    <div className="rise">
      <Link href="/admin/entries" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink mb-4 hover:underline"><Icon name="chevronR" size={14} className="rotate-180" /> All entries</Link>
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
      <section className="card p-5 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div><h2 className="font-semibold">Location evidence</h2><p className="text-xs text-muted">{pings.length} position{pings.length === 1 ? '' : 's'} recorded during this capture{e.geoDistanceM != null ? ` · submitted ${e.geoDistanceM >= 1000 ? `${(e.geoDistanceM / 1000).toFixed(1)} km` : `${e.geoDistanceM} m`} from the outlet pin` : ''}</p></div>
          <div className="flex items-center gap-3"><GeoBadge geo={e.geoStatus} distance={e.geoDistanceM} />{e.geoLat != null && <a className="text-xs font-semibold text-brand-ink hover:underline" href={`https://www.google.com/maps?q=${e.geoLat},${e.geoLng}`} target="_blank" rel="noreferrer noopener">Open in Google Maps</a>}</div>
        </div>
        {pings.length || e.geoLat != null
          ? <EntryLocation outlet={meta.lat != null && meta.lng != null ? { lat: meta.lat, lng: meta.lng, name: meta.outlet } : null} geofenceM={settings.geofenceMeters}
              pings={pings.map((p) => ({ lat: p.lat, lng: p.lng, kind: p.kind, at: p.at.toISOString(), accuracyM: p.accuracyM }))} submitAt={e.geoLat != null && e.geoLng != null ? { lat: e.geoLat, lng: e.geoLng } : null} />
          : <p className="text-sm text-muted py-6 text-center">No location was shared for this entry.</p>}
      </section>
      <AdminEntryEditor entryId={id} catalog={catalog} initial={data.prices} symbol={currencySymbol(settings.currency)} locked={!!e.lockedAt} status={e.status} />
    </div>
  )
}
