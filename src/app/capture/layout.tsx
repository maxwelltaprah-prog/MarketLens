import { requireUser } from '@/lib/session'
import { logoutAction } from '@/actions/auth'
import { Logo, Icon } from '@/components/icons'
import { SyncPill } from '@/components/sync-pill'
import { OfflineBar } from '@/components/offline-bar'
import { Toaster } from '@/components/toast'
import { SyncManager } from '@/components/sync-manager'
import { Avatar } from '@/components/ui'
import { LocationTracker } from '@/components/location-tracker'
import { getSettings } from '@/lib/settings'
import { todayISO } from '@/lib/format'

export default async function CaptureLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireUser('promoter'), getSettings()])
  return (
    <div className="min-h-dvh">
      <OfflineBar />
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-line safe-t">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Logo size={40} />
          <div className="flex items-center gap-3 sm:gap-4">
            <SyncPill />
            <details className="relative group">
              <summary className="list-none cursor-pointer [&::-webkit-details-marker]:hidden" aria-label="Account menu">
                <Avatar text={user.name} tone="dark" />
              </summary>
              <div className="pop absolute right-0 mt-2 w-60 card p-2 shadow-pop z-30">
                <div className="px-3 py-2"><div className="font-semibold text-sm truncate">{user.name}</div><div className="text-xs text-muted truncate">{user.outletName ?? 'No outlet assigned'}</div></div>
                <form action={logoutAction}><button className="btn btn-ghost w-full !justify-start"><Icon name="logout" size={16} /> Sign out</button></form>
              </div>
            </details>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-8">
        {settings.locationTracking && <LocationTracker userId={user.id} role="promoter" date={todayISO()} intervalSec={settings.trackingIntervalSec} required={settings.requireLocation} outletName={user.outletName} />}
        {children}
      </main>
      <SyncManager />
      <Toaster />
    </div>
  )
}
