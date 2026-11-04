import { requireUser } from '@/lib/session'
import { logoutAction } from '@/actions/auth'
import { Logo, Icon } from '@/components/icons'
import { SyncPill } from '@/components/sync-pill'
import { Avatar } from '@/components/ui'

export default async function CaptureLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('promoter')
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-line safe-t">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo dark size={38} />
          <div className="flex items-center gap-4">
            <SyncPill />
            <details className="relative group">
              <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden" aria-label="Account menu">
                <Avatar text={user.name} tone="dark" />
              </summary>
              <div className="pop absolute right-0 mt-2 w-60 card p-2 shadow-pop">
                <div className="px-3 py-2"><div className="font-semibold text-sm truncate">{user.name}</div><div className="text-xs text-muted truncate">{user.outletName ?? 'No outlet assigned'}</div></div>
                <form action={logoutAction}><button className="btn btn-ghost w-full !justify-start"><Icon name="logout" size={16} /> Sign out</button></form>
              </div>
            </details>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">{children}</main>
    </div>
  )
}
