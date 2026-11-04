import { Skeleton } from './ui'

export function CaptureSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-72 mt-3" /><Skeleton className="h-4 w-60 mt-3" />
      <div className="card p-5 mt-6 flex gap-6"><Skeleton className="h-12 w-1/3" /><Skeleton className="h-12 w-1/3" /></div>
      <Skeleton className="h-24 mt-4 rounded-2xl" />
      <Skeleton className="h-8 w-40 mt-8" />
      <div className="space-y-3 mt-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[72px] rounded-2xl" />)}</div>
    </div>
  )
}
