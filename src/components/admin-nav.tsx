'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Icon, Logo, type IconName } from './icons'
import { Avatar, cx } from './ui'
import { CommandPalette, type Command } from './command-palette'
import { OfflineBar } from './offline-bar'
import { Toaster } from './toast'
import { logoutAction } from '@/actions/auth'

const NAV: { href: string; label: string; icon: IconName; title: string; hint: string }[] = [
  { href: '/admin', label: 'Dashboard', icon: 'grid', title: 'Dashboard', hint: 'Coverage, KPIs and trends' },
  { href: '/admin/reports', label: 'Reports', icon: 'table', title: 'Price report', hint: 'Brand × outlet price matrix' },
  { href: '/admin/entries', label: 'Entries', icon: 'bars', title: 'Entries', hint: 'Every capture, by outlet and day' },
  { href: '/admin/outlets', label: 'Outlets', icon: 'building', title: 'Outlets', hint: 'Manage outlets and regions' },
  { href: '/admin/promoters', label: 'Promoters', icon: 'user', title: 'Promoters', hint: 'Accounts, PINs and assignments' },
  { href: '/admin/skus', label: 'SKUs & Brands', icon: 'leaf', title: 'SKUs & Brands', hint: 'Pack sizes and the brands under each' },
  { href: '/admin/settings', label: 'Settings', icon: 'cog', title: 'Settings', hint: 'Currency, edit window, security log' },
]
const isActive = (p: string, h: string) => (h === '/admin' ? p === '/admin' : p.startsWith(h))

function Links({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname()
  return (
    <nav className="space-y-1" aria-label="Main">
      {NAV.map((n) => {
        const on = isActive(path, n.href)
        return (
          <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={on ? 'page' : undefined}
            className={cx('group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all',
              on ? 'bg-white/[0.07] text-white' : 'text-white/60 hover:text-white hover:bg-white/[0.05]')}>
            <span className={cx('absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-brand transition-opacity', on ? 'opacity-100' : 'opacity-0')} />
            <Icon name={n.icon} className={cx('transition-colors', on ? 'text-brand' : 'text-white/50 group-hover:text-brand-soft')} />{n.label}
          </Link>
        )
      })}
    </nav>
  )
}

function Account({ name }: { name: string }) {
  return (
    <div className="border-t border-white/10 pt-4 flex items-center gap-3">
      <div className="grid place-items-center size-9 rounded-full bg-brand text-white text-xs font-bold">{name.slice(0, 2).toUpperCase()}</div>
      <div className="min-w-0 flex-1 leading-tight"><div className="text-sm font-semibold text-white truncate">{name}</div><div className="text-[0.7rem] text-white/50">Administrator</div></div>
      <form action={logoutAction}><button className="text-white/60 hover:text-white p-2 rounded-lg hover:bg-white/10" aria-label="Sign out"><Icon name="logout" /></button></form>
    </div>
  )
}

export type QuickLink = { label: string; hint: string; href: string; kind: 'outlet' | 'promoter' }

export function AdminShell({ name, quick, children }: { name: string; quick: QuickLink[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const path = usePathname()
  useEffect(() => setOpen(false), [path])
  const title = NAV.find((n) => isActive(path, n.href))?.title ?? 'Admin'
  const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Accra' })
  const commands = useMemo<Command[]>(() => [
    ...NAV.map((n) => ({ id: n.href, label: n.label, hint: n.hint, icon: n.icon, href: n.href, keywords: 'page go to' })),
    { id: 'export', label: 'Export this month (CSV)', hint: 'All price points, current month', icon: 'download', href: '/admin/export', keywords: 'csv download' },
    { id: 'today', label: 'Who hasn’t reported today?', hint: 'Draft and missing entries for today', icon: 'alert', href: '/admin/entries?status=draft', keywords: 'pending missing' },
    ...quick.map((q) => ({ id: q.href, label: q.label, hint: q.hint, icon: (q.kind === 'outlet' ? 'building' : 'user') as IconName, href: q.href, keywords: q.kind })),
  ], [quick])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="no-print hidden lg:flex sticky top-0 h-dvh flex-col bg-forest px-4 py-6">
        <div className="px-2 mb-8"><Logo dark size={40} /></div>
        <button onClick={() => window.dispatchEvent(new Event('ml-palette'))}
          className="mb-5 flex items-center gap-2 rounded-xl bg-white/[0.06] hover:bg-white/10 px-3 py-2.5 text-left text-sm text-white/55 transition-colors">
          <Icon name="search" size={15} /><span className="flex-1">Search…</span><span className="kbd !bg-white/10 !border-white/10 !text-white/50">⌘K</span>
        </button>
        <Links />
        <div className="mt-auto"><Account name={name} /></div>
      </aside>

      {/* Mobile drawer */}
      {open && <div className="lg:hidden fixed inset-0 z-40 bg-forest-deep/60 backdrop-blur-sm" onClick={() => setOpen(false)} />}
      <aside className={cx('lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-forest px-4 py-6 flex flex-col transition-transform duration-300', open ? 'translate-x-0' : '-translate-x-full')} aria-hidden={!open}>
        <div className="flex items-center justify-between px-2 mb-8"><Logo dark size={36} /><button className="text-white/70 p-2" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="x" /></button></div>
        <Links onNavigate={() => setOpen(false)} />
        <div className="mt-auto"><Account name={name} /></div>
      </aside>

      <div className="min-w-0">
        <OfflineBar />
        <header className="no-print sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-line">
          <div className="px-4 sm:px-8 h-[4.25rem] flex items-center gap-3">
            <button className="lg:hidden icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
            <div className="min-w-0 flex-1 leading-tight"><div className="font-semibold truncate">{title}</div><div className="text-xs text-muted truncate hidden sm:block">{date}</div></div>
            <button className="icon-btn lg:hidden" aria-label="Search" onClick={() => window.dispatchEvent(new Event('ml-palette'))}><Icon name="search" size={16} /></button>
            <span className="hidden sm:inline-flex items-center gap-2 text-xs font-semibold text-success"><span className="size-2 rounded-full bg-success animate-pulse" />Live</span>
            <Avatar text={name} tone="dark" />
          </div>
        </header>
        <main className="px-4 sm:px-8 py-8 max-w-[96rem]">{children}</main>
      </div>
      <CommandPalette commands={commands} />
      <Toaster />
    </div>
  )
}
