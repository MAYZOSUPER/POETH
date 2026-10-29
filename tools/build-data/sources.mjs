// Источники данных вкладки «Билд» (S36) — закреплённые версии и загрузка с кэшем.
//
//   - дерево пассивок: grindinggear/skilltree-export (официальный Data Export GGG, тег TREE_TAG);
//   - RU-имена, строковые id и stat id нод, переводы статов, камни: RePoE fork (MIT), снимок страниц
//     repoe-fork/repoe-fork.github.io по коммиту REPOE_COMMIT (не «последняя версия» сайта);
//   - эффекты мастерств, имена классов восхождения и тексты журнала: таблицы клиента PoE1 в CSV —
//     repoe-fork/dat-export по коммиту DAT_COMMIT (тот же, что у имён гида прокачки, S31).
//
// Кэш — .cache/build-data/src/ (в .gitignore). `--refresh` — скачать заново. Файлы из сети — только данные:
// читаем JSON.parse и разбором CSV, ничего не исполняем.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DAT_COMMIT, DAT_REPO, parseCsv } from '../leveling/game-names.mjs'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const CACHE = path.join(ROOT, '.cache/build-data/src')
export const OUT_DIR = path.join(ROOT, 'resources/data/poe1/build')

export const TREE_REPO = 'grindinggear/skilltree-export'
/** тег 3.29.1 — последний на 29.10.2026; под 3.30 — новый тег и коммит */
export const TREE_TAG = '3.29.1'
export const TREE_COMMIT = '8bd138b32ea2631455cac5935bfab089f826094f'

export const REPOE_REPO = 'repoe-fork/repoe-fork.github.io'
/** «Version 3.29.3.3», 29.10.2026 */
export const REPOE_COMMIT = 'd8635430f4005faccfed69c7957ef2fb9f8fb1fb'
export const REPOE_VERSION = '3.29.3.3'

export { DAT_COMMIT, DAT_REPO }

const UA = 'POETH dataset build (+https://github.com/MAYZOSUPER/POETH)'
const REFRESH = process.argv.includes('--refresh')

/** Файл кэша → адрес источника. */
export const FILES = {
  'tree-export.json': `https://raw.githubusercontent.com/${TREE_REPO}/${TREE_COMMIT}/data.json`,
  'repoe-tree-en.json': repoe('passive_skill_trees/Default.json'),
  'repoe-tree-ru.json': repoe('Russian/passive_skill_trees/Default.json'),
  'repoe-pst-en.json': repoe('stat_translations/passive_skill.json'),
  'repoe-pst-ru.json': repoe('Russian/stat_translations/passive_skill.json'),
  'repoe-st-en.json': repoe('stat_translations.json'),
  'repoe-st-ru.json': repoe('Russian/stat_translations.json'),
  'repoe-gems-en.json': repoe('gems.json'),
  'repoe-gems-min-en.json': repoe('gems_minimal.json'),
  'repoe-gems-min-ru.json': repoe('Russian/gems_minimal.json'),
  'dat-PassiveSkillMasteryEffects.csv': dat('PassiveSkillMasteryEffects'),
  'dat-Stats.csv': dat('Stats'),
  'dat-Ascendancy.csv': dat('Ascendancy'),
  'dat-Characters.csv': dat('Characters'),
  'dat-GemEffects.csv': dat('GemEffects'),
  'dat-GrantedEffects.csv': dat('GrantedEffects'),
  'dat-BackendErrors.csv': dat('BackendErrors'),
  'dat-ClientStrings.csv': dat('ClientStrings')
}

function repoe(rel) {
  return `https://raw.githubusercontent.com/${REPOE_REPO}/${REPOE_COMMIT}/data/${rel}`
}
function dat(table) {
  return `https://raw.githubusercontent.com/${DAT_REPO}/${DAT_COMMIT}/current/poe/heuristics/csv/${table}.csv`
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

export async function readCsv(name) {
  return parseCsv(readFileSync(await ensure(name), 'utf8'))
}

/** Минимальный JSON одной строкой без перевода строки в конце: CRLF-конвертация git его не трогает. */
export function writeData(file, data) {
  mkdirSync(path.dirname(file), { recursive: true })
  const text = JSON.stringify(data)
  writeFileSync(file, text, 'utf8')
  return Buffer.byteLength(text)
}
