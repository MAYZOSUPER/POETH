#!/usr/bin/env node
// Генератор данных regex-строк PoE 2 (этап S62): путевые камни, плитки (в игре «Tablet» / «Плитка»), торговец.
//
// Источники:
//   • RePoE fork PoE 2 (https://repoe-fork.github.io/poe2/, код MIT, данные © GGG): mods, base_items,
//     stat_translations (stat_descriptions, tablet_stat_descriptions) — какие моды бывают на путевых камнях,
//     плитках и снаряжении и их английский текст. Кэш — tools/regex/poe2/sources/ (в .gitignore).
//   • Exiled Exchange 2 (MIT, уже в репозитории: resources/data/poe2/{en,ru}) — русский текст тех же статов
//     (связь — trade id из stat_translations), строки клиента (метки свойств путевого камня), названия баз.
// poe2.re и poe2-regex-ru НЕ используются (нет лицензии): алгоритм «кратчайшая уникальная подстрока» — свой
// (как у PoE 1, tools/regex/build-regex-data.mjs; помощники импортируются оттуда).
//
// Выход: resources/data/poe2/regex/regex.{en,ru}.json — { meta, waystone, tablet, vendor } (формат —
// Poe2RegexData в src/shared/types/regex.ts). Main отдаёт по IPC regex:poeTwoData (сначала userData/data —
// обновление без переустановки). Корпус для тестов — tests/regex/poe2/fixtures/corpus.{en,ru}.json.
//
// Запуск:
//   node tools/regex/poe2/build-poe2-regex-data.mjs                 — из кэша (скачает недостающее)
//   node tools/regex/poe2/build-poe2-regex-data.mjs --refresh       — перекачать (новый патч, 1.0 — 11.12)
//   node tools/regex/poe2/build-poe2-regex-data.mjs --refresh --patch 1.0
// Сборка детерминированная: те же источники → байт-в-байт те же файлы.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  ROOT,
  escapeRegex,
  fold,
  indexTranslations,
  normLine,
  pickVariant,
  renderVariant,
  substrings,
  toRegex
} from '../build-regex-data.mjs'
import { buildVendor } from './vendor.mjs'

const TOOL_DIR = path.join(ROOT, 'tools/regex/poe2')
const SRC_DIR = path.join(TOOL_DIR, 'sources')
const OUT_DIR = path.join(ROOT, 'resources/data/poe2/regex')
const OUT_CORPUS = path.join(ROOT, 'tests/regex/poe2/fixtures')
const EE2_DIR = path.join(ROOT, 'resources/data/poe2')
const BASE_URL = 'https://repoe-fork.github.io/poe2/'
export const DEFAULT_PATCH = '0.5.5'
export const LANGS = ['en', 'ru']

const SOURCES = {
  mods: 'mods.min.json',
  bases: 'base_items.min.json',
  stats: 'stat_translations/stat_descriptions.min.json',
  tabletStats: 'stat_translations/tablet_stat_descriptions.min.json'
}

/**
 * Таблицы игры (факт-справка, как названия классов фикстур S47): слова имён редких предметов и русские имена
 * аффиксов — LocalIdentity/poe2-data @ 6a49dbd (выгрузка 0.1.x). В тайнике у каждого редкого предмета имя из двух
 * слов («Gloom Path» / «Мрачный путь»); токен не должен совпадать с ним (ни внутри слова, ни на стыке слов).
 */
const P2D_SHA = '6a49dbd72e745d338958525c4c570b4891719c72'
const P2D_URL = `https://raw.githubusercontent.com/LocalIdentity/poe2-data/${P2D_SHA}/data/`
const P2D_SOURCES = { words: 'words.json', wordsRu: 'russian/words.json', modsRu: 'russian/mods.json' }
/** Списки слов имён редких предметов: 1 — первое слово (прилагательное), 2 — второе. */
const RARE_WORDLISTS = new Set([1, 2])

/** Короче 3 символов токены задевают слишком многое (имена предметов, которых нет в данных). */
const TOKEN_MIN = 3
const TOKEN_MAX = 12
const FALLBACK_MAX = 28
const FORBIDDEN = /["!\n]/

/**
 * Число в строке мода. С 0.5.0 поиск игры идёт по расширенному тексту предмета (патчноут 0.5.0: «Searching by an
 * item's text will now match the advanced description format»): у числа может стоять диапазон тира —
 * «28(26-30)%», «-8(-8--6)%», «7.59(7-7.9)%». Поэтому «#» в токене — цифра и дальше цифры, точки, скобки, дефисы.
 */
export const NUM_RE = '\\d[\\d.()-]*'

/** Подстрока строки мода → фрагмент регулярки PoE 2: спецсимволы экранированы, # → NUM_RE. */
export function toRegex2(raw) {
  return escapeRegex(raw).replace(/#/g, NUM_RE)
}

/** Теги модов, которые игра пишет в строке `{ … — Damage, Physical }` (implicit_tags RePoE → подпись). */
const SHOWN_TAGS = ['damage', 'elemental', 'fire', 'cold', 'lightning', 'chaos', 'physical', 'attack', 'caster', 'speed', 'life', 'mana', 'defences', 'armour', 'evasion', 'energy_shield', 'resistance', 'attribute', 'minion', 'critical', 'gem', 'ailment', 'charm', 'flask', 'aura', 'curse', 'block', 'bleed', 'poison']
/** RU-подписи тегов: client_strings EE2 (*_TAG) и таблица фикстур (tools/data/make-poe2-ru-fixtures.mjs). */
const TAG_RU_KEYS = { life: 'LIFE_TAG', mana: 'MANA_TAG', armour: 'ARMOUR_TAG', evasion: 'EVASION_TAG', energy_shield: 'ENERGY_SHIELD_TAG', physical: 'PHYSICAL_TAG', fire: 'FIRE_TAG', cold: 'COLD_TAG', lightning: 'LIGHTNING_TAG', chaos: 'CHAOS_TAG', attack: 'ATTACK_TAG', caster: 'CASTER_TAG', speed: 'SPEED_TAG', attribute: 'ATTRIBUTE_TAG', minion: 'MINION_TAG' }
const TAG_RU_EXTRA = { damage: 'Урон', elemental: 'Стихии', resistance: 'Сопротивление', defences: 'Защита', critical: 'Критический', gem: 'Камень', ailment: 'Состояние', charm: 'Оберег' }

/**
 * Строка-заголовок мода в расширенном тексте: `{ Prefix Modifier "Painful" (Tier: 1) — Damage, Physical }`.
 * Имя аффикса есть только английское (RePoE); в RU-клиенте имена русские — их нет в данных (пункт проверки в игре).
 */
export function headerLine(mod, lang, strings, names = null) {
  return headerLines(mod, lang, strings, names)[0]
}

/**
 * Заголовки мода на языке клиента: в RU — по каждой форме русского имени аффикса (poe2-data, «Коллекционный /
 * Коллекционная…»), если оно есть, иначе с английским именем.
 */
export function headerLines(mod, lang, strings, names = null, id = null) {
  const ru = lang === 'ru' && names && id ? names.affixRu.get(id) : null
  const forms = ru?.length ? ru : [mod.name ?? '']
  return forms.map((n) => headerWith(mod, lang, strings, n))
}

function headerWith(mod, lang, strings, affix) {
  const kinds = {
    prefix: 'PREFIX_MODIFIER',
    suffix: 'SUFFIX_MODIFIER',
    unique: 'UNIQUE_MODIFIER',
    corrupted: 'CORRUPTED_IMPLICIT'
  }
  let kind = strings[kinds[mod.generation_type] ?? 'IMPLICIT_MODIFIER'] ?? ''
  if (mod.domain === 'desecrated') kind = `${strings.DESECRATED_MODIFIER} ${kind}`
  const tier = lang === 'ru' ? 'Уровень' : 'Tier'
  const tags = (mod.implicit_tags ?? [])
    .filter((t) => SHOWN_TAGS.includes(t))
    .map((t) => (lang === 'ru' ? strings[TAG_RU_KEYS[t]] ?? TAG_RU_EXTRA[t] : t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())))
    .filter(Boolean)
  const name = affix ? ` "${affix}"` : ''
  return normLine(`{ ${kind}${name} (${tier}: 1)${tags.length ? ` — ${tags.join(', ')}` : ''} }`)
}

// ---------------------------------------------------------------------------
// Имена редких предметов и русские имена аффиксов (poe2-data)
// ---------------------------------------------------------------------------

/** Формы слова: «<if:MS>{Мрачный}<elif:FS>{Мрачная}…» → все варианты в фигурных скобках; иначе — само слово. */
export function wordForms(text) {
  const t = String(text ?? '')
  const forms = t.includes('{') ? [...t.matchAll(/\{([^}]*)\}/g)].map((m) => m[1]) : [t]
  return [...new Set(forms.map((f) => f.trim()).filter(Boolean))]
}

/**
 * Индекс слов имён: подстрока без пробела задевает имя, если есть внутри слова; с пробелом — если начало (до
 * первого пробела) — конец какого-то слова, а хвост (после последнего пробела) — начало какого-то слова (стык
 * «Gloom Path» → «m p»). Проверка со свёрткой ё→е и в нижнем регистре.
 */
export function nameIndex(words) {
  const list = [...new Set(words.map((w) => fold(w.toLowerCase())))].sort()
  const joined = '\n' + list.join('\n') + '\n'
  const ends = new Set()
  const starts = new Set()
  for (const w of list) {
    for (let i = 0; i < w.length; i++) {
      ends.add(w.slice(i))
      starts.add(w.slice(0, i + 1))
    }
  }
  const hitsRaw = (raw) => {
    const f = fold(raw.toLowerCase())
    if (!f.includes(' ')) return joined.includes(f)
    if (list.some((w) => w.includes(f))) return true
    const parts = f.split(' ')
    return ends.has(parts[0]) && starts.has(parts[parts.length - 1])
  }
  /** То же для фрагмента регулярки метки (с «.» вместо заглавной). */
  const hitsRegex = (re) => {
    const parts = re.split(' ')
    if (parts.length === 1) return list.some((w) => new RegExp(re).test(w))
    const a = new RegExp(`${parts[0]}$`)
    const b = new RegExp(`^${parts[parts.length - 1]}`)
    return list.some((w) => new RegExp(re).test(w)) || (list.some((w) => a.test(w)) && list.some((w) => b.test(w)))
  }
  return { list, hitsRaw, hitsRegex }
}

/** Слова имён редких предметов (списки 1 и 2) на языке клиента и русские имена аффиксов по id мода. */
export function loadNames() {
  const read = (key) => JSON.parse(fs.readFileSync(path.join(SRC_DIR, 'p2d_' + cacheName(P2D_SOURCES[key])), 'utf8'))
  const en = read('words')
  const ru = read('wordsRu')
  const words = { en: [], ru: [] }
  en.forEach((w, i) => {
    if (!RARE_WORDLISTS.has(w.Wordlist)) return
    words.en.push(...wordForms(w.Text))
    words.ru.push(...wordForms(ru[i]?.Text2 ?? w.Text))
  })
  const affixRu = new Map()
  for (const m of read('modsRu')) {
    const forms = wordForms(m.Name)
    if (m.Id && forms.length) affixRu.set(m.Id, forms)
  }
  return { words, affixRu, index: { en: nameIndex(words.en), ru: nameIndex(words.ru) } }
}

/** Теги путевых камней (ярусы): мод с весом > 0 по ним — мод путевого камня. */
const WAYSTONE_TAGS = new Set(['map_key_low', 'map_key_medium', 'map_key_high', 'map_key_highest'])

/**
 * Скрытые статы модов путевого камня: их значение игра суммирует в свойства («Pack Size: +20%», «Waystone Drop
 * Chance»), отдельной строкой мода они не показываются. В stat_descriptions их нет (они в map_stat_descriptions);
 * список — страховка на случай, если RePoE добавит перевод.
 */
const HIDDEN_STAT = /_final_from_map$|^dummy_stat_display_nothing$/

/** Типы плиток: тег базы → ключ. Названия — из данных игры (EE2 items.ndjson). */
export const TABLET_TYPES = [
  ['tower_augment_breach', 'breach'],
  ['tower_augment_expedition', 'expedition'],
  ['tower_augment_delirium', 'delirium'],
  ['tower_augment_ritual', 'ritual'],
  ['tower_augment_generic', 'irradiated'],
  ['tower_augment_map_boss', 'overseer'],
  ['tower_augment_abyss', 'abyss'],
  ['tower_augment_incursion', 'temple']
]

/** «Опасные» моды путевых камней для большинства билдов: причина → признак в EN-тексте. */
const SCARY = [
  ['maxRes', /maximum player resistances/],
  ['recovery', /less recovery rate/],
  ['flasks', /reduced flask charges/],
  ['cooldown', /less cooldown recovery/],
  ['penetration', /penetrates/],
  ['curse', /periodically cursed/],
  ['steal', /steal power, frenzy and endurance/],
  ['noDamage', /deal no damage/],
  ['buffs', /less buff effect|less effect of buffs/]
]

/** Свойства путевого камня (метка — client_strings EE2; старый формат «Monster Pack Size:» тоже ищется). */
const WAYSTONE_LABELS = [
  ['packSize', 'WAYSTONE_PACK_SIZE', { en: ['Monster Pack Size: '] }],
  ['magicMonsters', 'WAYSTONE_MAGIC_MONSTERS'],
  ['rareMonsters', 'WAYSTONE_RARE_MONSTERS'],
  ['dropChance', 'WAYSTONE_DROP_CHANCE'],
  ['itemRarity', 'WAYSTONE_RARITY'],
  ['monsterRarity', 'WAYSTONE_MONSTER_RARITY'],
  ['effectiveness', 'WAYSTONE_EFFECTIVENESS']
]

/** Класс предмета EN → RU (LocalIdentity/poe2-data @ 6a49dbd — как tools/data/make-poe2-ru-fixtures.mjs). */
export const ITEM_CLASS_RU = {
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
  Waystones: 'Путевые камни'
}

// ---------------------------------------------------------------------------
// Источники
// ---------------------------------------------------------------------------

const cacheName = (rel) => rel.replace(/\//g, '_')

function userAgent() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  return `POETH/${pkg.version} (+https://github.com/MAYZOSUPER/POETH)`
}

export async function ensureSources(refresh) {
  fs.mkdirSync(SRC_DIR, { recursive: true })
  const infoFile = path.join(SRC_DIR, 'sources.json')
  const info = fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, 'utf8')) : {}
  for (const rel of Object.values(SOURCES)) {
    const file = path.join(SRC_DIR, cacheName(rel))
    if (!refresh && fs.existsSync(file)) continue
    const url = BASE_URL + rel
    process.stdout.write(`скачиваю ${url} … `)
    const res = await fetch(url, { headers: { 'User-Agent': userAgent() } })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    info[rel] = { url, lastModified: res.headers.get('last-modified') }
    console.log('ok')
  }
  // poe2-data — закреплённый коммит: перекачивать незачем (новый — сменить P2D_SHA)
  for (const rel of Object.values(P2D_SOURCES)) {
    const file = path.join(SRC_DIR, 'p2d_' + cacheName(rel))
    if (fs.existsSync(file)) continue
    const url = P2D_URL + rel
    process.stdout.write(`скачиваю ${url} … `)
    const res = await fetch(url, { headers: { 'User-Agent': userAgent() } })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    info[`poe2-data/${rel}`] = { url, sha: P2D_SHA }
    console.log('ok')
  }
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2) + '\n')
  return info
}

export function readSource(key) {
  return JSON.parse(fs.readFileSync(path.join(SRC_DIR, cacheName(SOURCES[key])), 'utf8'))
}

function sourcesDate(info) {
  let best = null
  for (const rel of Object.values(SOURCES)) {
    const lm = info[rel]?.lastModified
    const d = lm ? new Date(lm) : fs.statSync(path.join(SRC_DIR, cacheName(rel))).mtime
    if (!Number.isNaN(d.getTime()) && (!best || d > best)) best = d
  }
  return best.toISOString().slice(0, 10)
}

function readNdjson(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
}

export function readClientStrings(lang) {
  return JSON.parse(fs.readFileSync(path.join(EE2_DIR, lang, 'client_strings.json'), 'utf8'))
}

// ---------------------------------------------------------------------------
// EE2: английская строка стата → русская (по trade id и тексту матчера)
// ---------------------------------------------------------------------------

/** Сравнение текста матчера EE2 и строки RePoE: числа → #, регистр и пробелы не важны. */
const matchKey = (s) =>
  s
    .split('\n')
    .map((l) => normLine(l))
    .join('\n')
    .trim()
    // EE2 пишет матчеры без знака («# to maximum Life»), игра — со знаком («+85 to maximum Life»)
    .replace(/(^|[ \n(])[+-]#/g, '$1#')

/** Знаки «+»/«-» перед числами EN-шаблона — на те же по счёту числа RU-шаблона (EE2 хранит RU без знака). */
function copySigns(en, ru) {
  const signs = [...en.matchAll(/(^|.)#/g)].map((m) => (m[1] === '+' || m[1] === '-' ? m[1] : ''))
  let i = 0
  return ru.replace(/(^|.)#/g, (all, before) => {
    const sign = signs[i++] ?? ''
    return sign && before !== sign ? `${before}${sign}#` : all
  })
}

export function loadEe2() {
  const en = readNdjson(path.join(EE2_DIR, 'en/stats.ndjson'))
  const ru = readNdjson(path.join(EE2_DIR, 'ru/stats.ndjson'))
  const byTrade = new Map()
  const byText = new Map()
  for (const stat of en) {
    for (const ids of Object.values(stat.trade?.ids ?? {})) {
      for (const id of ids) {
        const num = id.slice(id.indexOf('.') + 1)
        for (const key of [id, num]) {
          if (!byTrade.has(key)) byTrade.set(key, [])
          if (!byTrade.get(key).includes(stat)) byTrade.get(key).push(stat)
        }
      }
    }
    for (const m of stat.matchers) {
      for (const field of ['string', 'advanced']) {
        if (!m[field]) continue
        const k = matchKey(m[field])
        if (!byText.has(k)) byText.set(k, { stat, matcher: m })
      }
    }
  }
  return { byTrade, byText, ruByRef: new Map(ru.map((s) => [s.ref, s])) }
}

/** Вариант RU-матчера, соответствующий EN-матчеру (по value/negate, иначе по порядку) — как в make-poe2-ru-fixtures. */
function pickRuMatcher(enMatchers, enMatcher, ruMatchers) {
  const sameKind = (m) => (m.value ?? null) === (enMatcher.value ?? null) && !!m.negate === !!enMatcher.negate
  // варианты одного стата отличаются «где»: Map / Area / Your Maps / Areas with Powerful Map Bosses — порядок в RU
  // у EE2 другой («Ваши карты…» первым), поэтому сначала сужаем по «где», потом — по порядку
  const enList = enMatchers.filter((m) => sameKind(m) && scopeEn(m.string) === scopeEn(enMatcher.string))
  const ruList = ruMatchers.filter((m) => sameKind(m) && scopeRu(m.string) === scopeEn(enMatcher.string))
  if (ruList.length) return ruList[Math.max(0, enList.indexOf(enMatcher))] ?? ruList[0]
  if (enMatcher.value != null) return ruMatchers.find(sameKind)
  const enAll = enMatchers.filter(sameKind)
  const ruAll = ruMatchers.filter(sameKind)
  return ruAll[enAll.indexOf(enMatcher)] ?? ruAll[0]
}

/** «Где» действует строка мода: карта, область, «ваши карты», области с боссами — EN и RU. */
function scopeEn(s) {
  if (/areas with/i.test(s)) return 'boss'
  if (/your maps/i.test(s)) return 'your'
  if (/\barea\b/i.test(s)) return 'area'
  if (/\bmaps?\b/i.test(s)) return 'map'
  return 'other'
}
function scopeRu(s) {
  if (/боссами/i.test(s)) return 'boss'
  if (/ваш(и|их) карт/i.test(s)) return 'your'
  if (/област/i.test(s)) return 'area'
  if (/карт/i.test(s)) return 'map'
  return 'other'
}

/**
 * Русский шаблон строки (с «#») для английского шаблона en записи перевода entry; null — нет в EE2.
 * Сначала — статы EE2 с тем же trade id, затем любой стат с тем же текстом матчера.
 */
export function ruTemplate(ee2, entry, en) {
  const key = matchKey(en)
  const hits = []
  for (const ts of entry?.trade_stats ?? []) {
    for (const k of [ts.id, ts.id.slice(ts.id.indexOf('.') + 1)]) {
      for (const stat of ee2.byTrade.get(k) ?? []) {
        const matcher = stat.matchers.find((m) => matchKey(m.string) === key || (m.advanced && matchKey(m.advanced) === key))
        if (matcher) hits.push({ stat, matcher })
      }
    }
  }
  const hit = hits[0] ?? ee2.byText.get(key)
  if (!hit) return null
  const trade = Object.values(hit.stat.trade?.ids ?? {}).flat()
  const ruStat = ee2.ruByRef.get(hit.stat.ref)
  const m = ruStat ? pickRuMatcher(hit.stat.matchers, hit.matcher, ruStat.matchers) : null
  return { ru: m?.string ? copySigns(en, m.string) : null, trade }
}

/** В RU-данных EE2 иногда лежит английский текст (перевода нет) — такой строке в RU-клиенте верить нельзя. */
export const looksEnglish = (s) => !/[а-яё]/i.test(s)

// ---------------------------------------------------------------------------
// Текст мода через stat_translations
// ---------------------------------------------------------------------------

function repr(stat) {
  if (!stat) return 0
  return stat.max !== 0 ? stat.max : stat.min
}

/**
 * Видимые строки мода: по каждому стату — запись перевода из первого индекса, где она есть (у плиток сначала
 * tablet_stat_descriptions). Статы без записи и скрытые (HIDDEN_STAT) в подсказке не видны — пропускаем.
 * Каждая запись → строки EN/RU (шаблон с «#»), trade id (для запроса trade2) и флаг «RU нет в EE2».
 */
export function renderMod(mod, trs, ee2) {
  const stats = new Map(mod.stats.map((s) => [s.id, s]))
  const used = new Set()
  // ruOk[i] — строка out.ru[i] переведена (в EE2 есть русский текст)
  const out = { en: [], ru: [], displayEn: [], displayRu: [], ruOk: [], ids: [], trade: [], noRu: false, decimal: false }
  for (const stat of mod.stats) {
    if (used.has(stat.id) || HIDDEN_STAT.test(stat.id)) continue
    let entry = null
    for (const tr of trs) {
      let best = -1
      for (const c of tr.byStat.get(stat.id) ?? []) {
        const sc = c.ids.filter((id) => stats.has(id)).length * 100 - c.ids.length
        if (sc > best) {
          best = sc
          entry = c
        }
      }
      if (entry) break
    }
    if (!entry) continue
    for (const id of entry.ids) used.add(id)
    if (entry.ids.every((id) => HIDDEN_STAT.test(id) || !stats.has(id))) continue
    const vals = entry.ids.map((id) => repr(stats.get(id)))
    const v = pickVariant(entry.English, vals)
    if (!v || !v.string) continue
    const info = {}
    const en = renderVariant(v, vals, info).trim()
    if (!en) continue
    const ru = ruTemplate(ee2, entry, en)
    let ruText = ru?.ru ?? null
    const ruOk = !!ruText && !looksEnglish(ruText)
    if (!ruOk) {
      out.noRu = true
      ruText = en
    }
    if (info.decimal) out.decimal = true
    for (const l of en.split('\n')) {
      out.en.push(normLine(l))
      out.displayEn.push(normLine(l, false))
    }
    for (const l of ruText.split('\n')) {
      out.ru.push(normLine(l))
      out.displayRu.push(normLine(l, false))
      out.ruOk.push(ruOk)
    }
    out.ids.push(...entry.ids.filter((id) => stats.has(id)))
    // trade id для поиска trade2: из RePoE и из EE2 (там они есть и у статов, которых RePoE не связал с трейдом)
    out.trade.push([...new Set([...(entry.trade_stats ?? []).map((t) => t.id), ...(ru?.trade ?? [])])])
  }
  return out
}

export function positiveTags(mod) {
  return (mod.spawn_weights ?? []).filter((w) => w.weight > 0).map((w) => w.tag.trim())
}

/** Вес мода для базы: первый тег spawn_weights, который есть у базы (правило игры). */
export function weightFor(mod, baseTags) {
  for (const w of mod.spawn_weights ?? []) if (baseTags.includes(w.tag)) return w.weight
  return 0
}

// ---------------------------------------------------------------------------
// Группы модов (тиры с одинаковым видимым текстом склеены)
// ---------------------------------------------------------------------------

function waystoneKind(mod) {
  const tags = positiveTags(mod)
  if (mod.domain === 'area' && (mod.generation_type === 'prefix' || mod.generation_type === 'suffix')) {
    if (tags.some((t) => WAYSTONE_TAGS.has(t)) || tags.includes('default')) return mod.generation_type
  }
  // осквернение костями Бездны
  if (mod.domain === 'desecrated' && tags.includes('map')) return 'desecrated'
  // вложение эмоций Делириума
  if (mod.domain === 'area' && mod.generation_type === 'instilled') return 'instilled'
  return null
}

function collectGroups(mods, pick, trs, ee2) {
  const groups = new Map()
  for (const [modId, mod] of Object.entries(mods).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const kind = pick(modId, mod)
    if (!kind) continue
    const r = renderMod(mod, trs, ee2)
    if (r.en.length === 0) continue
    const key = [kind, r.ids.join(','), r.en.join('\n'), r.ru.join('\n')].join('|')
    let g = groups.get(key)
    if (!g) {
      g = {
        kind,
        statIds: r.ids,
        text: { en: r.en, ru: r.ru },
        display: { en: r.displayEn, ru: r.displayRu },
        trade: r.trade,
        ruOk: r.ruOk,
        noRu: r.noRu,
        decimal: r.decimal,
        members: [],
        names: new Set()
      }
      groups.set(key, g)
    }
    g.members.push(modId)
    if (mod.name) g.names.add(mod.name)
  }
  const list = [...groups.values()].sort((a, b) => {
    const ka = `${a.kind}|${a.text.en.join('\n')}`
    const kb = `${b.kind}|${b.text.en.join('\n')}`
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
  const seen = new Map()
  for (const g of list) {
    const base = g.statIds.join(',')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    g.id = n === 1 ? base : `${base}~${n}`
  }
  return list
}

// ---------------------------------------------------------------------------
// Кратчайшая уникальная подстрока (как у карт PoE 1)
// ---------------------------------------------------------------------------

const isSuperset = (sup, sub) => sub.every((l) => sup.includes(l))

function findToken(group, lang, all, extraFolded, names = null) {
  const lines = group.text[lang]
  const caseLines = lang === 'ru' ? group.display[lang] : null
  // в RU токен берём только из переведённых строк (английскую строку RU-клиент покажет по-русски)
  const candLines = lang === 'ru' && group.ruOk.some(Boolean) ? lines.filter((_, i) => group.ruOk[i]) : lines
  // в RU — без букв, заглавных в подсказке (регистр кириллицы в поиске игры не проверен)
  const caseFine = (cand) => lang !== 'ru' || group.display.ru.some((d) => d.includes(cand))
  const others = all.filter((g) => g !== group).map((g) => ({ g, folded: [...g.text[lang], ...(g.head?.[lang] ?? [])].map(fold) }))
  const conflicts = (cand) => {
    const f = fold(cand)
    // строка подсказки или имя редкого предмета («Gloom Path»): задевать нельзя никогда
    if (extraFolded.includes(f) || names?.hitsRaw(cand)) return null
    const hit = []
    for (const o of others) {
      if (o.folded.some((l) => l.includes(f)) && !isSuperset(o.g.text[lang], lines)) hit.push(o.g.id)
    }
    return hit
  }
  const withNum = { allowNum: !group.decimal, caseLines }
  const tiers = [
    [TOKEN_MIN, TOKEN_MAX, { caseLines }],
    [TOKEN_MIN, TOKEN_MAX, withNum],
    [TOKEN_MAX + 1, FALLBACK_MAX, withNum]
  ]
  for (const [lo, hi, o] of tiers) {
    for (const cand of substrings(candLines, lo, hi, o)) {
      if (!caseFine(cand)) continue
      const c = conflicts(cand)
      if (c && c.length === 0) return { token: toRegex2(cand) }
    }
  }
  let best = null
  for (const cand of substrings(candLines, TOKEN_MIN, FALLBACK_MAX, { caseLines })) {
    if (!caseFine(cand)) continue
    const c = conflicts(cand)
    if (!c) continue
    if (!best || c.length < best.also.length) best = { token: toRegex2(cand), also: c }
    if (best.also.length === 1) break
  }
  if (best) return { token: best.token, alsoMatches: best.also.sort() }
  // все подстроки есть и в строках подсказки (в RU EE2 бывает один перевод на два разных стата): меньше всего
  // задетых чужих строк; UI предупреждает («заденет похожие»)
  const extraLines = extraFolded.split('\n')
  for (const cand of substrings(candLines, TOKEN_MIN, FALLBACK_MAX, { caseLines })) {
    const f = fold(cand)
    const n = extraLines.filter((l) => l.includes(f)).length + (names?.hitsRaw(cand) ? 1 : 0)
    const hit = others.filter((o) => o.folded.some((l) => l.includes(f)) && !isSuperset(o.g.text[lang], lines)).map((o) => o.g.id)
    if (!best || n < best.extra || (n === best.extra && hit.length < best.also.length)) best = { token: toRegex2(cand), also: hit, extra: n }
  }
  if (!best) throw new Error(`${lang}: нет даже неуникального токена для ${group.id} (${lines.join(' / ')})`)
  return { token: best.token, alsoMatches: best.also.sort(), alsoExtra: best.extra }
}

/**
 * Метка строки-свойства («Pack Size: +20%», «Rarity: Rare», «Corrupted»): подстрока, которая есть во всех своих
 * строках и ни в одной чужой. В RU заглавная буква подсказки → «.» (регистр кириллицы в поиске не проверен).
 * colon — только кандидаты с «:» (привязка к строке свойства, а не к слову в тексте мода).
 */
export function findLabel(name, own, displays, others, { lang, colon = false, part = null, min = TOKEN_MIN, names = null } = {}) {
  const othersFolded = others.map(fold)
  const src = part ?? own[0]
  const srcDisplay = part ? displays[0].slice(own[0].indexOf(part), own[0].indexOf(part) + part.length) : displays[0]
  const cands = []
  for (let i = 0; i < src.length; i++) {
    for (let len = min; len <= Math.min(24, src.length - i); len++) {
      const raw = src.slice(i, i + len)
      if (FORBIDDEN.test(raw) || /^ | $/.test(raw) || raw.includes('#')) continue
      if (colon && !raw.includes(':')) continue
      let out = ''
      let test = ''
      let ups = 0
      for (let k = i; k < i + len; k++) {
        const up = lang === 'ru' && srcDisplay[k] !== srcDisplay[k].toLowerCase()
        if (up) ups++
        out += up ? '.' : toRegex(src[k])
        test += up ? '.' : escapeRegex(fold(src[k]))
      }
      // «.» вместо заглавной не считается: min — число настоящих символов
      if (len - ups < min) continue
      cands.push({ out, re: new RegExp(test) })
    }
  }
  // «.» вместо заглавной шире совпадает, «ё» игра может не различать с «е» — дороже
  const cost = (c) => c.out.length + (c.out.match(/ё/g) ?? []).length * 2 + 2 * c.out.split('').filter((ch, k) => ch === '.' && c.out[k - 1] !== '\\').length
  cands.sort((a, b) => cost(a) - cost(b) || (a.out < b.out ? -1 : a.out > b.out ? 1 : 0))
  for (const c of cands) {
    if (!own.every((l) => c.re.test(fold(l)))) continue
    if (othersFolded.some((l) => c.re.test(l))) continue
    // метка без «:» (тип плитки, флаг) не должна совпадать с именем редкого предмета
    if (!c.out.includes(':') && names?.hitsRegex(c.re.source)) continue
    return c.out
  }
  throw new Error(`${lang}: нет уникальной метки для ${name} («${own.join(' / ')}»)`)
}

/** Фрагмент перед числом (тир «Waystone (Tier 14)» / «Путевой камень (Ур. 14)»): самый короткий хвост без чужих строк. */
function findPrefix(name, line, display, others, lang) {
  const i = line.indexOf('#')
  const pre = line.slice(0, i)
  const dpre = display.slice(0, i)
  for (let len = 4; len <= pre.length; len++) {
    const s = pre.slice(pre.length - len)
    const d = dpre.slice(dpre.length - len)
    if (/^ /.test(s)) continue
    let out = ''
    let test = ''
    for (let k = 0; k < s.length; k++) {
      const up = lang === 'ru' && d[k] !== d[k].toLowerCase()
      out += up ? '.' : toRegex(s[k])
      test += up ? '.' : escapeRegex(fold(s[k]))
    }
    const re = new RegExp(test + '\\d')
    if (!others.some((o) => re.test(fold(o).replace(/#/g, '1')))) return out
  }
  throw new Error(`нет уникального префикса для ${name}`)
}

// ---------------------------------------------------------------------------
// Путевые камни и плитки
// ---------------------------------------------------------------------------

const cs = (strings, key) => {
  const v = strings[key]
  if (typeof v !== 'string') throw new Error(`нет строки клиента ${key}`)
  return v
}

/** Названия баз EE2 по английскому refName. */
function baseNames(lang) {
  const map = new Map()
  for (const r of readNdjson(path.join(EE2_DIR, lang, 'items.ndjson'))) {
    if (r.namespace === 'ITEM' && !map.has(r.refName)) map.set(r.refName, r.name)
  }
  return map
}

function uniqueTabletLines(mods, trs, ee2, lang) {
  const out = []
  for (const [, mod] of Object.entries(mods).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (mod.domain !== 'tablet' || mod.generation_type !== 'unique') continue
    const r = renderMod(mod, trs, ee2)
    out.push(...r[lang])
  }
  return out
}

/** Строки подсказок путевых камней и плиток, которые не являются модами (проверка ложных срабатываний). */
function tooltipLines(lang, ctx) {
  const s = ctx.strings[lang]
  const names = ctx.names[lang]
  const lines = new Set()
  const add = (l) => {
    for (const x of l.split('\n')) if (x.trim()) lines.add(normLine(x))
  }
  const rarities = ['RARITY_NORMAL', 'RARITY_MAGIC', 'RARITY_RARE', 'RARITY_UNIQUE'].map((k) => cs(s, k))
  for (const r of rarities) add(cs(s, 'RARITY') + r)
  const cls = (en) => (lang === 'ru' ? ITEM_CLASS_RU[en] : en)
  add(cs(s, 'ITEM_CLASS') + cls('Waystones'))
  add(cs(s, 'ITEM_CLASS') + cls('Tablet'))
  add(cs(s, 'ITEM_LEVEL') + '1')
  add(cs(s, 'AREA_LEVEL') + '1')
  add(cs(s, 'WAYSTONE_TIER') + '1')
  add(cs(s, 'WAYSTONE_REVIVES') + '1')
  add(cs(s, 'CORRUPTED'))
  add(cs(s, 'DOUBLE_CORRUPTED'))
  add(cs(s, 'MIRRORED'))
  add(cs(s, 'UNMODIFIABLE'))
  add(cs(s, 'PRICE_NOTE') + '~price 1 exalted')
  for (const k of ['PHYSICAL_DAMAGE', 'ELEMENTAL_DAMAGE', 'LIGHTNING_DAMAGE', 'COLD_DAMAGE', 'FIRE_DAMAGE', 'CRIT_CHANCE', 'ATTACK_SPEED', 'ARMOUR', 'EVASION', 'ENERGY_SHIELD', 'RUNIC_WARD', 'BLOCK_CHANCE', 'QUALITY', 'STACK_SIZE', 'SOCKETS', 'GEM_LEVEL', 'CHARM_SLOTS', 'BASE_SPIRIT', 'RELOAD_SPEED', 'REQUIRES', 'TALISMAN_TIER', 'MAP_TIER']) {
    if (typeof s[k] === 'string') {
      add(s[k] + '1')
      add(s[k] + '+1%')
      add(s[k] + '1.5%')
    }
  }
  // неопознанный предмет с тиром («Unidentified (Tier 5)» / «Неопознано (Ранг 5)») — из регулярки клиента
  const unid = lang === 'ru' ? 'Неопознано' : 'Unidentified'
  add(unid)
  add(lang === 'ru' ? `${unid} (Ранг 1)` : `${unid} (Tier 1)`)
  for (const [key, , old] of WAYSTONE_LABELS) {
    const label = cs(s, WAYSTONE_LABELS.find((x) => x[0] === key)[1])
    for (const l of [label, ...(old?.[lang] ?? [])]) {
      add(`${l}+1%`)
      add(`${l}+1% (augmented)`)
    }
  }
  // строки расширенного описания (Ctrl+Alt+C): заголовки модов и «неизменяемое значение»
  for (const k of ['PREFIX_MODIFIER', 'SUFFIX_MODIFIER', 'IMPLICIT_MODIFIER', 'UNIQUE_MODIFIER', 'DESECRATED_MODIFIER', 'CORRUPTED_IMPLICIT', 'ENCHANT_MODIFIER', 'FRACTURED_MODIFIER']) {
    const t = cs(s, k)
    add(lang === 'ru' ? `{ ${t} (Уровень: 1) }` : `{ ${t} (Tier: 1) }`)
    add(`{ ${t} }`)
  }
  add(cs(s, 'UNSCALABLE_VALUE').replace(/^ /, ''))
  // описания в подсказке (в EE2 только EN — в RU-клиенте свой текст, неизвестен: оставляем EN)
  add('Can be used in a Map Device, allowing you to enter a Map. Waystones can only be used once.')
  add('Can be used in a personal Map Device to add modifiers to a Map.')
  // базы: путевые камни всех ярусов, плитки
  for (let t = 1; t <= 16; t++) add(names.get(`Waystone (Tier ${t})`) ?? `Waystone (Tier ${t})`)
  for (const [, type] of TABLET_TYPES) add(ctx.tabletNames[lang][type])
  // имена аффиксов (строки «{ Prefix Modifier "Painful" … }») — только EN в данных
  for (const l of ctx.headerLines[lang]) add(l)
  // слова имён редких предметов («Gloom», «Path» / «мрачный», «путь»)
  for (const w of ctx.rare.words[lang]) add(w)
  // уникальные плитки: имена и их моды
  for (const n of ctx.uniqueTabletNames[lang]) add(n)
  for (const l of ctx.uniqueTabletLines[lang]) add(l)
  // имплиситы плиток: «Adds Ritual Altars to a Map» / «# uses remaining»
  for (const l of ctx.tabletImplicits[lang]) add(l)
  lines.delete('')
  return [...lines].sort()
}

function buildSection(lang, groups, extra, { scary = false, names = null } = {}) {
  const extraFolded = fold(extra.join('\n'))
  const mods = []
  const warn = []
  for (const g of groups) {
    const t = findToken(g, lang, groups, extraFolded, names)
    const m = {
      id: g.id,
      text: g.text[lang].join('\n'),
      display: g.display[lang].join('\n'),
      token: t.token,
      kind: g.kind,
      tags: []
    }
    if (g.types) m.types = g.types
    // заголовки мода в расширенном тексте («{ prefix modifier "painful" (tier: #) }»): видны поиску, поэтому
    // чужой токен не должен их задевать, а свой может
    if (g.head?.[lang]?.length) m.head = g.head[lang].join('\n')
    if (scary) {
      const en = g.text.en.join(' ')
      const reason = SCARY.find(([, re]) => re.test(en))?.[0]
      if (reason) m.scary = reason
    }
    // в RU нет ни одной переведённой строки: строка поиска такой мод в RU-клиенте не найдёт (UI не даёт выбрать)
    if (lang === 'ru' && !g.ruOk.some(Boolean)) m.tags.push('noRu')
    const trade = [...new Set(g.trade.flat())].filter((id) => /^(explicit|desecrated|implicit)\./.test(id)).sort()
    if (trade.length) m.trade = trade
    if (t.alsoMatches?.length) m.alsoMatches = t.alsoMatches
    if (t.alsoExtra) m.alsoExtra = t.alsoExtra
    if (t.alsoMatches || t.alsoExtra) warn.push(`${g.id} → ${t.token} (+${(t.alsoMatches ?? []).join(', ')}${t.alsoExtra ? `; строк подсказки: ${t.alsoExtra}` : ''})`)
    mods.push(m)
  }
  return { mods, warn }
}

function buildWaystone(lang, ctx) {
  const s = ctx.strings[lang]
  const groups = ctx.waystoneGroups
  const tabletModLines = ctx.tabletGroups.flatMap((g) => g.text[lang])
  // строка, совпадающая со строкой мода раздела (тот же мод у уникальной плитки), — это «тот же мод», не чужая
  const ownLines = new Set(groups.flatMap((g) => g.text[lang]))
  const extra = [...new Set([...tooltipLines(lang, ctx), ...tabletModLines, ...ctx.tabletGroups.flatMap((g) => g.head[lang])])]
    .filter((l) => !ownLines.has(l))
    .sort()
  const { mods, warn } = buildSection(lang, groups, extra, { scary: true, names: ctx.rare.index[lang] })
  const own = new Set(groups.flatMap((g) => g.text[lang]))
  const all = [...new Set([...own, ...extra])]
  const labels = {}
  for (const [key, sKey, old] of WAYSTONE_LABELS) {
    const label = cs(s, sKey)
    const ownLines = [label, ...(old?.[lang] ?? [])].flatMap((l) => [normLine(`${l}+1%`), normLine(`${l}+1% (augmented)`)])
    const displays = [label, ...(old?.[lang] ?? [])].flatMap((l) => [normLine(`${l}+1%`, false), normLine(`${l}+1% (augmented)`, false)])
    const others = all.filter((l) => !ownLines.includes(l))
    const part = normLine(label).replace(/ $/, '')
    labels[key] = findLabel(key, ownLines, displays, others, { lang, colon: true, part })
  }
  const rarity = {}
  for (const [key, sKey] of [['normal', 'RARITY_NORMAL'], ['magic', 'RARITY_MAGIC'], ['rare', 'RARITY_RARE'], ['unique', 'RARITY_UNIQUE']]) {
    const line = cs(s, 'RARITY') + cs(s, sKey)
    rarity[key] = findLabel(key, [normLine(line)], [normLine(line, false)], all.filter((l) => l !== normLine(line)), { lang, colon: true, min: 4 })
  }
  const corrupted = normLine(cs(s, 'CORRUPTED'))
  const twice = normLine(cs(s, 'DOUBLE_CORRUPTED'))
  const unid = lang === 'ru' ? 'неопознано' : 'unidentified'
  const flags = {
    // «Twice Corrupted» — тоже осквернён: строка флага может его задевать
    corrupted: findLabel('corrupted', [corrupted], [normLine(cs(s, 'CORRUPTED'), false)], all.filter((l) => l !== corrupted && l !== twice), { lang, min: 4, names: ctx.rare.index[lang] }),
    unidentified: findLabel('unidentified', [unid], [lang === 'ru' ? 'Неопознано' : 'Unidentified'], all.filter((l) => !l.startsWith(unid)), { lang, min: 4, names: ctx.rare.index[lang] })
  }
  const tierName = ctx.names[lang].get('Waystone (Tier 1)') ?? 'Waystone (Tier 1)'
  const tierLine = normLine(tierName)
  const tier = findPrefix('tier', tierLine, normLine(tierName, false), all.filter((l) => l !== tierLine), lang)
  return { section: { mods, extra, labels, tier, rarity, flags }, warn }
}

function buildTablet(lang, ctx) {
  const s = ctx.strings[lang]
  const groups = ctx.tabletGroups
  const waystoneModLines = ctx.waystoneGroups.flatMap((g) => g.text[lang])
  const ownLines = new Set(groups.flatMap((g) => g.text[lang]))
  const extra = [...new Set([...tooltipLines(lang, ctx), ...waystoneModLines, ...ctx.waystoneGroups.flatMap((g) => g.head[lang])])]
    .filter((l) => !ownLines.has(l))
    .sort()
  const { mods, warn } = buildSection(lang, groups, extra, { names: ctx.rare.index[lang] })
  const own = new Set(groups.flatMap((g) => g.text[lang]))
  const all = [...new Set([...own, ...extra])]
  // тип плитки — по названию базы (у волшебных оно внутри имени, у уникальных — отдельной строкой)
  const types = {}
  for (const [, type] of TABLET_TYPES) {
    const name = ctx.tabletNames[lang][type]
    const line = normLine(name)
    types[type] = findLabel(type, [line], [normLine(name, false)], all.filter((l) => l !== line), { lang, min: 5, names: ctx.rare.index[lang] })
  }
  // «# uses remaining» / «Осталось зарядов - #»: фрагмент вокруг числа
  const usesLine = ctx.tabletUsesLine[lang]
  const others = all.filter((l) => l !== usesLine && !ctx.tabletImplicits[lang].includes(l))
  const i = usesLine.indexOf('#')
  const pre = usesLine.slice(0, i)
  const post = usesLine.slice(i + 1)
  let uses = null
  for (let lp = 0; lp <= pre.length && !uses; lp++) {
    for (let lq = 0; lq <= post.length; lq++) {
      const a = pre.slice(pre.length - lp)
      const b = post.slice(0, lq)
      if (/^ /.test(a) && a.length) continue
      if (/ $/.test(b) && b.length) continue
      if (a.length + b.length < 4) continue
      const f = fold(a) + '#' + fold(b)
      if (others.some((o) => fold(o).includes(f))) continue
      if (ctx.rare.index[lang].hitsRaw(a) && ctx.rare.index[lang].hitsRaw(b)) continue
      uses = { pre: toRegex(a), post: toRegex(b) }
      break
    }
  }
  if (!uses) throw new Error(`${lang}: нет фрагмента для «uses remaining»`)
  const rarity = {}
  for (const [key, sKey] of [['normal', 'RARITY_NORMAL'], ['magic', 'RARITY_MAGIC'], ['rare', 'RARITY_RARE'], ['unique', 'RARITY_UNIQUE']]) {
    const line = cs(s, 'RARITY') + cs(s, sKey)
    rarity[key] = findLabel(key, [normLine(line)], [normLine(line, false)], all.filter((l) => l !== normLine(line)), { lang, colon: true, min: 4 })
  }
  return { section: { mods, extra, types, names: ctx.tabletNames[lang], uses, rarity, tradeType: ctx.tabletNames.en }, warn }
}

// ---------------------------------------------------------------------------
// Сборка
// ---------------------------------------------------------------------------

function tabletContext(mods, bases, trs, ee2, names) {
  const tabletNames = { en: {}, ru: {} }
  const tabletBaseTags = {}
  const implicitIds = []
  for (const [, base] of Object.entries(bases).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (base.item_class !== 'TowerAugmentation' || base.release_state !== 'released') continue
    const t = TABLET_TYPES.find(([tag]) => base.tags.includes(tag))
    if (!t) continue
    tabletNames.en[t[1]] = base.name
    tabletNames.ru[t[1]] = names.ru.get(base.name) ?? base.name
    tabletBaseTags[t[1]] = base.tags
    implicitIds.push(...(base.implicits ?? []))
  }
  const tabletImplicits = { en: [], ru: [] }
  for (const id of [...new Set(implicitIds)].sort()) {
    const r = renderMod(mods[id], trs, ee2)
    for (const lang of LANGS) tabletImplicits[lang].push(...r[lang])
  }
  return { tabletNames, tabletBaseTags, tabletImplicits }
}

export async function loadContext(refresh = false) {
  const info = await ensureSources(refresh)
  const mods = readSource('mods')
  const bases = readSource('bases')
  const trMain = indexTranslations(readSource('stats'))
  const trTablet = indexTranslations(readSource('tabletStats'))
  const ee2 = loadEe2()
  const names = { en: baseNames('en'), ru: baseNames('ru') }
  const strings = { en: readClientStrings('en'), ru: readClientStrings('ru') }
  // слова имён редких предметов и русские имена аффиксов (poe2-data)
  const rare = loadNames()
  return { info, mods, bases, trMain, trTablet, ee2, names, strings, rare }
}

export function buildEndgame(base) {
  const { mods, bases, trMain, trTablet, ee2, names, strings, rare } = base
  const tab = tabletContext(mods, bases, [trTablet, trMain], ee2, names)
  const waystoneGroups = collectGroups(mods, (_id, m) => waystoneKind(m), [trMain], ee2)
  const tabletGroups = collectGroups(
    mods,
    (_id, m) => (m.domain === 'tablet' && (m.generation_type === 'prefix' || m.generation_type === 'suffix') ? m.generation_type : null),
    [trTablet, trMain],
    ee2
  )
  // на какие типы плиток выпадает мод (по весам spawn_weights для тегов базы)
  for (const g of tabletGroups) {
    const types = new Set()
    for (const id of g.members) {
      for (const [, type] of TABLET_TYPES) if (weightFor(mods[id], tab.tabletBaseTags[type] ?? []) > 0) types.add(type)
    }
    g.types = TABLET_TYPES.map(([, t]) => t).filter((t) => types.has(t))
  }
  // заголовки модов расширенного текста `{ Prefix Modifier "Painful" (Tier: 1) — … }`: у модов разделов — свои (head),
  // в строки подсказки — заголовки уникальных плиток
  for (const g of [...waystoneGroups, ...tabletGroups]) {
    g.head = { en: [], ru: [] }
    for (const id of g.members) for (const lang of LANGS) g.head[lang].push(...headerLines(mods[id], lang, strings[lang], rare, id))
    for (const lang of LANGS) g.head[lang] = [...new Set(g.head[lang])].sort()
  }
  const headers = { en: [], ru: [] }
  for (const [modId, mod] of Object.entries(mods).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!(mod.domain === 'tablet' && mod.generation_type === 'unique')) continue
    for (const lang of LANGS) headers[lang].push(...headerLines(mod, lang, strings[lang], rare, modId))
  }
  const uniqueTabletNames = { en: [], ru: [] }
  const ruUniques = readNdjson(path.join(EE2_DIR, 'ru/items.ndjson')).filter((r) => r.namespace === 'UNIQUE')
  for (const r of ruUniques) {
    if (!/Tablet$/.test(r.unique?.base ?? '')) continue
    uniqueTabletNames.en.push(r.refName)
    uniqueTabletNames.ru.push(r.name)
  }
  const usesEn = tab.tabletImplicits.en.find((l) => l.includes('uses remaining')) ?? '# uses remaining'
  const usesIdx = tab.tabletImplicits.en.indexOf(usesEn)
  const ctx = {
    strings,
    names,
    rare,
    waystoneGroups,
    tabletGroups,
    headerLines: headers,
    uniqueTabletNames,
    uniqueTabletLines: { en: uniqueTabletLines(mods, [trTablet, trMain], ee2, 'en'), ru: uniqueTabletLines(mods, [trTablet, trMain], ee2, 'ru') },
    tabletUsesLine: { en: usesEn, ru: tab.tabletImplicits.ru[usesIdx] },
    ...tab
  }
  return ctx
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n')
}

async function main() {
  const args = process.argv.slice(2)
  const refresh = args.includes('--refresh')
  const pi = args.indexOf('--patch')
  const patch = pi >= 0 ? args[pi + 1] : DEFAULT_PATCH
  const base = await loadContext(refresh)
  const ctx = buildEndgame(base)
  const ee2Meta = JSON.parse(fs.readFileSync(path.join(EE2_DIR, 'data.meta.json'), 'utf8'))
  const meta = {
    source: 'RePoE fork PoE 2 (repoe-fork.github.io/poe2): mods, base_items, stat_translations; Exiled Exchange 2: stats, client_strings, items; LocalIdentity/poe2-data ' + P2D_SHA.slice(0, 7) + ': words, russian/mods',
    date: sourcesDate(base.info),
    patch,
    ee2: ee2Meta.ee2Sha.slice(0, 7)
  }
  for (const lang of LANGS) {
    const w = buildWaystone(lang, ctx)
    const t = buildTablet(lang, ctx)
    const v = buildVendor(lang, base)
    // слова имён редких предметов — движку: общие подстроки «любой из» / «не хочу» их не задевают
    const rareWords = base.rare.index[lang].list
    const data = {
      meta: { ...meta, lang },
      waystone: { ...w.section, rareWords },
      tablet: { ...t.section, rareWords },
      vendor: v.section
    }
    const file = path.join(OUT_DIR, `regex.${lang}.json`)
    writeJson(file, data)
    writeJson(path.join(OUT_CORPUS, `corpus.${lang}.json`), v.corpus)
    const noRu = (list) => list.filter((m) => m.tags.includes('noRu')).length
    console.log(
      `${lang}: путевые камни ${w.section.mods.length} (без RU ${noRu(w.section.mods)}), плитки ${t.section.mods.length} (без RU ${noRu(t.section.mods)}), ` +
        `свойства торговца ${Object.keys(v.section.props).length}, корпус ${v.corpus.lines.length} → ${path.relative(ROOT, file)}`
    )
    console.log(`  путевые: метки ${JSON.stringify(w.section.labels)} тир «${w.section.tier}» флаги ${JSON.stringify(w.section.flags)}`)
    console.log(`  плитки: типы ${JSON.stringify(t.section.types)} заряды ${JSON.stringify(t.section.uses)}`)
    for (const x of [...w.warn, ...t.warn]) console.log(`  ⚠ неуникальный токен: ${x}`)
    for (const x of v.warn) console.log(`  ⚠ торговец: ${x}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
