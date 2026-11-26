'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { enqueue, getItem, type ReceiptBlob } from '@/lib/offline-db'
import { flushOutbox } from '@/lib/sync-client'
import { getLastFix } from '@/lib/geo-client'
import { deleteReceiptAction } from '@/actions/capture'
import { Icon } from './icons'
import { cx } from './ui'
import { toast } from './toast'

export type ServerReceipt = { id: string; clientId: string; bytes: number; capturedAt: string }
type Local = ReceiptBlob & { pending: true }
const MAX_SIDE = 1600, QUALITY = 0.72, MAX_BYTES = 450_000

/** Shrinks a photo on the device: long side ≤ 1600px, JPEG. Receipts stay legible and the upload stays small, even on 2G. */
async function compress(file: File): Promise<ReceiptBlob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('unreadable')
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  let q = QUALITY, dataUrl = canvas.toDataURL('image/jpeg', q)
  while (dataUrl.length * 0.75 > MAX_BYTES && q > 0.4) { q -= 0.1; dataUrl = canvas.toDataURL('image/jpeg', q) }
  const data = dataUrl.split(',')[1]
  return { clientId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, mime: 'image/jpeg', data, bytes: Math.round(data.length * 0.75), width: w, height: h, capturedAt: new Date().toISOString() }
}

export function ReceiptCapture({ userId, date, initial, editable }: { userId: string; date: string; initial: ServerReceipt[]; editable: boolean }) {
  const [server, setServer] = useState(initial)
  const [local, setLocal] = useState<Local[]>([])
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<{ src: string; label: string } | null>(null)
  const router = useRouter()
  const cam = useRef<HTMLInputElement>(null), gal = useRef<HTMLInputElement>(null)

  useEffect(() => { setServer(initial) }, [initial])
  useEffect(() => {
    let alive = true
    getItem(userId, date).then((q) => { if (alive && q?.receipts?.length) setLocal(q.receipts.map((r) => ({ ...r, pending: true }))) })
    // After a sync the server copy exists: refresh the server list first, then drop the local copy.
    const synced = () => { router.refresh(); setTimeout(() => getItem(userId, date).then((q) => { if (alive) setLocal((q?.receipts ?? []).map((r) => ({ ...r, pending: true }))) }), 1500) }
    window.addEventListener('ml-synced', synced)
    return () => { alive = false; window.removeEventListener('ml-synced', synced) }
  }, [userId, date, router])

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    const out: ReceiptBlob[] = []
    for (const f of Array.from(files).slice(0, 5)) {
      if (!f.type.startsWith('image/')) { toast('Only photos can be attached', { tone: 'warn' }); continue }
      try { out.push(await compress(f)) } catch { toast('That image could not be read', { tone: 'warn' }) }
    }
    if (out.length) {
      const fix = getLastFix()
      await enqueue(userId, date, {}, undefined, fix ? [{ ...fix, kind: 'save', capturedAt: new Date().toISOString() }] : [], {}, out)
      setLocal((l) => [...l, ...out.map((r) => ({ ...r, pending: true as const }))])
      toast(out.length === 1 ? 'Receipt attached' : `${out.length} receipts attached`, { body: navigator.onLine ? 'Uploading…' : 'Saved on this phone. Uploads when you have signal.' })
      void flushOutbox().then(() => window.dispatchEvent(new Event('ml-receipts-refresh')))
    }
    setBusy(false)
    if (cam.current) cam.current.value = ''; if (gal.current) gal.current.value = ''
  }

  const remove = async (r: ServerReceipt) => {
    if (!confirm('Remove this receipt?')) return
    const res = await deleteReceiptAction({ id: r.id })
    if (res.ok) { setServer((s) => s.filter((x) => x.id !== r.id)); toast('Receipt removed') } else toast('Could not remove receipt', { body: res.error, tone: 'error' })
  }

  const all = [...server.map((r) => ({ key: r.id, src: `/api/receipts/${r.id}`, pending: false, at: r.capturedAt, server: r })), ...local.filter((l) => !server.some((s) => s.clientId === l.clientId)).map((l) => ({ key: l.clientId, src: `data:${l.mime};base64,${l.data}`, pending: true, at: l.capturedAt, server: null }))]

  return (
    <section className="card p-4 sm:p-5 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div><h2 className="font-semibold flex items-center gap-2"><Icon name="camera" size={18} className="text-brand" /> Receipts &amp; invoices</h2><p className="text-xs text-muted">Photograph the receipt for today’s sales. {all.length ? `${all.length} attached.` : 'None yet.'}</p></div>
        {editable && (
          <div className="flex gap-2">
            <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <input ref={gal} type="file" accept="image/*" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => cam.current?.click()}><Icon name="camera" size={14} /> {busy ? 'Preparing…' : 'Take photo'}</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => gal.current?.click()}><Icon name="upload" size={14} /> Gallery</button>
          </div>
        )}
      </div>
      {all.length > 0 && (
        <ul className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {all.map((r) => (
            <li key={r.key} className="relative group">
              <button type="button" onClick={() => setView({ src: r.src, label: new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) })} className="block w-full aspect-[3/4] rounded-xl overflow-hidden border border-line bg-surface-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.src} alt="Receipt" className="w-full h-full object-cover" loading="lazy" />
              </button>
              <span className={cx('absolute left-1.5 bottom-1.5 rounded-md px-1.5 py-0.5 text-[0.6rem] font-semibold', r.pending ? 'bg-amber text-white' : 'bg-ink/80 text-white')}>{r.pending ? 'Uploading' : new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
              {editable && r.server && <button type="button" aria-label="Remove receipt" onClick={() => remove(r.server!)} className="absolute right-1 top-1 grid place-items-center size-6 rounded-full bg-white/90 text-danger shadow"><Icon name="x" size={12} /></button>}
            </li>
          ))}
        </ul>
      )}
      {view && (
        <div className="fixed inset-0 z-[80] bg-black/90 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Receipt" onClick={() => setView(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={view.src} alt="Receipt" className="max-h-full max-w-full rounded-lg shadow-pop" />
          <button className="absolute top-4 right-4 icon-btn" aria-label="Close" onClick={() => setView(null)}><Icon name="x" /></button>
          <span className="absolute bottom-4 text-white/80 text-xs">{view.label}</span>
        </div>
      )}
    </section>
  )
}
