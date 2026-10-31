import { parentPort, workerData } from 'worker_threads'
import type { Bitmap } from '@shared/ocr/bitmap'
import { parseDigitSet, type DigitSet } from '@shared/screen/digits'
import { describe, type IconDesc } from '@shared/screen/icons'
import { parseLayoutSet, type LayoutSet } from '@shared/screen/layout'
import { recognizeStash, type StashResult } from '@shared/screen/recognize'
import { readStack } from '@shared/screen/stack'
import { decodeThumbs } from '@shared/screen/thumbs'
import { createOcrEngine, type OcrEngine } from '../ocr/engine'

// Поток распознавания окон игры (S68): поиск ячеек, сравнение с иконками и числа стопок — сотни миллисекунд счёта,
// не в главном потоке main. Эталоны игры (эскизы иконок, раскладки, образцы цифр) присылаются один раз на игру;
// распознаватель цифр S28 (tesseract) грузится при первом снимке. Поток закрывает reader.ts после простоя.

export type ScreenWorkerIn =
  | { type: 'game'; game: string; thumbs: Uint8Array; layouts: unknown; digits: unknown }
  | { type: 'read'; id: number; game: string; img: Bitmap; clientHeight: number }

export type ScreenWorkerOut = { id: number; ok: true; result: Omit<StashResult, 'debug'> } | { id: number; ok: false; error: string }

interface GameData {
  icons: IconDesc[]
  layouts: LayoutSet | null
  digits: DigitSet | null
}

const port = parentPort
const games = new Map<string, GameData>()
let engine: Promise<OcrEngine> | null = null

port?.on('message', async (msg: ScreenWorkerIn) => {
  if (msg.type === 'game') {
    const thumbs = decodeThumbs(msg.thumbs) ?? []
    games.set(msg.game, { icons: thumbs.map((t) => describe(t)), layouts: parseLayoutSet(msg.layouts), digits: parseDigitSet(msg.digits) })
    return
  }
  try {
    const g = games.get(msg.game)
    if (!g) throw new Error('screen: no game data')
    engine ??= createOcrEngine((workerData as { ocrDir: string }).ocrDir)
    // без распознавателя (файлы повреждены) числа читаются только по образцам цифр
    const ocr = await engine.catch(() => null)
    const { debug: _debug, ...result } = recognizeStash({
      img: msg.img,
      clientHeight: msg.clientHeight,
      icons: g.icons,
      layouts: g.layouts,
      readCount: (img, cell) => readStack(img, cell, ocr ? ocr.read : null, g.digits)
    })
    port.postMessage({ id: msg.id, ok: true, result } satisfies ScreenWorkerOut)
  } catch (err) {
    port.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) } satisfies ScreenWorkerOut)
  }
})
