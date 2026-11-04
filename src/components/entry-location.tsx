'use client'
import { useEffect, useRef } from 'react'
import type { Map as LMap } from 'leaflet'

type P = { lat: number; lng: number; kind: string; at: string; accuracyM: number | null }
/** Small map on the entry page: outlet pin, geofence ring and the pings recorded during this capture. */
export function EntryLocation({ outlet, pings, submitAt, geofenceM }: { outlet: { lat: number; lng: number; name: string } | null; pings: P[]; submitAt: { lat: number; lng: number } | null; geofenceM: number }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<LMap | null>(null)
  useEffect(() => {
    let dead = false
    ;(async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (dead || !box.current || map.current) return
      const m = L.map(box.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m)
      const b: [number, number][] = []
      if (outlet) { b.push([outlet.lat, outlet.lng]); L.circle([outlet.lat, outlet.lng], { radius: geofenceM, color: '#ff6000', weight: 1, fillColor: '#ff6000', fillOpacity: 0.08 }).addTo(m); L.circleMarker([outlet.lat, outlet.lng], { radius: 7, color: '#121212', fillColor: '#ff6000', fillOpacity: 1 }).bindTooltip(outlet.name).addTo(m) }
      const pts = pings.map((p) => [p.lat, p.lng] as [number, number]); pts.forEach((p) => b.push(p))
      if (pts.length > 1) L.polyline(pts, { color: '#121212', weight: 2, opacity: 0.5, dashArray: '2 6' }).addTo(m)
      pings.forEach((p) => L.circleMarker([p.lat, p.lng], { radius: 4, color: p.kind === 'submit' ? '#1b7f4a' : '#6b6b6b', fillOpacity: 1 }).bindTooltip(`${p.kind} · ${new Date(p.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${p.accuracyM ? ` · ±${Math.round(p.accuracyM)} m` : ''}`).addTo(m))
      if (submitAt) { b.push([submitAt.lat, submitAt.lng]); L.circleMarker([submitAt.lat, submitAt.lng], { radius: 8, color: '#fff', weight: 2, fillColor: '#1b7f4a', fillOpacity: 1 }).bindTooltip('Submitted here').addTo(m) }
      if (b.length) m.fitBounds(b, { padding: [30, 30], maxZoom: 17 }); else m.setView([7.9465, -1.0232], 6)
      map.current = m
    })()
    return () => { dead = true; map.current?.remove(); map.current = null }
  }, [outlet, pings, submitAt, geofenceM])
  return <div ref={box} className="h-64 w-full rounded-xl overflow-hidden bg-surface-2" role="img" aria-label="Capture location map" />
}
