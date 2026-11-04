import { requireUser } from '@/lib/session'
import { todayISO } from '@/lib/format'
import { CaptureView } from '@/lib/capture-page'

export const metadata = { title: 'Price capture' }

export default async function CapturePage() {
  const user = await requireUser('promoter')
  return <CaptureView user={user} date={todayISO()} mode="today" />
}
