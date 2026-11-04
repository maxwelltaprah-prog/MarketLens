'use client'
/* Browser geolocation helpers. Everything here is best-effort: a missing or denied fix never blocks the UI by itself. */

export type ClientFix = {
  lat: number; lng: number; accuracyM: number | null; speedMps: number | null; headingDeg: number | null; altitudeM: number | null
  battery: number | null; online: boolean; capturedAt: string
}
export type ClientPing = ClientFix & { kind: 'login' | 'heartbeat' | 'save' | 'submit' }

let lastFix: ClientFix | null = null
export const getLastFix = () => lastFix

async function battery(): Promise<number | null> {
  try {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }
    if (!nav.getBattery) return null
    return (await nav.getBattery()).level
  } catch { return null }
}

export async function toFix(p: GeolocationPosition): Promise<ClientFix> {
  const c = p.coords
  const f: ClientFix = {
    lat: c.latitude, lng: c.longitude, accuracyM: c.accuracy ?? null, speedMps: c.speed ?? null, headingDeg: c.heading ?? null, altitudeM: c.altitude ?? null,
    battery: await battery(), online: navigator.onLine, capturedAt: new Date(p.timestamp || Date.now()).toISOString(),
  }
  lastFix = f
  return f
}

/** One fix, high accuracy, with a timeout. Resolves null when unavailable or denied. */
export function getFix(timeoutMs = 12_000): Promise<ClientFix | null> {
  return new Promise((res) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return res(null)
    navigator.geolocation.getCurrentPosition((p) => void toFix(p).then(res), () => res(lastFix), { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 })
  })
}

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'
export async function permissionState(): Promise<PermissionState> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported'
  try { return (await navigator.permissions.query({ name: 'geolocation' })).state as PermissionState } catch { return 'prompt' }
}

/** Post pings straight to the server (used for sign-in and heartbeats when online). */
export async function postPings(pings: ClientPing[], ctx: { entryDate?: string } = {}): Promise<boolean> {
  try {
    const r = await fetch('/api/location', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pings, ...ctx }) })
    return r.ok
  } catch { return false }
}
