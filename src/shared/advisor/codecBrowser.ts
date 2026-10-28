// Сжатие кода POETH1 в браузере (сайт): DecompressionStream / CompressionStream('deflate') — тот же формат, что zlib.
// Распаковка читает поток кусками и обрывает его, как только набралось больше предела (zip-бомба не
// разворачивается в память целиком).

import { CodeTooLargeError } from './codec'

async function readAll(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader()
  const parts: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new CodeTooLargeError()
    }
    parts.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

/** Пара потоков сжатия: типы CompressionStream в lib.dom и @types/node расходятся — приводим к общему виду. */
type Pair = { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes)
      c.close()
    }
  })
}

export function inflateBrowser(bytes: Uint8Array, maxBytes: number): Promise<Uint8Array> {
  return readAll(streamOf(bytes).pipeThrough(new DecompressionStream('deflate') as unknown as Pair), maxBytes)
}

export function deflateBrowser(bytes: Uint8Array): Promise<Uint8Array> {
  return readAll(streamOf(bytes).pipeThrough(new CompressionStream('deflate') as unknown as Pair), Number.MAX_SAFE_INTEGER)
}
