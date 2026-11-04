'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { enqueue } from '@/lib/offline-db'
import { getFix, permissionState, postPings, toFix, type ClientFix, type ClientPing, type PermissionState } from '@/lib/geo-client'
import { Icon } from './icons'
import { cx } from './ui'

type Props = { userId: string; role: 'promoter' | 'admin'; date?: string; intervalSec: number; required: boolean; outletName?: string | null }
export type GeoState = 'on' | 'off' | 'denied' | 'unsupported' | 'searching'
const emit = (s: GeoState) => window.dispatchEvent(new CustomEvent('ml-geo', { detail: s }))

/** Visible, consent-based location sharing.
 *  - sends one "login" ping per session once permission is granted
 *  - keeps a GPS watch running while this screen is open and sends a heartbeat every `intervalSec`
 *  - promoters' pings go through the offline outbox when there is no signal, so trails survive dead zones */
export function LocationTracker({ userId, role, date, intervalSec, required, outletName }: Props) {
  const [perm, setPerm] = useState<PermissionState | 'unknown'>('unknown')
  const [state, setState] = useState<GeoState>('off')
  const [dismissed, setDismissed] = useState(false)
  const last = useRef<ClientFix | null>(null)

  const send = useCallback(async (p: ClientPing) => {
    if (role === 'promoter' && date) {
      if (navigator.onLine && (await postPings([p], { entryDate: date }))) return
      await enqueue(userId, date, {}, undefined, [p])   // offline: ride along with the outbox
    } else await postPings([p])
  }, [role, date, userId])

  const start = useCallback(() => {
    if (!navigator.geolocation) { setState('unsupported'); emit('unsupported'); return () => {} }
    setState('searching'); emit('searching')
    const key = `ml:loginping:${userId}`
    const watch = navigator.geolocation.watchPosition(async (pos) => {
      const f = await toFix(pos); last.current = f
      setState('on'); emit('on')
      let loggedIn = false
      try { loggedIn = sessionStorage.getItem(key) === '1' } catch {}
      if (!loggedIn) { try { sessionStorage.setItem(key, '1') } catch {}; void send({ ...f, kind: 'login' }) }
    }, (err) => {
      if (err.code === err.PERMISSION_DENIED) { setPerm('denied'); setState('denied'); emit('denied') }
    }, { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 })
    const beat = setInterval(() => { if (last.current && document.visibilityState === 'visible') void send({ ...last.current, kind: 'heartbeat', capturedAt: new Date().toISOString(), online: navigator.onLine }) }, Math.max(30, intervalSec) * 1000)
    return () => { navigator.geolocation.clearWatch(watch); clearInterval(beat) }
  }, [userId, intervalSec, send])

  useEffect(() => {
    let stop: (() => void) | undefined
    permissionState().then((p) => { setPerm(p); if (p === 'granted') stop = start(); else if (p === 'unsupported') { setState('unsupported'); emit('unsupported') } else if (p === 'denied') { setState('denied'); emit('denied') } })
    return () => stop?.()
  }, [start])

  const enable = async () => {
    const f = await getFix(15_000)          // triggers the browser prompt
    const p = await permissionState()
    setPerm(p)
    if (f || p === 'granted') start()
  }

  if (perm === 'granted' || perm === 'unknown' || perm === 'unsupported' || dismissed) return null
  return (
    <div className={cx('no-print pop card p-4 mb-6 flex items-start gap-3', perm === 'denied' ? 'border-amber bg-amber-soft/40' : 'border-brand-soft bg-gradient-to-r from-mint to-white')} role="region" aria-label="Location sharing">
      <span className={cx('grid place-items-center size-10 rounded-xl shrink-0', perm === 'denied' ? 'bg-amber text-white' : 'bg-brand text-white')}><Icon name="map" /></span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">{perm === 'denied' ? 'Location is blocked for this app' : 'Share your location while you capture'}</div>
        <div className="text-xs text-muted mt-0.5">
          {perm === 'denied'
            ? `${required ? 'Submissions need a location. ' : ''}Open your phone’s browser settings, allow Location for this site, then reload.`
            : `Your position is recorded while this screen is open so your administrator can confirm captures at ${outletName ?? 'your outlet'}. Nothing is tracked when the app is closed.`}
        </div>
      </div>
      {perm !== 'denied' && <button className="btn btn-primary btn-sm" onClick={enable}>Turn on</button>}
      {!required && <button className="icon-btn !size-9" aria-label="Not now" onClick={() => setDismissed(true)}><Icon name="x" size={14} /></button>}
      {state === 'searching' && <span className="sr-only">Searching for GPS</span>}
    </div>
  )
}
