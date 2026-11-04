import 'server-only'
import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { entries } from '@/db'
import { Icon } from '@/components/icons'
import { StatusPill } from '@/components/ui'
import { CaptureGrid, type CellMap } from '@/components/capture-grid'
import { getAverages, getCatalog } from '@/lib/catalog'
import { canEdit, getEntryWithPrices } from '@/lib/entries'
import { currencySymbol, fmtDate, fmtTime, greeting } from '@/lib/format'
import { getSettings } from '@/lib/settings'
import type { CurrentUser } from '@/lib/session'

/** Shared by /capture (today) and /capture/submissions/[id] (any past date). */
export async function CaptureView({ user, date, mode }: { user: CurrentUser; date: string; mode: 'today' | 'past' }) {
  if (!user.outletId)
    return <div className="card p-8 text-center"><h1 className="text-2xl font-medium">No outlet assigned</h1><p className="text-muted mt-2">Ask your administrator to assign you to an outlet so you can start capturing prices.</p></div>

  const [catalog, settings, averages, existing] = await Promise.all([
    getCatalog(), getSettings(), getAverages(),
    getEntryWithPrices(and(eq(entries.outletId, user.outletId), eq(entries.entryDate, date))),
  ])
  const status = existing ? existing.entry.status : 'new'
  const editable = canEdit(existing?.entry ?? null, settings)
  const lockedNote = existing?.entry.lockedAt
    ? 'An administrator has locked this entry.'
    : existing?.entry.status === 'submitted' ? `The ${settings.editWindowHours}-hour edit window has closed, so this entry is read-only.` : undefined
  const initial: CellMap = existing?.prices ?? {}
  const first = user.name.split('@')[0]

  return (
    <div className="rise">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow">Price capture</div>
          <h1 className="text-4xl font-medium mt-1">{mode === 'today' ? `${greeting()}, ${first}` : fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' })}</h1>
          <p className="text-muted mt-2 text-sm">{mode === 'today' ? 'Record today’s shelf prices at your assigned outlet.' : 'Review or update this capture.'}</p>
        </div>
        <Link href={mode === 'today' ? '/capture/submissions' : '/capture'} className="btn btn-outline">
          <Icon name="calendar" size={16} /> {mode === 'today' ? 'My submissions' : 'New capture'}
        </Link>
      </div>

      <div className="card mt-6 mb-4 p-5 grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-4 items-center">
        <div><div className="th flex items-center gap-1.5"><Icon name="building" size={14} /> Assigned outlet</div><div className="font-semibold mt-1">{user.outletName}</div></div>
        <div><div className="th flex items-center gap-1.5"><Icon name="calendar" size={14} /> Entry date</div><div className="font-semibold mt-1">{fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
        <div className="col-span-2 sm:col-span-1 sm:justify-self-end">
          {status === 'new' ? <span className="pill pill-draft">Not started</span> : <StatusPill status={status} />}
          {existing?.entry.submittedAt && <span className="text-xs text-muted ml-2">{fmtTime(existing.entry.submittedAt)}</span>}
        </div>
      </div>

      <CaptureGrid userId={user.id} date={date} catalog={catalog} initial={initial} averages={averages}
        symbol={currencySymbol(settings.currency)} variancePct={settings.varianceWarningPct}
        status={status} editable={editable} lockedNote={lockedNote} />
    </div>
  )
}
