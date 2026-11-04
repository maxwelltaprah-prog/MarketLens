import { Suspense } from 'react'
import { FieldMap, type MapUser } from '@/components/field-map'
import { PageHeader } from '@/components/ui'
import { Skeleton } from '@/components/ui'
import { Icon } from '@/components/icons'
import { getFieldStatus, getTrail } from '@/lib/location'
import { getSettings } from '@/lib/settings'

export const metadata = { title: 'Field map' }
export const dynamic = 'force-dynamic'

export default async function FieldPage() {
  return (
    <div className="rise">
      <PageHeader eyebrow="Live tracking" title="Field map" sub="Where every promoter was last seen, their trail for today, and whether captures happened at the outlet." />
      <Suspense fallback={<div className="grid lg:grid-cols-[22rem_1fr] gap-4"><Skeleton className="h-[75vh] rounded-2xl" /><Skeleton className="h-[75vh] rounded-2xl" /></div>}><Body /></Suspense>
    </div>
  )
}

async function Body() {
  const [status, settings] = await Promise.all([getFieldStatus(24), getSettings()])
  const promoters = status.users.filter((u) => u.last)
  const trails = Object.fromEntries(await Promise.all(promoters.slice(0, 60).map(async (u) => [u.id, (await getTrail(u.id, 24, 600)).map((p) => ({ lat: p.lat, lng: p.lng, kind: p.kind, at: p.at.toISOString(), accuracyM: p.accuracyM, online: p.online }))])))
  const users: MapUser[] = status.users.map((u) => ({ ...u, last: u.last ? { ...u.last, at: u.last.at.toISOString() } : null }))
  const live = users.filter((u) => u.last && Date.now() - new Date(u.last.at).getTime() < 10 * 60_000).length
  const away = users.filter((u) => u.last?.distanceM != null && u.last.distanceM > settings.geofenceMeters).length
  const unpinned = status.outlets.filter((o) => o.lat == null).length
  return (
    <div className="space-y-4">
      {!settings.locationTracking && <p className="text-sm text-amber-ink bg-amber-soft rounded-xl px-4 py-3 inline-flex items-center gap-2"><Icon name="alert" size={16} /> Location tracking is turned off in Settings. Promoters are not being asked for their position.</p>}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[['Live now', live, 'active in the last 10 minutes'], ['Seen today', users.filter((u) => u.last).length, `of ${users.filter((u) => u.role === 'promoter').length} promoters`], ['Away from outlet', away, `beyond ${settings.geofenceMeters} m`], ['Outlets without a pin', unpinned, 'cannot be geofenced yet']].map(([l, v, s]) => (
          <div key={String(l)} className="card p-4"><div className="text-xs text-muted">{l}</div><div className="text-2xl font-semibold tabular-nums mt-1">{v}</div><div className="text-xs text-muted">{s}</div></div>
        ))}
      </div>
      <FieldMap users={users} outlets={status.outlets} trails={trails} geofenceM={settings.geofenceMeters} />
    </div>
  )
}
