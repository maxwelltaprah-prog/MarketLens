'use client'
import { useActionState, useState } from 'react'
import { loginAction, type LoginState } from '@/actions/auth'
import { Icon } from './icons'
import { cx } from './ui'

export function LoginForm() {
  const [mode, setMode] = useState<'promoter' | 'admin'>('promoter')
  const [show, setShow] = useState(false)
  const [id, setId] = useState('') // controlled so a wrong PIN doesn't wipe the number (React resets forms after actions)
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {})
  const error = state.mode === mode ? state.error : undefined

  return (
    <form action={action} className="space-y-5" noValidate>
      <input type="hidden" name="mode" value={mode} />
      <div role="tablist" aria-label="Sign in as" className="grid grid-cols-2 gap-1 rounded-2xl bg-[#eef0eb] p-1 border border-line">
        {(['promoter', 'admin'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setShow(false); setId('') }}
            className={cx('flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all',
              mode === m ? 'bg-white text-brand-ink shadow-card' : 'text-muted hover:text-ink')}>
            <Icon name={m === 'promoter' ? 'user' : 'shield'} size={16} />
            {m === 'promoter' ? 'Promoter' : 'Administrator'}
          </button>
        ))}
      </div>

      <div key={mode} className="space-y-4 rise">
        {mode === 'promoter' ? (
          <label className="block">
            <span className="block text-sm font-semibold mb-1.5">Mobile number</span>
            <input className="input" name="phone" type="tel" inputMode="tel" autoComplete="username" placeholder="e.g. 054 123 4567" required value={id} onChange={(e) => setId(e.target.value)} />
          </label>
        ) : (
          <label className="block">
            <span className="block text-sm font-semibold mb-1.5">Work email</span>
            <input className="input" name="email" type="email" autoComplete="username" placeholder="you@company.com" required value={id} onChange={(e) => setId(e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className="block text-sm font-semibold mb-1.5">{mode === 'promoter' ? 'PIN' : 'Password'}</span>
          <div className="relative">
            <input className="input pr-16" name="secret" type={show ? 'text' : 'password'} required
              inputMode={mode === 'promoter' ? 'numeric' : undefined} autoComplete="current-password"
              placeholder={mode === 'promoter' ? '4 to 8 digit PIN' : 'Your password'} />
            <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-brand-ink px-2 py-1.5 rounded-lg hover:bg-mint">
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </label>
      </div>

      {error && (
        <div role="alert" className="pop flex gap-2 rounded-xl bg-danger-soft text-danger text-sm p-3">
          <Icon name="alert" size={18} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? <><span className="size-4 rounded-full border-2 border-white/40 border-t-white animate-spin" /> Signing in…</> : <>Sign in <Icon name="arrowR" size={16} /></>}
      </button>
      <p className="text-xs text-muted text-center">Forgot your PIN or password? Ask your administrator to reset it.</p>
    </form>
  )
}
