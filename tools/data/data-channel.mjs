// Раскладка ветки `data` по играм (S12, S67). Общие правила для publish-data.mjs, push-data-branch.mjs и тестов.
//
// В корне ветки у каждой игры свой манифест и своя папка:
//   manifest.json        + poe1/…   — PoE 1 (адрес links.DATA_MANIFEST_URL читают все выпущенные версии POETH)
//   manifest-poe2.json   + poe2/…   — PoE 2 (S67; приложение берёт адрес рядом: shared/updates dataManifestUrl)
// Файлы пакета лежат в <game>/<путь из манифеста> — относительно манифеста, как и раньше.
// Публикация одной игры заменяет только её манифест и папку; пакет другой игры остаётся.

export const DATA_GAMES = ['poe1', 'poe2']

/** Имя манифеста игры в корне ветки `data` (то же — shared/updates.ts dataManifestUrl). */
export function manifestName(game) {
  return game === 'poe1' ? 'manifest.json' : `manifest-${game}.json`
}

/** Какой игре принадлежит запись в корне ветки (манифест или папка игры); null — общая (README.md и т. п.). */
export function ownerOf(entry) {
  for (const g of DATA_GAMES) if (entry === g || entry === manifestName(g)) return g
  return null
}

/** Записи корня ветки, которые удаляются перед выпуском пакетов `games`: всё, кроме пакетов других игр. */
export function entriesToReplace(entries, games) {
  return entries.filter((e) => e !== '.git' && !(ownerOf(e) && !games.includes(ownerOf(e))))
}
