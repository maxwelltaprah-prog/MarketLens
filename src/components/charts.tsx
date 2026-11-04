import { cx } from './ui'

/** Server-rendered SVG charts: no client JS, animated with CSS. */
export function BarChart({ data, fmt }: { data: { name: string; v: number }[]; fmt: (n: number) => string }) {
  if (!data.length) return <NoData />
  const max = Math.max(...data.map((d) => d.v)) * 1.12 || 1
  const min = Math.min(...data.map((d) => d.v))
  return (
    <div className="h-64 flex items-end gap-2 sm:gap-4 border-b border-line relative pt-6"
      style={{ backgroundImage: 'linear-gradient(to bottom, transparent calc(100% - 1px), var(--color-line) 0)', backgroundSize: '100% 25%' }}>
      {data.map((d, i) => (
        <div key={d.name} className="flex-1 min-w-0 h-full flex flex-col justify-end items-center group">
          <div className="text-[0.65rem] font-semibold tabular-nums text-muted mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{fmt(d.v)}</div>
          <div className={cx('w-full max-w-14 rounded-t-lg grow', d.v === min ? 'bg-brand-soft' : i % 2 ? 'bg-brand-soft' : 'bg-brand')}
            style={{ height: `${(d.v / max) * 100}%`, animationDelay: `${i * 60}ms` }} title={`${d.name}: ${fmt(d.v)}`} />
        </div>
      ))}
    </div>
  )
}
export function BarLabels({ names }: { names: string[] }) {
  return <div className="flex gap-2 sm:gap-4 mt-2">{names.map((n) => <div key={n} className="flex-1 min-w-0 text-center text-[0.65rem] text-muted truncate">{n}</div>)}</div>
}

export function Donut({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total ? value / total : 0
  const r = 52, c = 2 * Math.PI * r
  return (
    <div className="relative size-44 mx-auto">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={`${Math.round(pct * 100)}% ${label}`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-amber)" strokeWidth="13" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--color-brand)" strokeWidth="13" strokeLinecap="butt"
          strokeDasharray={`${c * pct} ${c}`} style={{ transition: 'stroke-dasharray .8s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center"><div><div className="text-3xl font-semibold tabular-nums">{Math.round(pct * 100)}%</div><div className="text-xs text-muted">{label}</div></div></div>
    </div>
  )
}

export function AreaChart({ points, fmt }: { points: { d: string; v: number }[]; fmt: (n: number) => string }) {
  if (points.length < 2) return <NoData text="Not enough days in this range to draw a trend." />
  const W = 800, H = 220, pad = 8
  const vs = points.map((p) => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2)
  const y = (v: number) => H - 24 - ((v - lo) / span) * (H - 56)
  // smooth curve (monotone-ish via midpoint control)
  let d = `M${x(0)},${y(vs[0])}`
  for (let i = 1; i < points.length; i++) { const mx = (x(i - 1) + x(i)) / 2; d += ` C${mx},${y(vs[i - 1])} ${mx},${y(vs[i])} ${x(i)},${y(vs[i])}` }
  const area = `${d} L${x(points.length - 1)},${H} L${x(0)},${H} Z`
  const lab = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1]
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Price trend from ${fmt(vs[0])} to ${fmt(vs[vs.length - 1])}`}>
        <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--color-brand)" stopOpacity=".22" /><stop offset="1" stopColor="var(--color-brand)" stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} stroke="var(--color-line)" />)}
        <path d={area} fill="url(#ag)" />
        <path d={d} fill="none" stroke="var(--color-brand)" strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray="1" style={{ ['--len' as string]: 1, animation: 'draw 1.2s ease-out both' }} />
        <circle cx={x(points.length - 1)} cy={y(vs[vs.length - 1])} r="5" fill="#fff" stroke="var(--color-brand)" strokeWidth="3" />
      </svg>
      <div className="flex justify-between text-xs text-muted mt-1">{ticks.map((t) => <span key={t}>{lab(points[t].d)}</span>)}</div>
    </div>
  )
}

export function Meter({ name, pct }: { name: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-medium">{name}</span><span className="font-semibold tabular-nums">{pct}%</span></div>
      <div className="h-1.5 rounded-full bg-[#e9ece6] mt-1.5 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-soft" style={{ width: `${pct}%`, transition: 'width .8s ease' }} /></div>
    </div>
  )
}

function NoData({ text = 'No data for these filters yet.' }: { text?: string }) {
  return <div className="h-48 grid place-items-center text-sm text-muted text-center px-6">{text}</div>
}

/** Horizontal bars, sorted as given. Good for ranking brands or outlets. */
export function HBarChart({ data, fmt, highlight }: { data: { name: string; v: number }[]; fmt: (n: number) => string; highlight?: 'low' | 'high' }) {
  if (!data.length) return <NoData />
  const max = Math.max(...data.map((d) => d.v)) || 1
  const min = Math.min(...data.map((d) => d.v))
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => {
        const hot = highlight === 'low' ? d.v === min : highlight === 'high' ? d.v === max : false
        return (
          <li key={d.name} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate font-medium" title={d.name}>{d.name}</span>
            <span className="h-3 rounded-full bg-surface-2 overflow-hidden">
              <span className={cx('block h-full rounded-full grow-x', hot ? 'bg-brand' : 'bg-forest/80')} style={{ width: `${(d.v / max) * 100}%`, animationDelay: `${i * 40}ms` }} />
            </span>
            <span className={cx('tabular-nums text-xs font-semibold w-20 text-right', hot && 'text-brand-ink')}>{fmt(d.v)}</span>
          </li>
        )
      })}
    </ul>
  )
}
