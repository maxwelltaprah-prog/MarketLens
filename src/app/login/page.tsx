import type { Metadata } from 'next'
import { Logo, Icon, type IconName } from '@/components/icons'
import { LoginForm } from '@/components/login-form'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } }
// Rendered per request so the CSP nonce from the proxy is applied to inline scripts.
export const dynamic = 'force-dynamic'

const points: [IconName, string, string][] = [
  ['mobile', 'Capture in seconds', 'A tap-friendly price grid built for the shelf. Works with no signal and syncs itself.'],
  ['trend', 'Spot movement early', 'Variance warnings flag prices that look off before they are submitted.'],
  ['shield', 'Decide with confidence', 'Live coverage, brand availability and a brand × outlet price matrix for your team.'],
]

export default function LoginPage() {
  return (
    <main className="min-h-dvh grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="relative overflow-hidden bg-forest text-white px-6 py-8 lg:p-12 flex flex-col">
        <div className="absolute -right-32 -top-32 size-[28rem] rounded-full bg-brand/30 blur-3xl" aria-hidden />
        <div className="absolute -left-24 -bottom-40 size-[24rem] rounded-full bg-brand/15 blur-3xl" aria-hidden />
        <div className="relative"><Logo dark size={44} /></div>
        <div className="hidden lg:block mt-auto relative">
          <div className="eyebrow !text-brand-soft">Olam Agri · Field intelligence</div>
          <h1 className="text-5xl xl:text-6xl font-medium leading-[1.02] mt-4">Know the shelf.<br />Move with confidence.</h1>
          <p className="text-white/70 mt-5 max-w-md leading-relaxed">Capture competitive prices at every outlet and turn field activity into decisions your team can act on the same day.</p>
          <ul className="mt-10 grid gap-4 border-t border-white/10 pt-8 max-w-md">
            {points.map(([ic, t, d]) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 grid place-items-center size-8 rounded-xl bg-brand text-white shrink-0"><Icon name={ic} size={15} /></span>
                <span><span className="font-semibold">{t}.</span> <span className="text-white/65">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-10 lg:p-12">
        <div className="w-full max-w-md rise">
          <div className="eyebrow">Welcome back</div>
          <h2 className="text-4xl font-medium mt-1">Sign in</h2>
          <p className="text-muted mt-2 mb-7">Enter your details to continue to MarketLens.</p>
          <LoginForm />
          <p className="mt-10 text-[0.7rem] text-muted text-center flex items-center justify-center gap-1.5"><Icon name="lock" size={12} /> Private system. Access is monitored and logged.</p>
        </div>
      </section>
    </main>
  )
}
