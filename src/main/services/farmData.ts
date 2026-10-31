import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { FarmRules } from '@shared/farm/zones'
import { POE2_FARM_AREAS_FILE, POE2_FARM_DIR, normalizePoe2FarmAreas, poe2FarmRules } from '@shared/farm/zonesPoe2'
import { resourcesDir } from './questDataset'

// Данные трекера карт PoE 2 (S69): виды областей resources/data/poe2/farm/areas.json — или файл из пакета
// данных в userData/data/poe2/farm/ (пакет кладёт туда всё дерево данных игры; применяется после
// перезапуска). Только чтение с диска, сети нет. Файла нет или он битый — виды областей по шаблонам.

export async function loadPoe2FarmRules(): Promise<FarmRules> {
  const roots = [path.join(app.getPath('userData'), 'data'), path.join(resourcesDir(), 'data')]
  for (const root of roots) {
    const file = path.join(root, 'poe2', POE2_FARM_DIR, POE2_FARM_AREAS_FILE)
    try {
      const data = normalizePoe2FarmAreas(JSON.parse(await fs.readFile(file, 'utf8')))
      if (data) return poe2FarmRules(data)
      console.warn(`[farm] ${file}: не тот формат`)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.warn(`[farm] ${file}:`, e)
    }
  }
  console.warn('[farm] виды областей PoE 2 не найдены — по шаблонам id')
  return poe2FarmRules(null)
}
