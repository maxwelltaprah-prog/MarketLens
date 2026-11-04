'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Map as LMap, LayerGroup } from 'leaflet'
import { Icon } from './icons'
import { cx } from './ui'
import { toast } from './toast'
import { saveOutletAction } from '@/actions/admin'

export type MapUser = {
  id: string; name: string; role: 'admin' | 'promoter'; outletId: string | null; outletName: string | null; outletLat: number | null; outletLng: number | null; pingsToday: number
  last: { lat: number; lng: number; accuracyM: number | null; kind: string; at: string; distanceM: number | null; battery: number | null; speedMps: number | null } | null
}
export type MapOutlet = { id: string; name: string; region: string; lat: number | null; lng: number | null }
export type TrailPoint = { lat: number; lng: number; kind: string; at: string; accuracyM: number | null; online: boolean | null }

const DEFAULT_CENTER: [number, number] = [7.9465, -1.0232] // Ghana
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}
const freshness = (iso: string | undefined) => { if (!iso) return 'none'; const m = (Date.now() - new Date(iso).getTime()) / 60_000; return m < 10 ? 'live' : m < 120 ? 'recent' : 'stale' }
const DOT: Record<string, string> = { live: '#1b7f4a', recent: '#e7a33b', stale: '#9a9a9a', none: '#d0d0d0' }

export function FieldMap({ users, outlets, trails, geofenceM }: { users: MapUser[]; outlets: MapOutlet[]; trails: Record<string, TrailPoint[]>; geofenceM: number }) {
  const router = useRouter()
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<LMap | null>(null)
  const layer = useRef<LayerGroup | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'promoter' | 'away'>('promoter')
  const [, start] = useTransition()
  const [pending, setPending] = useState(false)

  const list = users.filter((u) => filter === 'all' ? true : filter === 'promoter' ? u.role === 'promoter' : (u.last?.distanceM ?? 0) > geofenceM)

  // Init map once
  useEffect(() => {
    let dead = false
    ;(async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (dead || !box.current || map.current) return
      const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(DEFAULT_CENTER, 7)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(m)
      map.current = m; layer.current = L.layerGroup().addTo(m)
      draw()
    })()
    return () => { dead = true; map.current?.remove(); map.current = null; layer.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redraw markers whenever data/selection changes
  useEffect(() => { draw() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [users, outlets, trails, sel, filter])

  async function draw() {
    const m = map.current, g = layer.current
    if (!m || !g) return
    const L = (await import('leaflet')).default
    g.clearLayers()
    const bounds: [number, number][] = []
    for (const o of outlets) {
      if (o.lat == null || o.lng == null) continue
      bounds.push([o.lat, o.lng])
      L.circle([o.lat, o.lng], { radius: geofenceM, color: '#ff6000', weight: 1, fillColor: '#ff6000', fillOpacity: 0.08 }).addTo(g)
      L.marker([o.lat, o.lng], { icon: L.divIcon({ className: '', html: `<div style="background:#121212;color:#fff;border:2px solid #ff6000;border-radius:10px;padding:2px 7px;font:600 11px DM Sans,sans-serif;white-space:nowrap;transform:translate(-50%,-50%)">${esc(o.name)}</div>`, iconSize: [0, 0] }) }).addTo(g)
    }
    for (const u of list) {
      if (!u.last) continue
      const f = freshness(u.last.at)
      bounds.push([u.last.lat, u.last.lng])
      const isSel = sel === u.id
      const html = `<div style="display:flex;align-items:center;gap:4px;transform:translate(-14px,-14px)"><div style="width:28px;height:28px;border-radius:50%;background:${DOT[f]};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);display:grid;place-items:center;color:#fff;font:700 10px DM Sans,sans-serif${isSel ? ';outline:3px solid #ff6000' : ''}">${esc(u.name.slice(0, 2).toUpperCase())}</div></div>`
      const mk = L.marker([u.last.lat, u.last.lng], { icon: L.divIcon({ className: '', html, iconSize: [0, 0] }), zIndexOffset: isSel ? 1000 : 0 }).addTo(g)
      mk.on('click', () => setSel(u.id))
      if (u.last.accuracyM && u.last.accuracyM < 500) L.circle([u.last.lat, u.last.lng], { radius: u.last.accuracyM, color: DOT[f], weight: 1, fillOpacity: 0.06 }).addTo(g)
      if (isSel && trails[u.id]?.length > 1) {
        const pts = trails[u.id].map((p) => [p.lat, p.lng] as [number, number])
        L.polyline(pts, { color: '#ff6000', weight: 3, opacity: 0.8, dashArray: '2 6' }).addTo(g)
        trails[u.id].forEach((p) => { if (p.kind === 'submit' || p.kind === 'login') L.circleMarker([p.lat, p.lng], { radius: 5, color: p.kind === 'submit' ? '#1b7f4a' : '#121212', fillOpacity: 1 }).bindTooltip(`${p.kind} · ${new Date(p.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`).addTo(g) })
        pts.forEach((p) => bounds.push(p))
      }
    }
    if (sel) { const u = users.find((x) => x.id === sel); if (u?.last) m.setView([u.last.lat, u.last.lng], Math.max(m.getZoom(), 15), { animate: true }) }
    else if (bounds.length) m.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 })
  }

  const useAsPin = (u: MapUser) => {
    if (!u.last || !u.outletId) return
    const o = outlets.find((x) => x.id === u.outletId)
    if (!o) return
    setPending(true)
    start(async () => {
      const r = await saveOutletAction({ id: o.id, name: o.name, region: o.region, active: true, lat: u.last!.lat, lng: u.last!.lng })
      setPending(false)
      if (r.ok) { toast(`${o.name} pinned`, { body: 'Geofence now uses this position.' }); router.refresh() } else toast('Could not pin outlet', { body: r.error, tone: 'error' })
    })
  }

  const selected = users.find((u) => u.id === sel)
  return (
    <div className="grid lg:grid-cols-[22rem_minmax(0,1fr)] gap-4">
      <aside className="card overflow-hidden flex flex-col max-h-[75vh]">
        <div className="p-3 border-b border-line flex items-center gap-1">
          {([['promoter', 'Promoters'], ['away', 'Away from outlet'], ['all', 'Everyone']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors', filter === k ? 'bg-ink text-white' : 'text-muted hover:bg-surface-2')}>{l}</button>
          ))}
          <button className="ml-auto icon-btn !size-8" aria-label="Refresh" onClick={() => router.refresh()}><Icon name="refresh" size={14} /></button>
        </div>
        <ul className="divide-y divide-line overflow-y-auto">
          {list.length === 0 && <li className="p-6 text-sm text-muted text-center">No one matches this filter.</li>}
          {list.map((u) => {
            const f = freshness(u.last?.at)
            const away = u.last?.distanceM != null && u.last.distanceM > geofenceM
            return (
              <li key={u.id}>
                <button onClick={() => setSel(sel === u.id ? null : u.id)} className={cx('w-full text-left p-3 flex items-start gap-3 transition-colors hover:bg-[#fbfaf7]', sel === u.id && 'bg-mint/60')}>
                  <span className="relative mt-0.5 grid place-items-center size-9 rounded-full bg-forest text-white text-xs font-bold shrink-0">{u.name.slice(0, 2).toUpperCase()}
                    <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white" style={{ background: DOT[f] }} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2"><span className="font-semibold text-sm truncate">{u.name}</span>{u.role === 'admin' && <span className="pill pill-off !py-0">admin</span>}</span>
                    <span className="block text-xs text-muted truncate">{u.outletName ?? 'No outlet'}{u.last ? ` · ${ago(u.last.at)}` : ' · no location yet'}</span>
                    {u.last && (
                      <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.7rem] text-muted">
                        {u.last.distanceM != null && <span className={cx('font-semibold', away ? 'text-danger' : 'text-success')}>{away ? `${fmtM(u.last.distanceM)} from outlet` : 'At outlet'}</span>}
                        {u.last.distanceM == null && u.outletId && <span className="text-amber-ink">outlet not pinned</span>}
                        {u.last.accuracyM != null && <span>±{Math.round(u.last.accuracyM)} m</span>}
                        {u.last.battery != null && <span className="inline-flex items-center gap-0.5"><Icon name="battery" size={11} />{Math.round(u.last.battery * 100)}%</span>}
                        <span>{u.pingsToday} pings</span>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        {selected?.last && (
          <div className="p-3 border-t border-line bg-[#fbfaf7] text-xs space-y-2">
            <div className="flex items-center justify-between"><span className="font-semibold">{selected.name}</span><span className="text-muted">{new Date(selected.last.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
            <div className="text-muted tabular-nums">{selected.last.lat.toFixed(5)}, {selected.last.lng.toFixed(5)} · last event: {selected.last.kind}</div>
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-outline btn-sm" href={`https://www.google.com/maps?q=${selected.last.lat},${selected.last.lng}`} target="_blank" rel="noreferrer noopener">Open in Google Maps</a>
              {selected.outletId && <button className="btn btn-dark btn-sm" disabled={pending} onClick={() => useAsPin(selected)}><Icon name="pin" size={13} /> Use as outlet pin</button>}
            </div>
          </div>
        )}
      </aside>
      <div className="card overflow-hidden relative">
        <div ref={box} className="h-[75vh] min-h-[28rem] w-full bg-surface-2" aria-label="Map of field team locations" role="img" />
        <div className="absolute bottom-3 left-3 z-[400] card px-3 py-2 text-[0.7rem] flex gap-3">
          {[['live', '< 10 min'], ['recent', '< 2 h'], ['stale', 'older']].map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full" style={{ background: DOT[k] }} />{l}</span>)}
          <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full border border-brand bg-brand/20" />geofence {geofenceM} m</span>
        </div>
      </div>
    </div>
  )
}

const fmtM = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`)
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
