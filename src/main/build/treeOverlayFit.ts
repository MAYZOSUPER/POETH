/// <reference types="electron-vite/node" />
import { screen } from 'electron'
import type { Worker } from 'worker_threads'
import type { ClientSize, Point, TreeView } from '@shared/build/treeOverlay'
import type { FitPoint, FitResult } from '@shared/build/treeOverlayMatch'
import type { Bitmap } from '@shared/ocr/bitmap'
import { getOverlayStatus } from '../windows/gameOverlay'
import createFitWorker from './treeOverlayFitWorker?nodeWorker'
import type { FitRequest, FitResponse } from './treeOverlayFitWorker'

// Автоподгонка дерева по снимку окна игры (S38). Снимок — только по хоткею игрока (Alt+P), до того как
// наложение появилось на экране: копия клиентской области (electron-overlay-window, OverlayController.screenshot —
// BitBlt рабочего стола, как у S28). Живёт только в памяти, на диск и в сеть не уходит; в игру ничего не шлём,
// память и процесс игры не трогаем. Счёт — в отдельном потоке; один запрос за раз.

const IDLE_MS = 2 * 60_000
const TIMEOUT_MS = 5_000

export interface TreeShot {
  img: Bitmap
  client: ClientSize
  /** курсор, точки клиентской области */
  cursor: Point | null
}

/** Снимок клиентской области игры; null — игры нет или снимок не вышел. */
export function captureTreeShot(): TreeShot | null {
  const st = getOverlayStatus()
  const b = st.bounds
  if (process.platform !== 'win32' || !st.attached || !b || b.width < 100 || b.height < 100) return null
  try {
    const { OverlayController } = require('electron-overlay-window') as typeof import('electron-overlay-window')
    const data = OverlayController.screenshot()
    if (data.length !== b.width * b.height * 4) return null
    // свой буфер: снимок уходит в поток подгонки (transfer), общий буфер Node отдавать нельзя
    const img = { width: b.width, height: b.height, data: new Uint8Array(data) }
    const cur = screen.dipToScreenPoint(screen.getCursorScreenPoint())
    const cursor = { x: cur.x - b.x, y: cur.y - b.y }
    const inside = cursor.x >= 0 && cursor.y >= 0 && cursor.x < b.width && cursor.y < b.height
    return { img, client: { width: b.width, height: b.height }, cursor: inside ? cursor : null }
  } catch (e) {
    console.error('[buildTree] screenshot failed:', e)
    return null
  }
}

let worker: Worker | null = null
let sentPoints = false
let idle: NodeJS.Timeout | null = null
let seq = 0
const pending = new Map<number, (r: FitResponse) => void>()

function stop(): void {
  if (idle) clearTimeout(idle)
  idle = null
  const w = worker
  worker = null
  sentPoints = false
  for (const [id, done] of pending) done({ id, ok: false, error: 'fit worker stopped' })
  pending.clear()
  void w?.terminate()
}

function getWorker(): Worker {
  if (worker) return worker
  const w = createFitWorker({})
  w.on('message', (r: FitResponse) => {
    pending.get(r.id)?.(r)
    pending.delete(r.id)
  })
  w.on('error', (e) => {
    console.error('[buildTree] fit worker failed:', e)
    if (worker === w) stop()
  })
  w.on('exit', () => {
    if (worker === w) stop()
  })
  worker = w
  return w
}

/** Подогнать наложение по снимку около подсказок. */
export function fitTreeShot(shot: TreeShot, points: () => FitPoint[], priors: TreeView[]): Promise<FitResult | null> {
  const w = getWorker()
  if (idle) clearTimeout(idle)
  idle = setTimeout(stop, IDLE_MS)
  const id = ++seq
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('fit timeout'))
    }, TIMEOUT_MS)
    pending.set(id, (r) => {
      clearTimeout(timer)
      if (r.ok) resolve(r.result)
      else reject(new Error(r.error))
    })
    const msg: FitRequest = { id, img: shot.img, client: shot.client, priors, cursor: shot.cursor }
    if (!sentPoints) {
      msg.points = points()
      sentPoints = true
    }
    w.postMessage(msg, [shot.img.data.buffer as ArrayBuffer])
  })
}

export function stopTreeFit(): void {
  stop()
}
