import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden="true" />
}

export function StatusPill({ status }: { status: 'draft' | 'submitted' | 'active' | 'inactive' | 'missing' }) {
  const map = {
    submitted: ['pill-ok', 'Submitted'], active: ['pill-ok', 'Active'],
    draft: ['pill-draft', 'Draft'], missing: ['pill-draft', 'Not started'], inactive: ['pill-off', 'Inactive'],
  } as const
  const [c, l] = map[status]
  return <span className={cx('pill', c)}>{l}</span>
}

export function PageHeader({ eyebrow, title, sub, action }: { eyebrow: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="text-3xl md:text-4xl font-medium mt-1">{title}</h1>
        {sub && <p className="text-muted text-sm mt-2">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

export function Empty({ icon = 'search', title, hint }: { icon?: IconName; title: string; hint?: string }) {
  return (
    <div className="py-14 text-center">
      <div className="mx-auto mb-3 grid place-items-center size-12 rounded-2xl bg-mint text-brand"><Icon name={icon} size={22} /></div>
      <div className="font-medium">{title}</div>
      {hint && <div className="text-sm text-muted mt-1">{hint}</div>}
    </div>
  )
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold mb-1.5">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted mt-1">{hint}</span>}
      {error && <span role="alert" className="block text-xs text-danger mt-1">{error}</span>}
    </label>
  )
}

export function Avatar({ text, tone = 'mint' }: { text: string; tone?: 'mint' | 'dark' | 'sand' }) {
  const t = { mint: 'bg-mint text-brand', dark: 'bg-brand text-white', sand: 'bg-[#f3e3b3] text-forest' }[tone]
  return <div className={cx('grid place-items-center rounded-full size-9 text-xs font-bold shrink-0', t)}>{text.slice(0, 2).toUpperCase()}</div>
}
