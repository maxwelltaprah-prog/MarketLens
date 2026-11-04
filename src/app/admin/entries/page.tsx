import { Suspense } from 'react'
import { Icon } from '@/components/icons'
import { FilterBar, SearchBox } from '@/components/filter-bar'
import { EntryTable } from '@/components/entry-table'
import { Pagination } from '@/components/pagination'
import { TableSkeleton } from '@/components/admin-skeletons'
import { PageHeader } from '@/components/ui'
import { PAGE_SIZE, getFilterOptions, listEntries, parseFilters } from '@/lib/admin-queries'
import { getCatalog, totalPricePoints } from '@/lib/catalog'
import { todayISO } from '@/lib/format'

export const metadata = { title: 'Entries' }
type SP = Record<string, string | string[] | undefined>

export default async function EntriesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams
  const g = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k])
  const { f, raw } = parseFilters(sp)
  const status = g('status') === 'draft' || g('status') === 'submitted' ? (g('status') as 'draft' | 'submitted') : undefined
  const q = g('q')?.slice(0, 80)
  const page = Math.max(1, Number.parseInt(g('page') ?? '1', 10) || 1)
  const opts = await getFilterOptions()
  const today = todayISO()
  const exportQs = new URLSearchParams({ from: f.from, to: f.to, ...(f.outletId ? { outlet: f.outletId } : {}), ...(status ? { status } : {}), ...(q ? { q } : {}) }).toString()
  return (
    <div className="rise">
      <PageHeader eyebrow="Field activity" title="Price entries" sub="Review, correct, lock, and export all submitted price captures."
        action={<a href={`/admin/export?${exportQs}`} className="btn btn-primary"><Icon name="download" size={16} /> Export data</a>} />
      <FilterBar defaults={{ from: `${today.slice(0, 8)}01`, to: today }} fields={{ outlet: opts.outlets, status: true }} />
      <div className="card overflow-hidden">
        <div className="p-4"><SearchBox placeholder="Search outlet or promoter" /></div>
        <Suspense key={JSON.stringify(raw) + status + q + page} fallback={<TableSkeleton rows={6} />}>
          <Rows f={{ from: f.from, to: f.to, outletId: f.outletId, status, q, page }} />
        </Suspense>
      </div>
    </div>
  )
}

async function Rows({ f }: { f: Parameters<typeof listEntries>[0] }) {
  const [{ rows, total }, catalog] = await Promise.all([listEntries(f), getCatalog()])
  return (
    <>
      <EntryTable rows={rows} total={totalPricePoints(catalog)} />
      <Pagination page={f.page} pages={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} size={PAGE_SIZE} />
    </>
  )
}
