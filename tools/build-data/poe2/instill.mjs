// «Вложение» PoE 2 (S66): три дистиллированные эмоции на амулете дают нотабл дерева →
// resources/data/poe2/build/instill.json.
//
//   node tools/build-data/poe2/instill.mjs [--refresh]
//
// Источники (закреплены в sources.mjs):
//   - рецепты — поле `recipe` нотаблов официальной выгрузки GGG poe2-skilltree-export: три id эмоций
//     («LiquidParanoia», «DilutedLiquidGreed», «ConcentratedLiquidIsolation»);
//   - эмоции — RePoE PoE 2 base_items: `Metadata/Items/Currency/DistilledEmotion1…10` и `EndgameDistilledEmotion1…3`
//     (порядок номеров — порядок силы: разбавленные, обычные, концентрированные, густые); id рецепта = имя без
//     пробелов; «древние» (TimeLost) в рецептах нет. **Порядок эмоций в рецепте значим** (в отличие от масел PoE 1):
//     без учёта порядка у 642 пар нот наборы совпадают, с порядком — ни одной;
//   - имена эмоций RU/EN и tradeTag — данные EE2 (items.ndjson); имена нотаблов RU/EN — данные EE2
//     (stats.ndjson, стат «Allocates #»: «Активирует <нотабл>», значение — hash ноды); тексты статов EN — выгрузка GGG.
// Формат — схема и загрузчик в src/shared/poe2/build/instill.ts. Вывод детерминирован: ноды по возрастанию hash.

import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  OUT_DIR,
  REPOE_SOURCE,
  ROOT,
  TREE2_VERSION,
  TREE_SOURCE,
  ee2Source,
  readEe2,
  readJson,
  stripMarkup,
  treeNodes,
  writeData
} from './sources.mjs'

export const INSTILL_FORMAT = 1
const OUT = path.join(OUT_DIR, 'instill.json')

const EMOTION_RE = /^Metadata\/Items\/Currency\/(Endgame)?DistilledEmotion(\d{1,2})$/

/** «Allocates #» из stats.ndjson EE2: hash ноды → имя нотабла (без «Allocates » / «Активирует »). */
export function allocatesNames(stats) {
  const s = stats.find((x) => x.ref === 'Allocates #' && x.id === 'mod_granted_passive_hash')
  const out = new Map()
  for (const m of s?.matchers ?? []) {
    if (!Number.isInteger(m.value) || typeof m.string !== 'string') continue
    // «Allocates Fast Acting Toxins» / «Активирует Быстродействующие токсины»: первое слово — глагол
    const name = m.string.replace(/^\S+\s+/, '').trim()
    if (name) out.set(m.value, name)
  }
  return out
}

/** Собрать instill.json. src: { exp, items (RePoE base_items), en/ru (EE2 items), statsEn/statsRu, meta } */
export function buildInstill(src) {
  const report = { unknownEmotion: [], bad: [], duplicates: [], noRu: [], noEe2: [] }
  const enItems = new Map(src.en.filter((i) => i.refName).map((i) => [i.refName, i]))
  const ruItems = new Map(src.ru.filter((i) => i.refName).map((i) => [i.refName, i]))

  const emotions = []
  for (const id of Object.keys(src.items)) {
    const m = EMOTION_RE.exec(id)
    if (!m) continue
    const en = String(src.items[id].name ?? '').trim()
    emotions.push({ order: (m[1] ? 100 : 0) + Number(m[2]), baseId: id, en, key: en.replace(/\s+/g, '') })
  }
  emotions.sort((a, b) => a.order - b.order)
  const index = new Map(emotions.map((e, i) => [e.key, i]))

  const enNames = allocatesNames(src.statsEn)
  const ruNames = allocatesNames(src.statsRu)
  const recipes = {}
  const notables = {}
  const seen = new Map()
  for (const n of treeNodes(src.exp)) {
    if (!Array.isArray(n.recipe)) continue
    const idx = n.recipe.map((r) => index.get(r))
    if (idx.some((i) => i === undefined)) {
      report.unknownEmotion.push(`${n.hash} ${n.name}: ${n.recipe.join(' + ')}`)
      continue
    }
    if (idx.length !== 3) {
      report.bad.push(`${n.hash} ${n.name}: ${idx.length} эмоции`)
      continue
    }
    // в PoE 2 порядок эмоций значим: без учёта порядка 642 набора совпадают у разных нот (0.5.5)
    const key = idx.join(',')
    if (seen.has(key)) report.duplicates.push(`${key}: ${seen.get(key)} и ${n.name}`)
    seen.set(key, n.name)
    recipes[n.hash] = idx
    const en = enNames.get(n.hash) ?? String(n.name ?? '')
    const ru = ruNames.get(n.hash) ?? ''
    if (!enNames.has(n.hash)) report.noEe2.push(`${n.hash} ${n.name}`)
    if (!ru) report.noRu.push(`${n.hash} ${n.name}`)
    notables[n.hash] = [en, ru, (n.stats ?? []).map((l) => stripMarkup(l))]
  }

  const data = {
    v: INSTILL_FORMAT,
    meta: { ...src.meta, recipes: Object.keys(recipes).length },
    emotions: emotions.map((e) => {
      const en = enItems.get(e.en)
      const ru = ruItems.get(e.en)
      if (!en || !ru) report.noEe2.push(`эмоция ${e.en}`)
      return [e.key, e.baseId, e.en, ru?.name ?? '', en?.tradeTag ?? '']
    }),
    recipes,
    notables
  }
  return { data, report }
}

export async function loadInstillSources() {
  const [exp, items] = await Promise.all([readJson('tree-export.json'), readJson('repoe-base-items.json')])
  return {
    exp,
    items,
    en: readEe2('en', 'items.ndjson'),
    ru: readEe2('ru', 'items.ndjson'),
    statsEn: readEe2('en', 'stats.ndjson'),
    statsRu: readEe2('ru', 'stats.ndjson'),
    meta: { tree: TREE2_VERSION, sources: [TREE_SOURCE, REPOE_SOURCE, ee2Source()] }
  }
}

function printList(label, list, max = 30) {
  if (!list.length) return
  console.log(`\n${label} (${list.length}):\n  ${list.slice(0, max).join('\n  ')}${list.length > max ? '\n  …' : ''}`)
}

async function main() {
  const { data, report } = buildInstill(await loadInstillSources())
  printList('эмоция рецепта не найдена в base_items — рецепт пропущен', report.unknownEmotion)
  printList('рецепт не из трёх эмоций — пропущен', report.bad)
  printList('одинаковые наборы эмоций у разных нот', report.duplicates)
  printList('нет в данных EE2 (имя EN из выгрузки GGG)', report.noEe2)
  printList('нет RU-имени нотабла — покажем EN', report.noRu)
  if (report.unknownEmotion.length || report.bad.length || report.duplicates.length || data.meta.recipes < 400 || data.emotions.length < 10) {
    console.error('\nрецепты не собраны — instill.json не записан')
    process.exit(1)
  }
  const bytes = writeData(OUT, data)
  const sha = createHash('sha256').update(JSON.stringify(data)).digest('hex')
  console.log(
    `\nэмоций ${data.emotions.length}, рецептов ${data.meta.recipes} → ${path.relative(ROOT, OUT)} ` +
      `(${(bytes / 1024).toFixed(1)} КБ, sha256 ${sha.slice(0, 12)})`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
