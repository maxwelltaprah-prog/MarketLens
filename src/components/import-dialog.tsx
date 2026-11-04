'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from './icons'
import { Modal } from './modal'
import type { ImportResult } from '@/actions/admin'

export function ImportButton({ label = 'Import', title, columns, example, action }: {
  label?: string; title: string; columns: string; example: string; action: (text: string) => Promise<ImportResult>
}) {
  const [open, setOpen] = useState(false)
  const [res, setRes] = useState<ImportResult | null>(null)
  const [pending, start] = useTransition()
  const router = useRouter()
  const run = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 1_000_000) return setRes({ ok: false, error: 'That file is too large (max 1 MB).' })
    const text = await file.text()
    start(async () => { setRes(await action(text)); router.refresh() })
  }
  const sample = () => {
    const url = URL.createObjectURL(new Blob([`${columns}\n${example}\n`], { type: 'text/csv' }))
    Object.assign(document.createElement('a'), { href: url, download: `${title.toLowerCase().replace(/\W+/g, '-')}-template.csv` }).click()
    URL.revokeObjectURL(url)
  }
  return (
    <>
      <button className="btn btn-outline" onClick={() => { setRes(null); setOpen(true) }}><Icon name="upload" size={16} /> {label}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={title}>
        <p className="text-sm text-muted">Upload a CSV file with these columns: <code className="bg-canvas rounded px-1.5 py-0.5 text-ink">{columns}</code>. Existing records are updated, new ones are created.</p>
        <button className="text-sm font-semibold text-brand mt-2 hover:underline" onClick={sample}>Download a template</button>
        <label className="mt-5 grid place-items-center gap-2 rounded-2xl border-2 border-dashed border-line hover:border-brand-soft hover:bg-mint/40 transition-colors cursor-pointer p-8 text-center">
          <Icon name="upload" size={24} className="text-brand" />
          <span className="font-semibold text-sm">{pending ? 'Importing…' : 'Choose a CSV file'}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" disabled={pending} onChange={(e) => { void run(e.target.files?.[0]); e.target.value = '' }} />
        </label>
        {res && (res.ok ? (
          <div className="mt-4 rounded-xl bg-mint text-brand text-sm p-3" role="status">
            <b>Done.</b> {res.created} created, {res.updated} updated{res.skipped.length ? `, ${res.skipped.length} skipped` : ''}.
            {res.skipped.length > 0 && <ul className="mt-2 text-amber-ink list-disc pl-5 space-y-0.5">{res.skipped.map((s) => <li key={s}>{s}</li>)}</ul>}
          </div>
        ) : <div role="alert" className="mt-4 rounded-xl bg-danger-soft text-danger text-sm p-3">{res.error}</div>)}
      </Modal>
    </>
  )
}
