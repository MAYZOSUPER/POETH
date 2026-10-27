// FNV-1a 32 бит по байтам UTF-8 — тот же хэш, что `@sindresorhus/fnv1a` (size 32) в Awakened PoE Trade.
// Ключи индексов *.index.bin строит tools/data/sync-apt-data.mjs (там своя копия функции).

const encoder = new TextEncoder()

export function fnv1a32(str: string): number {
  const bytes = encoder.encode(str)
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
