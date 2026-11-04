import Link from 'next/link'
import { Logo } from '@/components/icons'

export const dynamic = 'force-dynamic'

export default function NotFound() {
  return (
    <main className="min-h-dvh grid place-items-center p-6">
      <div className="text-center rise">
        <div className="flex justify-center mb-8"><Logo size={44} /></div>
        <div className="eyebrow">404</div>
        <h1 className="text-3xl font-medium mt-1">That page doesn’t exist</h1>
        <p className="text-muted text-sm mt-2">Check the address, or head back to where you were.</p>
        <Link href="/" className="btn btn-primary mt-6">Take me home</Link>
      </div>
    </main>
  )
}
