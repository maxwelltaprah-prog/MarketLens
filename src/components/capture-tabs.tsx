'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, type IconName } from './icons'
import { cx } from './ui'

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/capture', label: 'Prices', icon: 'bars', match: (p) => p === '/capture' || p.startsWith('/capture/submissions/') },
  { href: '/capture/sales', label: 'Sales', icon: 'trend', match: (p) => p.startsWith('/capture/sales') },
  { href: '/capture/submissions', label: 'History', icon: 'history', match: (p) => p === '/capture/submissions' },
]
/** Promoter section switcher: segmented control on wide screens, bottom tab bar on phones. */
export function CaptureTabs() {
  const path = usePathname()
  return (
    <nav aria-label="Sections" className="no-print fixed sm:static inset-x-0 bottom-0 z-[35] sm:z-auto bg-white/95 sm:bg-transparent backdrop-blur border-t sm:border-0 border-line safe-b sm:mb-6">
      <div className="mx-auto max-w-4xl grid grid-cols-3 sm:inline-grid sm:rounded-2xl sm:bg-surface-2 sm:p-1 sm:border sm:border-line">
        {TABS.map((t) => { const on = t.match(path); return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}
            className={cx('flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 py-2 sm:py-2 sm:px-5 text-[0.7rem] sm:text-sm font-semibold rounded-xl transition-colors',
              on ? 'text-brand-ink sm:bg-white sm:shadow-card' : 'text-muted hover:text-ink')}>
            <Icon name={t.icon} size={18} className={cx(on && 'text-brand')} />{t.label}
          </Link>) })}
      </div>
    </nav>
  )
}
