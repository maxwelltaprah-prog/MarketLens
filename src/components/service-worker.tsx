'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function ServiceWorker() {
  const path = usePathname()
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
      // Warm the promoter app shell so it opens offline even if only one page was ever visited.
      if (path.startsWith('/capture')) (reg.active ?? reg.waiting ?? reg.installing)?.postMessage({ type: 'warm' })
      if (path === '/login') reg.active?.postMessage({ type: 'logout' })
    }).catch(() => {})
  }, [path])
  return null
}
