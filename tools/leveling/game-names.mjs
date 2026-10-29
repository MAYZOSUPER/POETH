// Имена из клиента игры для данных прокачки PoE1 (S31): зоны, квесты, боссы, NPC, предметы квестов, надписи
// объектов и арен, лабиринты, классы — EN и RU так, как их пишет клиент. Гид показывает их на языке клиента
// игры (Settings.gameLang), а текст шага — на языке интерфейса.
//
//   node tools/leveling/game-names.mjs [--refresh]      # дописать имена в готовый leveling.json
//   (build.mjs вызывает applyGameNames сам — при полной пересборке)
//
// Источник — таблицы клиента PoE1 (.datc64) в CSV по языкам: выгрузка repoe-fork/dat-export (инструмент проверки
// dat-schema на pathofexile-dat, SnosMe) по коммиту DAT_COMMIT, версия игры — в его сообщении. Берём только имена
// (тексты GGG как факты, кода нет). Кэш — .cache/leveling/dat-export/ (в git не кладём).
//
// Что делаем с leveling.json:
//  - зоны — по id из WorldAreas (у RU-имён клиента есть падежи «<if:gen>{…}<else>{…}» — берём именительный);
//  - квесты — по id из Quest;
//  - имена фрагментов маршрута ({kill|…}, {arena|…}, {generic|…}, {quest_text|…}) и NPC наград — по таблицам
//    в порядке вида (KINDS); не нашлось — имя не из игры (описание: «лодку», «всех»): остаётся наш перевод из
//    phrases.ru.mjs, и такое имя попадает в `plain` — его гид пишет на языке интерфейса;
//  - имя в маршруте с опечаткой или без «The» (The Bring King's Throne, The Resonator) — заменяем на имя клиента;
//  - лабиринты (Labyrinths) и классы с классами восхождения EN/RU → базовый класс (Characters, Ascendancy).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const CACHE = path.join(ROOT, '.cache/leveling/dat-export')
const OUT = path.join(ROOT, 'resources/data/poe1/leveling/leveling.json')

export const DAT_REPO = 'repoe-fork/dat-export'
/** «export data at version 3.29.3.3 / 0.5.5.5» */
export const DAT_COMMIT = 'cf45257e2f1759dae95c762ce9ab574bd345f236'
const UA = 'POETH dataset build (+https://github.com/MAYZOSUPER/POETH)'

const TABLES = [
  'WorldAreas',
  'Quest',
  'NPCs',
  'MonsterVarieties',
  'BaseItemTypes',
  'Chests',
  'ClientStrings',
  'Labyrinths',
  'Characters',
  'Ascendancy'
]

// ---------------------------------------------------------------------------
// Загрузка и разбор CSV
// ---------------------------------------------------------------------------

async function table(name, refresh) {
  const file = path.join(CACHE, `${name}.csv`)
  if (!refresh && existsSync(file)) return parseCsv(readFileSync(file, 'utf8'))
  const url = `https://raw.githubusercontent.com/${DAT_REPO}/${DAT_COMMIT}/current/poe/heuristics/csv/${name}.csv`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const text = await res.text()
  mkdirSync(CACHE, { recursive: true })
  writeFileSync(file, text, 'utf8')
  return parseCsv(text)
}

/** CSV (RFC 4180: кавычки, "" внутри, переводы строк в полях) → строки-объекты по заголовку. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let f = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c !== '"') f += c
      else if (text[i + 1] === '"') {
        f += '"'
        i++
      } else q = false
    } else if (c === '"') q = true
    else if (c === ',') {
      row.push(f)
      f = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(f)
      rows.push(row)
      row = []
      f = ''
    } else f += c
  }
  if (f || row.length) {
    row.push(f)
    rows.push(row)
  }
  const [head, ...rest] = rows
  return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((k, i) => [k, r[i] ?? ''])))
}

export async function loadClientTables({ refresh = false } = {}) {
  const out = {}
  for (const t of TABLES) out[t] = await table(t, refresh)
  return out
}

// ---------------------------------------------------------------------------
// Имена
// ---------------------------------------------------------------------------

/** Именительный падеж из RU-строки клиента: «<if:gen>{Побережья}<else>{Побережье}» → «Побережье». */
export function nominative(s) {
  const t = String(s ?? '').trim()
  const m = /<else>\{([^}]*)\}/.exec(t)
  if (m) return m[1].trim()
  return t.replace(/<[^>]*>\{([^}]*)\}/g, '$1').trim()
}

/** Для сравнения EN-имён: регистр, апострофы, «The» в начале. */
const norm = (s) =>
  String(s)
    .replace(/[’`]/g, "'")
    .replace(/^the\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

/** Однобуквенные опечатки маршрута (The Bring King's Throne): расстояние Левенштейна ≤ 1 при длине ≥ 12. */
function near(a, b) {
  if (Math.abs(a.length - b.length) > 1 || a.length < 12) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
      continue
    }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else {
      i++
      j++
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/**
 * Где искать имя по виду фрагмента: таблица и (для ClientStrings) какие строки — надписи объектов и арен.
 * Порядок — приоритет: босс — сперва монстры, NPC — сперва NPC, предмет квеста — базы предметов и надписи.
 */
const SOURCES = {
  monster: { table: 'MonsterVarieties' },
  npc: { table: 'NPCs', cols: ['Name', 'ShortName'] },
  item: { table: 'BaseItemTypes' },
  chest: { table: 'Chests' },
  object: { table: 'ClientStrings', col: 'Text', id: /^ObjectDisplayText|^SecretPassage$/ },
  // арены боссов: ArenaName*, BrutusAreaName, UnholySubBossDomain* (Жатва), MapStair* (переходы)
  arenaStr: { table: 'ClientStrings', col: 'Text', id: /Arena|AreaName|SubBossDomain|^MapStair/ },
  area: { table: 'WorldAreas' },
  quest: { table: 'Quest' }
}
const KINDS = {
  kill: ['monster', 'npc'],
  npc: ['npc', 'monster'],
  qtext: ['item', 'object', 'chest', 'quest', 'npc', 'monster'],
  generic: ['npc', 'item', 'object', 'chest', 'monster'],
  arena: ['arenaStr', 'area', 'object']
}

function buildIndex(tables) {
  const idx = {}
  for (const [key, src] of Object.entries(SOURCES)) {
    const exact = new Map()
    const loose = []
    for (const r of tables[src.table]) {
      if (src.id && !src.id.test(r.Id)) continue
      for (const col of src.cols ?? [src.col ?? 'Name']) {
        const en = (r[col] ?? '').trim()
        const ru = nominative(r[`${col} (Russian)`])
        if (!en || !ru) continue
        const hit = { en, ru, id: r.Id }
        if (!exact.has(en)) exact.set(en, [])
        exact.get(en).push(hit)
        loose.push(hit)
      }
    }
    idx[key] = { exact, loose }
  }
  return idx
}

/** Самое частое RU среди строк с одним EN (у монстров одно имя — много строк). */
function pick(hits) {
  const count = new Map()
  for (const h of hits) count.set(h.ru, (count.get(h.ru) ?? 0) + 1)
  const ru = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
  return { en: hits[0].en, ru, ambiguous: count.size > 1 ? [...count.keys()] : null }
}

/** Имя клиента для EN-имени маршрута по видам фрагментов: точное → без «The»/регистра → опечатка в букву. */
export function lookupName(idx, en, kinds) {
  const order = [...new Set(kinds.flatMap((k) => KINDS[k] ?? []))]
  for (const s of order) {
    const hits = idx[s].exact.get(en)
    if (hits) return { ...pick(hits), from: s, how: 'exact' }
  }
  const n = norm(en)
  for (const s of order) {
    const hits = idx[s].loose.filter((h) => norm(h.en) === n)
    if (hits.length) return { ...pick(hits), from: s, how: 'loose' }
  }
  // опечатка — не множественное число: «Find 3x Kitava's Torment» — три разных предмета, а не квест «…Torments»;
  // у монстров можно: «kill Gemling Legionnaires» — над монстрами в игре «Gemling Legionnaire»
  const plural = (a, b) => a + 's' === b || b + 's' === a
  for (const s of order) {
    const hits = idx[s].loose.filter((h) => near(norm(h.en), n) && (s === 'monster' || !plural(norm(h.en), n)))
    if (hits.length) return { ...pick(hits), from: s, how: 'typo' }
  }
  return null
}

const LAB_TIER = { 1: 'normal', 2: 'cruel', 3: 'merciless', 4: 'eternal' }

/** NPC вне маршрута, которых называет вкладка «Кампания»: выбор у бандитов («помочь Alira»), Несса. */
const EXTRA_NPCS = ['Alira', 'Kraityn', 'Oak', 'Nessa']

/**
 * Дописать имена клиента в данные прокачки (мутирует data). report — что поменялось и чего в клиенте нет.
 * Наш перевод имён, которых в клиенте нет, берётся из data.names (его кладёт build.mjs из phrases.ru.mjs).
 */
export function applyGameNames(data, tables) {
  const report = { missing: [], areas: [], quests: [], names: [], renamed: [], plain: [], ambiguous: [] }
  const byId = (t) => new Map(tables[t].map((r) => [r.Id, r]))

  const wa = byId('WorldAreas')
  for (const [id, a] of Object.entries(data.areas)) {
    const r = wa.get(id)
    if (!r) {
      report.missing.push(`зона ${id} ${a.en}: нет в WorldAreas`)
      continue
    }
    const en = r.Name.trim()
    const ru = nominative(r['Name (Russian)'])
    if (en && ru && (en !== a.en || ru !== a.ru)) report.areas.push(`${id}: ${a.en} / ${a.ru} → ${en} / ${ru}`)
    if (en) a.en = en
    if (ru) a.ru = ru
  }

  const qs = byId('Quest')
  for (const [id, q] of Object.entries(data.quests)) {
    const r = qs.get(id)
    const en = r?.Name.trim()
    const ru = r ? nominative(r['Name (Russian)']) : ''
    if (!en || !ru) {
      report.missing.push(`квест ${id} ${q.en}: нет в Quest`)
      continue
    }
    if (en !== q.en || ru !== q.ru) report.quests.push(`${id}: ${q.en} / ${q.ru} → ${en} / ${ru}`)
    q.en = en
    q.ru = ru
  }

  // какие имена каким видом фрагмента встречаются (одно имя — бывает и боссом, и {generic})
  const kinds = new Map()
  const want = (en, k) => {
    if (!kinds.has(en)) kinds.set(en, new Set())
    kinds.get(en).add(k)
  }
  const fragParts = function* () {
    for (const s of data.sections)
      for (const st of s.steps) for (const p of [...st.parts, ...(st.sub ?? []).flatMap((x) => [...x.en, ...x.ru])]) yield p
  }
  for (const p of fragParts()) if (p && typeof p === 'object' && p.k in KINDS) want(p.v, p.k)
  for (const q of Object.values(data.quests))
    for (const r of Object.values(q.rewards ?? {})) {
      if (r.npc) want(r.npc, 'npc')
      for (const v of r.vendor) if (v.npc) want(v.npc, 'npc')
    }
  for (const en of EXTRA_NPCS) want(en, 'npc')

  const idx = buildIndex(tables)
  const names = {}
  const plain = []
  const rename = new Map()
  for (const [en, ks] of [...kinds.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const hit = lookupName(idx, en, [...ks])
    if (!hit) {
      plain.push(en)
      names[en] = data.names[en] ?? en
      report.plain.push(`${en} = ${names[en]} (${[...ks].join(', ')})`)
      continue
    }
    if (hit.ambiguous) report.ambiguous.push(`${en}: ${hit.ambiguous.join(' | ')} → ${hit.ru}`)
    if (hit.en !== en) {
      rename.set(en, hit.en)
      report.renamed.push(`${en} → ${hit.en} (${hit.how}, ${hit.from})`)
    }
    if (data.names[en] !== hit.ru) report.names.push(`${hit.en}: ${data.names[en] ?? '—'} → ${hit.ru} (${hit.from})`)
    names[hit.en] = hit.ru
  }
  // опечатки и «The» маршрута → имя клиента: в шагах, подсказках и наградах
  if (rename.size) {
    for (const p of fragParts()) if (p && typeof p === 'object' && p.k in KINDS && rename.has(p.v)) p.v = rename.get(p.v)
    for (const q of Object.values(data.quests))
      for (const r of Object.values(q.rewards ?? {})) {
        if (r.npc && rename.has(r.npc)) r.npc = rename.get(r.npc)
        for (const v of r.vendor) if (rename.has(v.npc)) v.npc = rename.get(v.npc)
      }
  }
  data.names = names
  data.plain = plain.sort()

  data.labs = {}
  for (const r of tables.Labyrinths) {
    const tier = LAB_TIER[r.Tier]
    if (tier) data.labs[tier] = { en: r.Name.trim(), ru: nominative(r['Name (Russian)']) }
  }
  for (const tier of Object.values(LAB_TIER)) if (!data.labs[tier]) throw new Error(`нет лабиринта ${tier} в Labyrinths`)

  // классы: базовый и восхождения на EN и RU → базовый EN (награды-камни exile-leveling — по базовому)
  const base = new Map(tables.Characters.map((r) => [r.rownum, r.Name.trim()]))
  data.classes = {}
  for (const r of tables.Characters) {
    data.classes[r.Name.trim()] = r.Name.trim()
    data.classes[nominative(r['Name (Russian)'])] = r.Name.trim()
  }
  for (const r of tables.Ascendancy) {
    const b = base.get(r.Character)
    if (!b) continue
    for (const n of [r.Name.trim(), r.Id.trim(), nominative(r['Name (Russian)'])]) if (n && !data.classes[n]) data.classes[n] = b
  }

  const src = `${DAT_REPO}@${DAT_COMMIT.slice(0, 7)} (таблицы клиента PoE1)`
  data.meta.names = [src, ...(data.meta.names ?? []).filter((n) => !n.startsWith(DAT_REPO))]
  return report
}

export function printReport(report) {
  const out = (label, list) => list.length && console.log(`\n${label} (${list.length}):\n  ${list.join('\n  ')}`)
  out('нет в клиенте — осталось имя маршрута', report.missing)
  out('зоны: изменено по клиенту', report.areas)
  out('квесты: изменено по клиенту', report.quests)
  out('имена: изменено по клиенту', report.names)
  out('имена маршрута → как в клиенте', report.renamed)
  out('несколько RU у одного EN (взято частое)', report.ambiguous)
  out('нет в клиенте — описание, на языке интерфейса (plain)', report.plain)
}

async function main() {
  const refresh = process.argv.includes('--refresh')
  const tables = await loadClientTables({ refresh })
  const data = JSON.parse(readFileSync(OUT, 'utf8'))
  const report = applyGameNames(data, tables)
  writeFileSync(OUT, JSON.stringify(data) + '\n', 'utf8')
  printReport(report)
  console.log(`\nимён ${Object.keys(data.names).length}, из них не из игры ${data.plain.length} → ${path.relative(ROOT, OUT)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
