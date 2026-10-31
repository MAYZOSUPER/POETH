import { app, nativeImage } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { crop, type Bitmap } from '@shared/ocr/bitmap'
import { isGameFocused, isOverlayActive } from '../focus/gameFocus'
import { getOverlayStatus } from '../windows/gameOverlay'
import { devEnv } from '../devEnv'

// Снимок окна игры для цен поверх окон (S68). Только по хоткею игрока: копия клиентской области
// (electron-overlay-window, OverlayController.screenshot — BitBlt рабочего стола, как у S28 и S38), до того как
// подписи появятся на экране. Живёт только в памяти, на диск и в сеть не уходит; в игру ничего не шлём, память и
// процесс игры не трогаем. На диск — только в dev-режиме сбора образцов (POETH_OCR_FIXTURES=1, как у S28; в
// собранной версии переменная не действует) в свой профиль, папка screen-fixtures.

/**
 * Что вырезаем из кадра сразу: левая часть окна шириной REGION_W высот — там тайник и окна Ритуала и торговцев
 * (интерфейс игры раскладывается по высоте окна). Остальной кадр не копируется.
 */
export const REGION_W = 1.0

export interface ScreenShot {
  /** левая часть клиентской области: от (0, 0), координаты те же, что у окна */
  img: Bitmap
  client: { width: number; height: number }
  /** мс на снимок */
  ms: number
}

/**
 * Снимок клиентской области игры; null — игры нет, она не в фокусе или снимок не вышел. Без фокуса игры (и не
 * в активном оверлее) поверх неё может быть браузер или Discord — такой кадр не снимаем.
 */
export function captureScreen(): ScreenShot | null {
  const st = getOverlayStatus()
  const b = st.bounds
  if (process.platform !== 'win32' || !st.attached || !b || b.width < 100 || b.height < 100) return null
  if (!isGameFocused() && !isOverlayActive()) return null
  try {
    const t0 = performance.now()
    const { OverlayController } = require('electron-overlay-window') as typeof import('electron-overlay-window')
    const data = OverlayController.screenshot()
    if (data.length !== b.width * b.height * 4) return null
    // вырез — свой буфер: уходит в поток распознавания (transfer), общий буфер Node отдавать нельзя
    const img = crop({ width: b.width, height: b.height, data }, { x: 0, y: 0, width: Math.min(b.width, Math.round(b.height * REGION_W)), height: b.height })
    return { img, client: { width: b.width, height: b.height }, ms: performance.now() - t0 }
  } catch (e) {
    console.error('[screen] screenshot failed:', e)
    return null
  }
}

/**
 * Dev: сохранить снимок в свой профиль (образцы для tests/fixtures/screen). PNG собирается сразу, до передачи
 * буфера в поток распознавания.
 */
export async function saveScreenFixture(shot: ScreenShot): Promise<void> {
  if (devEnv('POETH_OCR_FIXTURES') !== '1') return
  const { img } = shot
  const png = nativeImage
    .createFromBitmap(Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength), { width: img.width, height: img.height })
    .toPNG()
  const dir = path.join(app.getPath('userData'), 'screen-fixtures')
  await fs.mkdir(dir, { recursive: true })
  const name = `screen-${new Date().toISOString().replace(/[:.]/g, '-')}-${img.width}x${img.height}.png`
  await fs.writeFile(path.join(dir, name), png)
  console.log(`[screen] fixture saved: ${name}`)
}
