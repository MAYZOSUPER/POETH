#!/usr/bin/env node
// RU-близнецы EN-фикстур PoE2: tests/fixtures/poe2/en/*.txt → tests/fixtures/poe2/ru/*.txt (то же имя файла).
//
//   node tools/data/make-poe2-ru-fixtures.mjs            # перегенерировать все RU-фикстуры
//   node tools/data/make-poe2-ru-fixtures.mjs --check    # только сравнить с тем, что лежит на диске
//
// Детерминированно и без сети: всё берётся из данных EE2 (resources/data/poe2/{en,ru}):
//  - заголовки, свойства, строки `{ … }` — по ключам client_strings.json (EN-строка → тот же ключ в RU);
//  - имена баз, уников, камней, валюты — items.ndjson по `refName`;
//  - строки модов — EN-строка → стат (`ref`) по EN-матчерам (тот же перебор плейсхолдеров, что у парсера) →
//    RU-матчер того же варианта (по `value`/`negate`, иначе по порядку) → подстановка чисел/диапазонов как в EN;
//  - класс предмета (`Класс предмета:`) — таблица ниже: названия классов из LocalIdentity/poe2-data
//    @ 6a49dbd72e745d338958525c4c570b4891719c72 (data/itemclasses.json ↔ data/russian/itemclasses.json; берём только
//    названия классов как факты GGG), классы неогранённых камней — свои (по RU-имени предмета).
// Что НЕ переводится (парсер это не читает): имена аффиксов в `{ … "Name" … }`, слова аффиксов в именах волшебных
// предметов, случайные имена редких, описания/подсказки/флейвор, теги камней, строки свойств флаконов кроме
// «Содержит зарядов», `(augmented)` / `(unmet)` / `(fire)` и суффиксы `(implicit)` / `(rune)` / … (в клиенте они
// английские и в RU). Это машинные близнецы, а не захваты из игры — см. tests/fixtures/poe2/README.md.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const DATA = path.join(ROOT, 'resources/data/poe2')
const FIX = path.join(ROOT, 'tests/fixtures/poe2')
const CHECK = process.argv.includes('--check')

// ---------------------------------------------------------------- справочники

/** Класс предмета EN → RU (LocalIdentity/poe2-data @ 6a49dbd, кроме помеченных «свой»). */
const ITEM_CLASS_RU = {
  Amulets: 'Амулеты',
  Belts: 'Пояса',
  'Body Armours': 'Нательные доспехи',
  Boots: 'Обувь',
  Bows: 'Луки',
  Bucklers: 'Баклеры',
  Charms: 'Обереги',
  Claws: 'Когти',
  Crossbows: 'Самострелы',
  Daggers: 'Кинжалы',
  Flails: 'Кистени',
  Foci: 'Фокусы',
  Gloves: 'Перчатки',
  Helmets: 'Шлемы',
  Jewels: 'Самоцветы',
  'Life Flasks': 'Флаконы жизни',
  'Mana Flasks': 'Флаконы маны',
  'One Hand Axes': 'Одноручные топоры',
  'One Hand Maces': 'Одноручные булавы',
  'One Hand Swords': 'Одноручные мечи',
  Quarterstaves: 'Боевые посохи',
  Quivers: 'Колчаны',
  Relics: 'Реликвии',
  Rings: 'Кольца',
  Sceptres: 'Скипетры',
  Shields: 'Щиты',
  'Skill Gems': 'Камни умений',
  Spears: 'Копья',
  'Stackable Currency': 'Валюта',
  Staves: 'Посохи',
  'Support Gems': 'Камни поддержки',
  Tablet: 'Плитки',
  'Two Hand Axes': 'Двуручные топоры',
  'Two Hand Maces': 'Двуручные булавы',
  'Two Hand Swords': 'Двуручные мечи',
  Wands: 'Жезлы',
  Waystones: 'Путевые камни',
  // свой: в poe2-data @ 6a49dbd у этих классов пустые названия
  'Uncut Skill Gems': 'Неогранённые камни умений',
  'Uncut Spirit Gems': 'Неогранённые камни духа',
  'Uncut Support Gems': 'Неогранённые камни поддержки'
}

/** Теги модов в строках `{ … — теги }`: часть есть в client_strings (*_TAG), остальные — своя таблица. */
const EXTRA_TAGS_RU = {
  Damage: 'Урон',
  Elemental: 'Стихии',
  Resistance: 'Сопротивление',
  Defences: 'Защита',
  Critical: 'Критический',
  Gem: 'Камень',
  Ailment: 'Состояние',
  Charm: 'Оберег'
}

/** Ключи client_strings — префиксы строк свойств («Quality: », «Armour: »…). */
const PROP_PREFIX_KEYS = [
  'ITEM_LEVEL',
  'GEM_LEVEL',
  'STACK_SIZE',
  'SOCKETS',
  'QUALITY',
  'PHYSICAL_DAMAGE',
  'ELEMENTAL_DAMAGE',
  'LIGHTNING_DAMAGE',
  'COLD_DAMAGE',
  'FIRE_DAMAGE',
  'CRIT_CHANCE',
  'ATTACK_SPEED',
  'ARMOUR',
  'EVASION',
  'ENERGY_SHIELD',
  'RUNIC_WARD',
  'BLOCK_CHANCE',
  'AREA_LEVEL',
  'CHARM_SLOTS',
  'BASE_SPIRIT',
  'PRICE_NOTE',
  'WAYSTONE_TIER',
  'TIMELESS_RADIUS',
  'RELOAD_SPEED',
  'WAYSTONE_REVIVES',
  'WAYSTONE_PACK_SIZE',
  'WAYSTONE_MAGIC_MONSTERS',
  'WAYSTONE_RARE_MONSTERS',
  'WAYSTONE_DROP_CHANCE',
  'WAYSTONE_RARITY',
  'WAYSTONE_MONSTER_RARITY',
  'WAYSTONE_EFFECTIVENESS',
  'TALISMAN_TIER',
  'TRIAL_COUNT'
]

/** Ключи client_strings — строки целиком. */
const FULL_LINE_KEYS = [
  'CORRUPTED',
  'DOUBLE_CORRUPTED',
  'MIRRORED',
  'SANCTIFIED',
  'FRACTURED_ITEM',
  'UNMODIFIABLE',
  'FOIL_UNIQUE',
  'VEILED_PREFIX',
  'VEILED_SUFFIX',
  'CANNOT_USE_ITEM',
  'SECTION_SYNTHESISED'
]

/** Тип мода в строке `{ … }` (EN) — ключи client_strings; порядок: длинные раньше. */
const MOD_TYPE_KEYS = [
  'VAAL_UNIQUE_MODIFIER',
  'CORRUPTED_MODIFIER',
  'UNIQUE_MODIFIER',
  'IMPLICIT_MODIFIER',
  'PREFIX_MODIFIER',
  'SUFFIX_MODIFIER',
  'ENCHANT_MODIFIER'
]
const MOD_TYPE_PREFIX_KEYS = ['FRACTURED_MODIFIER', 'DESECRATED_MODIFIER', 'CRAFTED_MODIFIER']

// суффиксы строк модов: в клиенте английские во всех языках (как в EE2)
const LINE_SUFFIXES = [
  [' (implicit)', 'implicit'],
  [' (enchant)', 'enchant'],
  [' (rune)', 'rune'],
  [' (added rune)', 'rune'],
  [' (fractured)', 'fractured'],
  [' (crafted)', 'crafted'],
  [' (desecrated)', 'desecrated'],
  [' (scourge)', 'scourge']
]

// ---------------------------------------------------------------- данные

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'))
}

function reviveStrings(raw) {
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    out[k] = v && typeof v === 'object' && '$re' in v ? new RegExp(v.$re, v.$flags) : v
  }
  return out
}

function readNdjson(rel) {
  return fs
    .readFileSync(path.join(DATA, rel), 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

const EN = reviveStrings(readJson('en/client_strings.json'))
const RU = reviveStrings(readJson('ru/client_strings.json'))

const enItems = readNdjson('en/items.ndjson')
const ruItems = readNdjson('ru/items.ndjson')
const enItemsByName = groupBy(enItems, (r) => `${r.namespace}::${r.name}`)
const ruItemsByRef = groupBy(ruItems, (r) => `${r.namespace}::${r.refName}`)

const enStats = readNdjson('en/stats.ndjson')
const ruStatsByRef = new Map(readNdjson('ru/stats.ndjson').map((s) => [s.ref, s]))
const enStatByMatch = new Map()
for (const stat of enStats) {
  for (const m of stat.matchers) {
    for (const field of ['string', 'advanced']) {
      if (m[field] && !enStatByMatch.has(m[field])) enStatByMatch.set(m[field], { stat, matcher: m, field })
    }
  }
}

function groupBy(list, key) {
  const map = new Map()
  for (const item of list) {
    const k = key(item)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(item)
  }
  return map
}

const warnings = []
/** строки без перевода (описания, флейвор, моды, которых нет в данных) — по файлам, выводятся с --verbose */
const untranslated = new Map()
function warn(file, msg) {
  warnings.push(`${file}: ${msg}`)
}

// ---------------------------------------------------------------- предметы

function ruItemName(ns, enName, file, filter) {
  const en = enItemsByName.get(`${ns}::${enName}`)
  if (!en) return undefined
  const ru = (ruItemsByRef.get(`${ns}::${en[0].refName}`) ?? []).filter(filter ?? (() => true))
  if (!ru.length) {
    warn(file, `нет RU-имени для ${ns} «${enName}»`)
    return undefined
  }
  return ru[0].name
}

/** Шаблон RU из регулярки client_strings: `^(.*) высокого качества$` + имя → «Имя высокого качества». */
function fromRegexTemplate(re, value) {
  return re.source.replace(/^\^/, '').replace(/\$$/, '').replace('(.*)', value)
}

function translateSingleName(line, rarity, file) {
  if (rarity === EN.RARITY_GEM) return ruItemName('GEM', line, file) ?? keep(line, file, 'камень')
  const direct = ruItemName('ITEM', line, file)
  if (direct) return direct
  if (rarity === EN.RARITY_NORMAL) {
    for (const key of ['ITEM_SUPERIOR', 'ITEM_EXCEPTIONAL']) {
      const m = EN[key].exec(line)
      const base = m && ruItemName('ITEM', m[1], file)
      if (base) return fromRegexTemplate(RU[key], base)
    }
  }
  if (rarity === EN.RARITY_MAGIC) {
    // [префикс] база [суффикс]: самая длинная подпоследовательность слов, которая является базой
    const words = line.split(' ')
    let best
    for (let start = 0; start < words.length; start++) {
      for (let end = start + 1; end <= words.length; end++) {
        const sub = words.slice(start, end).join(' ')
        const found = enItemsByName.get(`ITEM::${sub}`)
        if (found?.[0].craftable && (!best || sub.length > best.sub.length)) best = { sub, start, end }
      }
    }
    if (best) {
      const ruBase = ruItemName('ITEM', best.sub, file)
      if (ruBase) return [...words.slice(0, best.start), ruBase, ...words.slice(best.end)].join(' ')
    }
  }
  return keep(line, file, 'имя')
}

function keep(line, file, what) {
  warn(file, `${what} без перевода: «${line}»`)
  return line
}

// ---------------------------------------------------------------- моды

function* placeholders(stat) {
  const matches = []
  const withPlaceholders = stat
    .replace(/\(\)/gm, '')
    .replace(
      /(?<value>(?<!\d|\))[+-]?\d+(?:\.\d+)?)(?:\((?<min>.[^)-]*)(?:-(?<max>[^)]+))?\))?/gm,
      (full, roll, min, max) => {
        if (min != null && max == null) max = min
        const bounds = { min: Number(min), max: Number(max) }
        const valid = !(Number.isNaN(bounds.min) || Number.isNaN(bounds.max))
        matches.push({ rollStr: roll, raw: valid ? full : roll })
        return valid ? '#' : min != null ? `#(${min}-${max})` : '#'
      }
    )
  const MAP = [
    [[]],
    [[0], []],
    [[0, 1], [0], [1], []],
    [[0, 1, 2], [1, 2], [0, 2], [0, 1], [2], [1], [0], []],
    [
      [0, 1, 2, 3],
      [1, 2, 3],
      [0, 2, 3],
      [0, 1, 3],
      [0, 1, 2],
      [2, 3],
      [1, 3],
      [1, 2],
      [0, 3],
      [0, 2],
      [0, 1],
      [3],
      [2],
      [1],
      [0],
      []
    ]
  ]
  if (matches.length < MAP.length) {
    for (const replacements of MAP[matches.length]) {
      let idx = -1
      const replaced = withPlaceholders.replace(/#/gm, () => {
        idx += 1
        return replacements.includes(idx) ? matches[idx].rollStr : '#'
      })
      yield { stat: replaced, values: matches.filter((_, i) => !replacements.includes(i)) }
    }
  }
  yield { stat, values: [] }
}

/** Вариант RU-матчера, соответствующий EN-матчеру (по value/negate, иначе по порядку среди «обычных»). */
function pickRuMatcher(enMatchers, enMatcher, ruMatchers) {
  const sameKind = (m) => (m.value ?? null) === (enMatcher.value ?? null) && !!m.negate === !!enMatcher.negate
  if (enMatcher.value != null) return ruMatchers.find(sameKind)
  const enList = enMatchers.filter(sameKind)
  const ruList = ruMatchers.filter(sameKind)
  return ruList[enList.indexOf(enMatcher)] ?? ruList[0]
}

function renderRu(combo, hit) {
  const ruStat = ruStatsByRef.get(hit.stat.ref)
  if (!ruStat) return undefined
  const ruMatcher = pickRuMatcher(hit.stat.matchers, hit.matcher, ruStat.matchers)
  if (!ruMatcher) return undefined
  const template = ruMatcher[hit.field] ?? ruMatcher.string
  const holes = (template.match(/#/g) ?? []).length
  if (holes !== combo.values.length) return undefined
  let i = 0
  return template.replace(/#/g, () => combo.values[i++].raw)
}

/** EN-строка стата (без суффикса и «— Unscalable Value») → RU или undefined. */
function translateStatString(text, modType) {
  let fallback
  for (const combo of placeholders(text)) {
    const hit = enStatByMatch.get(combo.stat)
    if (!hit) continue
    const ids = hit.stat.trade?.ids ?? {}
    const typeOk = modType in ids || hit.stat.ref.startsWith(EN.GRANTS_SKILL)
    if (!typeOk) {
      fallback ??= { combo, hit }
      continue
    }
    const ru = renderRu(combo, hit)
    if (ru !== undefined) return ru
  }
  return fallback ? renderRu(fallback.combo, fallback.hit) : undefined
}

function splitSuffix(line) {
  for (const [suffix, type] of LINE_SUFFIXES) {
    if (line.endsWith(suffix)) return [line.slice(0, -suffix.length), suffix, type]
  }
  return [line, '', undefined]
}

/** Строки статов одного мода (или секции обычного формата) → RU. Многострочные статы — как у парсера. */
function translateStatLines(lines, modType, file) {
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line === '' || /^\s*\(/.test(line)) {
      out.push(line)
      i++
      continue
    }
    let done = false
    for (let end = i; end < Math.min(lines.length, i + 3) && !done; end++) {
      const parts = lines.slice(i, end + 1).map(splitSuffix)
      const suffix = parts[0][1]
      const type = parts[0][2] ?? (lines[i].startsWith(EN.GRANTS_SKILL) ? 'skill' : modType)
      let text = parts.map((p) => p[0]).join('\n')
      const unscalable = text.endsWith(EN.UNSCALABLE_VALUE)
      if (unscalable) text = text.slice(0, -EN.UNSCALABLE_VALUE.length)
      const emptyParens = text.endsWith('()')
      const ru = translateStatString(text, type)
      if (ru === undefined) continue
      const ruLines = (ru + (emptyParens ? '()' : '') + (unscalable ? RU.UNSCALABLE_VALUE : '')).split('\n')
      out.push(...ruLines.map((l) => l + suffix))
      i = end + 1
      done = true
    }
    if (!done) {
      if (!untranslated.has(file)) untranslated.set(file, [])
      untranslated.get(file).push(line)
      out.push(line)
      i++
    }
  }
  return out
}

function translateTags(text) {
  const tagMap = {}
  for (const key of Object.keys(EN).filter((k) => k.endsWith('_TAG'))) tagMap[EN[key]] = RU[key]
  Object.assign(tagMap, EXTRA_TAGS_RU)
  return text
    .split(', ')
    .map((t) => tagMap[t] ?? t)
    .join(', ')
}

/** `{ Fractured Prefix Modifier "Name" (Tier: 2) — Tags — 22% Increased }` → RU + тип мода для статов. */
function translateModHeader(line, file, relic) {
  const parts = line
    .slice(1, -1)
    .split('—')
    .map((s) => s.trim())
  const m = parts[0].match(EN.MODIFIER_LINE)
  if (!m) return { line: keep(line, file, 'строка { … }'), modType: 'explicit' }
  let type = m.groups.type.trim()
  let modType = relic ? 'sanctum' : 'explicit'
  const ruType = []
  for (const key of MOD_TYPE_PREFIX_KEYS) {
    if (type.startsWith(EN[key])) {
      ruType.push(RU[key])
      type = type.slice(EN[key].length).trim()
      if (modType !== 'fractured')
        modType = key === 'FRACTURED_MODIFIER' ? 'fractured' : key === 'DESECRATED_MODIFIER' ? 'desecrated' : 'crafted'
    }
  }
  const baseKey = MOD_TYPE_KEYS.find((k) => EN[k] === type)
  if (!baseKey) warn(file, `тип мода без перевода: «${type}»`)
  ruType.push(baseKey ? RU[baseKey] : type)
  if (baseKey === 'IMPLICIT_MODIFIER') modType = 'implicit'
  if (baseKey === 'ENCHANT_MODIFIER' || baseKey === 'CORRUPTED_MODIFIER') modType = 'enchant'

  let head = ruType.join(' ')
  if (m.groups.name != null) head += ` "${m.groups.name}"`
  if (m.groups.tier) head += ` (${tierLabel(RU.MODIFIER_LINE, 'tier')}: ${m.groups.tier})`
  if (m.groups.rank) head += ` (${tierLabel(RU.MODIFIER_LINE, 'rank')}: ${m.groups.rank})`

  const rest = parts.slice(1).map((p) => {
    const incr = EN.MODIFIER_INCREASED.exec(p)
    return incr ? fromRegexTemplate(RU.MODIFIER_INCREASED, incr[1]) : translateTags(p)
  })
  return { line: `{ ${[head, ...rest].join(' — ')} }`, modType }
}

/** «Уровень» / «Ранг» из RU-регулярки MODIFIER_LINE: `\(Уровень: (?<tier>\d+)\)`. */
function tierLabel(re, group) {
  const m = new RegExp(`\\\\\\(([^:()\\\\]+): \\(\\?<${group}>`).exec(re.source)
  if (!m) throw new Error(`MODIFIER_LINE RU: не найдена подпись группы ${group}`)
  return m[1]
}

// ---------------------------------------------------------------- свойства

const PROP_PREFIXES = PROP_PREFIX_KEYS.map((k) => [EN[k], RU[k]])
  .filter(([en, ru]) => en && ru)
  .sort((a, b) => b[0].length - a[0].length)

function translateRequires(line) {
  return line
    .replace(EN.REQUIRES, RU.REQUIRES)
    .replace(/Level (?=\d)/, 'Уровень ')
    .replace(/ (?:Strength|Str)(?=,|$)/, ' Сила')
    .replace(/ Dexterity(?=,|$)/, ' Ловкость')
    .replace(/ Dex(?=,|$)/, ' Ловк')
    .replace(/ Intelligence(?=,|$)/, ' Интеллект')
    .replace(/ Int(?=,|$)/, ' Инт')
}

const LEGACY_REQ_ATTR = [
  [/^(?:Strength|Str): /, 'Сила: '],
  [/^Dexterity: /, 'Ловкость: '],
  [/^Dex: /, 'Ловк: '],
  [/^Intelligence: /, 'Интеллект: '],
  [/^Int: /, 'Инт: ']
]

function translatePropertyLine(line) {
  for (const key of FULL_LINE_KEYS) {
    if (line.trim() === EN[key].trim()) return RU[key].trim()
  }
  const unid = EN.UNIDENTIFIED.exec(line)
  if (unid) {
    const tierWord = /\\\(([^\\\s]+)\\s\*/.exec(RU.UNIDENTIFIED.source)?.[1]
    return (
      RU.UNIDENTIFIED.source.match(/^\^([^(]+)/)[1] + (unid.groups?.tier ? ` (${tierWord} ${unid.groups.tier})` : '')
    )
  }
  if (line.startsWith(EN.REQUIRES)) return translateRequires(line)
  if (EN.FLASK_CHARGES.test(line)) {
    const n = /\d+/.exec(line)[0]
    return RU.FLASK_CHARGES.source.replace(/^\^/, '').replace(/\$$/, '').replace('\\d+', n)
  }
  for (const [en, ru] of PROP_PREFIXES) {
    if (line.startsWith(en)) return ru + line.slice(en.length)
  }
  return undefined
}

// ---------------------------------------------------------------- текст предмета

function toSections(text) {
  const lines = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n')
  const sections = [[]]
  for (const line of lines) {
    if (line === '--------') sections.push([])
    else sections[sections.length - 1].push(line)
  }
  return sections
}

function translateItem(text, file) {
  const sections = toSections(text)
  const out = sections.map((s) => [...s])

  // --- табличка с именем
  const plate = out[0]
  let li = 0
  let rarity
  if (plate[li]?.startsWith(EN.ITEM_CLASS)) {
    const cls = plate[li].slice(EN.ITEM_CLASS.length)
    const ruCls = ITEM_CLASS_RU[cls] ?? keep(cls, file, 'класс предмета')
    plate[li] = RU.ITEM_CLASS + ruCls
    li++
  }
  if (plate[li]?.startsWith(EN.RARITY)) {
    rarity = plate[li].slice(EN.RARITY.length)
    const key = Object.keys(EN).find((k) => k.startsWith('RARITY_') && EN[k] === rarity)
    plate[li] = RU.RARITY + (key ? RU[key] : keep(rarity, file, 'редкость'))
    li++
  }
  let nameLines = plate.slice(li)
  let nameSection = 0
  if (nameLines[0] === EN.CANNOT_USE_ITEM) {
    plate[li] = RU.CANNOT_USE_ITEM
    nameSection = 1
    nameLines = out[1]
    li = 0
  }
  const target = out[nameSection]
  const isUnique = rarity === EN.RARITY_UNIQUE
  if (nameLines.length >= 2 && rarity !== EN.RARITY_GEM) {
    const [name, base] = nameLines
    const enBase = enItemsByName.get(`ITEM::${base}`)
    const ruBase = ruItemName('ITEM', base, file) ?? keep(base, file, 'база')
    let ruName = name
    if (isUnique) {
      ruName =
        ruItemName('UNIQUE', name, file, (r) => !enBase || r.unique?.base === enBase[0].refName) ??
        keep(name, file, 'уник')
    }
    target[li] = ruName
    target[li + 1] = ruBase
  } else if (nameLines.length >= 1) {
    target[li] = translateSingleName(nameLines[0], rarity, file)
  }

  // --- остальные секции
  const relic = sections[0][0] === `${EN.ITEM_CLASS}Relics`
  for (let si = 0; si < out.length; si++) {
    if (si === 0 || (si === nameSection && nameSection === 1)) continue
    const section = out[si]
    const src = sections[si]
    const legacyReq = src[0] === `${EN.REQUIREMENTS}:`
    if (legacyReq) {
      section[0] = `${RU.REQUIREMENTS}:`
      for (let i = 1; i < section.length; i++) {
        const prop = translatePropertyLine(src[i])
        let line = prop ?? src[i]
        for (const [re, ru] of LEGACY_REQ_ATTR) line = line.replace(re, ru)
        section[i] = line
      }
      continue
    }
    if (src.some((l) => l.startsWith('{') && l.endsWith('}'))) {
      // расширенный формат: заголовки `{ … }` и строки статов под ними
      let modType = relic ? 'sanctum' : 'explicit'
      const result = []
      let group = []
      const flush = () => {
        if (group.length) result.push(...translateStatLines(group, modType, file))
        group = []
      }
      for (const line of src) {
        if (line.startsWith('{') && line.endsWith('}')) {
          flush()
          const h = translateModHeader(line, file, relic)
          result.push(h.line)
          modType = h.modType
        } else {
          group.push(line)
        }
      }
      flush()
      out[si] = result
      continue
    }
    // свойства / моды обычного формата
    const result = []
    let pending = []
    const flush = () => {
      if (pending.length) result.push(...translateStatLines(pending, relic ? 'sanctum' : 'explicit', file))
      pending = []
    }
    for (const line of src) {
      const prop = translatePropertyLine(line)
      if (prop !== undefined) {
        flush()
        result.push(prop)
      } else {
        pending.push(line)
      }
    }
    flush()
    out[si] = result
  }

  return out.map((s) => s.join('\n')).join('\n--------\n') + '\n'
}

// ---------------------------------------------------------------- main

const enDir = path.join(FIX, 'en')
const ruDir = path.join(FIX, 'ru')
fs.mkdirSync(ruDir, { recursive: true })
let changed = 0
for (const file of fs
  .readdirSync(enDir)
  .filter((f) => f.endsWith('.txt'))
  .sort()) {
  const ru = translateItem(fs.readFileSync(path.join(enDir, file), 'utf8'), file)
  const target = path.join(ruDir, file)
  const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
  if (before !== ru) {
    changed++
    if (CHECK) console.log(`отличается: ru/${file}`)
    else fs.writeFileSync(target, ru)
  }
}
for (const w of warnings) console.warn(`  ! ${w}`)
for (const [file, lines] of untranslated) {
  console.log(`  ${file}: ${lines.length} строк(и) без перевода (описания/флейвор/нет в данных)`)
  if (process.argv.includes('--verbose')) for (const l of lines) console.log(`      «${l}»`)
}
console.log(`${CHECK ? 'проверено' : 'записано'}: ${changed} изменённых RU-фикстур, предупреждений: ${warnings.length}`)
if (CHECK && changed) process.exitCode = 1
