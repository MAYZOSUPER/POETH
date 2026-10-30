// Данные «умной оценки» timeless-самоцветов PoE1 (S45): исход сида по 21 гнезду дерева для Lethal Pride,
// Brutal Restraint, Militant Faith, Elegant Hubris и Heroic Tragedy.
//
//   node tools/timeless/build.mjs              # кэш: .cache/timeless/ (+ .cache/build-data/src/ для переводов)
//   node tools/timeless/build.mjs --refresh    # скачать источники заново
//
// Источники (закреплены коммитом и SHA-256, см. SOURCES):
//   - Path of Building Community (MIT, Copyright (c) 2016 David Gowor): лукап-таблицы исходов
//     src/Data/TimelessJewelData/<Самоцвет>.zip (zlib), NodeIndexMapping.lua (строка таблицы ↔ нода,
//     локальный id исхода ↔ общий), LegionPassives.lua (исходы: id, имя, stat id и значения). Данные — не код PoB.
//   - наше дерево S36 resources/data/poe1/build/tree.json (skilltree-export GGG + RePoE fork): ноды, места, имена;
//   - RePoE fork (MIT) stat_translations EN/RU — тексты исходов (как tools/build-data/translate.mjs);
//   - таблицы клиента PoE1 (repoe-fork/dat-export) AlternatePassiveSkills — RU-имена заменённых нотаблов,
//     вид исходов мелких нод (сверка).
//
// Почему лукапы, а не свой генератор: ГСЧ игры — изменённый TinyMT32; эталонный TinyMT32 (сверен с векторами
// авторов) исходы игры не повторяет, а открытого описания изменений с подходящей лицензией нет (S45-handover).
// Лукапы PoB сверены с калькулятором Vilsol на живом примере (tests/timeless/golden.test.ts).
//
// Выход (resources/data/poe1/build/, через poeth://data/poe1/build/ и канал обновления данных):
//   timeless.json          — гнёзда, нотаблы в радиусе, исходы с текстами EN/RU, диапазоны сидов;
//   timeless-<вид>.bin     — zlib: байт на (нотабл × сид) — номер исхода в списке `outcomes` самоцвета.
// Файлы — только данные: исполняемого в них нет; Lua разбирается своим парсером литералов (lua-table.mjs).

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { DAT_COMMIT, DAT_REPO, parseCsv } from '../leveling/game-names.mjs'
import { OUT_DIR, REPOE_COMMIT, REPOE_REPO, REPOE_VERSION, ROOT, readCsv, readJson, writeData } from '../build-data/sources.mjs'
import { makeTranslator } from '../build-data/translate.mjs'
import { parseLuaTable, parseNodeIndexMapping } from './lua-table.mjs'

export const FORMAT = 1
const CACHE = path.join(ROOT, '.cache/timeless')
const REFRESH = process.argv.includes('--refresh')
const UA = 'POETH dataset build (+https://github.com/MAYZOSUPER/POETH)'

export const POB_REPO = 'PathOfBuildingCommunity/PathOfBuilding'
/** «3.29 export» лукапов (#9992) и позже; ветка dev на 29.10.2026 */
export const POB_COMMIT = '3dbca4463c0a59079d9f7f032d8240cf868e09da'
/** радиус timeless-самоцвета (Large) в единицах дерева */
export const RADIUS = 1800

const pob = (rel) => `https://raw.githubusercontent.com/${POB_REPO}/${POB_COMMIT}/src/Data/TimelessJewelData/${rel}`
const dat = (table) => `https://raw.githubusercontent.com/${DAT_REPO}/${DAT_COMMIT}/current/poe/heuristics/csv/${table}.csv`

/** файл кэша → [адрес, sha256 | null (таблицы клиента — закреплены коммитом)] */
const SOURCES = {
  'LethalPride.zip': [pob('LethalPride.zip'), '533d47d174b9baf7747cf74b9f3271a44429384a8ba2da9bbe262c3f513d9d3c'],
  'BrutalRestraint.zip': [pob('BrutalRestraint.zip'), 'aacad0903efca6777669b3f06b6a7ddcfa103cafee13b8297126ea8526fb9c85'],
  'MilitantFaith.zip': [pob('MilitantFaith.zip'), '4b2ddcffdf991dfb9ff42ae2f87c4745804e082ccfcd43f4475616f0c234c6c7'],
  'ElegantHubris.zip': [pob('ElegantHubris.zip'), 'd2a73134f2b8ea8260602d16270c9ef54c5f41eef87958f02c927e8a587799eb'],
  'HeroicTragedy.zip': [pob('HeroicTragedy.zip'), '461d5ca14d9f90e7c263c777735936587ac047fc1ff9bc9cff7be68fddf24561'],
  'NodeIndexMapping.lua': [pob('NodeIndexMapping.lua'), 'eba252a0d95fe2f28f92afb0efcc01572fd13b26e5029e3dcde25a90175c5125'],
  'LegionPassives.lua': [pob('LegionPassives.lua'), '944e70c4a2343a7f21f9dc51335c8ddf9bb07f28654bd36d6216e5082f30d1a9'],
  'LICENSE.md': [`https://raw.githubusercontent.com/${POB_REPO}/${POB_COMMIT}/LICENSE.md`, '52506adfa82b9e36be1e5a9f1735e0b88dbc6239ac2a7006b167a9c41479110c'],
  'dat-AlternatePassiveSkills.csv': [dat('AlternatePassiveSkills'), null],
  'dat-AlternatePassiveAdditions.csv': [dat('AlternatePassiveAdditions'), null]
}

/**
 * Самоцветы: номер типа в данных PoB (`data.timelessJewelTypes`), файл лукапа, сиды в данных (у Elegant Hubris
 * на предмете и на трейде — сид × 20, «монеты»), исходы мелких нод (единственный вариант у этих самоцветов:
 * атрибутные ноды «+10 к силе/ловкости/интеллекту» и прочие мелкие).
 */
export const JEWELS = {
  LP: { type: 2, file: 'LethalPride.zip', seeds: [10000, 18000], scale: 1, attr: 'karui_attribute_strength', small: 'karui_small_strength' },
  BR: { type: 3, file: 'BrutalRestraint.zip', seeds: [500, 8000], scale: 1, attr: 'maraketh_attribute_dex', small: 'maraketh_small_dex' },
  MF: { type: 4, file: 'MilitantFaith.zip', seeds: [2000, 10000], scale: 1, attr: 'templar_devotion_node', small: 'templar_small_devotion' },
  EH: { type: 5, file: 'ElegantHubris.zip', seeds: [100, 8000], scale: 20, attr: 'eternal_small_blank', small: 'eternal_small_blank' },
  HT: { type: 6, file: 'HeroicTragedy.zip', seeds: [100, 8000], scale: 1, attr: 'kalguuran_attribute_ward', small: 'kalguuran_small_ward' }
}
/** версия дерева альтернатив в таблицах клиента (AlternateTreeVersions) */
const TREE_VERSION = { LP: 2, BR: 3, MF: 4, EH: 5, HT: 6 }
/** PoB: общий id ≥ ADDITIONS — замена (`nodes[id - ADDITIONS]`), меньше — прибавка (`additions[id]`) */
const ADDITIONS = 337
const ATTRIBUTE_NAMES = new Set(['Strength', 'Dexterity', 'Intelligence'])
/** код «нет данных» в .bin: нотабла нет в лукапе PoB */
export const UNKNOWN = 255

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')

async function fetchSource(name) {
  const file = path.join(CACHE, name)
  const [url, sha] = SOURCES[name]
  if (REFRESH || !existsSync(file)) {
    process.stdout.write(`скачиваю ${url} … `)
    const res = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    mkdirSync(CACHE, { recursive: true })
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    console.log('ok')
  }
  const buf = readFileSync(file)
  if (sha && sha256(buf) !== sha) throw new Error(`${name}: sha256 ${sha256(buf)} ≠ закреплённого ${sha} (обновить POB_COMMIT и SOURCES)`)
  return buf
}

/** Позиция ноды tree.json — своя формула (центр группы + радиус орбиты под углом места), как стенд S38. */
const ANGLES_16 = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330]
const ANGLES_40 = [
  0, 10, 20, 30, 40, 45, 50, 60, 70, 80, 90, 100, 110, 120, 130, 135, 140, 150, 160, 170, 180, 190, 200, 210, 220, 225,
  230, 240, 250, 260, 270, 280, 290, 300, 310, 315, 320, 330, 340, 350
]
function position(tree, n) {
  const g = tree.groups[String(n[6])]
  if (!g) return null
  const per = tree.constants.skillsPerOrbit[n[7]] ?? 0
  const deg = per === 16 ? ANGLES_16[n[8]] : per === 40 ? ANGLES_40[n[8]] : per > 0 ? (360 * n[8]) / per : 0
  const r = tree.constants.orbitRadii[n[7]] ?? 0
  const a = (deg * Math.PI) / 180
  return { x: g[0] + Math.sin(a) * r, y: g[1] - Math.cos(a) * r }
}

const KIND = { normal: 0, notable: 1, keystone: 2, jewel: 4 }

/** Гнёзда для обычных самоцветов на основном дереве (21): вид «гнездо», не восхождение, не внутри кластера. */
export function treeSockets(tree) {
  return Object.entries(tree.nodes)
    .filter(([, n]) => n[2] === KIND.jewel && !(n[3] & 1) && !n[10]?.a && (n[10]?.js == null || n[10].js === 2))
    .map(([h]) => Number(h))
    .sort((a, b) => a - b)
}

/** Ноды, которые меняет timeless-самоцвет: мелкие, нотаблы и кейстоуны основного дерева в радиусе гнезда. */
export function nodesInRadius(tree, socket) {
  const p0 = position(tree, tree.nodes[socket])
  const out = []
  for (const [h, n] of Object.entries(tree.nodes)) {
    if (![KIND.normal, KIND.notable, KIND.keystone].includes(n[2]) || n[3] & (1 | 8) || n[10]?.a) continue
    const p = position(tree, n)
    if (!p) continue
    const d = Math.hypot(p.x - p0.x, p.y - p0.y)
    if (d <= RADIUS) out.push({ hash: Number(h), node: n, d })
  }
  return out.sort((a, b) => a.hash - b.hash)
}

function legionEntries(table) {
  return Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b)
    .map((k) => table[k])
}


async function main() {
  const t0 = Date.now()
  const buf = Object.fromEntries(await Promise.all(Object.keys(SOURCES).map(async (k) => [k, await fetchSource(k)])))
  const tree = JSON.parse(readFileSync(path.join(OUT_DIR, 'tree.json'), 'utf8'))
  const [pstEn, pstRu, stEn, stRu] = await Promise.all(
    ['repoe-pst-en.json', 'repoe-pst-ru.json', 'repoe-st-en.json', 'repoe-st-ru.json'].map((f) => readJson(f))
  )
  const tr = makeTranslator([pstEn, stEn], [pstRu, stRu])
  const altSkills = parseCsv(buf['dat-AlternatePassiveSkills.csv'].toString('utf8'))
  const altAdds = parseCsv(buf['dat-AlternatePassiveAdditions.csv'].toString('utf8'))
  const altById = new Map([...altSkills, ...altAdds].map((r) => [r.Id, r]))
  const statIds = (await readCsv('dat-Stats.csv')).map((r) => r.Id)

  /**
   * Статы исхода со значениями игры: строка таблицы клиента по id (у четырёх прибавок PoB другое имя — тогда по
   * набору stat id той же версии); порядок — `sortedStats` PoB (порядок строк описания, как в игре). Значения у
   * этих самоцветов фиксированные (min = max): лукап не хранит бросок, разброс — ошибка данных.
   */
  function gameStats(e, rep, kind) {
    const order = Object.values(e.sortedStats ?? {})
    const sameSet = (r) => {
      const ids = JSON.parse(r.StatsKeys || '[]').map((k) => statIds[k])
      return ids.length === order.length && ids.every((id) => order.includes(id))
    }
    const pool = rep ? altSkills : altAdds
    const row =
      pool.find((r) => r.Id === e.id && sameSet(r)) ??
      pool.filter((r) => Number(r.AlternateTreeVersionsKey) === TREE_VERSION[kind] && sameSet(r)).find((r, _, all) => all.length === 1)
    if (!row) throw new Error(`${e.id}: нет однозначной строки в таблицах клиента`)
    const keys = JSON.parse(row.StatsKeys)
    const ranges = [
      [row.Stat1Min, row.Stat1Max],
      [row.Stat2Min ?? row.i32_52, row.Stat2Max ?? row.i32_56]
    ]
    const byId = {}
    keys.forEach((k, i) => {
      const [min, max] = (ranges[i] ?? []).map(Number)
      if (min !== max || Number.isNaN(min)) throw new Error(`${e.id}: стат ${statIds[k]} ${min}–${max} — лукап не хранит бросок`)
      byId[statIds[k]] = min
    })
    return Object.fromEntries(order.map((id) => [id, byId[id]]))
  }

  const legion = parseLuaTable(buf['LegionPassives.lua'].toString('utf8'))
  const legionNodes = legionEntries(legion.nodes)
  const legionAdds = legionEntries(legion.additions)
  if (legionAdds.length !== ADDITIONS) throw new Error(`LegionPassives: прибавок ${legionAdds.length}, ждали ${ADDITIONS}`)
  const mapping = parseNodeIndexMapping(buf['NodeIndexMapping.lua'].toString('utf8'))
  const report = { enMismatch: [], noRu: [], noLut: new Set() }

  // --- гнёзда и нотаблы в их радиусе
  const sockets = treeSockets(tree)
  if (sockets.length !== 21) throw new Error(`гнёзд ${sockets.length}, ждали 21`)
  const rowOf = new Map()
  const socketsOut = []
  const nameOf = (h) => {
    const n = tree.nodes[h]
    const [en, ru] = tree.names[n[1]]
    return [en, ru || en]
  }
  const names = {}
  for (const s of sockets) {
    const inR = nodesInRadius(tree, s)
    const notables = inR.filter((x) => x.node[2] === KIND.notable)
    const keystones = inR.filter((x) => x.node[2] === KIND.keystone)
    const small = inR.filter((x) => x.node[2] === KIND.normal)
    const attr = small.filter((x) => ATTRIBUTE_NAMES.has(tree.names[x.node[1]][0])).length
    for (const x of notables) {
      // нотаблы новее лукапа PoB (переделки дерева 3.2x): исхода нет — строка с кодом UNKNOWN, оценка помечается неполной
      if (!mapping.index.has(x.hash) || mapping.index.get(x.hash) >= mapping.sizeNotable) report.noLut.add(`${x.hash} ${nameOf(x.hash)[0]}`)
      if (!rowOf.has(x.hash)) rowOf.set(x.hash, -1)
    }
    // подпись гнезда — ближайший кейстоун в радиусе, иначе ближайший нотабл: их можно найти поиском по дереву в игре
    const near = (keystones.length ? keystones : notables).slice().sort((a, b) => a.d - b.d)[0]
    names[near.hash] = nameOf(near.hash)
    socketsOut.push({ id: s, near: near.hash, notables: notables.map((x) => x.hash), keystones: keystones.map((x) => x.hash), attr, small: small.length - attr })
  }
  const rows = [...rowOf.keys()].sort((a, b) => a - b)
  rows.forEach((h, i) => {
    rowOf.set(h, i)
    names[h] = nameOf(h)
  })
  for (const s of socketsOut) s.notables = s.notables.map((h) => rowOf.get(h))

  // --- исходы и лукапы по самоцветам
  const jewelsOut = {}
  const files = {}
  for (const [kind, j] of Object.entries(JEWELS)) {
    const lut = inflateSync(buf[j.file])
    const seedCount = j.seeds[1] - j.seeds[0] + 1
    if (lut.length !== mapping.sizeNotable * seedCount) {
      throw new Error(`${j.file}: ${lut.length} байт ≠ ${mapping.sizeNotable} нотаблов × ${seedCount} сидов`)
    }
    const l2g = mapping.localToGlobal[j.type] ?? {}
    const outcomes = []
    const codeOf = new Map()
    const outcome = (globalId) => {
      if (codeOf.has(globalId)) return codeOf.get(globalId)
      const rep = globalId >= ADDITIONS
      const e = rep ? legionNodes[globalId - ADDITIONS] : legionAdds[globalId]
      if (!e) throw new Error(`${kind}: нет исхода ${globalId}`)
      outcomes.push(describe(e, rep))
      codeOf.set(globalId, outcomes.length - 1)
      return outcomes.length - 1
    }
    const describe = (e, rep) => {
      const stats = gameStats(e, rep, kind)
      const lines = tr.lines(stats).map((l) => [l.en, l.ru ?? l.en])
      const pobLines = Object.values(e.sd ?? {})
      if (lines.map((l) => l[0]).join(' / ') !== pobLines.join(' / ')) report.enMismatch.push(`${e.id}: «${lines.map((l) => l[0]).join(' / ')}» ≠ PoB «${pobLines.join(' / ')}»`)
      if (lines.some((l) => l[1] === l[0])) report.noRu.push(e.id)
      const out = { id: e.id, rep: rep ? 1 : 0, lines, stats }
      if (rep) {
        const row = altById.get(e.id)
        out.name = [e.dn.trim(), (row?.['Name (Russian)'] || e.dn).trim()]
        if (!row) report.noRu.push(`${e.id} (имя)`)
      }
      return out
    }
    // мелкие ноды: единственный вариант у этих самоцветов (сверка с таблицей клиента)
    const smallOf = (id, type) => {
      const r = altById.get(id)
      if (!r || Number(r.AlternateTreeVersionsKey) !== TREE_VERSION[kind]) throw new Error(`${kind}: нет ${id} в таблицах клиента`)
      const isSkill = 'Name' in r
      const pool = (isSkill ? altSkills : altAdds).filter(
        (x) => Number(x.AlternateTreeVersionsKey) === TREE_VERSION[kind] && JSON.parse(x.PassiveType || '[]').includes(type)
      )
      if (pool.length !== 1) throw new Error(`${kind}: у мелких нод вида ${type} ${pool.length} вариантов — исход не однозначен`)
      const e = (isSkill ? legionNodes : legionAdds).find((x) => x.id === id)
      return describe(e, isSkill)
    }
    const bin = new Uint8Array(rows.length * seedCount)
    rows.forEach((h, r) => {
      const i = mapping.index.get(h)
      if (i == null || i >= mapping.sizeNotable) {
        bin.fill(UNKNOWN, r * seedCount, (r + 1) * seedCount)
        return
      }
      for (let s = 0; s < seedCount; s++) {
        const local = lut[i * seedCount + s]
        bin[r * seedCount + s] = outcome(l2g[local] ?? local)
      }
    })
    if (outcomes.length >= UNKNOWN) throw new Error(`${kind}: исходов ${outcomes.length} ≥ ${UNKNOWN}`)
    // доля исхода среди всех нотаблов в радиусе по всем сидам — «насколько обычен» (правила сравнивают с ней)
    const hits = new Array(outcomes.length).fill(0)
    let known = 0
    for (const code of bin) {
      if (code === UNKNOWN) continue
      hits[code]++
      known++
    }
    outcomes.forEach((o, code) => (o.share = Math.round((hits[code] / known) * 1e5) / 1e5))
    const file = `timeless-${kind.toLowerCase()}.bin`
    files[file] = deflateSync(bin, { level: 9 })
    jewelsOut[kind] = {
      seeds: j.seeds,
      scale: j.scale,
      file,
      sha256: sha256(files[file]),
      attr: smallOf(j.attr, 1),
      small: smallOf(j.small, 2),
      outcomes
    }
  }

  const data = {
    v: FORMAT,
    meta: {
      tree: tree.meta.tree,
      radius: RADIUS,
      sources: [
        `${POB_REPO}@${POB_COMMIT.slice(0, 7)} — лукапы TimelessJewelData (MIT, Copyright (c) 2016 David Gowor)`,
        `${REPOE_REPO}@${REPOE_COMMIT.slice(0, 7)} (RePoE fork ${REPOE_VERSION}, MIT) — тексты статов EN/RU`,
        `${DAT_REPO}@${DAT_COMMIT.slice(0, 7)} (таблицы клиента PoE1) — RU-имена`,
        `tree.json ${tree.meta.tree} (S36)`
      ]
    },
    rows,
    names,
    sockets: socketsOut,
    jewels: jewelsOut
  }
  const size = writeData(path.join(OUT_DIR, 'timeless.json'), data)
  for (const [file, b] of Object.entries(files)) writeFileSync(path.join(OUT_DIR, file), b)
  // MIT PoB: уведомление об авторском праве — рядом с производными от его лукапов данными (в пакете и канале данных)
  const pobLicense = buf['LICENSE.md'].toString('utf8').split(/\*{20,}/)[1]?.trim()
  if (!pobLicense?.startsWith('Copyright (c) 2016 David Gowor')) throw new Error('LICENSE.md PoB: не нашли раздел MIT')
  writeFileSync(
    path.join(OUT_DIR, 'timeless-LICENSE.txt'),
    'timeless-*.bin и исходы в timeless.json получены из лукап-таблиц Path of Building Community\n' +
      `(https://github.com/${POB_REPO}, коммит ${POB_COMMIT}, src/Data/TimelessJewelData).\n\n${pobLicense}\n`
  )
  console.log(`timeless.json ${(size / 1024).toFixed(0)} КБ; нотаблов в радиусе ${rows.length}; гнёзд ${socketsOut.length}`)
  for (const [k, j] of Object.entries(jewelsOut)) console.log(`  ${k}: исходов ${j.outcomes.length}, ${j.file} ${(files[j.file].length / 1024).toFixed(0)} КБ`)
  if (report.enMismatch.length) console.log(`\nEN не совпал с PoB (${report.enMismatch.length}):\n  ${report.enMismatch.join('\n  ')}`)
  if (report.noRu.length) console.log(`\nнет RU (${report.noRu.length}): ${report.noRu.join(', ')}`)
  if (report.noLut.size) console.log(`\nнотаблы в радиусе без исхода в лукапе PoB (${report.noLut.size}): ${[...report.noLut].join('; ')}`)
  console.log(`готово за ${((Date.now() - t0) / 1000).toFixed(1)} с`)
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('build.mjs')) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
