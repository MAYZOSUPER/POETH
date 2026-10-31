// Раскладка ветки `data` по играм (S12, S67). Общие правила для publish-data.mjs, push-data-branch.mjs и тестов.
//
// В корне ветки у каждой игры свой манифест и своя папка:
//   manifest.json        + poe1/…   — PoE 1 (адрес links.DATA_MANIFEST_URL читают все выпущенные версии POETH)
//   manifest-poe2.json   + poe2/…   — PoE 2 (S67; приложение берёт адрес рядом: shared/updates dataManifestUrl)
// Файлы пакета лежат в <game>/<путь из манифеста> — относительно манифеста, как и раньше.
// Публикация одной игры заменяет только её манифест и папку; пакет другой игры остаётся.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const DATA_GAMES = ['poe1', 'poe2']
/** версий файла в `prev` манифеста — не больше (приложение принимает до 200) */
export const MAX_PREV = 100

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

/** Файлы вне prices/, которые отличаются между пакетами (добавлены, удалены, другое содержимое) — S67. */
export function nonPriceChanges(baseFiles, files) {
  const keys = new Set([...Object.keys(baseFiles), ...Object.keys(files)])
  return [...keys].filter((k) => !k.startsWith('prices/') && baseFiles[k]?.sha256 !== files[k]?.sha256).sort()
}

// ---------------------------------------------------------------- прежние версии файлов (S67, `prev` манифеста)

/**
 * Прежние версии файла для манифеста: `history` — sha256 его версий в git (новые первыми), `sha` — версия в пакете.
 * Версия есть в истории — берутся те, что старше неё; нет (снимок цен из CI, правка без коммита) — вся история:
 * пакет новее любой закоммиченной версии.
 */
export function prevVersions(history, sha, max = MAX_PREV) {
  const i = history.indexOf(sha)
  const older = i >= 0 ? history.slice(i + 1) : history
  return [...new Set(older.filter((h) => h !== sha))].slice(0, max)
}

const git = (root, args, opts = {}) => execFileSync('git', args, { cwd: root, maxBuffer: 1 << 28, ...opts })

/** История git не обрезана (shallow) до коммитов текущей ветки — иначе `prev` неполный и пакет не заменит старые сборки. */
export function assertFullHistory(root) {
  const file = path.resolve(root, String(git(root, ['rev-parse', '--git-path', 'shallow'], { encoding: 'utf8' })).trim())
  if (!existsSync(file)) return
  for (const sha of readFileSync(file, 'utf8').split(/\s+/).filter(Boolean)) {
    try {
      git(root, ['merge-base', '--is-ancestor', sha, 'HEAD'], { stdio: 'ignore' })
    } catch {
      continue // граница чужой ветки (например, data из git fetch --depth=1) — история HEAD цела
    }
    throw new Error('история git обрезана (shallow): для `prev` нужна полная — actions/checkout fetch-depth: 0 (или --no-prev)')
  }
}

/** sha256 всех версий файлов resources/data/<game>/… в истории HEAD: путь в пакете → [sha256], новые первыми. */
export function gitDataHistory(root, game) {
  const prefix = `resources/data/${game}/`
  const log = String(git(root, ['-c', 'core.quotepath=off', 'log', '--format=', '--raw', '--no-abbrev', '--no-renames', 'HEAD', '--', prefix], { encoding: 'utf8' }))
  const blobs = new Map()
  for (const line of log.split('\n')) {
    // :100644 100644 <было> <стало> M\t<путь>
    const m = /^:\d+ \d+ [0-9a-f]+ ([0-9a-f]+) [A-Z]\d*\t(.+)$/.exec(line.trimEnd())
    if (!m || /^0+$/.test(m[1]) || !m[2].startsWith(prefix)) continue
    const rel = m[2].slice(prefix.length)
    const list = blobs.get(rel) ?? []
    if (!list.includes(m[1])) list.push(m[1])
    blobs.set(rel, list)
  }
  const shaOf = new Map()
  const hist = new Map()
  for (const [rel, ids] of blobs) {
    hist.set(
      rel,
      ids.map((id) => {
        if (!shaOf.has(id)) shaOf.set(id, createHash('sha256').update(git(root, ['cat-file', 'blob', id])).digest('hex'))
        return shaOf.get(id)
      })
    )
  }
  return hist
}
