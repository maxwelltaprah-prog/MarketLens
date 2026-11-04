'use client'
import { useEffect } from 'react'
import { Icon } from '@/components/icons'

/* Production error boundary: never shows stack traces or internals to the user. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('[marketlens]', error.digest ?? error.message) }, [error])
  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="card max-w-md w-full p-8 text-center rise">
        <div className="mx-auto mb-4 grid place-items-center size-14 rounded-2xl bg-danger-soft text-danger"><Icon name="alert" size={26} /></div>
        <h1 className="text-2xl font-medium">Something went wrong</h1>
        <p className="text-muted text-sm mt-2">The problem has been recorded. Your captured prices are safe. {error.digest && <span className="block text-xs mt-2 font-mono">Ref {error.digest}</span>}</p>
        <div className="mt-6 flex justify-center gap-3"><button className="btn btn-primary" onClick={reset}>Try again</button><a className="btn btn-outline" href="/">Home</a></div>
      </div>
    </main>
  )
}
