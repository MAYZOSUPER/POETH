#!/usr/bin/env node
// Генератор данных regex-строк для карт PoE 1 (этап S7).
//
// Источник — открытые данные RePoE fork (https://repoe-fork.github.io/): mods, stat_translations
// (EN + Russian), base_items (EN + Russian). Кэш — tools/regex/sources/ (в .gitignore).
// poe.re НЕ используется (нет лицензии): алгоритм «кратчайшая уникальная подстрока» реализован здесь.
//
// Выход: resources/data/poe1/regex/maps.{en,ru}.json
//   { meta, mods: [{id, text, display, token, kind, tags, scary?, alsoMatches?}], labels, flags, extra }
//   text — строки мода в нижнем регистре, числа → #, строки через \n; token — готовый фрагмент
//   регулярки (спецсимволы экранированы, число → \d+); extra — строки подсказки карты (не моды).
//
// Запуск:
//   node tools/regex/build-regex-data.mjs              — из кэша (скачает недостающее)
//   node tools/regex/build-regex-data.mjs --refresh    — перекачать источники (новый патч)
//   node tools/regex/build-regex-data.mjs --refresh --patch 3.30
// Сборка детерминированная: при тех же источниках файлы получаются байт-в-байт теми же.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const TOOL_DIR = path.join(ROOT, 'tools/regex')
const SRC_DIR = path.join(TOOL_DIR, 'sources')
const OUT_DIR = path.join(ROOT, 'resources/data/poe1/regex')
const BASE_URL = 'https://repoe-fork.github.io/'
export const DEFAULT_PATCH = '3.29'

const SOURCES = {
  mods: 'mods.min.json',
  statsEn: 'stat_translations.min.json',
  statsRu: 'Russian/stat_translations.min.json',
  basesEn: 'base_items.min.json',
  basesRu: 'Russian/base_items.min.json'
}

const LANGS = ['en', 'ru']

/** Теги spawn_weights, означающие «мод может выпасть на карте». */
const MAP_TAGS = new Set([
  'default',
  'low_tier_map',
  'mid_tier_map',
  'top_tier_map',
  'uber_tier_map',
  'maven_map',
  'primordial_map',
  'has_uber_map_prefix',
  'has_uber_map_suffix',
  'maven_void_map',
  'maven_void_map_feared',
  'maven_void_map_hidden'
])
/** Моды только с этими тегами — моды кошмарных (T17) карт. */
const T17_TAGS = new Set(['uber_tier_map', 'has_uber_map_prefix', 'has_uber_map_suffix'])
const MAVEN_TAGS = new Set(['maven_void_map', 'maven_void_map_feared', 'maven_void_map_hidden'])

/** «Опасные» моды для большинства билдов: ключ причины → признак в тексте (EN). */
const SCARY = [
  ['reflect', /reflect|thorns/],
  ['regen', /cannot regenerate/],
  ['recovery', /less recovery rate/],
  ['leech', /cannot be leeched|recovery per second from leech/],
  ['maxRes', /maximum resistances/],
  ['flasks', /less effect of flasks|reduced flask charges/],
  ['hexproof', /are hexproof/],
  ['penetration', /penetrates/],
  ['buffs', /buffs on players expire/],
  ['meteor', /targeted by a meteor/],
  ['defences', /less defences/]
]

/** Строки свойств карты для порогов (ключ метки → строка подсказки без числа). */
const LABEL_LINES = {
  en: {
    quantity: 'item quantity: +#%',
    rarity: 'item rarity: +#%',
    packSize: 'monster pack size: +#%',
    moreMaps: 'more maps: +#%',
    moreScarabs: 'more scarabs: +#%',
    moreCurrency: 'more currency: +#%',
    moreDivCards: 'more divination cards: +#%'
  },
  ru: {
    quantity: 'количество предметов: +#%',
    rarity: 'редкость предметов: +#%',
    packSize: 'размер групп монстров: +#%',
    moreMaps: 'больше карт: +#%',
    moreScarabs: 'больше скарабеев: +#%',
    moreCurrency: 'больше валюты: +#%',
    moreDivCards: 'больше гадальных карт: +#%'
  }
}
const FLAG_LINES = {
  en: { corrupted: 'corrupted', unidentified: 'unidentified' },
  ru: { corrupted: 'осквернено', unidentified: 'неопознано' }
}
/** Слова-приставки к названию базы карты (заражённые карты) и формат яруса в названии. */
const BASE_DECOR = {
  en: { tier: (n) => `${n} (tier #)`, prefixes: ['blighted', 'blight-ravaged'] },
  ru: { tier: (n) => `${n} (ур. #)`, prefixes: ['заражённая', 'разорённая скверной'] }
}

const TOKEN_MIN = 2
const TOKEN_MAX = 12
const FALLBACK_MAX = 24
const LABEL_MIN = 3
const REGEX_SPECIAL = /[\\^$.|?*+()[\]{}]/g
const FORBIDDEN = /["!\n]/
/** Обработчики, после которых число остаётся целым; с остальными \d+ в токене ненадёжен. */
const INT_HANDLERS = new Set(['negate'])

// ---------------------------------------------------------------------------
// Источники
// ---------------------------------------------------------------------------

function cacheName(rel) {
  return rel.replace(/\//g, '_')
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
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    info[rel] = { url, lastModified: res.headers.get('last-modified') }
    console.log('ok')
  }
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2))
  return info
}

export function readSource(key) {
  return JSON.parse(fs.readFileSync(path.join(SRC_DIR, cacheName(SOURCES[key])), 'utf8'))
}

/** Дата данных = самая свежая Last-Modified источников (не время сборки — воспроизводимость). */
export function sourcesDate(info) {
  let best = null
  for (const rel of Object.values(SOURCES)) {
    const lm = info[rel]?.lastModified
    const d = lm ? new Date(lm) : null
    if (d && !Number.isNaN(d.getTime()) && (!best || d > best)) best = d
  }
  if (!best) {
    // нет заголовков (кэш без sources.json) — берём mtime самого свежего файла
    for (const rel of Object.values(SOURCES)) {
      const d = fs.statSync(path.join(SRC_DIR, cacheName(rel))).mtime
      if (!best || d > best) best = d
    }
  }
  return best.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Текст модов через stat_translations
// ---------------------------------------------------------------------------

/** stat id → записи перевода, в которых он участвует; ключ ids → запись. */
export function indexTranslations(list) {
  const byStat = new Map()
  const byIds = new Map()
  for (const t of list) {
    byIds.set(t.ids.join('|'), t)
    for (const id of t.ids) {
      if (!byStat.has(id)) byStat.set(id, [])
      byStat.get(id).push(t)
    }
  }
  return { byStat, byIds, list }
}

/** Представительное значение стата: максимум ролла (или минимум, если максимум 0). */
function repr(stat) {
  if (!stat) return 0
  return stat.max !== 0 ? stat.max : stat.min
}

function conditionOk(cond, v) {
  if (!cond) return true
  let ok = true
  if (cond.min !== undefined && v < cond.min) ok = false
  if (cond.max !== undefined && v > cond.max) ok = false
  return cond.negated ? !ok : ok
}

export function pickVariant(variants, vals) {
  return variants?.find((variant) => variant.condition.every((c, i) => conditionOk(c, vals[i]))) ?? null
}

/** Подставить «#» вместо чисел, снять разметку [Ключ|Текст] и <тег>{текст}. */
export function renderVariant(variant, vals, info = {}) {
  let s = variant.string.replace(/\{(\d+)(?::[^}]*)?\}/g, (_, idx) => {
    const i = Number(idx)
    const fmt = variant.format[i] ?? '#'
    if (fmt === 'ignore') return ''
    let v = vals[i] ?? 0
    const handlers = variant.index_handlers[i] ?? []
    if (handlers.some((h) => !INT_HANDLERS.has(h))) info.decimal = true
    if (handlers.includes('negate')) v = -v
    const sign = v < 0 ? '-' : fmt.startsWith('+') ? '+' : ''
    return sign + '#' + fmt.replace(/^\+?#/, '')
  })
  s = s.replace(/\[([^\]|]*)\|([^\]]*)\]/g, '$2').replace(/\[([^\]]*)\]/g, '$1')
  s = s.replace(/<[^>]*>\{([^}]*)\}/g, '$1')
  return s
}

/** Нормализация строки подсказки: числа → #, один пробел, нижний регистр (lower=false — с регистром). */
export function normLine(s, lower = true) {
  const out = s
    .replace(/\d+(?:[.,]\d+)?/g, '#')
    .replace(/#(?:#)+/g, '#')
    .replace(/[ \t ]+/g, ' ')
    .trim()
  return lower ? out.toLowerCase() : out
}

/** ё и е в поиске игры могут не различаться — уникальность проверяем «со свёрткой». */
export function fold(s) {
  return s.replace(/ё/g, 'е')
}

/**
 * Видимые строки мода (скрытые статы вроде IIQ карты пропускаются) и id видимых статов.
 * entries — те же строки по записям перевода (S46: «Предметы» выбирают строку, а не мод целиком).
 */
export function renderMod(mod, trEn, trRu) {
  const stats = new Map(mod.stats.map((s) => [s.id, s]))
  const used = new Set()
  const out = { en: [], ru: [], displayEn: [], displayRu: [], ids: [], decimal: false, entries: [] }
  for (const stat of mod.stats) {
    if (used.has(stat.id)) continue
    const cands = trEn.byStat.get(stat.id) ?? []
    // запись перевода, покрывающая больше всего статов этого мода
    let entry = null
    let bestScore = -1
    for (const c of cands) {
      const sc = c.ids.filter((id) => stats.has(id)).length * 100 - c.ids.length
      if (sc > bestScore) {
        bestScore = sc
        entry = c
      }
    }
    if (!entry) continue // скрытый стат (нет перевода)
    for (const id of entry.ids) used.add(id)
    const vals = entry.ids.map((id) => repr(stats.get(id)))
    const ru = trRu.byIds.get(entry.ids.join('|'))
    const vEn = pickVariant(entry.English, vals)
    const vRu = pickVariant(ru?.Russian, vals)
    if (!vEn || !vEn.string) continue
    // служебные статы («# patches with Ground Effect per 100 tiles»): нет на трейде и нет перевода —
    // в подсказке игры не показываются
    if (!entry.trade_stats?.length && vRu?.string === vEn.string) continue
    const info = {}
    const en = renderVariant(vEn, vals, info)
    const ruText = vRu ? renderVariant(vRu, vals, info) : en
    if (info.decimal) out.decimal = true
    const e = { ids: entry.ids, en: [], ru: [], displayEn: [], displayRu: [], decimal: !!info.decimal }
    for (const l of en.split('\n')) {
      e.en.push(normLine(l))
      e.displayEn.push(normLine(l, false))
    }
    for (const l of ruText.split('\n')) {
      e.ru.push(normLine(l))
      e.displayRu.push(normLine(l, false))
    }
    out.en.push(...e.en)
    out.ru.push(...e.ru)
    out.displayEn.push(...e.displayEn)
    out.displayRu.push(...e.displayRu)
    out.entries.push(e)
    out.ids.push(...entry.ids.filter((id) => stats.has(id)))
  }
  return out
}

// ---------------------------------------------------------------------------
// Выбор модов карт
// ---------------------------------------------------------------------------

export function positiveTags(mod) {
  return mod.spawn_weights.filter((w) => w.weight > 0).map((w) => w.tag.trim())
}

function isMapMod(mod) {
  if (mod.domain !== 'area') return false
  const tags = positiveTags(mod)
  if (mod.generation_type === 'prefix' || mod.generation_type === 'suffix') {
    return tags.some((t) => MAP_TAGS.has(t))
  }
  // осквернённые имплиситы карт (Vaal Orb): «Contains a Vaal Side Area», «… random Scarab effects»
  if (mod.generation_type === 'corrupted') return tags.includes('default')
  return false
}

function collectGroups(mods, trEn, trRu) {
  const groups = new Map()
  for (const [modId, mod] of Object.entries(mods).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!isMapMod(mod)) continue
    const r = renderMod(mod, trEn, trRu)
    if (r.en.length === 0) continue // только скрытые статы
    const kind = mod.generation_type === 'corrupted' ? 'implicit' : mod.generation_type
    const key = [kind, r.ids.join(','), r.en.join('\n'), r.ru.join('\n')].join('|')
    let g = groups.get(key)
    if (!g) {
      g = {
        kind,
        statIds: r.ids,
        text: { en: r.en, ru: r.ru },
        display: { en: r.displayEn, ru: r.displayRu },
        decimal: false,
        members: [],
        tags: []
      }
      groups.set(key, g)
    }
    g.members.push(modId)
    g.tags.push(positiveTags(mod))
    if (r.decimal) g.decimal = true
  }
  // стабильные id: видимые статы (+ суффикс при совпадении), одинаковые для EN и RU
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
    const t17 = g.tags.every((tags) => tags.length > 0 && tags.every((t) => T17_TAGS.has(t)))
    const maven = g.tags.every((tags) => tags.length > 0 && tags.every((t) => MAVEN_TAGS.has(t)))
    g.flags = []
    if (t17) g.flags.push('t17')
    if (maven) g.flags.push('maven')
    if (g.kind === 'implicit') g.flags.push('corrupted')
    const en = g.text.en.join(' ')
    g.scary = SCARY.find(([, re]) => re.test(en))?.[0]
  }
  return list
}

// ---------------------------------------------------------------------------
// Строки подсказки (не моды)
// ---------------------------------------------------------------------------

function readExtraFile(lang) {
  return fs
    .readFileSync(path.join(TOOL_DIR, `extra-lines.${lang}.txt`), 'utf8')
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => normLine(l))
}

function collectExtra(lang, basesEn, basesRu, mods, trEn, trRu) {
  const lines = new Set(readExtraFile(lang))
  const bases = lang === 'en' ? basesEn : basesRu
  const decor = BASE_DECOR[lang]
  const implicits = new Set()
  for (const [key, base] of Object.entries(basesEn)) {
    if (base.item_class !== 'Map') continue
    const name = normLine((bases[key] ?? base).name)
    lines.add(decor.tier(name))
    for (const p of decor.prefixes) lines.add(`${p} ${name}`)
    for (const imp of base.implicits ?? []) implicits.add(imp)
  }
  // собственные свойства баз карт («Area is influenced by The Shaper» и т. п.)
  for (const imp of [...implicits].sort()) {
    const mod = mods[imp]
    if (!mod) continue
    const r = renderMod(mod, trEn, trRu)
    for (const l of r[lang]) lines.add(l)
  }
  // влияния на карты, которых нет в модах: «Area is influenced by …», «Map is occupied by …»
  for (let i = 0; i < trEn.list.length; i++) {
    const enStrings = trEn.list[i].English.map((v) => v.string)
    if (!enStrings.some((s) => /^(Area is influenced by|Map is occupied by)/.test(s))) continue
    const variants = lang === 'en' ? trEn.list[i].English : trRu.list[i].Russian
    for (const v of variants ?? []) {
      const vals = v.condition.map((c) => c.min ?? c.max ?? 1)
      for (const l of renderVariant(v, vals).split('\n')) lines.add(normLine(l))
    }
  }
  lines.delete('')
  return [...lines].sort()
}

// ---------------------------------------------------------------------------
// Кратчайшая уникальная подстрока
// ---------------------------------------------------------------------------

export function escapeRegex(s) {
  return s.replace(REGEX_SPECIAL, '\\$&')
}

/** Подстрока строки подсказки → фрагмент регулярки: спецсимволы экранируются, # → \d+. */
export function toRegex(raw) {
  return escapeRegex(raw).replace(/#/g, '\\d+')
}

/**
 * Оценка кандидата: короче (в символах регулярки) — лучше; спецсимволы, ё, пробелы и
 * буквы, бывшие заглавными в подсказке (регистр кириллицы в игре не проверен), — штраф.
 */
export function score(raw, caseLines) {
  const esc = toRegex(raw)
  const special = esc.length - raw.length
  const yo = (raw.match(/ё/g) ?? []).length
  const spaces = (raw.match(/ /g) ?? []).length
  const upper = caseLines && !caseLines.some((l) => l.includes(raw)) ? 2 : 0
  return esc.length + special * 0.5 + yo * 1.5 + spaces * 0.3 + upper
}

/**
 * Все подстроки строк `lines` длиной lo..hi: без кавычек и !, без пробелов и # по краям;
 * # (число) внутри — только если allowNum. Сортировка — по оценке, затем по алфавиту.
 */
export function substrings(lines, lo, hi, { allowNum = false, caseLines = null } = {}) {
  const out = new Set()
  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      for (let len = lo; len <= hi && i + len <= line.length; len++) {
        const s = line.slice(i, i + len)
        if (FORBIDDEN.test(s)) break
        if (!allowNum && s.includes('#')) break
        if (/^[ #]|[ #]$/.test(s)) continue
        out.add(s)
      }
    }
  }
  const sc = new Map([...out].map((s) => [s, score(s, caseLines)]))
  return [...out].sort((a, b) => sc.get(a) - sc.get(b) || (a < b ? -1 : a > b ? 1 : 0))
}

/** M' «надмножество» M, если в нём есть все строки M (тот же эффект + что-то ещё). */
function isSuperset(sup, sub) {
  return sub.every((l) => sup.includes(l))
}

function findToken(group, lang, all, extraFolded) {
  const lines = group.text[lang]
  const caseLines = lang === 'ru' ? group.display[lang] : null
  const others = all.filter((g) => g !== group).map((g) => ({ g, folded: g.text[lang].map(fold) }))
  const conflicts = (cand) => {
    const f = fold(cand)
    if (extraFolded.includes(f)) return null // задевает строку подсказки — нельзя никогда
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
    for (const cand of substrings(lines, lo, hi, o)) {
      const c = conflicts(cand)
      if (c && c.length === 0) return { token: toRegex(cand) }
    }
  }
  // уникальной подстроки нет (все строки мода есть в других модах) — минимум лишних совпадений
  let best = null
  for (const cand of substrings(lines, TOKEN_MIN, FALLBACK_MAX, { caseLines })) {
    const c = conflicts(cand)
    if (!c) continue
    if (!best || c.length < best.also.length) best = { token: toRegex(cand), also: c }
    if (best.also.length === 1) break
  }
  if (!best) throw new Error(`${lang}: нет даже неуникального токена для ${group.id}`)
  return { token: best.token, alsoMatches: best.also.sort() }
}

/** Метка для строки-свойства/флага: уникальна среди всех строк, кроме самой этой строки. */
function findLabel(line, part, allLines, { anchorEnd = false, caseLine = null } = {}) {
  const others = allLines.filter((l) => l !== line).map(fold)
  const caseLines = caseLine ? [caseLine] : null
  const cands = []
  for (const s of substrings([part], LABEL_MIN, part.length, { caseLines })) cands.push({ raw: s, end: false })
  if (anchorEnd) {
    for (let i = 0; i <= line.length - LABEL_MIN; i++) {
      const s = line.slice(i)
      if (!FORBIDDEN.test(s) && !/^[ #]/.test(s)) cands.push({ raw: s, end: true })
    }
  }
  // двоеточие привязывает метку к строке свойства («Item Quantity: +80%») — надёжнее
  const sc = (c) => score(c.raw, caseLines) + (c.end ? 1 : 0) - (c.raw.includes(':') ? 1.1 : 0)
  cands.sort((a, b) => sc(a) - sc(b) || (a.raw < b.raw ? -1 : a.raw > b.raw ? 1 : 0))
  for (const c of cands) {
    const f = fold(c.raw)
    const bad = c.end ? others.some((l) => l.endsWith(f)) : others.some((l) => l.includes(f))
    if (!bad) return toRegex(c.raw) + (c.end ? '$' : '')
  }
  throw new Error(`нет уникальной метки для «${line}»`)
}

// ---------------------------------------------------------------------------
// Сборка
// ---------------------------------------------------------------------------

function buildLang(lang, groups, extra, meta) {
  const extraFolded = fold(extra.join('\n'))
  const mods = []
  const stats = { fallback: [], maxLen: 0 }
  for (const g of groups) {
    const t = findToken(g, lang, groups, extraFolded)
    const m = {
      id: g.id,
      text: g.text[lang].join('\n'),
      display: g.display[lang].join('\n'),
      token: t.token,
      kind: g.kind,
      tags: g.flags
    }
    if (g.scary) m.scary = g.scary
    if (t.alsoMatches) {
      m.alsoMatches = t.alsoMatches
      stats.fallback.push(`${g.id} → ${t.token} (+${t.alsoMatches.join(', ')})`)
    }
    stats.maxLen = Math.max(stats.maxLen, t.token.length)
    mods.push(m)
  }
  const allLines = [...new Set([...groups.flatMap((g) => g.text[lang]), ...extra])]
  const labels = {}
  for (const [key, line] of Object.entries(LABEL_LINES[lang])) {
    const own = extra.find((l) => l.startsWith(line)) ?? line
    const part = line.slice(0, line.indexOf(': +#%') + 1)
    const caseLine = part[0].toUpperCase() + part.slice(1)
    labels[key] = findLabel(own, part, allLines, { caseLine })
  }
  const flags = {}
  for (const [key, line] of Object.entries(FLAG_LINES[lang])) {
    // в подсказке флаг пишется с заглавной: «Corrupted» / «Осквернено»
    const caseLine = line[0].toUpperCase() + line.slice(1)
    flags[key] = findLabel(line, line, allLines, { anchorEnd: true, caseLine })
  }
  return { data: { meta: { ...meta, lang }, mods, labels, flags, extra }, stats }
}

async function main() {
  const args = process.argv.slice(2)
  const refresh = args.includes('--refresh')
  const pi = args.indexOf('--patch')
  const patch = pi >= 0 ? args[pi + 1] : DEFAULT_PATCH
  const info = await ensureSources(refresh)

  const mods = readSource('mods')
  const trEn = indexTranslations(readSource('statsEn'))
  const trRu = indexTranslations(readSource('statsRu'))
  const basesEn = readSource('basesEn')
  const basesRu = readSource('basesRu')

  const groups = collectGroups(mods, trEn, trRu)
  const meta = {
    source: 'RePoE fork (repoe-fork.github.io): mods, stat_translations, base_items',
    date: sourcesDate(info),
    patch
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  for (const lang of LANGS) {
    const extra = collectExtra(lang, basesEn, basesRu, mods, trEn, trRu)
    const { data, stats } = buildLang(lang, groups, extra, meta)
    const file = path.join(OUT_DIR, `maps.${lang}.json`)
    fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n')
    console.log(
      `${lang}: модов ${data.mods.length}, строк подсказки ${extra.length}, макс. токен ${stats.maxLen} → ${path.relative(ROOT, file)}`
    )
    console.log(`  метки: ${JSON.stringify(data.labels)} флаги: ${JSON.stringify(data.flags)}`)
    for (const f of stats.fallback) console.log(`  ⚠ неуникальный токен: ${f}`)
  }
}

// запуск как скрипт; при импорте (генератор торговца) — только помощники
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
