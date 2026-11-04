import { desc, eq } from 'drizzle-orm'
import { db, auditLog, users } from '@/db'
import { SettingsForm } from '@/components/settings-form'
import { getSettings } from '@/lib/settings'
import { fmtTime } from '@/lib/format'
export const metadata = { title: 'Settings' }

export default async function Page() {
  const [settings, log] = await Promise.all([
    getSettings(),
    db.select({ id: auditLog.id, action: auditLog.action, at: auditLog.createdAt, who: users.name }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId)).orderBy(desc(auditLog.createdAt)).limit(12),
  ])
  return (
    <div className="rise">
      <SettingsForm initial={settings} />
      <section className="card max-w-3xl mt-6 overflow-hidden">
        <div className="px-6 py-5"><h2 className="font-semibold text-lg">Audit history</h2><p className="text-sm text-muted">Latest administrative and submission activity.</p></div>
        <ul className="divide-y divide-line border-t border-line text-sm">
          {log.length === 0 && <li className="px-6 py-6 text-muted">No activity recorded yet.</li>}
          {log.map((l) => (
            <li key={l.id} className="px-6 py-3 flex items-center justify-between gap-4"><span><b className="font-semibold">{l.who ?? 'System'}</b> <span className="text-muted">· {l.action}</span></span><span className="text-xs text-muted tabular-nums">{l.at.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} {fmtTime(l.at)}</span></li>
          ))}
        </ul>
      </section>
    </div>
  )
}
