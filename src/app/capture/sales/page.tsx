import { requireUser } from '@/lib/session'
import { getCompanyCatalog, getSalesForDay, recentSalesDays } from '@/lib/sales-core'
import { getSettings } from '@/lib/settings'
import { currencySymbol, fmtDate, todayISO, addDaysISO } from '@/lib/format'
import { SalesEntry } from '@/components/sales-entry'
import { Icon } from '@/components/icons'

export const metadata = { title: 'Daily sales' }

export default async function SalesPage() {
  const user = await requireUser('promoter')
  const today = todayISO()
  if (!user.outletId) return <div className="card p-8 text-center"><h1 className="text-2xl font-medium">No outlet assigned</h1><p className="text-muted mt-2">Ask your administrator to assign you to an outlet.</p></div>
  const [catalog, initial, settings, recent] = await Promise.all([getCompanyCatalog(), getSalesForDay(user.outletId, today), getSettings(), recentSalesDays(user.outletId, 14)])
  const sym = currencySymbol(settings.currency)
  return (
    <div className="rise">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div><div className="eyebrow">Daily sales</div><h1 className="text-4xl font-medium mt-1">{fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}</h1><p className="text-muted mt-2 text-sm">Record the units of our brands sold today at {user.outletName}.</p></div>
      </div>
      <SalesEntry userId={user.id} date={today} catalog={catalog} initial={initial} symbol={sym} editable />
      {recent.filter((r) => r.date !== today).length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-medium mb-3">Previous days</h2>
          <ul className="card divide-y divide-line">
            {recent.filter((r) => r.date !== today).map((r) => (
              <li key={r.date} className="flex items-center gap-4 p-4">
                <span className="grid place-items-center size-10 rounded-xl bg-surface-2 text-muted"><Icon name="calendar" size={16} /></span>
                <div className="flex-1 min-w-0"><div className="font-semibold">{r.date === addDaysISO(today, -1) ? 'Yesterday' : fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</div><div className="text-xs text-muted">{r.lines} line{r.lines === 1 ? '' : 's'}{r.value ? ` · ${sym} ${Number(r.value).toLocaleString('en-GH', { minimumFractionDigits: 2 })}` : ''}</div></div>
                <div className="text-right"><div className="text-lg font-semibold tabular-nums">{r.units}</div><div className="text-[0.65rem] text-muted uppercase tracking-wider">units</div></div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
