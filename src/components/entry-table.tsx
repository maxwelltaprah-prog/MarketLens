import Link from 'next/link'
import { Icon } from './icons'
import { Avatar, Empty, StatusPill } from './ui'
import { fmtDate, fmtTime } from '@/lib/format'

export type EntryRowData = { id: string; date: string; outlet: string; promoter: string; at: Date | null; status: 'draft' | 'submitted'; filled: number; locked?: Date | null; geo?: string | null; geoDistance?: number | null }

export function GeoBadge({ geo, distance, compact }: { geo?: string | null; distance?: number | null; compact?: boolean }) {
  if (!geo) return null
  const m = distance == null ? '' : distance >= 1000 ? `${(distance / 1000).toFixed(1)} km` : `${distance} m`
  const map = { ok: ['text-success', 'At outlet'], away: ['text-danger', `${m} away`], unverified: ['text-muted', 'Outlet not pinned'], none: ['text-amber-ink', 'No location'] } as const
  const [c, l] = map[geo as keyof typeof map] ?? ['text-muted', geo]
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${c}`} title={l}><Icon name="pin" size={12} />{!compact && l}</span>
}

export function EntryTable({ rows, total }: { rows: EntryRowData[]; total: number }) {
  if (!rows.length) return <Empty icon="bars" title="No entries match these filters" hint="Try widening the date range or clearing filters." />
  return (
    <>
      <table className="hidden md:table w-full text-sm">
        <thead><tr className="bg-[#f3f4f0] text-left">{['Date', 'Outlet', 'Promoter', 'Submitted', 'Prices filled', 'Location', 'Status', ''].map((h) => <th key={h} className="th px-5 py-3 font-bold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-[#fafbf8] transition-colors">
              <td className="px-5 py-3.5 text-muted whitespace-nowrap">{fmtDate(r.date)}</td>
              <td className="px-5 py-3.5 font-semibold">{r.outlet}</td>
              <td className="px-5 py-3.5 text-muted">{r.promoter}</td>
              <td className="px-5 py-3.5 text-muted tabular-nums">{fmtTime(r.at)}</td>
              <td className="px-5 py-3.5 tabular-nums">{r.filled} / {total}</td>
              <td className="px-5 py-3.5"><GeoBadge geo={r.geo} distance={r.geoDistance} /></td>
              <td className="px-5 py-3.5"><span className="inline-flex items-center gap-2"><StatusPill status={r.status} />{r.locked && <Icon name="lock" size={14} className="text-muted" />}</span></td>
              <td className="px-5 py-2 text-right"><Link href={`/admin/entries/${r.id}`} className="icon-btn" aria-label={`View ${r.outlet} entry`}><Icon name="eye" size={16} /></Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="md:hidden divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/admin/entries/${r.id}`} className="flex items-center gap-3 p-4 active:bg-mint/50">
              <Avatar text={r.outlet} />
              <div className="min-w-0 flex-1"><div className="font-semibold truncate">{r.outlet}</div><div className="text-xs text-muted truncate flex items-center gap-1.5">{fmtDate(r.date)} · {r.promoter} · {r.filled}/{total} <GeoBadge geo={r.geo} distance={r.geoDistance} compact /></div></div>
              <StatusPill status={r.status} />
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
