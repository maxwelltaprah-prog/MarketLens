const SYMBOL: Record<string, string> = { GHS: 'GH₵', NGN: '₦', USD: '$', EUR: '€', GBP: '£', XOF: 'CFA' }
export const currencySymbol = (c: string) => SYMBOL[c] ?? c
export const money = (n: number | string | null | undefined, c = 'GHS') =>
  n == null || n === '' ? '-' : `${currencySymbol(c)} ${Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const TZ = 'Africa/Accra'
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
export const addDaysISO = (iso: string, d: number) => {
  const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10)
}
export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
export const fmtTime = (d: Date | string | null) =>
  d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '-'
export const greeting = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: TZ }).format(new Date()))
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/** Ghana numbers: accepts 054 123 4567, 0541234567, +233541234567, 541234567 */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[^\d]/g, '')
  if (d.startsWith('233')) d = d.slice(3)
  if (d.length === 9) d = '0' + d
  return /^0\d{9}$/.test(d) ? d : null
}
