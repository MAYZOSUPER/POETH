import { app, nativeImage, screen } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { crop, type Bitmap, type Rect } from '@shared/ocr/bitmap'
import { getOverlayStatus } from '../windows/gameOverlay'

// Снимок стакана у курсора (S28). Только по хоткею: копия клиентской области окна игры с экрана
// (electron-overlay-window, OverlayController.screenshot — BitBlt рабочего стола, как OCR гемов в APT),
// сразу вырезаем небольшую область у курсора, остальное отбрасываем. Ничего не нажимаем в игре, память и
// процесс игры не трогаем; картинка живёт только в памяти и в сеть не уходит. На диск — только в dev-режиме
// сбора фикстур (POETH_OCR_FIXTURES=1) в свой профиль.

/** Высота цифр стакана при высоте окна 1080 точек (интерфейс PoE масштабируется по высоте). */
const GLYPH_AT_1080 = 13

export interface BookShot {
  img: Bitmap
  /** ожидаемая высота цифр, точки снимка */
  hint: number
  /** курсор на снимке (физические точки) — для отладки */
  cursor: { x: number; y: number }
}

export type ShotFail = 'no-game' | 'error'

/**
 * Область вокруг курсора: «Рыночный курс» — над таблицей, таблица ниже и шире подписи. С запасом по всем
 * сторонам — разметка (shared/ocr/segment) сама найдёт таблицу среди остального окна обмена.
 */
export function bookArea(cursor: { x: number; y: number }, hint: number): Rect {
  return { x: cursor.x - hint * 22, y: cursor.y - hint * 8, width: hint * 44, height: hint * 34 }
}

export function captureBook(): BookShot | ShotFail {
  const st = getOverlayStatus()
  const b = st.bounds
  if (process.platform !== 'win32' || !st.attached || !b || b.width < 100 || b.height < 100) return 'no-game'
  // курсор — в физических точках экрана, как границы окна игры (учтён масштаб Windows 100/125/150 %)
  const cur = screen.dipToScreenPoint(screen.getCursorScreenPoint())
  const cursor = { x: Math.round(cur.x - b.x), y: Math.round(cur.y - b.y) }
  if (cursor.x < 0 || cursor.y < 0 || cursor.x >= b.width || cursor.y >= b.height) return 'no-game'
  try {
    // тот же модуль, что прицепил оверлей к игре (require закэширован), — снимок его окна
    const { OverlayController } = require('electron-overlay-window') as typeof import('electron-overlay-window')
    const data = OverlayController.screenshot()
    if (data.length !== b.width * b.height * 4) return 'error'
    const hint = (GLYPH_AT_1080 * b.height) / 1080
    const img = crop({ width: b.width, height: b.height, data }, bookArea(cursor, hint))
    return { img, hint, cursor }
  } catch (e) {
    console.error('[ocr] screenshot failed:', e)
    return 'error'
  }
}

/**
 * Dev: сохранить снимок в свой профиль (сбор фикстур для tests/fixtures/ocr). PNG собирается сразу, до первого
 * await: буфер снимка следом уходит в поток распознавания (transfer) и здесь становится пустым.
 */
export async function saveFixtureShot(shot: BookShot): Promise<void> {
  if (process.env.POETH_OCR_FIXTURES !== '1') return
  const png = nativeImage
    .createFromBitmap(Buffer.from(shot.img.data.buffer, shot.img.data.byteOffset, shot.img.data.byteLength), {
      width: shot.img.width,
      height: shot.img.height
    })
    .toPNG()
  const dir = path.join(app.getPath('userData'), 'ocr-fixtures')
  await fs.mkdir(dir, { recursive: true })
  const name = `book-${new Date().toISOString().replace(/[:.]/g, '-')}-h${Math.round(shot.hint)}.png`
  await fs.writeFile(path.join(dir, name), png)
  console.log(`[ocr] fixture saved: ${name}`)
}
