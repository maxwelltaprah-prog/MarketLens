/** Pivot-friendly date breakdown for exports. ISO week number, month name, weekday. */
export function dateParts(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`)
  const year = d.getUTCFullYear(), month = d.getUTCMonth() + 1
  const t = new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7)
  return {
    year, month, monthName: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }), yearMonth: iso.slice(0, 7),
    week: `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, weekday: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }), day: d.getUTCDate(),
  }
}
export const DATE_HEADERS = ['Date', 'Year', 'Month', 'Month name', 'Year-Month', 'ISO week', 'Weekday', 'Day']
export const dateRow = (iso: string) => { const p = dateParts(iso); return [iso, p.year, p.month, p.monthName, p.yearMonth, p.week, p.weekday, p.day] }
