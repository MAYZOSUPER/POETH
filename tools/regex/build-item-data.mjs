#!/usr/bin/env node
// Генератор строк «Предметов» (S46): моды предметов для поиска в тайнике — кратчайшие уникальные подстроки
// EN и RU, пороги «≥ N», базы, классы, редкость, влияние, «осквернено», «уровень предмета».
//
// Источник — открытые данные RePoE fork (тот же кэш tools/regex/sources/, что у карт и «Торговца»): mods,
// stat_translations EN/RU, base_items EN/RU, item_classes EN/RU, crafting_bench_options (классы для ремесла),
// Russian/mods (русские названия свойств — они стоят в имени волшебного предмета). Метки свойств предмета —
// client_strings APT, строки настоящих подсказок — фикстуры парсера tests/fixtures/poe1/{en,ru}.
//
// Единица выбора — строка мода, как её видит игрок («+# to maximum Life»), а не мод целиком: одна строка
// бывает в разных тирах, в ремесле и в гибридных модах. Строки — из модов domain item/crafted/flask
// (префиксы и суффиксы). Для каждой строки:
//   • токен — кратчайшая подстрока, которой нет ни в одной «чужой» строке корпуса;
//   • порог (строка с одним числом) — <pre><atLeast(N)><post>, как у «Торговца»;
//   • классы, где строка может выпасть (spawn_weights по тегам баз, влияние — по influence_tags класса,
//     ремесло — по crafting_bench_options), префикс/суффикс, ремесло, только с влиянием.
// Корпус «чужих» строк — корпус «Торговца» (моды предметов, имплиситы, метки, классы, редкости, базы, фикстуры)
// + все строки модов «Предметов», зачарования, моды уникальных предметов и названия свойств (EN и RU, все роды).
// Не считаются ложными строки, где своя строка целиком (« … during Effect», гибриды): без ^ и $ их не отделить —
// такие строки других модов записываются в also, UI предупреждает «заденет и …».
//
// Выход:
//   resources/data/poe1/regex/items.{en,ru}.json   — данные страницы (main отдаёт по IPC regex:itemData);
//   tests/regex/fixtures/item-corpus.{en,ru}.json  — корпус строк и метки для тестов.
//
// Запуск: node tools/regex/build-item-data.mjs [--refresh] [--patch 3.30]
// Сборка детерминированная: при тех же источниках файлы получаются байт-в-байт теми же.

import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_PATCH,
  ROOT,
  ensureSources,
  escapeRegex,
  fold,
  indexTranslations,
  normLine,
  readSource,
  renderMod,
  sourcesDate,
  substrings,
  toRegex
} from './build-regex-data.mjs'
import {
  CLASSES,
  caseOk,
  collectCorpus,
  cost,
  ensureExtra,
  findLabel,
  postCandidates,
  preCandidates,
  readClientStrings,
  readExtra
} from './build-vendor-data.mjs'

const OUT_DIR = path.join(ROOT, 'resources/data/poe1/regex')
const OUT_CORPUS = path.join(ROOT, 'tests/regex/fixtures')
const LANGS = ['en', 'ru']

const SOURCES = {
  classesEn: 'item_classes.min.json',
  classesRu: 'Russian/item_classes.min.json',
  bench: 'crafting_bench_options.min.json',
  modsRu: 'Russian/mods.min.json'
}

/** Классы страницы: как у «Торговца» + флаконы и камни (ключ — ItemClassKey в src/shared/types/regex.ts). */
export const ITEM_CLASSES = [
  ...CLASSES,
  ['lifeFlask', 'LifeFlask'],
  ['manaFlask', 'ManaFlask'],
  ['hybridFlask', 'HybridFlask'],
  ['utilityFlask', 'UtilityFlask'],
  ['skillGem', 'Active Skill Gem'],
  ['supportGem', 'Support Skill Gem']
]
/** У камней базы не выбирают (их сотни) — для них свой блок «Камни». */
const NO_BASES = new Set(['skillGem', 'supportGem'])

const RARITIES = [
  ['normal', 'RARITY_NORMAL'],
  ['magic', 'RARITY_MAGIC'],
  ['rare', 'RARITY_RARE'],
  ['unique', 'RARITY_UNIQUE'],
  ['gem', 'RARITY_GEM']
]

/** Влияние: ключ (InfluenceKey), строка client_strings, хвост тега в influence_tags класса. */
const INFLUENCES = [
  ['shaper', 'INFLUENCE_SHAPER', 'shaper'],
  ['elder', 'INFLUENCE_ELDER', 'elder'],
  ['crusader', 'INFLUENCE_CRUSADER', 'crusader'],
  ['hunter', 'INFLUENCE_HUNTER', 'basilisk'],
  ['redeemer', 'INFLUENCE_REDEEMER', 'eyrie'],
  ['warlord', 'INFLUENCE_WARLORD', 'adjudicator'],
  ['exarch', 'ITEM_EXARCH', null],
  ['eater', 'ITEM_EATER', null]
]

/** Строки модов страницы: префиксы и суффиксы предметов, ремесла и флаконов. */
const UNIT_DOMAINS = new Set(['item', 'crafted', 'flask'])
const UNIT_TYPES = new Set(['prefix', 'suffix'])
/** Дополнительно в корпус: зачарования и моды уникальных предметов (в тайнике они рядом с редкими). */
const EXTRA_TYPES = new Set(['enchantment', 'unique'])

const TOKEN_MIN = 2

/**
 * «секунд(-ы)», «заряда(-ов)» (так пишет RePoE RU): клиент игры то склоняет слово сам («на 4 секунды» — фикстура
 * flask-01), то показывает как есть (описания камней). Слово целиком заменяем на «"» — такой символ в токен
 * не попадает, и токен на окончание не опирается. Показ (display) — как в RePoE.
 */
const PLURAL = /[a-zа-яё]*\((?:-|\+)?[a-zа-яё]{1,6}\)/giu
export const stripPlural = (line) => line.replace(PLURAL, '"')
const TOKEN_MAX = 14
const FALLBACK_MAX = 44
const LONGEST_MAX = 64

// ---------------------------------------------------------------------------
// Индекс подстрок корпуса (биграммы → строки): «в каких строках есть s» без полного перебора
// ---------------------------------------------------------------------------

function makeIndex(lines) {
  const grams = new Map()
  lines.forEach((l, i) => {
    const seen = new Set()
    for (let k = 0; k + 2 <= l.length; k++) {
      const g = l.slice(k, k + 2)
      if (seen.has(g)) continue
      seen.add(g)
      if (!grams.has(g)) grams.set(g, [])
      grams.get(g).push(i)
    }
  })
  const memo = new Map()
  /** Номера строк (свёрнутых ё→е), где есть подстрока s (тоже свёрнутая). */
  function containing(s) {
    let hit = memo.get(s)
    if (hit) return hit
    let best = null
    for (let k = 0; k + 2 <= s.length; k++) {
      const list = grams.get(s.slice(k, k + 2)) ?? []
      if (!best || list.length < best.length) best = list
      if (!best.length) break
    }
    hit = (best ?? lines.map((_, i) => i)).filter((i) => lines[i].includes(s))
    memo.set(s, hit)
    return hit
  }
  /** Строки, которые кончаются на s (для флага «осквернено» с $). */
  function endingWith(s) {
    return containing(s).filter((i) => lines[i].endsWith(s))
  }
  /**
   * Строки, где своя строка есть целиком: «"» (склоняемое слово, см. stripPlural) — любое слово, так что
   * «… на # секунды при …» из фикстуры — тоже своя.
   */
  function like(s) {
    if (!s.includes('"')) return containing(s)
    const parts = s.split('"')
    const lit = parts.reduce((a, b) => (b.length > a.length ? b : a))
    const re = new RegExp(parts.map(escapeRegex).join('[^ ]*'))
    return (lit.length >= 2 ? containing(lit) : lines.map((_, i) => i)).filter((i) => re.test(lines[i]))
  }
  return { lines, containing, endingWith, like }
}

// ---------------------------------------------------------------------------
// Строки модов и где они выпадают
// ---------------------------------------------------------------------------

const weightFor = (mod, tags) => {
  for (const w of mod.spawn_weights) if (tags.has(w.tag)) return w.weight
  return 0
}

/** Наборы тегов баз по классам (у баз одного класса теги повторяются). */
function classTagSets(ctx) {
  const out = new Map()
  for (const [key, ...ids] of ITEM_CLASSES) {
    const sets = new Map()
    for (const k of Object.keys(ctx.bases).sort()) {
      const b = ctx.bases[k]
      if (b.release_state !== 'released' || !ids.includes(b.item_class)) continue
      const tags = [...b.tags].sort()
      sets.set(`${b.domain}|${tags.join(',')}`, { domain: b.domain, tags: new Set(tags) })
    }
    const infl = ids.flatMap((id) => ctx.classes[id]?.influence_tags ?? [])
    out.set(key, { sets: [...sets.values()], infl })
  }
  return out
}

/** Где мод выпадает: классы обычным образом, классы с влиянием (класс → влияния), ремесло. */
function modPlaces(id, mod, tagSets, benchByMod) {
  const normal = new Set()
  const infl = new Map()
  if (mod.domain === 'crafted') {
    for (const cls of benchByMod.get(id) ?? []) normal.add(cls)
    return { normal, infl, crafted: true }
  }
  if (!mod.spawn_weights.some((w) => w.weight > 0)) return { normal, infl, crafted: false }
  for (const [cls, { sets, infl: inflTags }] of tagSets) {
    const own = sets.filter((s) => s.domain === mod.domain)
    if (!own.length) continue
    if (own.some((s) => weightFor(mod, s.tags) > 0)) {
      normal.add(cls)
      continue
    }
    for (const tag of inflTags) {
      const key = INFLUENCES.find(([, , suffix]) => suffix && tag.endsWith('_' + suffix))?.[0]
      if (!key) continue
      if (own.some((s) => weightFor(mod, new Set([...s.tags, tag])) > 0)) {
        if (!infl.has(cls)) infl.set(cls, new Set())
        infl.get(cls).add(key)
      }
    }
  }
  return { normal, infl, crafted: false }
}

/** Классы ремесла: мод → классы (VendorItemClass/ItemClassKey) из crafting_bench_options. */
function benchClasses(bench) {
  const byId = new Map()
  for (const opt of bench) {
    const mod = opt.actions?.add_explicit_mod
    if (!mod) continue
    const list = byId.get(mod) ?? new Set()
    for (const ic of opt.item_classes ?? []) {
      const cls = ITEM_CLASSES.find(([, ...ids]) => ids.includes(ic))?.[0]
      if (cls) list.add(cls)
    }
    byId.set(mod, list)
  }
  return byId
}

function collectUnits(ctx) {
  const { mods, trEn, trRu } = ctx
  const tagSets = classTagSets(ctx)
  const benchByMod = benchClasses(ctx.bench)
  const units = new Map()
  for (const id of Object.keys(mods).sort()) {
    const m = mods[id]
    if (!UNIT_DOMAINS.has(m.domain) || !UNIT_TYPES.has(m.generation_type)) continue
    const r = renderMod(m, trEn, trRu)
    if (!r.entries.length) continue
    const places = modPlaces(id, m, tagSets, benchByMod)
    for (const e of r.entries) {
      if (!e.en.join('') || !e.ru.join('')) continue
      const key = [e.ids.join(','), e.en.join('\n'), e.ru.join('\n')].join('|')
      let u = units.get(key)
      if (!u) {
        u = {
          ids: e.ids,
          text: { en: e.en.map(stripPlural), ru: e.ru.map(stripPlural) },
          display: { en: e.displayEn, ru: e.displayRu },
          // для проверки регистра: те же позиции символов, что в text
          cased: { en: e.displayEn.map(stripPlural), ru: e.displayRu.map(stripPlural) },
          decimal: false,
          kinds: new Set(),
          normal: new Set(),
          infl: new Map(),
          crafted: 0,
          other: 0
        }
        units.set(key, u)
      }
      if (e.decimal) u.decimal = true
      u.kinds.add(m.generation_type)
      for (const c of places.normal) u.normal.add(c)
      for (const [c, list] of places.infl) {
        if (!u.infl.has(c)) u.infl.set(c, new Set())
        for (const k of list) u.infl.get(c).add(k)
      }
      if (places.crafted) u.crafted++
      else u.other++
    }
  }
  // стабильные id: stat id записи перевода (+ ~n, если у записи несколько текстов — «increased»/«reduced»)
  const list = [...units.values()].sort((a, b) => {
    const ka = `${a.ids.join(',')}|${a.text.en.join('\n')}|${a.text.ru.join('\n')}`
    const kb = `${b.ids.join(',')}|${b.text.en.join('\n')}|${b.text.ru.join('\n')}`
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
  const seen = new Map()
  for (const u of list) {
    const base = u.ids.join(',')
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    u.id = n === 1 ? base : `${base}~${n}`
  }
  return list
}

// ---------------------------------------------------------------------------
// Корпус
// ---------------------------------------------------------------------------

/** Русские названия свойств: «<if:MS>{Здравый}<elif:FS>{Здравая}…» → все формы. */
function nameForms(name) {
  if (!name) return []
  const forms = [...name.matchAll(/\{([^}]*)\}/g)].map((m) => m[1])
  return forms.length ? forms : [name]
}

function buildCorpus(lang, ctx, units) {
  const lines = collectCorpus(lang, ctx)
  for (const u of units) for (const l of u.text[lang]) lines.add(l)
  for (const id of Object.keys(ctx.mods).sort()) {
    const m = ctx.mods[id]
    if (!UNIT_DOMAINS.has(m.domain)) continue
    if (EXTRA_TYPES.has(m.generation_type)) {
      for (const l of renderMod(m, ctx.trEn, ctx.trRu)[lang]) lines.add(l)
    }
    // название свойства — часть имени волшебного предмета («Hale Iron Ring of the Bear»)
    if (UNIT_TYPES.has(m.generation_type) && m.domain !== 'crafted') {
      const names = lang === 'en' ? [m.name] : nameForms(ctx.modsRu[id]?.name)
      for (const n of names) if (n) lines.add(normLine(n))
    }
  }
  const cs = readClientStrings(lang)
  for (const v of Object.values(cs)) if (Array.isArray(v)) for (const s of v) if (typeof s === 'string') lines.add(normLine(s))
  lines.delete('')
  return [...new Set([...lines].map(stripPlural))].sort()
}

// ---------------------------------------------------------------------------
// Поиск фрагментов
// ---------------------------------------------------------------------------

/**
 * Токен строки мода: кратчайшая подстрока своих строк, которой нет в чужих строках корпуса. Чужие — все, кроме
 * строк, где своя строка есть целиком (их без ^/$ не отделить). В RU — без букв, заглавных в подсказке.
 */
function unitToken(u, lang, idx) {
  const own = u.text[lang]
  const disp = u.cased[lang]
  const allowedBy = own.map((l) => new Set(idx.like(fold(l))))
  const caseOkRu = (raw) => lang !== 'ru' || disp.some((d) => d.includes(raw))
  /** Чужие строки, где есть подстрока: свои строки и строки, где своя есть целиком, не считаются. */
  const allowedFor = (test) => {
    const allowed = new Set()
    own.forEach((l, i) => {
      if (test(fold(l))) for (const j of allowedBy[i]) allowed.add(j)
    })
    return allowed
  }
  const check = (raw) => {
    if (!caseOkRu(raw)) return null
    const f = fold(raw)
    const allowed = allowedFor((l) => l.includes(f))
    const hits = idx.containing(f)
    return { hits, bad: hits.filter((j) => !allowed.has(j)) }
  }
  const caseLines = lang === 'ru' ? disp : null
  // число внутри токена: \d+ (у дробных — [\d.]+: «Regenerate 1.5 Life per second»)
  const re = (raw) => numRegex(raw, u.decimal)
  for (const [lo, hi, o] of [
    [TOKEN_MIN, TOKEN_MAX, { caseLines }],
    [TOKEN_MIN, TOKEN_MAX, { allowNum: true, caseLines }]
  ]) {
    for (const raw of substrings(own, lo, hi, o)) {
      const c = check(raw)
      if (c && c.bad.length === 0) return { token: re(raw), hits: c.hits }
    }
  }
  // длинная подстрока или «a.*b» (в RU порядок слов: «приспешники имеют … скорости передвижения») — что короче
  let long = null
  for (const raw of substrings(own, TOKEN_MAX + 1, FALLBACK_MAX, { allowNum: true, caseLines })) {
    const c = check(raw)
    if (c && c.bad.length === 0) {
      long = { token: re(raw), hits: c.hits, c: cost(raw) }
      break
    }
  }
  const pair = pairToken(own, caseOkRu, allowedFor, idx, re)
  // RU: заглавная буква внутри строки («усилены Уроном огнем» — название камня) → «.», как в метках
  let dotted = null
  if (lang === 'ru') {
    own.forEach((line, i) => {
      for (const c of dottedCandidates(line, disp[i], lang, FALLBACK_MAX, (ch) => numRegex(ch, u.decimal))) {
        if (!c.dots) continue
        if (dotted && c.out.length >= dotted.c) break
        const hits = (c.lit.length >= 2 ? idx.containing(c.lit) : idx.lines.map((_, j) => j)).filter((j) =>
          c.test.test(idx.lines[j])
        )
        if (hits.every((j) => allowedBy[i].has(j))) {
          dotted = { token: c.out, hits, c: c.out.length }
          break
        }
      }
    })
  }
  const found = [long, pair, dotted].filter(Boolean).sort((a, b) => a.c - b.c)
  if (found.length) return found[0]
  // совсем длинная подстрока («ого урона в виде дополнительного урона от холода») — длинно, но без лишних строк
  for (const raw of substrings(own, FALLBACK_MAX + 1, LONGEST_MAX, { allowNum: true, caseLines })) {
    const c = check(raw)
    if (c && c.bad.length === 0) return { token: re(raw), hits: c.hits }
  }
  // уникального фрагмента нет — минимум лишних строк
  let best = null
  for (const raw of substrings(own, TOKEN_MIN, FALLBACK_MAX, { allowNum: true, caseLines })) {
    const c = check(raw)
    if (!c) continue
    if (!best || c.bad.length < best.bad.length) best = { token: re(raw), hits: c.hits, bad: c.bad }
  }
  if (!best) throw new Error(`${lang}: нет токена для ${u.id}`)
  return best
}

/** Подстрока → фрагмент регулярки игры: спецсимволы экранированы, # → \d+ (у дробных статов — [\d.]+). */
function numRegex(raw, decimal) {
  return escapeRegex(raw).replace(/#/g, decimal ? '[\\d.]+' : '\\d+')
}

const PAIR_PART_MIN = 2
const PAIR_PART_MAX = 6
const PAIR_MAX = 12

/**
 * «a.*b» внутри одной своей строки: перебор по общей длине a+b (2+2 … 12), из найденных на одной длине — дешевле.
 * Совпадения в корпусе: строки, где после a есть b (по меньшему из списков «есть a» / «есть b»).
 */
function pairToken(own, caseOkRu, allowedFor, idx, re) {
  const okPart = (s) => !/["!\n]/.test(s) && !/^[ #]|[ #]$/.test(s) && caseOkRu(s)
  // часть → [номер своей строки, позиция]: пара берётся только внутри одной строки
  const parts = new Map()
  own.forEach((line, li) => {
    for (let p = 0; p < line.length; p++) {
      for (let len = PAIR_PART_MIN; len <= PAIR_PART_MAX && p + len <= line.length; len++) {
        const s = line.slice(p, p + len)
        if (!okPart(s)) continue
        if (!parts.has(len)) parts.set(len, new Map())
        const at = parts.get(len)
        if (!at.has(s)) at.set(s, [])
        at.get(s).push([li, p])
      }
    }
  })
  const after = (l, fa, fb) => {
    const i = l.indexOf(fa)
    return i >= 0 && l.indexOf(fb, i + fa.length) >= 0
  }
  for (let total = PAIR_PART_MIN * 2; total <= PAIR_MAX; total++) {
    let best = null
    for (let la = PAIR_PART_MIN; la <= Math.min(PAIR_PART_MAX, total - PAIR_PART_MIN); la++) {
      const lb = total - la
      if (lb > PAIR_PART_MAX) continue
      for (const [a, pa] of parts.get(la) ?? []) {
        for (const [b, pb] of parts.get(lb) ?? []) {
          // b после a хотя бы в одной своей строке (с пропуском — иначе это просто подстрока)
          if (!pb.some(([lb, q]) => pa.some(([lt, p]) => lb === lt && q > p + la))) continue
          const [fa, fb] = [fold(a), fold(b)]
          const A = idx.containing(fa)
          const B = idx.containing(fb)
          const hits = (A.length <= B.length ? A : B).filter((j) => after(idx.lines[j], fa, fb))
          const allowed = allowedFor((l) => after(l, fa, fb))
          if (hits.some((j) => !allowed.has(j))) continue
          const c = cost(a) + 2 + cost(b)
          const token = `${re(a)}.*${re(b)}`
          if (!best || c < best.c || (c === best.c && token < best.token)) best = { token, hits, c }
        }
      }
    }
    if (best) return best
  }
  return null
}

/**
 * Порог строки с одним числом: <pre><atLeast(N)><post> — как у «Торговца» (pre чаще пусто или «+»: «\+» отсекает
 * «-#% to fire resistance»). Чужие строки — те же, что у токена.
 */
function unitThreshold(u, lang, idx) {
  const [line] = u.text[lang]
  const [disp] = u.cased[lang]
  const i = line.indexOf('#')
  const [pre, post] = [line.slice(0, i), line.slice(i + 1)]
  const [dpre, dpost] = [disp.slice(0, disp.indexOf('#')), disp.slice(disp.indexOf('#') + 1)]
  const allowed = new Set(idx.like(fold(line)))
  const ok = (raw, text) => lang !== 'ru' || caseOk(raw, [text])
  let best = null
  for (const s of preCandidates(pre)) {
    if (!pre.endsWith(s) || !ok(s, dpre)) continue
    for (const p of postCandidates(post)) {
      if (!ok(p, dpost)) continue
      const hits = idx.containing(fold(s) + '#' + fold(p))
      if (hits.some((j) => !allowed.has(j))) continue
      const c = cost(s) + cost(p)
      if (!best || c < best.c) best = { c, pre: s, post: p, hits }
      break
    }
  }
  if (best) return best
  return null
}

/**
 * Подстроки короткой строки (база, влияние) по длине регулярки. В RU буква, заглавная в подсказке
 * («Предмет Создателя»), заменяется на «.» — регистр кириллицы в поиске игры не проверен (как метки «Торговца»).
 */
function dottedCandidates(line, display, lang, hi, reChar = toRegex) {
  const out = []
  for (let i = 0; i < line.length; i++) {
    for (let len = TOKEN_MIN; len <= hi && i + len <= line.length; len++) {
      const raw = line.slice(i, i + len)
      if (/["!\n]/.test(raw) || /^[ #]|[ #]$/.test(raw)) continue
      const up = (k) => lang === 'ru' && display[k] !== display[k].toLowerCase()
      if (up(i) || up(i + len - 1)) continue
      let re = ''
      let test = ''
      let dots = 0
      const lits = ['']
      for (let k = i; k < i + len; k++) {
        if (up(k)) {
          dots++
          re += '.'
          test += '.'
          lits.push('')
        } else {
          re += reChar(line[k])
          test += escapeRegex(fold(line[k]))
          lits[lits.length - 1] += fold(line[k])
        }
      }
      const lit = lits.reduce((a, b) => (b.length > a.length ? b : a))
      out.push({ out: re, test: new RegExp(test), lit, dots })
    }
  }
  return out.sort((a, b) => a.out.length - b.out.length || (a.out < b.out ? -1 : a.out > b.out ? 1 : 0))
}

/** Фрагмент короткой строки (база, влияние): чужие — все строки, кроме тех, где она есть целиком. */
function plainToken(line, display, lang, idx, hi = 40) {
  const allowed = new Set(idx.containing(fold(line)))
  const all = idx.lines.map((_, j) => j)
  const hitsOf = (c) => (c.lit.length >= 2 ? idx.containing(c.lit) : all).filter((j) => c.test.test(idx.lines[j]))
  const cands = dottedCandidates(line, display, lang, hi)
  for (const c of cands) {
    const hits = hitsOf(c)
    if (hits.every((j) => allowed.has(j))) return { token: c.out, hits }
  }
  // RU: короткое название отличается только заглавной буквой («Дага» и «врага») — класс [дД] верен при любом
  // регистре поиска игры
  if (lang === 'ru') {
    for (const c of casedCandidates(line, display, hi)) {
      const hits = (c.lit.length >= 2 ? idx.containing(c.lit) : all).filter((j) => idx.lines[j].includes(c.lit) && c.test.test(idx.lines[j]))
      if (hits.every((j) => allowed.has(j))) return { token: c.out, hits }
    }
  }
  // своя строка целиком есть в другой (база «Leather Belt» внутри «Studded Leather Belt»?) — самый длинный вариант
  const c = cands[cands.length - 1]
  return { token: c.out, hits: hitsOf(c) }
}

/** Подстроки, где заглавная буква подсказки — класс «[дД]» (а не «.»), по длине регулярки. */
function casedCandidates(line, display, hi) {
  const out = []
  for (let i = 0; i < line.length; i++) {
    for (let len = TOKEN_MIN; len <= hi && i + len <= line.length; len++) {
      const raw = line.slice(i, i + len)
      if (/["!\n]/.test(raw) || /^[ #]|[ #]$/.test(raw)) continue
      let re = ''
      let cased = 0
      for (let k = i; k < i + len; k++) {
        const up = display[k] !== display[k].toLowerCase()
        if (up) cased++
        re += up ? `[${line[k]}${display[k]}]` : toRegex(line[k])
      }
      if (!cased) continue
      out.push({ out: re, test: new RegExp(escapeRegex(fold(raw))), lit: fold(raw) })
    }
  }
  return out.sort((a, b) => a.out.length - b.out.length || (a.out < b.out ? -1 : a.out > b.out ? 1 : 0))
}

/**
 * Флаг-строка («Corrupted»): подстрока или конец строки с $ (как у карт: «corrupted blood» есть в модах).
 * ^ не используем (в игре не проверен), поэтому строки уникальных «… if corrupted» неотделимы — берём вариант
 * с наименьшим числом таких строк и отдаём их в also (тесты знают, что это допустимо).
 */
function flagToken(line, display, lang, idx) {
  const caseLines = lang === 'ru' ? [display] : null
  const own = fold(line)
  let best = null
  const consider = (token, hits) => {
    const also = hits.filter((j) => idx.lines[j] !== own).map((j) => idx.lines[j])
    if (!best || also.length < best.also.length || (also.length === best.also.length && token.length < best.token.length)) {
      best = { token, also }
    }
  }
  for (const raw of substrings([line], 3, line.length, { caseLines })) {
    if (lang === 'ru' && !display.includes(raw)) continue
    consider(toRegex(raw), idx.containing(fold(raw)))
  }
  for (let i = line.length - 3; i >= 0; i--) {
    const raw = line.slice(i)
    if (lang === 'ru' && !display.includes(raw)) continue
    consider(toRegex(raw) + '$', idx.endingWith(fold(raw)))
  }
  if (!best) throw new Error(`${lang}: нет флага для «${line}»`)
  return best
}

// ---------------------------------------------------------------------------
// Сборка
// ---------------------------------------------------------------------------

function buildLang(lang, ctx, units) {
  const corpus = buildCorpus(lang, ctx, units)
  const folded = corpus.map(fold)
  const idx = makeIndex(folded)
  const foldedAll = corpus.map((line, i) => ({ line, folded: folded[i] }))
  // строка корпуса → строки модов, у которых она своя (для also: «заденет и …»)
  const unitsByLine = new Map()
  for (const u of units) {
    for (const l of u.text[lang]) {
      for (const j of idx.containing(fold(l)).filter((k) => idx.lines[k] === fold(l))) {
        if (!unitsByLine.has(j)) unitsByLine.set(j, new Set())
        unitsByLine.get(j).add(u.id)
      }
    }
  }
  const alsoOf = (u, hits) => {
    const out = new Set()
    for (const j of hits) for (const id of unitsByLine.get(j) ?? []) if (id !== u.id) out.add(id)
    return [...out].sort()
  }

  const mods = []
  const stats = { thresholds: 0, fallback: [], maxToken: 0, sumToken: 0 }
  for (const u of units) {
    const t = unitToken(u, lang, idx)
    const m = {
      id: u.id,
      text: u.text[lang].join('\n'),
      display: u.display[lang].join('\n'),
      token: t.token,
      kind: u.kinds.size > 1 ? 'both' : [...u.kinds][0]
    }
    if (t.bad?.length) stats.fallback.push(`${u.id} → ${t.token} (+${t.bad.length}: ${t.bad.slice(0, 2).map((j) => idx.lines[j]).join(" / ")}) own: ${u.text[lang].join(" / ")}`)
    let also = alsoOf(u, t.hits)
    const own = u.text[lang]
    if (own.length === 1 && (own[0].match(/#/g) ?? []).length === 1 && !u.decimal) {
      const thr = unitThreshold(u, lang, idx)
      if (thr) {
        m.pre = toRegex(thr.pre)
        m.posts = [toRegex(thr.post)]
        m.digit = thr.post.startsWith('%') ? '.' : '\\d'
        also = [...new Set([...also, ...alsoOf(u, thr.hits)])].sort()
        stats.thresholds++
      }
    }
    if (also.length) m.also = also
    const cls = new Set([...u.normal, ...u.infl.keys()])
    if (cls.size) m.cls = ITEM_CLASSES.map(([k]) => k).filter((k) => cls.has(k))
    // только с влиянием: обычным образом не выпадает нигде
    if (!u.normal.size && u.infl.size) {
      const infl = new Set([...u.infl.values()].flatMap((s) => [...s]))
      m.infl = INFLUENCES.map(([k]) => k).filter((k) => infl.has(k))
    }
    // по классам: на шлеме «… урона от молнии к чарам» — только с влиянием, на жезле — обычным образом
    const inflBy = ITEM_CLASSES.map(([k]) => k).filter((k) => u.infl.has(k) && !u.normal.has(k))
    if (inflBy.length) {
      m.inflBy = Object.fromEntries(inflBy.map((k) => [k, INFLUENCES.map(([i]) => i).filter((i) => u.infl.get(k).has(i))]))
    }
    if (u.crafted && !u.other) m.src = 'crafted'
    else if (!cls.size) m.src = 'special'
    stats.maxToken = Math.max(stats.maxToken, t.token.length)
    stats.sumToken += t.token.length
    mods.push(m)
  }

  // классы, редкость, «уровень предмета» — метки с «:» (как у «Торговца»), на расширенном корпусе
  const cs = readClientStrings(lang)
  const labels = {}
  const classes = {}
  for (const [key, ...ids] of ITEM_CLASSES) {
    const names = ids.map((id) => ((lang === 'en' ? ctx.classes : ctx.classesRu)[id] ?? ctx.classes[id]).name)
    const own = names.map((n) => normLine(cs.ITEM_CLASS + n))
    labels[`class.${key}`] = names.map((n) => normLine(cs.ITEM_CLASS + n, false))
    classes[key] = findLabel(key, own, labels[`class.${key}`], foldedAll.filter((o) => !own.includes(o.line)), lang)
  }
  const rarity = {}
  for (const [key, csKey] of RARITIES) {
    const line = normLine(cs.RARITY + cs[csKey])
    labels[`rarity.${key}`] = [normLine(cs.RARITY + cs[csKey], false)]
    rarity[key] = findLabel(key, [line], labels[`rarity.${key}`], foldedAll.filter((o) => o.line !== line), lang)
  }
  const ilvl = normLine(cs.ITEM_LEVEL + '#')
  labels.itemLevel = [normLine(cs.ITEM_LEVEL + '#', false)]
  const itemLevel = findLabel('itemLevel', [ilvl], labels.itemLevel, foldedAll.filter((o) => o.line !== ilvl), lang)

  // влияние и «осквернено» — строки подсказки «Shaper Item» / «Предмет Создателя», «Corrupted» / «Осквернено»
  const influence = {}
  for (const [key, csKey] of INFLUENCES) {
    const display = normLine(cs[csKey], false)
    labels[`influence.${key}`] = [display]
    influence[key] = plainToken(normLine(cs[csKey]), display, lang, idx).token
  }
  labels.corrupted = [normLine(cs.CORRUPTED, false)]
  const corrupted = flagToken(normLine(cs.CORRUPTED), labels.corrupted[0], lang, idx)
  const flags = { corrupted: corrupted.token }
  // строки, неотделимые от «Corrupted» без ^ («… if corrupted» у уникальных) — для тестов
  labels.corruptedAlso = corrupted.also

  // базы снаряжения и флаконов: по классу, сначала поздние (у них лучшие свойства базы)
  const basesLang = lang === 'en' ? ctx.bases : ctx.basesRu
  const bases = []
  const seenNames = new Set()
  for (const [cls, ...ids] of ITEM_CLASSES) {
    if (NO_BASES.has(cls)) continue
    const list = Object.keys(ctx.bases)
      .sort()
      .filter((k) => ctx.bases[k].release_state === 'released' && ids.includes(ctx.bases[k].item_class))
      .filter((k) => ['item', 'flask'].includes(ctx.bases[k].domain))
    for (const k of list) {
      const en = ctx.bases[k].name
      if (seenNames.has(en)) continue
      seenNames.add(en)
      const name = (basesLang[k] ?? ctx.bases[k]).name
      const t = plainToken(normLine(name), normLine(name, false), lang, idx)
      const b = { id: k.replace(/^Metadata\/Items\//, ''), cls, name, token: t.token, level: ctx.bases[k].drop_level ?? 0 }
      const own = fold(normLine(name))
      const also = t.hits.filter((j) => idx.lines[j] !== own).length
      if (also) b.also = also
      bases.push(b)
    }
  }
  bases.sort((a, b) => ITEM_CLASSES.findIndex(([k]) => k === a.cls) - ITEM_CLASSES.findIndex(([k]) => k === b.cls) || b.level - a.level || (a.id < b.id ? -1 : 1))

  return { corpus, labels, data: { mods, bases, classes, rarity, influence, flags, itemLevel }, stats }
}

async function main() {
  const args = process.argv.slice(2)
  const refresh = args.includes('--refresh')
  const pi = args.indexOf('--patch')
  const patch = pi >= 0 ? args[pi + 1] : DEFAULT_PATCH
  const info = await ensureSources(refresh)
  await ensureExtra(refresh, SOURCES)

  const ctx = {
    mods: readSource('mods'),
    trEn: indexTranslations(readSource('statsEn')),
    trRu: indexTranslations(readSource('statsRu')),
    bases: readSource('basesEn'),
    basesRu: readSource('basesRu'),
    classes: readExtra('classesEn', SOURCES),
    classesRu: readExtra('classesRu', SOURCES),
    bench: readExtra('bench', SOURCES),
    modsRu: readExtra('modsRu', SOURCES)
  }
  const units = collectUnits(ctx)
  const date = sourcesDate(info)
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(OUT_CORPUS, { recursive: true })
  for (const lang of LANGS) {
    const langCtx = {
      ...ctx,
      basesLang: lang === 'en' ? ctx.bases : ctx.basesRu,
      classesLang: lang === 'en' ? ctx.classes : ctx.classesRu
    }
    const r = buildLang(lang, langCtx, units)
    const meta = { source: 'RePoE fork (repoe-fork.github.io) + APT client_strings', date, patch, lang }
    const file = path.join(OUT_DIR, `items.${lang}.json`)
    fs.writeFileSync(file, JSON.stringify({ meta, ...r.data }, null, 1) + '\n')
    const corpusFile = path.join(OUT_CORPUS, `item-corpus.${lang}.json`)
    fs.writeFileSync(corpusFile, JSON.stringify({ meta, labels: r.labels, lines: r.corpus }, null, 1) + '\n')
    const s = r.stats
    console.log(
      `${lang}: строк модов ${r.data.mods.length} (с порогом ${s.thresholds}), баз ${r.data.bases.length}, корпус ${r.corpus.length}` +
        ` · токен в среднем ${(s.sumToken / r.data.mods.length).toFixed(1)}, макс. ${s.maxToken} → ${path.relative(ROOT, file)}`
    )
    console.log(`  классы: ${JSON.stringify(r.data.classes)}`)
    console.log(`  редкость: ${JSON.stringify(r.data.rarity)} · уровень предмета: ${r.data.itemLevel}`)
    console.log(`  влияние: ${JSON.stringify(r.data.influence)} · флаги: ${JSON.stringify(r.data.flags)}`)
    for (const f of s.fallback) console.log(`  ⚠ неуникальный токен: ${f}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
