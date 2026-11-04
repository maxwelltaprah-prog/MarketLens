import { ImageResponse } from 'next/og'

export function iconImage(size: number, maskable = false) {
  const inner = Math.round(size * (maskable ? 0.5 : 0.58))
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#123e30', borderRadius: maskable ? 0 : size * 0.22 }}>
        <svg width={inner} height={inner} viewBox="0 0 24 24" fill="none" stroke="#cfe27c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.6 5.3-7" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  )
}
