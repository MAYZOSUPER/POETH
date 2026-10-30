// Рецепты анойнта PoE1 (S54): три масла → нотабл дерева → resources/data/poe1/build/anoints.json.
//
//   node tools/build-data/anoints.mjs [--refresh]
//
// Источники (закреплены в sources.mjs):
//   - рецепты — поле `recipe` у нод skilltree-export (официальный Data Export GGG, тот же тег, что у tree.json):
//     три id масел («ClearOil», «AzureOil», «BlackOil»), масла могут повторяться; `isBlighted` — нота только для
//     анойнта (на дереве её не взять);
//   - масла — таблица клиента BlightCraftingItems (dat-export): тир (порядок в рецепте: Prismatic 0, Clear 1 …
//     Golden 13) и назначение (UseType 0 — анойнт; 1 Tainted и 2 Reflective — не рецепты нот).
// Имена нот EN/RU — в tree.json (те же hash), имена масел на языке клиента и иконки — данные APT по tradeTag.
// Формат — схема и загрузчик в src/shared/build/anoints.ts. Вывод детерминирован: ноды по возрастанию hash.

import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DAT_COMMIT, DAT_REPO, OUT_DIR, ROOT, TREE_COMMIT, TREE_REPO, TREE_TAG, readCsv, readJson, writeData } from './sources.mjs'

export const ANOINTS_FORMAT = 1
const OUT = path.join(OUT_DIR, 'anoints.json')

const byNum = (a, b) => Number(a) - Number(b)

/** «Clear Oil» → «clear-oil» (tradeTag данных APT и трейда). */
export function oilTag(en) {
  return en.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

/**
 * Собрать anoints.json (чистая функция — проверяется тестом детерминизма).
 * src: { exp (skilltree-export), oilRows (BlightCraftingItems), meta }
 */
export function buildAnoints(src) {
  const { exp, oilRows } = src
  // масла анойнта по тиру; id как в рецепте skilltree-export: NameShort + «Oil»
  const oils = oilRows
    .filter((r) => Number(r.UseType) === 0)
    .map((r) => ({ tier: Number(r.Tier), short: String(r.NameShort).trim() }))
    .sort((a, b) => a.tier - b.tier)
    .map((o) => ({ id: `${o.short}Oil`, tier: o.tier, en: `${o.short} Oil` }))
  const index = new Map(oils.map((o, i) => [o.id, i]))

  const recipes = {}
  const only = []
  const report = { unknownOils: [], bad: [], duplicates: [] }
  const seen = new Map()
  for (const h of Object.keys(exp.nodes).sort(byNum)) {
    const n = exp.nodes[h]
    if (!Array.isArray(n.recipe)) continue
    const idx = n.recipe.map((id) => index.get(id))
    if (idx.some((i) => i === undefined)) {
      report.unknownOils.push(`${h} ${n.name}: ${n.recipe.join(' + ')}`)
      continue
    }
    if (idx.length !== 3) {
      report.bad.push(`${h} ${n.name}: ${n.recipe.length} масла`)
      continue
    }
    // порядок масел не важен (игра принимает в любом) — храним по тиру
    const sorted = idx.sort((a, b) => a - b)
    const key = sorted.join(',')
    if (seen.has(key)) report.duplicates.push(`${key}: ${seen.get(key)} и ${n.name}`)
    seen.set(key, n.name)
    recipes[h] = sorted
    if (n.isBlighted) only.push(Number(h))
  }

  const data = {
    v: ANOINTS_FORMAT,
    meta: { ...src.meta, recipes: Object.keys(recipes).length },
    oils: oils.map((o) => [o.id, o.en, oilTag(o.en)]),
    recipes,
    only
  }
  return { data, report }
}

export async function loadAnointSources() {
  const [exp, oilRows] = await Promise.all([readJson('tree-export.json'), readCsv('dat-BlightCraftingItems.csv')])
  return {
    exp,
    oilRows,
    meta: {
      tree: TREE_TAG,
      sources: [
        `${TREE_REPO}@${TREE_TAG} (${TREE_COMMIT.slice(0, 7)}) — Path of Exile Data Export, Grinding Gear Games`,
        `${DAT_REPO}@${DAT_COMMIT.slice(0, 7)} (таблицы клиента PoE1: BlightCraftingItems)`
      ]
    }
  }
}

function printList(label, list, max = 40) {
  if (!list.length) return
  console.log(`\n${label} (${list.length}):\n  ${list.slice(0, max).join('\n  ')}${list.length > max ? '\n  …' : ''}`)
}

async function main() {
  const { data, report } = buildAnoints(await loadAnointSources())
  printList('масло рецепта не найдено в BlightCraftingItems — рецепт пропущен', report.unknownOils)
  printList('рецепт не из трёх масел — пропущен', report.bad)
  printList('одинаковые наборы масел у разных нот', report.duplicates)
  if (report.unknownOils.length || report.bad.length || report.duplicates.length || data.meta.recipes < 400) {
    console.error('\nрецепты не собраны — anoints.json не записан')
    process.exit(1)
  }
  const bytes = writeData(OUT, data)
  const sha = createHash('sha256').update(JSON.stringify(data)).digest('hex')
  console.log(
    `\nмасел ${data.oils.length}, рецептов ${data.meta.recipes} (только анойнтом ${data.only.length}) → ` +
      `${path.relative(ROOT, OUT)} (${(bytes / 1024).toFixed(1)} КБ, sha256 ${sha.slice(0, 12)})`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
