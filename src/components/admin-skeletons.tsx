import { Skeleton } from './ui'

export function HeaderSkeleton() {
  return <div className="mb-6"><Skeleton className="h-3 w-24" /><Skeleton className="h-10 w-64 mt-3" /><Skeleton className="h-4 w-80 max-w-full mt-3" /></div>
}
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-16 rounded-2xl mb-6" />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}</div>
      <div className="grid xl:grid-cols-[2fr_1fr] gap-4 mt-4"><Skeleton className="h-80 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>
      <div className="grid xl:grid-cols-[2fr_1fr] gap-4 mt-4"><Skeleton className="h-72 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
    </div>
  )
}
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      <div className="p-4 flex gap-3"><Skeleton className="h-11 w-full max-w-md" /></div>
      <div className="divide-y divide-line">{Array.from({ length: rows }).map((_, i) => <div key={i} className="p-4 flex items-center gap-4"><Skeleton className="size-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div><Skeleton className="h-6 w-20 rounded-full" /></div>)}</div>
    </div>
  )
}
export function CardsSkeleton({ n = 6 }: { n?: number }) {
  return <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4" aria-busy="true">{Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
}
export function ListPageSkeleton({ cards = false }: { cards?: boolean }) {
  return <div><HeaderSkeleton />{cards ? <CardsSkeleton /> : <TableSkeleton />}</div>
}
