// Цены PoE 2 (S67): загрузка снимка poe.ninja для лиги игрока из данных PoE 2.
//
// Чтение файла передаётся снаружи (shared без fs и electron):
//   main (надстройка обновлений → встроенные данные, как protocol.ts / ipc/flip.ts):
//     const dirs = [path.join(app.getPath('userData'), 'data', 'poe2'), path.join(resourcesDir(), 'data', 'poe2')]
//     const read = async (rel: string) => {
//       for (const d of dirs) { try { return await fs.readFile(path.join(d, rel), 'utf8') } catch { /* дальше */ } }
//       return null
//     }
//     const prices = await loadPoe2Prices(read, getEffectiveLeague())   // id лиги trade2 = id лиги poe.ninja
//   renderer: fetch('poeth://data/poe2/prices/<file>') — после того как лид добавит 'prices' в DATA_SUBDIRS
//     протокола (src/main/protocol.ts, заморожен; дифф — S67-frozen.diff в заметках лида).
//
// Снимок меняется только с пакетом данных (CI → ветка data → обновление без переустановки), так что кэшировать
// результат можно до перезапуска; файлы — до ~200 КБ на лигу.

import { POE2_PRICES_DIR, POE2_PRICES_INDEX, parsePoe2PriceIndex, parsePoe2PriceSnapshot, pickLeague, type Poe2PriceMatch } from './snapshot'
import { Poe2PriceTable } from './table'

/** Прочитать файл данных PoE 2 по относительному пути ('prices/index.json'); нет файла — null. */
export type Poe2DataReader = (relPath: string) => Promise<string | null>

export interface LoadedPoe2Prices {
  table: Poe2PriceTable
  /** лига, которую спросили */
  requested: string
  /** лига снимка (при match ≠ 'exact' — другая: показывайте «цены лиги …») */
  league: string
  match: Poe2PriceMatch
  /** когда CI снял цены (мс) */
  at: number
}

/** Старше этого — показывать «цены от <дата>» с предупреждением. */
export const POE2_PRICES_STALE_MS = 7 * 24 * 60 * 60 * 1000

export function isPricesStale(at: number, now = Date.now()): boolean {
  return now - at > POE2_PRICES_STALE_MS
}

async function readJson(read: Poe2DataReader, rel: string): Promise<unknown> {
  try {
    const text = await read(rel)
    return text === null ? null : JSON.parse(text)
  } catch {
    return null
  }
}

/**
 * Снимок цен для лиги игрока ('auto' или пусто — текущая временная лига). Нет снимка или он битый — null:
 * функция работает без цен (показывайте «цен нет»), ошибки не бросаются.
 */
export async function loadPoe2Prices(read: Poe2DataReader, league: string | null | undefined): Promise<LoadedPoe2Prices | null> {
  const index = parsePoe2PriceIndex(await readJson(read, POE2_PRICES_INDEX))
  if (!index) return null
  const pick = pickLeague(index, league)
  if (!pick) return null
  const snap = parsePoe2PriceSnapshot(await readJson(read, `${POE2_PRICES_DIR}/${pick.entry.file}`))
  if (!snap || !snap.lines.length) return null
  return { table: new Poe2PriceTable(snap), requested: (league ?? '').trim(), league: snap.league, match: pick.match, at: snap.at }
}
