'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from './icons'
import { cx } from './ui'

export type Command = { id: string; label: string; hint?: string; icon: IconName; href?: string; keywords?: string }

/** ⌘K / Ctrl+K palette: jump to any page, outlet, promoter or quick action. */
export function CommandPalette({ commands }: { commands: Command[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o) }
      if (e.key === 'Escape') setOpen(false)
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey); window.addEventListener('ml-palette', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('ml-palette', onOpen) }
  }, [])
  useEffect(() => { if (open) { setQ(''); setI(0); setTimeout(() => input.current?.focus(), 10) } }, [open])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    const xs = s ? commands.filter((c) => `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`.toLowerCase().includes(s)) : commands
    return xs.slice(0, 12)
  }, [q, commands])
  useEffect(() => setI(0), [q])

  const run = (c: Command) => { setOpen(false); if (c.href) router.push(c.href) }
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[65] bg-forest-deep/50 backdrop-blur-sm p-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="pop mx-auto max-w-xl card overflow-hidden shadow-pop" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <Icon name="search" size={18} className="text-muted" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to a page, outlet or promoter…" aria-label="Search commands"
            className="flex-1 h-14 bg-transparent outline-none text-base"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(x + 1, list.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(x - 1, 0)) }
              if (e.key === 'Enter' && list[i]) run(list[i])
            }} />
          <span className="kbd hidden sm:inline">esc</span>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {list.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{q}”.</li>}
          {list.map((c, idx) => (
            <li key={c.id} role="option" aria-selected={idx === i}>
              <button onMouseEnter={() => setI(idx)} onClick={() => run(c)}
                className={cx('w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors', idx === i ? 'bg-mint text-brand-ink' : 'hover:bg-surface-2')}>
                <span className={cx('grid place-items-center size-8 rounded-lg shrink-0', idx === i ? 'bg-brand text-white' : 'bg-surface-2 text-muted')}><Icon name={c.icon} size={15} /></span>
                <span className="min-w-0 flex-1"><span className="block font-semibold truncate">{c.label}</span>{c.hint && <span className="block text-xs text-muted truncate">{c.hint}</span>}</span>
                {idx === i && <Icon name="arrowR" size={14} className="text-brand-ink" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 px-4 py-2 border-t border-line text-[0.65rem] text-muted bg-surface-2/60">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> navigate</span><span><span className="kbd">↵</span> open</span>
        </div>
      </div>
    </div>
  )
}
