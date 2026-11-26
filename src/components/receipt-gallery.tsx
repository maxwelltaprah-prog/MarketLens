'use client'
import { useState } from 'react'
import { Icon } from './icons'

/** Admin: small "N receipts" button that opens a viewer for that outlet/day. */
export function ReceiptGallery({ ids, label }: { ids: string[]; label: string }) {
  const [i, setI] = useState<number | null>(null)
  if (!ids.length) return <span className="text-xs text-muted">—</span>
  return (
    <>
      <button type="button" onClick={() => setI(0)} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-mint" title={`View ${ids.length} receipt${ids.length === 1 ? '' : 's'}`}>
        <Icon name="receipt" size={13} /> {ids.length}
      </button>
      {i !== null && (
        <div className="fixed inset-0 z-[80] bg-black/90 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={`Receipts for ${label}`} onClick={() => setI(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/receipts/${ids[i]}`} alt={`Receipt ${i + 1} of ${ids.length}`} className="max-h-[85vh] max-w-full rounded-lg shadow-pop" onClick={(e) => e.stopPropagation()} />
          <div className="absolute top-4 inset-x-4 flex items-center justify-between text-white/90 text-sm">
            <span>{label} · {i + 1} / {ids.length}</span>
            <div className="flex gap-2">
              <a className="icon-btn" href={`/api/receipts/${ids[i]}`} target="_blank" rel="noreferrer noopener" aria-label="Open full size" onClick={(e) => e.stopPropagation()}><Icon name="download" size={16} /></a>
              <button className="icon-btn" aria-label="Close" onClick={() => setI(null)}><Icon name="x" /></button>
            </div>
          </div>
          {ids.length > 1 && (
            <>
              <button className="absolute left-3 top-1/2 -translate-y-1/2 icon-btn" aria-label="Previous" onClick={(e) => { e.stopPropagation(); setI((i + ids.length - 1) % ids.length) }}><Icon name="chevronL" /></button>
              <button className="absolute right-3 top-1/2 -translate-y-1/2 icon-btn" aria-label="Next" onClick={(e) => { e.stopPropagation(); setI((i + 1) % ids.length) }}><Icon name="chevronR" /></button>
            </>
          )}
        </div>
      )}
    </>
  )
}
