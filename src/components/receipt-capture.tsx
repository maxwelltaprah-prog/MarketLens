'use client'
import type { ReceiptBlob } from '@/lib/offline-db'

const MAX_SIDE = 1600, QUALITY = 0.72, MAX_BYTES = 450_000

/** Shrinks a photo on the device: long side ≤ 1600px, JPEG. Receipts stay legible and the upload stays small, even on 2G. */
export async function compressImage(file: File): Promise<ReceiptBlob> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('unreadable')
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  let q = QUALITY, dataUrl = canvas.toDataURL('image/jpeg', q)
  while (dataUrl.length * 0.75 > MAX_BYTES && q > 0.4) { q -= 0.1; dataUrl = canvas.toDataURL('image/jpeg', q) }
  const data = dataUrl.split(',')[1]
  return { clientId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`, mime: 'image/jpeg', data, bytes: Math.round(data.length * 0.75), width: w, height: h, capturedAt: new Date().toISOString() }
}

