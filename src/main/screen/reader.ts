/// <reference types="electron-vite/node" />
import path from 'path'
import type { Worker } from 'worker_threads'
import type { Bitmap } from '@shared/ocr/bitmap'
import type { StashResult } from '@shared/screen/recognize'
import { resourcesDir } from '../services/questDataset'
import createScreenWorker from './worker?nodeWorker'
import type { ScreenWorkerIn, ScreenWorkerOut } from './worker'

// Поток распознавания окон (S68): создаётся при первом снимке, закрывается после 10 минут простоя (эталоны иконок
// и tesseract в памяти). Один запрос за раз — хоткей не копит очередь.

const IDLE_MS = 10 * 60_000
/** первый снимок дольше: компиляция wasm распознавателя цифр */
const TIMEOUT_MS = 15_000

let worker: Worker | null = null
let idle: NodeJS.Timeout | null = null
let seq = 0
/** игры, эталоны которых поток уже получил (ключ — игра и версия эталонов) */
const sent = new Set<string>()
const pending = new Map<number, (r: ScreenWorkerOut) => void>()

function stop(): void {
  if (idle) clearTimeout(idle)
  idle = null
  const w = worker
  worker = null
  sent.clear()
  for (const [id, done] of pending) done({ id, ok: false, error: 'screen worker stopped' })
  pending.clear()
  void w?.terminate()
}

function getWorker(): Worker {
  if (worker) return worker
  const w = createScreenWorker({ workerData: { ocrDir: path.join(resourcesDir(), 'ocr') } })
  w.on('message', (r: ScreenWorkerOut) => {
    pending.get(r.id)?.(r)
    pending.delete(r.id)
  })
  w.on('error', (e) => {
    console.error('[screen] worker failed:', e)
    if (worker === w) stop()
  })
  w.on('exit', () => {
    if (worker === w) stop()
  })
  worker = w
  return w
}

export interface GamePack {
  game: string
  /** версия эталонов (новые иконки — новая версия) */
  version: string
  /** эскизы иконок (encodeThumbs, без сжатия) */
  thumbs: Uint8Array
  layouts: unknown
  digits: unknown
}

/** Распознать снимок; эталоны игры уходят в поток один раз. */
export function readScreenImage(img: Bitmap, clientHeight: number, pack: GamePack): Promise<Omit<StashResult, 'debug'>> {
  const w = getWorker()
  if (idle) clearTimeout(idle)
  idle = setTimeout(stop, IDLE_MS)
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('screen timeout'))
    }, TIMEOUT_MS)
    pending.set(id, (r) => {
      clearTimeout(timer)
      if (r.ok) resolve(r.result)
      else reject(new Error(r.error))
    })
    const key = `${pack.game}:${pack.version}`
    if (!sent.has(key)) {
      const game: ScreenWorkerIn = { type: 'game', game: pack.game, thumbs: pack.thumbs, layouts: pack.layouts, digits: pack.digits }
      w.postMessage(game)
      sent.add(key)
    }
    const msg: ScreenWorkerIn = { type: 'read', id, game: pack.game, img, clientHeight }
    w.postMessage(msg, [img.data.buffer as ArrayBuffer])
  })
}

export function stopScreenReader(): void {
  stop()
}
