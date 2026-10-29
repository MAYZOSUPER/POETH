import { app } from 'electron'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import type { ItemLang } from '@shared/types'
import { captureFileName } from './captureName'
import { devEnv } from '../devEnv'

// Dev-флаг POETH_SAVE_CAPTURES=1: каждый захваченный по Ctrl+D текст предмета
// сохраняется в userData/captures/<lang>/<дата>-<время>-<название>.txt — заготовки
// фикстур для парсера (S2) и прайс-чека (S4). Текст пишется как есть (CRLF игры).

export function isCaptureLogEnabled(): boolean {
  return devEnv('POETH_SAVE_CAPTURES') === '1'
}

/** Сохранить захват (ошибки только в лог — захват не должен из-за этого падать). */
export async function saveCapture(text: string, lang: ItemLang, at = new Date()): Promise<string | null> {
  if (!isCaptureLogEnabled()) return null
  try {
    const dir = path.join(app.getPath('userData'), 'captures', lang)
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, captureFileName(text, at))
    await writeFile(file, text, 'utf8')
    console.log(`[capture] saved ${file}`)
    return file
  } catch (e) {
    console.error('[capture] save failed:', e)
    return null
  }
}
