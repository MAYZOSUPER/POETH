// Пакет эскизов иконок (S68, чистый модуль): кэш main в userData и фикстуры тестов. Формат v1:
// 'PTH1' · uint32 LE длина заголовка · заголовок JSON { size, items: [{ name, art, w, h }] } · RGBA эскизов подряд.
// Сжатие (deflate) — снаружи: здесь только байты, без Node.

import type { IconThumb } from './icons'

const MAGIC = 'PTH1'

export function encodeThumbs(thumbs: readonly IconThumb[]): Uint8Array {
  const size = thumbs[0]?.size ?? 0
  if (thumbs.some((t) => t.size !== size || t.rgba.length !== size * size * 4)) throw new Error('thumbs: mixed sizes')
  const head = new TextEncoder().encode(JSON.stringify({ size, items: thumbs.map((t) => ({ name: t.name, art: t.art, w: t.w, h: t.h })) }))
  const block = size * size * 4
  const out = new Uint8Array(8 + head.length + block * thumbs.length)
  for (let i = 0; i < 4; i++) out[i] = MAGIC.charCodeAt(i)
  new DataView(out.buffer).setUint32(4, head.length, true)
  out.set(head, 8)
  thumbs.forEach((t, i) => out.set(t.rgba, 8 + head.length + i * block))
  return out
}

/** Байты пакета → эскизы; null — не тот формат или обрезан. */
export function decodeThumbs(buf: Uint8Array): IconThumb[] | null {
  if (buf.length < 8 || String.fromCharCode(...buf.subarray(0, 4)) !== MAGIC) return null
  const len = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(4, true)
  if (8 + len > buf.length) return null
  let head: { size?: unknown; items?: unknown }
  try {
    head = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + len))) as typeof head
  } catch {
    return null
  }
  const size = Number(head.size)
  if (!(size > 0 && size <= 64) || !Array.isArray(head.items)) return null
  const block = size * size * 4
  if (8 + len + block * head.items.length > buf.length) return null
  const out: IconThumb[] = []
  head.items.forEach((it: { name?: unknown; art?: unknown; w?: unknown; h?: unknown }, i: number) => {
    if (typeof it?.name !== 'string' || typeof it.art !== 'string') return
    const from = 8 + len + i * block
    out.push({
      name: it.name,
      art: it.art,
      w: Number(it.w) || 1,
      h: Number(it.h) || 1,
      size,
      rgba: buf.slice(from, from + block)
    })
  })
  return out
}
