'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Icon, Logo, type IconName } from './icons'
import { Avatar, cx } from './ui'
import { logoutAction } from '@/actions/auth'

const NAV: { href: string; label: string; icon: IconName; title: string }[] = [
  { href: '/admin', label: 'Dashboard', icon: 'grid', title: 'Dashboard' },
  { href: '/admin/entries', label: 'Entries', icon: 'bars', title: 'Entries' },
  { href: '/admin/outlets', label: 'Outlets', icon: 'building', title: 'Outlets' },
  { href: '/admin/promoters', label: 'Promoters', icon: 'user', title: 'Promoters' },
  { href: '/admin/skus', label: 'SKUs & Brands', icon: 'leaf', title: 'SKUs & Brands' },
  { href: '/admin/settings', label: 'Settings', icon: 'cog', title: 'Settings' },
]
const isActive = (p: string, h: string) => (h === '/admin' ? p === '/admin' : p.startsWith(h))

function Links({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname()
  return (
    <nav className="space-y-1.5" aria-label="Main">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={isActive(path, n.href) ? 'page' : undefined}
          className={cx('flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all',
            isActive(path, n.href) ? 'bg-lime text-forest shadow-[0_8px_20px_-12px_rgb(207_226_124/.8)]' : 'text-white/70 hover:text-white hover:bg-white/8')}>
          <Icon name={n.icon} />{n.label}
        </Link>
      ))}
    </nav>
  )
}

function Account({ name }: { name: string }) {
  return (
    <div className="border-t border-white/10 pt-4 flex items-center gap-3">
      <div className="grid place-items-center size-9 rounded-full bg-[#f3e3b3] text-forest text-xs font-bold">{name.slice(0, 2).toUpperCase()}</div>
      <div className="min-w-0 flex-1 leading-tight"><div className="text-sm font-semibold text-white truncate">{name}</div><div className="text-[0.7rem] text-white/55">Administrator</div></div>
      <form action={logoutAction}><button className="text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10" aria-label="Sign out"><Icon name="logout" /></button></form>
    </div>
  )
}

export function AdminShell({ name, children }: { name: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const path = usePathname()
  useEffect(() => setOpen(false), [path])
  const title = NAV.find((n) => isActive(path, n.href))?.title ?? 'Admin'
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' })

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]">
      <aside className="hidden lg:flex sticky top-0 h-dvh flex-col bg-forest px-4 py-6">
        <div className="px-2 mb-8"><Logo /></div>
        <Links />
        <div className="mt-auto"><Account name={name} /></div>
      </aside>

      {/* Mobile drawer */}
      {open && <div className="lg:hidden fixed inset-0 z-40 bg-forest-deep/60 backdrop-blur-sm" onClick={() => setOpen(false)} />}
      <aside className={cx('lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-forest px-4 py-6 flex flex-col transition-transform duration-300', open ? 'translate-x-0' : '-translate-x-full')} aria-hidden={!open}>
        <div className="flex items-center justify-between px-2 mb-8"><Logo /><button className="text-white/70 p-2" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="x" /></button></div>
        <Links onNavigate={() => setOpen(false)} />
        <div className="mt-auto"><Account name={name} /></div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-line">
          <div className="px-4 sm:px-8 h-[4.25rem] flex items-center gap-3">
            <button className="lg:hidden icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
            <div className="min-w-0 flex-1 leading-tight"><div className="font-semibold truncate">{title}</div><div className="text-xs text-muted truncate hidden sm:block">{date}</div></div>
            <span className="hidden sm:inline-flex items-center gap-2 text-xs font-semibold text-brand"><span className="size-2 rounded-full bg-emerald-500" />Live data</span>
            <Avatar text={name} tone="dark" />
          </div>
        </header>
        <main className="px-4 sm:px-8 py-8 max-w-[96rem]">{children}</main>
      </div>
    </div>
  )
}
