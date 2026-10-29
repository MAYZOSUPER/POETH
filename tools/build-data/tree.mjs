// Дерево пассивок PoE1 для вкладки «Билд» (S36) → resources/data/poe1/build/tree.json.
//
//   node tools/build-data/tree.mjs [--refresh]
//
// Источники (закреплены в sources.mjs): skilltree-export (официальный Data Export GGG: ноды по hash, EN-имена
// и тексты статов, группы и орбиты, классы, эффекты мастерств) + RePoE fork (строковые id нод как в журнале
// игры, RU-имена, stat id со значениями, переводы статов) + таблицы клиента (эффекты мастерств по stat id,
// RU-имена классов восхождения, строка «Grants N Passive Skill Point»). Спрайты и картинки не берём.
//
// RU-текст статов собираем сами по stat id (translate.mjs); тем же способом собранный EN сверяется с официальным
// текстом skilltree-export — расхождения печатаются (обычно это баффы аур: их статов в RePoE нет). Строка без
// RU остаётся только EN, загрузчик покажет EN.
//
// Формат — компактный (кортежи и таблицы строк), схема и загрузчик — src/shared/build/{types,data}.ts.
// Вывод детерминирован: всё перебирается по возрастанию hash, таблицы строятся в этом порядке.

import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nominative } from '../leveling/game-names.mjs'
import {
  DAT_COMMIT,
  DAT_REPO,
  OUT_DIR,
  REPOE_COMMIT,
  REPOE_REPO,
  REPOE_VERSION,
  ROOT,
  TREE_COMMIT,
  TREE_REPO,
  TREE_TAG,
  readCsv,
  readJson,
  writeData
} from './sources.mjs'
import { makeTranslator } from './translate.mjs'

export const TREE_FORMAT = 1
const OUT = path.join(OUT_DIR, 'tree.json')

/** Вид ноды — индекс в TREE_KINDS (src/shared/build/types.ts). */
export const KIND = { normal: 0, notable: 1, keystone: 2, mastery: 3, jewel: 4, classStart: 5, ascStart: 6 }
/**
 * stat id, которые кладём в данные для упрощённого расчёта защит с дерева (B4): жизнь, ES, мана, сопротивления
 * (и максимальные), атрибуты, броня, уклонение, подавление, блок, скорость передвижения. Остальные статы —
 * только текстом: для урона нужен движок PoB.
 */
export const CALC_STAT =
  /(maximum_life|^base_life|life_+%|energy_shield|maximum_mana|^base_mana|mana_+%|resistance|strength|dexterity|intelligence|attributes|physical_damage_reduction_rating|armour|evasion|spell_suppression|block|movement_velocity)/

/** Флаги ноды (биты). */
export const FLAG = { proxy: 1, multipleChoice: 2, multipleChoiceOption: 4, bloodline: 8 }

/** Разметка игры в тексте: [Ключ|Текст] → Текст, [Текст] → Текст. */
export function stripMarkup(s) {
  return String(s)
    .replace(/\[([^\]|]*)\|([^\]]*)\]/g, '$2')
    .replace(/\[([^\]]*)\]/g, '$1')
}

const byNum = (a, b) => Number(a) - Number(b)
const splitLines = (list) => (list ?? []).flatMap((s) => String(s).split('\n')).map((s) => stripMarkup(s).trim()).filter(Boolean)

function kindOf(n) {
  if (n.classStartIndex !== undefined) return KIND.classStart
  if (n.isAscendancyStart) return KIND.ascStart
  if (n.isMastery) return KIND.mastery
  if (n.isJewelSocket) return KIND.jewel
  if (n.isKeystone) return KIND.keystone
  if (n.isNotable) return KIND.notable
  return KIND.normal
}

function flagsOf(n) {
  let f = 0
  if (n.isProxy) f |= FLAG.proxy
  if (n.isMultipleChoice) f |= FLAG.multipleChoice
  if (n.isMultipleChoiceOption) f |= FLAG.multipleChoiceOption
  if (n.isBloodline) f |= FLAG.bloodline
  return f
}

/** Таблица строк с повторным использованием: ключ → индекс. */
function table(keyOf) {
  const list = []
  const index = new Map()
  return {
    list,
    add(item) {
      const k = keyOf(item)
      let i = index.get(k)
      if (i === undefined) {
        i = list.length
        index.set(k, i)
        list.push(item)
      }
      return i
    }
  }
}

/**
 * Сопоставить официальные EN-строки с собранными переводом: RU берём у строки с тем же EN-текстом.
 * Возвращает пары [en, ru|null] в порядке официального текста.
 */
function alignLines(official, translated) {
  const pool = []
  for (const t of translated) {
    const en = t.en.split('\n').map((s) => stripMarkup(s).trim())
    const ru = (t.ru ?? '').split('\n').map((s) => stripMarkup(s).trim())
    en.forEach((line, i) => pool.push({ en: line, ru: t.ru && en.length === ru.length ? ru[i] : null, used: false }))
  }
  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ')
  return official.map((line) => {
    const hit = pool.find((p) => !p.used && p.en === line) ?? pool.find((p) => !p.used && norm(p.en) === norm(line))
    if (hit) hit.used = true
    return [line, hit?.ru ?? null]
  })
}

/**
 * Собрать tree.json из разобранных источников (чистая функция — проверяется тестом детерминизма).
 * src: { exp, repoeEn, repoeRu, trEn: [списки EN], trRu: [списки RU], masteryRows, statRows, ascRows,
 *        charRows, clientStrings, meta }
 */
export function buildTree(src) {
  const { exp, repoeEn, repoeRu } = src
  const tr = makeTranslator(src.trEn, src.trRu)
  const report = { enMismatch: [], ruMissing: 0, ruMissingNodes: [], masteryMismatch: [], unknownHandlers: [] }

  // «Grants N Passive Skill Point(s)» — строки клиента (статом в RePoE это не описано)
  const cs = new Map(src.clientStrings.map((r) => [r.Id, r]))
  const pointsLine = (n) => {
    const r = cs.get(n === 1 ? 'PassiveNodeGrantsPassivePoint' : 'PassiveNodeGrantsPassivePoints')
    if (!r) return null
    return { en: r.Text.replace('{0}', String(n)), ru: (r['Text (Russian)'] || '').replace('{0}', String(n)) || null, ids: [] }
  }

  const names = table((x) => `${x[0]}\u0000${x[1]}`)
  const lines = table((x) => `${x[0]}\u0000${x[1] ?? ''}`)
  const stats = table((x) => x)
  const lineIdx = ([en, ru]) => lines.add(ru ? [en, ru] : [en])
  const calcOf = (obj) =>
    Object.keys(obj)
      .filter((id) => CALC_STAT.test(id))
      .sort()
      .flatMap((id) => [stats.add(id), obj[id]])

  // ноды дерева = ноды RePoE (у них есть группа); без группы — ноды самоцветов/помазаний, не на дереве
  const hashes = Object.keys(repoeEn.passives)
    .filter((h) => exp.nodes[h] && exp.nodes[h].group !== undefined)
    .sort(byNum)
  const keep = new Set(hashes)
  const ascOf = (h) => exp.nodes[h]?.ascendancyName ?? null

  // рёбра: объединение out/in экспорта, одно ребро — у ноды с меньшим hash; переходы между деревом и
  // восхождением (стартовая нода класса ↔ старт восхождения) не связывают ноды — их не храним
  const edges = new Map(hashes.map((h) => [h, new Set()]))
  for (const h of hashes) {
    const n = exp.nodes[h]
    for (const o of [...(n.out ?? []), ...(n.in ?? [])]) {
      const t = String(o)
      if (!keep.has(t) || t === h || ascOf(t) !== ascOf(h)) continue
      const [a, b] = Number(h) < Number(t) ? [h, t] : [t, h]
      edges.get(a).add(Number(b))
    }
  }

  // эффекты мастерств: stat id и значения — из таблицы клиента, EN-текст — официальный
  const statId = new Map(src.statRows.map((r) => [r.rownum, r.Id]))
  const masteryStats = new Map()
  for (const r of src.masteryRows) {
    const rows = JSON.parse(r.Stats || '[]')
    const vals = [r.Stat1Value, r.Stat2Value, r.Stat3Value].map(Number)
    const st = {}
    rows.forEach((row, i) => {
      const id = statId.get(String(row))
      if (id) st[id] = vals[i] ?? 0
    })
    masteryStats.set(String(r.HASH16), st)
  }
  const masteries = {}
  const groupsUsed = new Set()

  const nodes = {}
  for (const h of hashes) {
    const n = exp.nodes[h]
    const pEn = repoeEn.passives[h]
    const pRu = repoeRu.passives[h]
    groupsUsed.add(String(n.group))

    const official = splitLines(n.stats)
    const translated = tr.lines(pEn.stats ?? {})
    if (pEn.skill_points > 0) {
      const pl = pointsLine(pEn.skill_points)
      if (pl) translated.push(pl)
    }
    const pairs = alignLines(official, translated)
    const builtEn = translated.flatMap((t) => t.en.split('\n').map((s) => stripMarkup(s).trim()))
    const missingEn = official.filter((l) => !builtEn.includes(l))
    if (missingEn.length) report.enMismatch.push(`${h} ${n.name}: ${missingEn.join(' / ')}`)
    const noRu = pairs.filter((p) => !p[1]).length
    if (noRu) {
      report.ruMissing += noRu
      report.ruMissingNodes.push(`${h} ${n.name}`)
    }

    const extra = {}
    if (n.ascendancyName) extra.a = n.ascendancyName
    if (pEn.skill_points > 0) extra.pts = pEn.skill_points
    if (n.expansionJewel) extra.js = n.expansionJewel.size
    if (n.isMastery && n.masteryEffects?.length) {
      extra.me = n.masteryEffects.map((e) => e.effect)
      for (const e of n.masteryEffects) {
        const key = String(e.effect)
        if (masteries[key]) continue
        const st = masteryStats.get(key) ?? {}
        const off = splitLines(e.stats)
        const tl = tr.lines(st)
        const mp = alignLines(off, tl)
        const built = tl.flatMap((t) => t.en.split('\n').map((s) => stripMarkup(s).trim()))
        const miss = off.filter((l) => !built.includes(l))
        if (miss.length) report.masteryMismatch.push(`${key} (${n.name}): ${miss.join(' / ')}`)
        report.ruMissing += mp.filter((p) => !p[1]).length
        masteries[key] = [mp.map(lineIdx), calcOf(st)]
      }
    }

    const tuple = [
      pEn.id,
      names.add([n.name, pRu?.name || n.name]),
      kindOf(n),
      flagsOf(n),
      pairs.map(lineIdx),
      calcOf(pEn.stats ?? {}),
      n.group,
      n.orbit,
      n.orbitIndex,
      [...edges.get(h)].sort(byNum)
    ]
    if (Object.keys(extra).length) tuple.push(extra)
    nodes[h] = tuple
  }

  // группы — только используемые, координаты округлены (для будущего SVG точности хватает)
  const groups = {}
  for (const g of Object.keys(exp.groups).sort(byNum)) {
    if (!groupsUsed.has(g)) continue
    groups[g] = [Math.round(exp.groups[g].x), Math.round(exp.groups[g].y)]
  }

  // классы в порядке PoB classId (= порядок classes экспорта = classStartIndex), восхождения — ascendClassId−1
  const charRu = new Map(src.charRows.map((r) => [r.Name.trim(), nominative(r['Name (Russian)'])]))
  const ascRu = new Map(src.ascRows.map((r) => [r.Id.trim(), nominative(r['Name (Russian)'])]))
  const startOf = new Map()
  const ascStart = new Map()
  for (const h of hashes) {
    const n = exp.nodes[h]
    if (n.classStartIndex !== undefined) startOf.set(n.classStartIndex, Number(h))
    if (n.isAscendancyStart && n.ascendancyName) ascStart.set(n.ascendancyName, Number(h))
  }
  const classes = exp.classes.map((c, i) => ({
    en: c.name,
    ru: charRu.get(c.name) || c.name,
    start: startOf.get(i) ?? null,
    attr: [c.base_str, c.base_dex, c.base_int],
    asc: c.ascendancies.map((a) => ({ id: a.id, en: a.name, ru: ascRu.get(a.id) || a.name, start: ascStart.get(a.id) ?? null }))
  }))
  // альтернативные восхождения (родословные): RU — имя их стартовой ноды
  const alt = (exp.alternate_ascendancies ?? []).map((a) => {
    const s = ascStart.get(a.id) ?? null
    const ru = s !== null ? repoeRu.passives[String(s)]?.name : null
    return { id: a.id, en: a.name, ru: ru || a.name, start: s }
  })

  report.unknownHandlers = [...tr.unknown].sort()
  const data = {
    v: TREE_FORMAT,
    meta: {
      ...src.meta,
      nodes: hashes.length,
      ruMissingLines: report.ruMissing
    },
    constants: { orbitRadii: exp.constants.orbitRadii, skillsPerOrbit: exp.constants.skillsPerOrbit },
    classes,
    alt,
    groups,
    names: names.list,
    lines: lines.list,
    stats: stats.list,
    masteries: Object.fromEntries(Object.keys(masteries).sort(byNum).map((k) => [k, masteries[k]])),
    nodes
  }
  return { data, report }
}

export async function loadTreeSources() {
  const [exp, repoeEn, repoeRu, pstEn, pstRu, stEn, stRu] = await Promise.all(
    ['tree-export.json', 'repoe-tree-en.json', 'repoe-tree-ru.json', 'repoe-pst-en.json', 'repoe-pst-ru.json', 'repoe-st-en.json', 'repoe-st-ru.json'].map(
      (f) => readJson(f)
    )
  )
  const [masteryRows, statRows, ascRows, charRows, clientStrings] = await Promise.all(
    ['dat-PassiveSkillMasteryEffects.csv', 'dat-Stats.csv', 'dat-Ascendancy.csv', 'dat-Characters.csv', 'dat-ClientStrings.csv'].map((f) => readCsv(f))
  )
  return {
    exp,
    repoeEn,
    repoeRu,
    trEn: [pstEn, stEn],
    trRu: [pstRu, stRu],
    masteryRows,
    statRows,
    ascRows,
    charRows,
    clientStrings: clientStrings.filter((r) => r.Id.startsWith('PassiveNodeGrants')),
    meta: {
      tree: TREE_TAG,
      sources: [
        `${TREE_REPO}@${TREE_TAG} (${TREE_COMMIT.slice(0, 7)}) — Path of Exile Data Export, Grinding Gear Games`,
        `${REPOE_REPO}@${REPOE_COMMIT.slice(0, 7)} (RePoE fork ${REPOE_VERSION}, MIT)`,
        `${DAT_REPO}@${DAT_COMMIT.slice(0, 7)} (таблицы клиента PoE1)`
      ]
    }
  }
}

function printList(label, list, max = 40) {
  if (!list.length) return
  console.log(`\n${label} (${list.length}):\n  ${list.slice(0, max).join('\n  ')}${list.length > max ? '\n  …' : ''}`)
}

async function main() {
  const { data, report } = buildTree(await loadTreeSources())
  const bytes = writeData(OUT, data)
  printList('EN собран не полностью — RU у этих строк нет (баффы аур и т. п.)', report.enMismatch)
  printList('эффекты мастерств: EN собран не полностью', report.masteryMismatch)
  printList('неизвестные обработчики значений', report.unknownHandlers)
  const sha = createHash('sha256').update(JSON.stringify(data)).digest('hex')
  console.log(
    `\nнод ${data.meta.nodes}, мастерств-эффектов ${Object.keys(data.masteries).length}, строк ${data.lines.length}, ` +
      `без RU ${report.ruMissing} → ${path.relative(ROOT, OUT)} (${(bytes / 1024).toFixed(0)} КБ, sha256 ${sha.slice(0, 12)})`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
