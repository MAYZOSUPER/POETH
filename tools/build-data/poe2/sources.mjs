// Источники данных «Билда» PoE 2 (S66) — закреплённые версии и загрузка с кэшем.
//
//   - дерево пассивок: grindinggear/poe2-skilltree-export (официальный Data Export GGG): строковый id ноды
//     (как в игровом файле `.build`), hash (как в коде PoB2), имя, вид, соседи, рецепт вложения (`recipe`);
//   - камни и эмоции (id предметов BaseItemTypes), уровни областей актов: RePoE fork PoE 2 (repoe-fork/poe2, MIT;
//     данные — © GGG), снимок по коммиту REPOE2_COMMIT;
//   - имена RU/EN камней, эмоций и нотаблов вложения — данные Exiled Exchange 2 (MIT), уже лежащие в
//     resources/data/poe2/{en,ru} (их обновляет tools/data/sync-ee2-data.mjs, S47).
//
// Кэш — .cache/build-data/poe2/ (в .gitignore). `--refresh` — скачать заново. Файлы из сети — только данные:
// читаем JSON.parse, ничего не исполняем.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
export const CACHE = path.join(ROOT, '.cache/build-data/poe2')
export const OUT_DIR = path.join(ROOT, 'resources/data/poe2/build')
export const EE2_DIR = path.join(ROOT, 'resources/data/poe2')

export const TREE2_REPO = 'grindinggear/poe2-skilltree-export'
/** коммит «0.5.5» (4.09.2026) — последний на 31.10.2026; под 1.0 (11.12) — новый коммит */
export const TREE2_VERSION = '0.5.5'
export const TREE2_COMMIT = 'bd87e6512c92b868542eddfb1ba4ea8b6dc2da36'

export const REPOE2_REPO = 'repoe-fork/poe2'
/** «Version 0.5.5.5», 29.10.2026 */
export const REPOE2_COMMIT = 'fbffebf2bd2a0ebc46dcf5b0b3640f94fb2677f6'
export const REPOE2_VERSION = '0.5.5.5'

const UA = 'POETH dataset build (+https://github.com/MAYZOSUPER/POETH)'
const REFRESH = process.argv.includes('--refresh')

/** Файл кэша → адрес источника. */
export const FILES = {
  'tree-export.json': `https://raw.githubusercontent.com/${TREE2_REPO}/${TREE2_COMMIT}/data.json`,
  'repoe-base-items.json': `https://raw.githubusercontent.com/${REPOE2_REPO}/${REPOE2_COMMIT}/data/base_items.json`,
  'repoe-world-areas.json': `https://raw.githubusercontent.com/${REPOE2_REPO}/${REPOE2_COMMIT}/data/world_areas.json`
}

async function ensure(name) {
  const file = path.join(CACHE, name)
  if (!REFRESH && existsSync(file)) return file
  const url = FILES[name]
  if (!url) throw new Error(`неизвестный источник ${name}`)
  process.stdout.write(`скачиваю ${url} … `)
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  console.log('ok')
  return file
}

export async function readJson(name) {
  return JSON.parse(readFileSync(await ensure(name), 'utf8'))
}

/** Строки ndjson данных EE2 (resources/data/poe2/<lang>/<file>). */
export function readEe2(lang, file) {
  const out = []
  for (const line of readFileSync(path.join(EE2_DIR, lang, file), 'utf8').split('\n')) {
    if (line.trim()) out.push(JSON.parse(line))
  }
  return out
}

/** Коммит EE2 из data.meta.json (для meta.sources). */
export function ee2Source() {
  const meta = JSON.parse(readFileSync(path.join(EE2_DIR, 'data.meta.json'), 'utf8'))
  return `${meta.ee2Repo}@${String(meta.ee2Sha).slice(0, 7)} (Exiled Exchange 2, MIT)`
}

export const TREE_SOURCE = `${TREE2_REPO}@${TREE2_VERSION} (${TREE2_COMMIT.slice(0, 7)}) — Path of Exile 2 Data Export, Grinding Gear Games`
export const REPOE_SOURCE = `${REPOE2_REPO}@${REPOE2_VERSION} (${REPOE2_COMMIT.slice(0, 7)}) — RePoE fork, данные © Grinding Gear Games`

/** Минимальный JSON одной строкой без перевода строки в конце: CRLF-конвертация git его не трогает. */
export function writeData(file, data) {
  mkdirSync(path.dirname(file), { recursive: true })
  const text = JSON.stringify(data)
  writeFileSync(file, text, 'utf8')
  return Buffer.byteLength(text)
}

/** Разметка выгрузки GGG «[Ключ|Текст]» / «[Текст]» → текст. */
export function stripMarkup(s) {
  return String(s ?? '').replace(/\[([^\]|]*)\|([^\]]*)\]/g, '$2').replace(/\[([^\]]*)\]/g, '$1')
}

/** Все узлы выгрузки дерева (ключ «root» — не нода). */
export function treeNodes(exp) {
  return Object.entries(exp.nodes)
    .filter(([k, n]) => /^\d+$/.test(k) && n && typeof n === 'object')
    .map(([k, n]) => ({ hash: Number(k), ...n }))
    .sort((a, b) => a.hash - b.hash)
}
