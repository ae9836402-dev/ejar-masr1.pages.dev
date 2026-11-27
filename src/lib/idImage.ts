/** Shrinks an ID photo in the browser before upload: one JPEG under ~280 KB (the server accepts up to 300 KB). Pure helpers are exported for tests. */
export const ID_TARGET_BYTES = 280_000

/** Largest size that keeps the aspect ratio and fits in `max` x `max` (never enlarges). */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}
/** Decoded size of a base64 data URL. */
export const dataUrlBytes = (u: string): number => Math.floor(((u.length - (u.indexOf(',') + 1)) * 3) / 4)

async function load(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('bad image')); i.src = url })
  } finally { URL.revokeObjectURL(url) }
}

/** Resizes and re-encodes as JPEG, lowering quality then size until it fits. Throws if the file is not a readable image. */
export async function toJpegDataUrl(file: File, maxBytes: number = ID_TARGET_BYTES): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('not an image')
  const img = await load(file)
  for (let side = 1400; side >= 600; side = Math.round(side * 0.8)) {
    const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, side)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d'); if (!ctx) throw new Error('no canvas')
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h)
    for (let q = 0.85; q >= 0.45; q -= 0.1) { const u = c.toDataURL('image/jpeg', q); if (dataUrlBytes(u) <= maxBytes) return u }
  }
  throw new Error('too large')
}
