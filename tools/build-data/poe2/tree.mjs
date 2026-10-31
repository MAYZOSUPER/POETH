// Дерево пассивок PoE 2 для экспорта в игровой `.build` (S66) → resources/data/poe2/build/tree.json.
//
//   node tools/build-data/poe2/tree.mjs [--refresh]
//
// Источники (закреплены в sources.mjs):
//   - ноды — официальная выгрузка GGG poe2-skilltree-export: hash (ключ ноды, его пишет PoB2 в <Spec nodes>),
//     строковый id из таблицы PassiveSkills (его ждёт игра в `.build`: «melee17», «AscendancyWarrior1Small3»),
//     имя EN, вид, восхождение, соседи (`out`/`in`) — для порядка взятия нод;
//   - классы и восхождения — `classes` выгрузки, индекс = classId PoB2, восхождение — id «Warrior1» (как `ascendancy`
//     в `.build` и `ascendancyInternalId` в PoB2); RU-имя восхождения — данные компаса PoE 2 (ascendancy.json);
//   - стартовые ноды классов (`classStartIndex`: одна нода на два класса) — отсюда порядок взятия нод;
//   - уровни актов — RePoE PoE 2 world_areas: акт N кончается на самой высокой области G<N>_*, следующий начинается
//     уровнем выше; интерлюдии — области P1_*…P3_*; эндгейм — уровень области первого путевого камня (65).
// Ноды без строкового id (неактивные восхождения в выгрузке) не попадают: в `.build` их не записать.
// Формат — схема и загрузчик в src/shared/poe2/build/data.ts. Вывод детерминирован: ноды по возрастанию hash.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUT_DIR, REPOE_SOURCE, ROOT, TREE2_VERSION, TREE_SOURCE, readJson, treeNodes, writeData } from './sources.mjs'

export const TREE2_FORMAT = 1
const OUT = path.join(OUT_DIR, 'tree.json')

/** Уровень области первого путевого камня (T1 = 65, патчноут 0.5.0) — с него этап «карты». */
export const MAPS_AREA_LEVEL = 65

/** Флаги ноды (поле 3). */
export const F = {
  notable: 1,
  keystone: 2,
  jewel: 4,
  classStart: 8,
  ascStart: 16,
  attribute: 32,
  choice: 64,
  mastery: 128
}

function flagsOf(n) {
  let f = 0
  if (n.isNotable) f |= F.notable
  if (n.isKeystone) f |= F.keystone
  if (n.isJewelSocket) f |= F.jewel
  if (Array.isArray(n.classStartIndex)) f |= F.classStart
  if (n.isAscendancyStart) f |= F.ascStart
  if (n.isGenericAttribute) f |= F.attribute
  if (n.isMultipleChoiceOption) f |= F.choice
  if (n.isMastery) f |= F.mastery
  return f
}

/**
 * Уровни актов по областям: [[акт, с уровня, по уровень]], интерлюдии [с, по]. Акт — области `G<N>_…` с уровнем
 * больше 1 (корабль G4_ship — уровня 1, служебная), конец акта — самая высокая область.
 */
export function actLevels(areas) {
  const list = Array.isArray(areas) ? areas : Object.values(areas)
  const ends = new Map()
  let interTo = 0
  for (const a of list) {
    if (!a || a.is_town || a.is_hideout || !(a.area_level > 1)) continue
    const g = /^G(\d{1,2})_/.exec(a.id ?? '')
    if (g) ends.set(Number(g[1]), Math.max(ends.get(Number(g[1])) ?? 0, a.area_level))
    else if (/^P\d_/.test(a.id ?? '')) interTo = Math.max(interTo, a.area_level)
  }
  const acts = []
  let from = 1
  for (const act of [...ends.keys()].sort((a, b) => a - b)) {
    const to = ends.get(act)
    if (to < from) continue
    acts.push([act, from, to])
    from = to + 1
  }
  return { acts, interlude: interTo >= from ? [from, interTo] : null }
}

/** Собрать tree.json (чистая функция — проверяется тестом детерминизма). src: { exp, areas, meta } */
export function buildTree2(src) {
  const { exp } = src
  const report = { noId: 0, dupId: [] }
  const all = treeNodes(exp)
  const kept = new Map()
  const ids = new Map()
  for (const n of all) {
    if (typeof n.id !== 'string' || !n.id) {
      report.noId++
      continue
    }
    if (ids.has(n.id)) report.dupId.push(`${n.id}: ${ids.get(n.id)} и ${n.hash}`)
    ids.set(n.id, n.hash)
    kept.set(n.hash, n)
  }
  const nodes = []
  for (const n of kept.values()) {
    const near = new Set()
    for (const h of [...(n.out ?? []), ...(n.in ?? [])]) {
      const x = Number(h)
      // ребро храним один раз — у ноды с меньшим hash
      if (Number.isInteger(x) && x > n.hash && kept.has(x)) near.add(x)
    }
    const f = flagsOf(n)
    // имя нужно только для показа заметных нод (нотаблы, кейстоуны, гнёзда, выбор восхождения)
    const named = f & (F.notable | F.keystone | F.jewel | F.choice)
    nodes.push([n.hash, n.id, named ? String(n.name ?? '') : '', f, n.ascendancyId ?? 0, [...near].sort((a, b) => a - b)])
  }
  // RU-имена восхождений — данные компаса PoE 2 (resources/data/ascendancy.json, nameRu) по английскому имени
  const ruAsc = new Map()
  for (const c of src.ascendancy?.classes ?? []) for (const o of c.options ?? []) if (o.name && o.nameRu) ruAsc.set(o.name, o.nameRu)
  const classes = exp.classes.map((c) => [
    String(c.name),
    (c.ascendancies ?? []).map((a) => [String(a.id), a.name ? String(a.name) : '', (a.name && ruAsc.get(a.name)) || ''])
  ])
  // стартовые ноды: у PoE 2 одна нода на два класса (classStartIndex [0, 6]) — [индекс класса, hash]
  const starts = []
  for (const n of kept.values()) for (const c of Array.isArray(n.classStartIndex) ? n.classStartIndex : []) starts.push([c, n.hash])
  starts.sort((a, b) => a[0] - b[0])
  const { acts, interlude } = actLevels(src.areas)
  const data = {
    v: TREE2_FORMAT,
    meta: { ...src.meta, nodes: nodes.length },
    classes,
    starts,
    nodes,
    acts,
    interlude,
    maps: MAPS_AREA_LEVEL
  }
  return { data, report }
}

export async function loadTree2Sources() {
  const [exp, areas] = await Promise.all([readJson('tree-export.json'), readJson('repoe-world-areas.json')])
  const ascendancy = JSON.parse(readFileSync(path.join(ROOT, 'resources/data/ascendancy.json'), 'utf8'))
  return { exp, areas, ascendancy, meta: { tree: TREE2_VERSION, sources: [TREE_SOURCE, REPOE_SOURCE] } }
}

async function main() {
  const { data, report } = buildTree2(await loadTree2Sources())
  if (report.dupId.length) console.log(`\nодинаковый id у разных нод (${report.dupId.length}):\n  ${report.dupId.slice(0, 20).join('\n  ')}`)
  console.log(`нод без строкового id (не в файле): ${report.noId}`)
  if (data.nodes.length < 3000 || data.acts.length < 3) {
    console.error('\nдерево не собрано (мало нод или актов) — tree.json не записан')
    process.exit(1)
  }
  const bytes = writeData(OUT, data)
  const sha = createHash('sha256').update(JSON.stringify(data)).digest('hex')
  console.log(
    `нод ${data.nodes.length}, классов ${data.classes.length}, акты ${data.acts.map((a) => `${a[0]}: ${a[1]}–${a[2]}`).join(', ')}` +
      `${data.interlude ? `, интерлюдии ${data.interlude[0]}–${data.interlude[1]}` : ''} → ` +
      `${path.relative(ROOT, OUT)} (${(bytes / 1024).toFixed(1)} КБ, sha256 ${sha.slice(0, 12)})`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
