import type { Metadata } from 'next'
import { Logo, Icon } from '@/components/icons'
import { LoginForm } from '@/components/login-form'

export const metadata: Metadata = { title: 'Sign in' }

const points = [
  ['Capture in seconds', 'A tap-friendly price grid built for the shelf, with offline drafts.'],
  ['Spot movement early', 'Variance warnings flag prices that look off before they are submitted.'],
  ['Decide with confidence', 'Live coverage, brand availability and trends for your admin team.'],
] as const

export default function LoginPage() {
  return (
    <main className="min-h-dvh grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="bg-forest text-white relative overflow-hidden px-6 py-8 lg:p-12 flex flex-col">
        <div className="absolute -right-24 -bottom-24 size-96 rounded-full bg-brand/40 blur-3xl" aria-hidden />
        <Logo />
        <div className="hidden lg:block mt-auto relative">
          <div className="eyebrow !text-lime">Market intelligence, simplified</div>
          <h1 className="text-5xl xl:text-6xl font-medium leading-[1.02] mt-4">Know the market.<br />Move with confidence.</h1>
          <p className="text-white/75 mt-5 max-w-md leading-relaxed">Capture competitive prices from every outlet and turn field activity into decisions your team can act on.</p>
          <ul className="mt-10 space-y-4 border-t border-white/15 pt-8 max-w-md">
            {points.map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 grid place-items-center size-6 rounded-full bg-lime text-forest shrink-0"><Icon name="check" size={14} /></span>
                <span><span className="font-semibold">{t}.</span> <span className="text-white/70">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-10 lg:p-12">
        <div className="w-full max-w-md rise">
          <div className="eyebrow">Welcome back</div>
          <h2 className="text-4xl font-medium mt-1">Field team sign in</h2>
          <p className="text-muted mt-2 mb-7">Enter your details to continue to MarketLens.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  )
}
