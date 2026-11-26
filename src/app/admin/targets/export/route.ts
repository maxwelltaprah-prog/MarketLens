import { getCurrentUser } from '@/lib/session'
import { getTargetGrid, thisMonth, MONTH } from '@/lib/targets'
import { buildXlsx, XLSX_MIME } from '@/lib/xlsx'

export const dynamic = 'force-dynamic'

/** Excel: target vs actual per promoter and brand, matching the incentive sheet layout. */
export async function GET(req: Request) {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') return new Response('Unauthorized', { status: 401 })
  const m = new URL(req.url).searchParams.get('month') ?? ''
  const month = MONTH.test(m) ? m : thisMonth()
  const g = await getTargetGrid(month)
  const header = ['Region', 'Promoter', 'Phone', 'Outlet', ...g.brands.flatMap((b) => [`${b.name} target`, `${b.name} sold`, `${b.name} %`]), 'Total target', 'Total sold', 'Achieved %', 'Incentive', 'Incentive earned']
  const rows = g.rows.map((r) => [r.region, r.name, r.phone, r.outlet,
    ...g.brands.flatMap((b) => { const t = r.targets[b.id] ?? 0, a = r.actual[b.id] ?? 0; return [t, a, t ? Math.round((a / t) * 100) : null] }),
    r.totalTarget, r.totalActual, r.totalTarget ? Math.round((r.totalActual / r.totalTarget) * 100) : null, r.incentive, r.incentive != null && r.totalTarget > 0 && r.totalActual >= r.totalTarget ? r.incentive : 0])
  const wb = buildXlsx([
    { name: `Targets ${month}`, header, rows },
    { name: 'Info', header: ['Setting', 'Value'], rows: [['Month', month], ['Days elapsed', g.elapsed], ['Days in month', g.range.days], ['Exported', new Date().toISOString()], ['Exported by', user.name]] },
  ])
  return new Response(new Uint8Array(wb), { headers: { 'Content-Type': XLSX_MIME, 'Content-Disposition': `attachment; filename="marketlens-targets_${month}.xlsx"`, 'Cache-Control': 'no-store' } })
}
