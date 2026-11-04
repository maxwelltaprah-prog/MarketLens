import { desc, eq, like, notLike, sql } from 'drizzle-orm'
import { db, auditLog, users } from '@/db'
import { SettingsForm } from '@/components/settings-form'
import { AdminsManager } from '@/components/admins-manager'
import { requireUser } from '@/lib/session'
import { asc } from 'drizzle-orm'
import { Icon } from '@/components/icons'
import { cx } from '@/components/ui'
import { getSettings } from '@/lib/settings'
import { fmtTime } from '@/lib/format'
export const metadata = { title: 'Settings' }

const LABEL: Record<string, string> = {
  'security.login.failed': 'Failed sign-in', 'security.login.locked': 'Account locked (5 failures)', 'security.login.ratelimited': 'Sign-in rate limit hit',
  'security.login.success': 'Signed in', 'security.csrf.rejected': 'Cross-site request blocked', 'security.authz.denied': 'Unauthorised access blocked',
  'security.sync.rejected': 'Offline sync rejected', 'security.session.revoked': 'Sessions revoked',
}
const severe = (a: string) => /locked|ratelimited|csrf|authz/.test(a)

export default async function Page() {
  const me = await requireUser('admin')
  const since = new Date(Date.now() - 7 * 86_400_000)
  const [settings, log, sec, counts, admins] = await Promise.all([
    getSettings(),
    db.select({ id: auditLog.id, action: auditLog.action, at: auditLog.createdAt, who: users.name }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId))
      .where(notLike(auditLog.action, 'security.%')).orderBy(desc(auditLog.createdAt)).limit(12),
    db.select({ id: auditLog.id, action: auditLog.action, at: auditLog.createdAt, who: users.name, ip: auditLog.entityId, meta: auditLog.meta }).from(auditLog).leftJoin(users, eq(users.id, auditLog.actorId))
      .where(like(auditLog.action, 'security.%')).orderBy(desc(auditLog.createdAt)).limit(25),
    db.select({ action: auditLog.action, n: sql<number>`count(*)::int` }).from(auditLog)
      .where(sql`${auditLog.action} like 'security.%' and ${auditLog.createdAt} > ${since}`).groupBy(auditLog.action),
    db.select({ id: users.id, name: users.name, email: users.email, active: users.active, lastLoginAt: users.lastLoginAt }).from(users).where(eq(users.role, 'admin')).orderBy(asc(users.name)),
  ])
  const c = (a: string) => counts.find((x) => x.action === a)?.n ?? 0
  const tiles = [
    ['Failed sign-ins', c('security.login.failed'), 'alert'], ['Lockouts', c('security.login.locked'), 'lock'],
    ['Rate limits', c('security.login.ratelimited'), 'shield'], ['Blocked requests', c('security.csrf.rejected') + c('security.authz.denied'), 'x'],
  ] as const

  return (
    <div className="rise space-y-6">
      <SettingsForm initial={settings} />
      <AdminsManager admins={admins} meId={me.id} />

      <section className="card max-w-3xl overflow-hidden">
        <div className="px-6 py-5 flex items-start justify-between gap-4">
          <div><h2 className="font-semibold text-lg flex items-center gap-2"><Icon name="shield" size={18} className="text-brand-ink" /> Security monitor</h2><p className="text-sm text-muted">Suspicious activity in the last 7 days. Every sign-in, lockout and blocked request is recorded.</p></div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-line border-y border-line">
          {tiles.map(([l, n, ic]) => (
            <div key={l} className="bg-white p-4"><div className="flex items-center gap-1.5 text-xs text-muted"><Icon name={ic} size={13} />{l}</div><div className={cx('text-2xl font-semibold tabular-nums mt-1', n > 0 && l !== 'Failed sign-ins' ? 'text-danger' : '')}>{n}</div></div>
          ))}
        </div>
        <ul className="divide-y divide-line text-sm max-h-96 overflow-y-auto">
          {sec.length === 0 && <li className="px-6 py-6 text-muted">No security events yet.</li>}
          {sec.map((l) => {
            const m = (l.meta ?? {}) as Record<string, unknown>
            return (
              <li key={l.id} className="px-6 py-3 flex items-center gap-3">
                <span className={cx('size-2 rounded-full shrink-0', severe(l.action) ? 'bg-danger' : l.action.endsWith('success') ? 'bg-success' : 'bg-amber')} />
                <span className="min-w-0 flex-1"><span className="font-semibold">{LABEL[l.action] ?? l.action}</span>
                  <span className="block text-xs text-muted truncate">{l.who ?? 'Unknown account'} · {l.ip ?? '-'}{m.mode ? ` · ${String(m.mode)}` : ''}{m.attempts ? ` · attempt ${String(m.attempts)}` : ''}</span></span>
                <span className="text-xs text-muted tabular-nums whitespace-nowrap">{l.at.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} {fmtTime(l.at)}</span>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card max-w-3xl overflow-hidden">
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
