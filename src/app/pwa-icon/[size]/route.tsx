import { iconImage } from '@/lib/icon-image'

export function generateStaticParams() { return [{ size: '192' }, { size: '512' }, { size: 'maskable' }] }

export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params
  if (size === 'maskable') return iconImage(512, true)
  const n = size === '192' ? 192 : 512
  return iconImage(n)
}
