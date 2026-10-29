import { parentPort, workerData } from 'worker_threads'
import type { Bitmap } from '@shared/ocr/bitmap'
import { readTable, type TableRead } from '@shared/ocr/read'
import { createOcrEngine, type OcrEngine } from './engine'

// Поток распознавания стакана (S28): разметка и tesseract — сотни миллисекунд счёта, не в главном потоке
// main. Распознаватель грузится при первом снимке и живёт, пока поток не закроют (reader.ts, простой 10 мин).

export interface OcrRequest {
  id: number
  img: Bitmap
  hint: number
}

export type OcrResponse = { id: number; ok: true; table: TableRead | null; ms: number } | { id: number; ok: false; error: string }

const port = parentPort
let engine: Promise<OcrEngine> | null = null

port?.on('message', async (msg: OcrRequest) => {
  try {
    engine ??= createOcrEngine((workerData as { dir: string }).dir)
    const e = await engine
    const t0 = Date.now()
    const table = readTable(msg.img, msg.hint, e.read)
    port.postMessage({ id: msg.id, ok: true, table, ms: Date.now() - t0 } satisfies OcrResponse)
  } catch (err) {
    engine = null
    port.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies OcrResponse)
  }
})
