import { parentPort } from 'worker_threads'
import type { ClientSize, Point, TreeView } from '@shared/build/treeOverlay'
import { fitTree, type FitPoint, type FitResult } from '@shared/build/treeOverlayMatch'
import type { Bitmap } from '@shared/ocr/bitmap'

// Поток автоподгонки дерева по снимку (S38): сотни миллисекунд счёта — не в главном потоке main. Ноды дерева
// приходят с первым запросом и живут, пока поток не закроют (treeOverlayFit.ts, простой 2 мин).

export interface FitRequest {
  id: number
  img: Bitmap
  client: ClientSize
  priors: TreeView[]
  cursor: Point | null
  /** ноды для подгонки — только в первом запросе потока */
  points?: FitPoint[]
}

export type FitResponse = { id: number; ok: true; result: FitResult | null } | { id: number; ok: false; error: string }

const port = parentPort
let points: FitPoint[] = []

port?.on('message', (msg: FitRequest) => {
  try {
    if (msg.points) points = msg.points
    const result = fitTree({ img: msg.img, client: msg.client, points, priors: msg.priors, cursor: msg.cursor })
    port.postMessage({ id: msg.id, ok: true, result } satisfies FitResponse)
  } catch (err) {
    port.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies FitResponse)
  }
})
