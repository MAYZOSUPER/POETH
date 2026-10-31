import { app, nativeImage } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { Bitmap } from '@shared/ocr/bitmap'
import { getOverlayStatus } from '../windows/gameOverlay'
import { devEnv } from '../devEnv'

// Снимок окна игры для цен поверх окон (S68). Только по хоткею игрока: копия клиентской области
// (electron-overlay-window, OverlayController.screenshot — BitBlt рабочего стола, как у S28 и S38), до того как
// подписи появятся на экране. Живёт только в памяти, на диск и в сеть не уходит; в игру ничего не шлём, память и
// процесс игры не трогаем. На диск — только в dev-режиме сбора образцов (POETH_OCR_FIXTURES=1, как у S28; в
// собранной версии переменная не действует) в свой профиль, папка screen-fixtures.

export interface ScreenShot {
  img: Bitmap
  client: { width: number; height: number }
  /** мс на снимок */
  ms: number
}

/** Снимок клиентской области игры; null — игры нет или снимок не вышел. */
export function captureScreen(): ScreenShot | null {
  const st = getOverlayStatus()
  const b = st.bounds
  if (process.platform !== 'win32' || !st.attached || !b || b.width < 100 || b.height < 100) return null
  try {
    const t0 = performance.now()
    const { OverlayController } = require('electron-overlay-window') as typeof import('electron-overlay-window')
    const data = OverlayController.screenshot()
    if (data.length !== b.width * b.height * 4) return null
    // свой буфер: снимок уходит в поток распознавания (transfer), общий буфер Node отдавать нельзя
    const img = { width: b.width, height: b.height, data: new Uint8Array(data) }
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
