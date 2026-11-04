'use client'
import { useParams } from './filter-bar'
import { cx } from './ui'

export function Pagination({ page, pages, total, size }: { page: number; pages: number; total: number; size: number }) {
  const { set, pending } = useParams()
  const from = total === 0 ? 0 : (page - 1) * size + 1, to = Math.min(total, page * size)
  const go = (p: number) => set({ page: p > 1 ? String(p) : null })
  const nums = Array.from(new Set([1, page - 1, page, page + 1, pages])).filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
  return (
    <div className={cx('flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-t border-line text-xs text-muted', pending && 'opacity-60')}>
      <span>Showing {from}–{to} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <button className="btn btn-ghost !min-h-9 !px-3 !text-xs" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</button>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && nums[i - 1] !== n - 1 && <span className="px-1">…</span>}
            <button onClick={() => go(n)} aria-current={n === page ? 'page' : undefined}
              className={cx('size-9 rounded-lg text-xs font-semibold', n === page ? 'bg-brand text-white' : 'border border-line bg-white hover:bg-mint')}>{n}</button>
          </span>
        ))}
        <button className="btn btn-ghost !min-h-9 !px-3 !text-xs" disabled={page >= pages} onClick={() => go(page + 1)}>Next</button>
      </div>
    </div>
  )
}
