/// <reference types="electron-vite/node" />
import path from 'path'
import type { Worker } from 'worker_threads'
import type { Bitmap } from '@shared/ocr/bitmap'
import type { TableRead } from '@shared/ocr/read'
import { resourcesDir } from '../services/questDataset'
import createOcrWorker from './worker?nodeWorker'
import type { OcrRequest, OcrResponse } from './worker'

// Распознавание стакана в отдельном потоке (S28): поток создаётся при первом снимке, закрывается после
// 10 минут простоя (модель tesseract в памяти ~50 МБ). Один запрос за раз — хоткей не копит очередь.

const IDLE_MS = 10 * 60_000
/** первый снимок дольше: компиляция wasm и загрузка модели */
const TIMEOUT_MS = 10_000

let worker: Worker | null = null
let idle: NodeJS.Timeout | null = null
let seq = 0
const pending = new Map<number, (r: OcrResponse) => void>()

function stop(): void {
  if (idle) clearTimeout(idle)
  idle = null
  const w = worker
  worker = null
  for (const [id, done] of pending) done({ id, ok: false, error: 'ocr worker stopped' })
  pending.clear()
  void w?.terminate()
}

function getWorker(): Worker {
  if (worker) return worker
  const w = createOcrWorker({ workerData: { dir: path.join(resourcesDir(), 'ocr') } })
  w.on('message', (r: OcrResponse) => {
    pending.get(r.id)?.(r)
    pending.delete(r.id)
  })
  w.on('error', (e) => {
    console.error('[ocr] worker failed:', e)
    if (worker === w) stop()
  })
  w.on('exit', () => {
    if (worker === w) stop()
  })
  worker = w
  return w
}

/** Найти и прочитать стакан на снимке. table: null — таблицы нет. */
export function readBookImage(img: Bitmap, hint: number): Promise<{ table: TableRead | null; ms: number }> {
  const w = getWorker()
  if (idle) clearTimeout(idle)
  idle = setTimeout(stop, IDLE_MS)
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('ocr timeout'))
    }, TIMEOUT_MS)
    pending.set(id, (r) => {
      clearTimeout(timer)
      if (r.ok) resolve({ table: r.table, ms: r.ms })
      else reject(new Error(r.error))
    })
    const msg: OcrRequest = { id, img, hint }
    w.postMessage(msg, [img.data.buffer as ArrayBuffer])
  })
}

export function stopBookReader(): void {
  stop()
}
