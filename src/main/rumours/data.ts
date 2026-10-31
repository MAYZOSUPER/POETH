import { promises as fs } from 'fs'
import { RUMOURS_DIR } from '@shared/rumours/schema'
import { loadRumours, type RumoursLoad } from '@shared/rumours/load'
import { resolveDataFile } from '../protocol'

// Данные «Слухов журнала» (S65): resources/data/poe2/rumours/rumours.json или обновлённый пакетом данных файл из
// userData/data (resolveDataFile; подпапка rumours — в DATA_SUBDIRS протокола). Читаем один раз за запуск: пакет
// данных применяется после перезапуска, как у остальных данных.

let cached: Promise<RumoursLoad> | null = null

export function getRumoursLoad(): Promise<RumoursLoad> {
  if (!cached) {
    cached = loadRumours(async (file) => {
      const abs = await resolveDataFile('poe2', RUMOURS_DIR, file)
      return abs ? fs.readFile(abs, 'utf8') : null
    }).then((load) => {
      for (const f of load.failed) console.warn(`[rumours] ${f.id ?? 'rumours.json'}: ${f.error}`)
      return load
    })
  }
  return cached
}
