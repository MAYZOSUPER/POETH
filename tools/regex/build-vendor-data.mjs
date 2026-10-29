#!/usr/bin/env node
// Генератор строк «Торговца» (S27): свойства предметов — жизнь, сопротивления, «+ к уровню камней»
// по типам, урон, скорости, характеристики — плюс фильтры редкости и класса предмета.
//
// Источник — открытые данные RePoE fork (как у карт, тот же кэш tools/regex/sources/): mods,
// stat_translations EN/RU, base_items EN/RU, item_classes EN/RU. Метки свойств предмета («Quality: »,
// «Rarity: », «Item Class: »…) — client_strings из данных APT (resources/data/poe1/{en,ru}), строки
// настоящих подсказок — фикстуры парсера tests/fixtures/poe1/{en,ru} (кроме adv-*: там Ctrl+Alt+C с
// диапазонами, в поиске игры их нет).
//
// Что ищет поиск игры (PoE 1, с 3.14): каждую строку текста предмета как при Ctrl+C, без учёта регистра,
// в том числе «Item Class: Boots» и «Rarity: Magic» — по ним и строятся фильтры класса и редкости.
//
// Для каждого свойства — «свои» строки (через stat_translations) и кратчайший фрагмент регулярки:
//   • порог «≥ N»: <atLeast(N)><хвост>, хвост — кратчайшее начало текста после числа, которое
//     не встречается после числа ни в одной «чужой» строке корпуса;
//   • без порога: кратчайшая подстрока (или несколько через |), которой нет в чужих строках.
// «Чужие» строки — все моды, которые встречаются на предметах у торговцев и в тайнике (префиксы, суффиксы,
// имплиситы баз, осквернённые, ремесло, флаконы; зачарования лабиринта у торговцев не бывают), метки свойств, классы, редкости, базы.
// Не считаются ложными: «вариант» своей строки (она же + условие: «… during Effect»), свои строки
// свойств из also (на них нельзя не попасть — UI предупредит «заденет и …») и та же строка у приспешников
// («Minions have …» — тот же текст с приставкой; помечается minions, UI предупреждает).
// ^ и $ не используем: их поведение в игре не проверено.
//
// Выход:
//   src/shared/regex/vendorData.ts                 — фрагменты для движка (EN/RU), генерируется;
//   tests/regex/fixtures/vendor-corpus.{en,ru}.json — корпус строк и «свои» строки для тестов.
//
// Запуск: node tools/regex/build-vendor-data.mjs [--refresh] [--patch 3.30]
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
  pickVariant,
  readSource,
  renderMod,
  renderVariant,
  sourcesDate,
  substrings,
  toRegex
} from './build-regex-data.mjs'

const SRC_DIR = path.join(ROOT, 'tools/regex/sources')
const OUT_TS = path.join(ROOT, 'src/shared/regex/vendorData.ts')
const OUT_CORPUS = path.join(ROOT, 'tests/regex/fixtures')
const FIXTURES = path.join(ROOT, 'tests/fixtures/poe1')
const APT_DATA = path.join(ROOT, 'resources/data/poe1')
const LANGS = ['en', 'ru']

/** Дополнительные источники RePoE (классы предметов) — в тот же кэш. */
const EXTRA_SOURCES = { classesEn: 'item_classes.min.json', classesRu: 'Russian/item_classes.min.json' }

// ---------------------------------------------------------------------------
// Свойства: ключ (VendorModKey в src/shared/types/regex.ts), stat id своих строк, порог
// ---------------------------------------------------------------------------

const ADDED = (kind, el) => `${kind}_minimum_added_${el}_damage`
const RES_PAIRS = { fire: ['cold', 'lightning'], cold: ['fire', 'lightning'], lightning: ['fire', 'cold'] }
const pairStat = (a, b) => {
  const [x, y] = [a, b].sort((p, q) => ORDER.indexOf(p) - ORDER.indexOf(q))
  return `${x}_and_${y}_damage_resistance_%`
}
const ORDER = ['fire', 'cold', 'lightning']

/**
 * min: порог «≥ N» (строка с одним числом); also: чьи строки неизбежно заденет (тот же текст —
 * начало их строки).
 */
export const PROPS = [
  // защита
  { key: 'life', min: true, stats: ['base_maximum_life'] },
  { key: 'mana', min: true, stats: ['base_maximum_mana'] },
  { key: 'energyShield', min: true, stats: ['local_energy_shield', 'base_maximum_energy_shield'] },
  // сопротивления: одиночное + двойное (кольцо Two-Stone, ремесло)
  ...['fire', 'cold', 'lightning'].map((el) => ({
    key: `res${el[0].toUpperCase()}${el.slice(1)}`,
    min: true,
    stats: [`base_${el}_damage_resistance_%`, ...RES_PAIRS[el].map((o) => pairStat(el, o))]
  })),
  { key: 'resChaos', min: true, stats: ['base_chaos_damage_resistance_%'] },
  { key: 'resAll', min: true, stats: ['base_resist_all_elements_%'] },
  // «+ к уровню камней» по типам
  { key: 'gemAll', stats: ['local_socketed_gem_level_+', 'all_skill_gem_level_+'] },
  { key: 'gemSpell', stats: ['spell_skill_gem_level_+', 'local_socketed_spell_gem_level_+'] },
  ...['fire', 'cold', 'lightning', 'chaos', 'physical'].map((el) => ({
    key: `gem${el === 'physical' ? 'Phys' : el[0].toUpperCase() + el.slice(1)}`,
    stats: [`local_socketed_${el}_gem_level_+`, `${el}_spell_skill_gem_level_+`, `${el}_skill_gem_level_+`]
  })),
  { key: 'gemMinion', stats: ['local_socketed_minion_gem_level_+', 'minion_skill_gem_level_+'] },
  { key: 'gemBow', stats: ['local_socketed_bow_gem_level_+'] },
  { key: 'gemMelee', stats: ['local_socketed_melee_gem_level_+'] },
  // урон
  { key: 'spellDamage', min: true, stats: ['spell_damage_+%'] },
  {
    key: 'physDamage',
    min: true,
    stats: ['local_physical_damage_+%'],
    allowSide: [{ why: 'gems', en: /^(cursed|nearby) enemies take #% increased physical damage$/, ru: /^$/ }]
  },
  { key: 'eleAttack', min: true, stats: ['elemental_damage_with_attack_skills_+%'] },
  // добавленный урон к атакам (кольца, амулеты, перчатки, колчаны) и на оружии; к чарам
  ...['physical', 'fire', 'cold', 'lightning', 'chaos'].map((el) => ({
    key: `addAttack${el === 'physical' ? 'Phys' : el[0].toUpperCase() + el.slice(1)}`,
    stats: [ADDED('attack', el), ADDED('local', el)],
    // «Adds # to # Fire Damage» на оружии — начало строки «… to Spells»: без $ заденет и добавленный к чарам
    also: [`addSpell${el === 'physical' ? 'Phys' : el[0].toUpperCase() + el.slice(1)}`]
  })),
  ...['physical', 'fire', 'cold', 'lightning', 'chaos'].map((el) => ({
    key: `addSpell${el === 'physical' ? 'Phys' : el[0].toUpperCase() + el.slice(1)}`,
    stats: [ADDED('spell', el)]
  })),
  // скорость и крит
  {
    key: 'moveSpeed',
    min: true,
    stats: ['base_movement_velocity_+%']
  },
  { key: 'attackSpeed', min: true, stats: ['local_attack_speed_+%', 'attack_speed_+%'] },
  { key: 'castSpeed', min: true, stats: ['base_cast_speed_+%'] },
  { key: 'critChance', min: true, stats: ['local_critical_strike_chance_+%', 'critical_strike_chance_+%'] },
  // характеристики: одиночная + двойная (ремесло) + «ко всем»
  ...['strength', 'dexterity', 'intelligence'].map((a) => ({
    key: a === 'strength' ? 'str' : a === 'dexterity' ? 'dex' : 'int',
    min: true,
    stats: [
      `additional_${a}`,
      ...['strength', 'dexterity', 'intelligence']
        .filter((b) => b !== a)
        .map((b) => {
          const [x, y] = [a, b].sort(
            (p, q) => ['strength', 'dexterity', 'intelligence'].indexOf(p) - ['strength', 'dexterity', 'intelligence'].indexOf(q)
          )
          return `additional_${x}_and_${y}`
        })
    ]
  })),
  { key: 'allAttributes', min: true, stats: ['additional_all_attributes'] }
]

/** Классы предметов для фильтра (ключ — VendorItemClass; id из item_classes, родственные — вместе). */
export const CLASSES = [
  ['boots', 'Boots'],
  ['gloves', 'Gloves'],
  ['helmet', 'Helmet'],
  ['bodyArmour', 'Body Armour'],
  ['shield', 'Shield'],
  ['quiver', 'Quiver'],
  ['ring', 'Ring'],
  ['amulet', 'Amulet'],
  ['belt', 'Belt'],
  ['wand', 'Wand'],
  ['sceptre', 'Sceptre'],
  ['staff', 'Staff', 'Warstaff'],
  ['dagger', 'Dagger', 'Rune Dagger'],
  ['claw', 'Claw'],
  ['bow', 'Bow'],
  ['sword1h', 'One Hand Sword', 'Thrusting One Hand Sword'],
  ['axe1h', 'One Hand Axe'],
  ['mace1h', 'One Hand Mace'],
  ['sword2h', 'Two Hand Sword'],
  ['axe2h', 'Two Hand Axe'],
  ['mace2h', 'Two Hand Mace']
]

const RARITIES = [
  ['normal', 'RARITY_NORMAL'],
  ['magic', 'RARITY_MAGIC'],
  ['rare', 'RARITY_RARE']
]

/** Моды, строки которых бывают на предметах у торговцев и в тайнике (кроме уникальных и зачарований лабиринта). */
const CORPUS_DOMAINS = new Set(['item', 'crafted', 'flask'])
const CORPUS_TYPES = new Set([
  'prefix',
  'suffix',
  'corrupted',
  'eater_of_worlds_implicit',
  'searing_exarch_implicit'
])

/** Приставка свойств приспешников: «Minions have +#% to all Elemental Resistances». */
const MINIONS = { en: 'minions have ', ru: 'приспешники имеют ' }

/**
 * Допустимые побочные совпадения — причина (ключ regex.vendor.side.<причина> в UI) и проверка строки.
 * minions — своя строка с приставкой «Minions have»: без ^ не отделить; negative — та же строка с минусом.
 * Свои правила свойства — allowSide
 * (gems — описания камней: «Cursed enemies take #% increased Physical Damage» у проклятия).
 */
const SIDE_RULES = {
  minions: (lang, own) => (line) => {
    if (!line.startsWith(MINIONS[lang])) return false
    const rest = line.slice(MINIONS[lang].length)
    return own.includes(rest) || isVariant(rest, own)
  },
  // «-1 к уровню размещённых камней поддержки»: отрицательная версия своей строки (или её варианта)
  negative: (lang, own) => (line) => line.startsWith('-') && isVariant('+' + line.slice(1), own)
}

const TOKEN_MAX = 20
const POST_MAX = 30
const PRE_MAX = 12
const PAIR_PART_MAX = 6

// ---------------------------------------------------------------------------
// Источники
// ---------------------------------------------------------------------------

async function ensureExtra(refresh) {
  const infoFile = path.join(SRC_DIR, 'sources.json')
  const info = fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, 'utf8')) : {}
  for (const rel of Object.values(EXTRA_SOURCES)) {
    const file = path.join(SRC_DIR, rel.replace(/\//g, '_'))
    if (!refresh && fs.existsSync(file)) continue
    const url = 'https://repoe-fork.github.io/' + rel
    process.stdout.write(`скачиваю ${url} … `)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    info[rel] = { url, lastModified: res.headers.get('last-modified') }
    console.log('ok')
  }
  fs.writeFileSync(infoFile, JSON.stringify(info, null, 2))
}

function readExtra(key) {
  return JSON.parse(fs.readFileSync(path.join(SRC_DIR, EXTRA_SOURCES[key].replace(/\//g, '_')), 'utf8'))
}

function readClientStrings(lang) {
  return JSON.parse(fs.readFileSync(path.join(APT_DATA, lang, 'client_strings.json'), 'utf8'))
}

// ---------------------------------------------------------------------------
// Строки: свои (по stat id) и корпус
// ---------------------------------------------------------------------------

/** Запись перевода, где стат — первый (у пар min/max — запись на обе). */
function entryFor(trEn, statId) {
  const cands = trEn.byStat.get(statId) ?? []
  const own = cands.filter((t) => t.ids[0] === statId)
  const list = own.length ? own : cands
  if (!list.length) throw new Error(`нет перевода для ${statId}`)
  return [...list].sort((a, b) => a.ids.length - b.ids.length)[0]
}

/** Строки стата в обоих языках: значения положительные (вариант «increased», не «reduced»). */
function statLines(trEn, trRu, statId) {
  const entry = entryFor(trEn, statId)
  // положительные значения — у самого стата и его пары max (Adds # to #), остальные статы записи — 0
  const pair = statId.replace('_minimum_', '_maximum_')
  const vals = entry.ids.map((id, i) => (id === statId || id === pair ? 1 + i : 0))
  const ru = trRu.byIds.get(entry.ids.join('|'))
  const vEn = pickVariant(entry.English, vals)
  const vRu = pickVariant(ru?.Russian, vals)
  if (!vEn || !vRu) throw new Error(`нет варианта перевода для ${statId}`)
  const out = {}
  for (const [lang, v] of [
    ['en', vEn],
    ['ru', vRu]
  ]) {
    const text = renderVariant(v, vals)
    out[lang] = { text: text.split('\n').map((l) => normLine(l)), display: text.split('\n').map((l) => normLine(l, false)) }
  }
  return out
}

function fixtureLines(lang) {
  const dir = path.join(FIXTURES, lang)
  const lines = []
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.txt') || f.startsWith('adv-')) continue
    for (const l of fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/)) {
      const n = normLine(l)
      if (n && n !== '--------') lines.push(n)
    }
  }
  return lines
}

function collectCorpus(lang, ctx) {
  const { mods, trEn, trRu, bases, basesLang, classes, classesLang } = ctx
  const lines = new Set()
  for (const id of Object.keys(mods).sort()) {
    const m = mods[id]
    if (!CORPUS_DOMAINS.has(m.domain) || !CORPUS_TYPES.has(m.generation_type)) continue
    for (const l of renderMod(m, trEn, trRu)[lang]) lines.add(l)
  }
  for (const key of Object.keys(bases).sort()) {
    const b = bases[key]
    if (b.release_state !== 'released' || (b.domain !== 'item' && b.domain !== 'flask')) continue
    lines.add(normLine((basesLang[key] ?? b).name))
    for (const imp of b.implicits ?? []) {
      const m = mods[imp]
      if (m) for (const l of renderMod(m, trEn, trRu)[lang]) lines.add(l)
    }
  }
  // метки свойств: «quality: +#%», «item level: #», «corrupted» …
  const cs = readClientStrings(lang)
  for (const v of Object.values(cs)) {
    if (typeof v !== 'string') continue
    lines.add(normLine(v.endsWith(': ') ? `${v}#` : v))
  }
  for (const id of Object.keys(classes).sort()) {
    const name = (classesLang[id] ?? classes[id]).name
    if (name) lines.add(normLine(cs.ITEM_CLASS + name))
  }
  for (const k of Object.keys(cs).filter((k) => k.startsWith('RARITY_')).sort()) lines.add(normLine(cs.RARITY + cs[k]))
  for (const l of fixtureLines(lang)) lines.add(l)
  lines.delete('')
  return lines
}

// ---------------------------------------------------------------------------
// Поиск фрагментов
// ---------------------------------------------------------------------------

/** В RU подстрока не должна задевать буквы, заглавные в подсказке (регистр кириллицы в игре не проверен). */
function caseOk(raw, displays) {
  return displays.every((d) => d.includes(raw))
}

/** Кандидат-хвост после числа: начало post длиной 1…POST_MAX, без края-пробела и без «#». */
function postCandidates(post) {
  const out = []
  for (let len = 1; len <= Math.min(POST_MAX, post.length); len++) {
    const p = post.slice(0, len)
    if (p.includes('#') || /["!]/.test(p)) break
    if (/ $/.test(p)) continue
    out.push(p)
  }
  return out
}

/**
 * Строка — «вариант» своей: своя строка + продолжение («… during effect», «…, если …», в RU «… камней огня»).
 * Без $ такую строку не отделить; сравнение со свёрткой ё→е (в RU-переводах бывает и «размещенных»).
 */
export function isVariant(line, own) {
  const l = fold(line)
  return own.some((t) => {
    const f = fold(t)
    return l !== f && (l.startsWith(f + ' ') || l.startsWith(f + ','))
  })
}

/** Кандидат-контекст перед числом: конец pre длиной 0…PRE_MAX («+» отсекает «-#% to fire resistance»). */
function preCandidates(pre) {
  const out = ['']
  for (let len = 1; len <= Math.min(PRE_MAX, pre.length); len++) {
    const s = pre.slice(pre.length - len)
    if (/["!]/.test(s)) break
    if (/^ /.test(s)) continue
    out.push(s)
  }
  return out
}

/** Цена фрагмента: длина в регулярке + штраф за «ё» (в игре ё/е могут различаться — лучше без неё). */
const cost = (raw) => toRegex(raw).length + (raw.match(/ё/g) ?? []).length * 1.5

/**
 * Порог: <pre><atLeast(N)><post>. pre — общий для всех своих строк конец текста до числа (часто пусто или «+»),
 * post — общее начало текста после числа или группа (a|b) по строкам. Ищем самый короткий вариант без
 * чужих строк, где встречается pre#post.
 */
function findThreshold(prop, lang, own, displays, others) {
  const split = (t) => {
    const i = t.indexOf('#')
    if (i < 0 || t.indexOf('#', i + 1) >= 0) throw new Error(`${prop.key}: порог только для строки с одним числом: ${t}`)
    return [t.slice(0, i), t.slice(i + 1)]
  }
  const parts = own.map(split)
  const dparts = displays.map(split)
  const bad = (s, p) => {
    const f = fold(s) + '#' + fold(p)
    return others.filter((o) => o.folded.includes(f)).map((o) => o.line)
  }
  const ok = (raw, texts) => lang !== 'ru' || caseOk(raw, texts)
  const pres = preCandidates(parts[0][0]).filter(
    (s) => parts.every(([pre]) => pre.endsWith(s)) && ok(s, dparts.map(([pre]) => pre))
  )
  let best = null
  for (const s of pres) {
    // один общий хвост для всех своих строк
    for (const p of postCandidates(parts[0][1])) {
      if (!parts.every(([, post]) => post.startsWith(p)) || !ok(p, dparts.map(([, post]) => post))) continue
      if (bad(s, p).length) continue
      const c = cost(s) + cost(p)
      if (!best || c < best.c) best = { c, pre: s, posts: [p] }
      break
    }
    // по хвосту на строку: pre(a|b)
    if (parts.length > 1) {
      const per = parts.map(([, post], i) =>
        postCandidates(post).find((p) => ok(p, [dparts[i][1]]) && bad(s, p).length === 0)
      )
      if (per.every(Boolean)) {
        // хвост одной строки может покрыть и другую — убираем лишние
        const uniq = [...new Set(per)].filter((p, _, all) => !all.some((q) => q !== p && p.startsWith(q))).sort()
        const c = cost(s) + uniq.reduce((n, p) => n + cost(p), 0) + (uniq.length > 1 ? uniq.length + 1 : 0)
        if (!best || c < best.c) best = { c, pre: s, posts: uniq }
      }
    }
  }
  if (best) return best
  // уникального варианта нет: полный текст и что ещё заденет
  const [pre, post] = parts[0]
  return { pre, posts: [post], hits: bad(pre, post) }
}

/** Кандидат: подстрока или «a.*b»; out — фрагмент регулярки игры, test — проверка строки корпуса (свёрнутой). */
function single(raw) {
  return { out: toRegex(raw), test: new RegExp(escapeRegex(fold(raw))), parts: [raw], cost: cost(raw) }
}

function pair(a, b) {
  return {
    out: `${toRegex(a)}.*${toRegex(b)}`,
    test: new RegExp(`${escapeRegex(fold(a))}.*${escapeRegex(fold(b))}`),
    parts: [a, b],
    cost: cost(a) + 2 + cost(b)
  }
}

/** «a.*b» из одной строки: в RU порядок слов («к уровню размещённых камней огня») делает подстроки длинными. */
function pairCandidates(line) {
  const ok = (s) => s && !/["!]/.test(s) && !/^ | $/.test(s)
  const out = []
  for (let p = 0; p < line.length; p++) {
    for (let la = 1; la <= PAIR_PART_MAX && p + la <= line.length; la++) {
      const a = line.slice(p, p + la)
      if (!ok(a)) continue
      for (let q = p + la + 1; q < line.length; q++) {
        for (let lb = 1; lb <= PAIR_PART_MAX && q + lb <= line.length; lb++) {
          const b = line.slice(q, q + lb)
          if (ok(b)) out.push(pair(a, b))
        }
      }
    }
  }
  return out.sort((x, y) => x.cost - y.cost || (x.out < y.out ? -1 : x.out > y.out ? 1 : 0))
}

function findToken(prop, lang, own, displays, others) {
  const clean = (c) => !others.some((o) => c.test.test(o.folded))
  const covers = (c) =>
    own.filter((t, i) => c.test.test(fold(t)) && (lang !== 'ru' || c.parts.every((p) => displays[i].includes(p))))
  // одна подстрока на все свои строки
  for (const raw of substrings([own[0]], 2, TOKEN_MAX, { allowNum: true })) {
    const c = single(raw)
    if (covers(c).length === own.length && clean(c)) return { tokens: [c] }
  }
  // жадное покрытие: на каждом шаге — фрагмент, покрывающий больше непокрытых строк (при равенстве — короче)
  const cands = []
  for (const raw of substrings(own, 2, TOKEN_MAX, { allowNum: true })) {
    const c = single(raw)
    c.covers = covers(c)
    if (c.covers.length && clean(c)) cands.push(c)
  }
  // строкам без уникальной подстроки — самый короткий «a.*b» без чужих строк
  for (const t of own.filter((t) => !cands.some((c) => c.covers.includes(t)))) {
    const c = pairCandidates(t).find((c) => covers(c).includes(t) && clean(c))
    if (c) cands.push(Object.assign(c, { covers: covers(c) }))
  }
  const left = new Set(own)
  const tokens = []
  while (left.size) {
    let best = null
    for (const c of cands) {
      const n = c.covers.filter((t) => left.has(t)).length
      if (!n) continue
      if (!best || n > best.n || (n === best.n && c.cost < best.c.cost)) best = { c, n }
    }
    if (!best) throw new Error(`${lang}/${prop.key}: нет уникального фрагмента для ${[...left].join(' / ')}`)
    tokens.push(best.c)
    for (const t of best.c.covers) left.delete(t)
  }
  return { tokens: tokens.sort((a, b) => (a.out < b.out ? -1 : a.out > b.out ? 1 : 0)) }
}

/**
 * Метка (класс, редкость, «уровень предмета»): уникальна среди всех строк, кроме своих, и с «:» —
 * привязана к строке-свойству, а не к случайному слову в имени редкого предмета.
 */
function findLabel(name, own, displays, others, lang) {
  const tokens = own.map((line, i) => {
    const c = labelCandidates(line, displays[i], lang).find((c) => !others.some((o) => c.test.test(o.folded)))
    if (!c) throw new Error(`${lang}: нет уникальной метки для ${name}`)
    return c.out
  })
  return [...new Set(tokens)].join('|')
}

/**
 * Подстроки строки-метки с «:». В RU заглавная буква подсказки («Класс предмета: Обувь») заменяется
 * на «.»: регистр кириллицы в поиске игры не проверен.
 */
function labelCandidates(line, display, lang) {
  const out = []
  for (let i = 0; i < line.length; i++) {
    for (let len = 2; len <= TOKEN_MAX && i + len <= line.length; len++) {
      const raw = line.slice(i, i + len)
      if (!raw.includes(':') || /["!]/.test(raw) || /^ | $/.test(raw)) continue
      let re = ''
      let test = ''
      for (let k = i; k < i + len; k++) {
        const up = lang === 'ru' && display[k] !== display[k].toLowerCase()
        re += up ? '.' : toRegex(line[k])
        test += up ? '.' : escapeRegex(fold(line[k]))
      }
      out.push({ out: re, test: new RegExp(test) })
    }
  }
  return out.sort((a, b) => a.out.length - b.out.length || (a.out < b.out ? -1 : a.out > b.out ? 1 : 0))
}

// ---------------------------------------------------------------------------
// Сборка
// ---------------------------------------------------------------------------

function buildLang(lang, ctx, ownByKey) {
  const corpus = collectCorpus(lang, ctx)
  for (const own of Object.values(ownByKey)) for (const l of own[lang].text) corpus.add(l)
  const lines = [...corpus].sort()
  const foldedAll = lines.map((line) => ({ line, folded: fold(line) }))
  const mods = {}
  const report = []
  for (const prop of PROPS) {
    const own = ownByKey[prop.key][lang].text
    const displays = ownByKey[prop.key][lang].display
    const alsoLines = new Set((prop.also ?? []).flatMap((k) => ownByKey[k][lang].text))
    const sides = [
      ...Object.entries(SIDE_RULES).map(([why, rule]) => ({ why, test: rule(lang, own) })),
      ...(prop.allowSide ?? []).map((r) => ({ why: r.why, test: (line) => r[lang].test(line) }))
    ]
    const others = foldedAll.filter(
      (o) => !own.includes(o.line) && !isVariant(o.line, own) && !alsoLines.has(o.line) && !sides.some((r) => r.test(o.line))
    )
    const entry = { text: displays }
    let hits
    if (prop.min) {
      const r = findThreshold(prop, lang, own, displays, others)
      if (r.hits?.length) throw new Error(`${lang}/${prop.key}: хвост «${r.posts[0]}» задевает ${r.hits.slice(0, 5).join(' / ')}`)
      const post = r.posts.map(toRegex)
      entry.pre = toRegex(r.pre)
      // хвосты — списком: движок соберёт (a|b) и объединит пороги с тем же pre и числом
      entry.posts = post
      // «.» вместо цифры — только когда сразу после числа «%» (как в порогах карт)
      entry.digit = r.posts.every((p) => p.startsWith('%')) ? '.' : '\\d'
      hits = (line) => r.posts.some((p) => fold(line).includes(fold(r.pre) + '#' + fold(p)))
      report.push(`${prop.key}: ${entry.pre}#(${entry.posts.join('|')})`)
    } else {
      const r = findToken(prop, lang, own, displays, others)
      entry.token = r.tokens.map((t) => t.out).join('|')
      hits = (line) => r.tokens.some((t) => t.test.test(fold(line)))
      report.push(`${prop.key}: ${entry.token}`)
    }
    // чьи свои строки заденет (на деле, по корпусу): UI предупредит «заденет и …»
    const also = PROPS.filter(
      (p) => p !== prop && ownByKey[p.key][lang].text.some((l) => !own.includes(l) && hits(l))
    ).map((p) => p.key)
    if (also.length) entry.also = also
    // побочные совпадения, которые строка действительно заденет в корпусе
    const side = sides.filter((r) => lines.some((l) => r.test(l) && hits(l))).map((r) => r.why)
    if (side.length) entry.side = [...new Set(side)]
    mods[prop.key] = entry
  }
  // классы и редкость: метка с «:» — только своя строка «Item Class: …» / «Rarity: …»
  const cs = readClientStrings(lang)
  const classTokens = {}
  // строки-метки с исходным регистром — для тестов (RU с регистрозависимой кириллицей)
  const labels = {}
  for (const [key, ...ids] of CLASSES) {
    const names = ids.map((id) => ((lang === 'en' ? ctx.classes : ctx.classesRu)[id] ?? ctx.classes[id]).name)
    const own = names.map((n) => normLine(cs.ITEM_CLASS + n))
    const others = foldedAll.filter((o) => !own.includes(o.line))
    labels[`class.${key}`] = names.map((n) => normLine(cs.ITEM_CLASS + n, false))
    classTokens[key] = findLabel(key, own, labels[`class.${key}`], others, lang)
  }
  const rarity = {}
  for (const [key, csKey] of RARITIES) {
    const line = normLine(cs.RARITY + cs[csKey])
    const display = normLine(cs.RARITY + cs[csKey], false)
    labels[`rarity.${key}`] = [display]
    rarity[key] = findLabel(key, [line], [display], foldedAll.filter((o) => o.line !== line), lang)
  }
  // «Item Level: 84» — терм-исключение для фильтра «уровень камня» (у камней строки нет)
  const ilvl = normLine(cs.ITEM_LEVEL + '#')
  const notItemLevel = findLabel('itemLevel', [ilvl], [normLine(cs.ITEM_LEVEL + '#', false)], foldedAll.filter((o) => o.line !== ilvl), lang)
  labels.itemLevel = [normLine(cs.ITEM_LEVEL + '#', false)]
  return { lines, mods, classTokens, rarity, notItemLevel, labels, report }
}

function quote(s) {
  // строки фрагментов — в одинарных кавычках TS; апострофы в текстах экранируем
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function tsValue(v, indent) {
  const pad = '  '.repeat(indent)
  if (typeof v === 'string') return quote(v)
  if (Array.isArray(v)) return `[${v.map((x) => tsValue(x, indent)).join(', ')}]`
  const inner = Object.entries(v)
    .map(([k, x]) => `${pad}  ${/^[a-zA-Z_]\w*$/.test(k) ? k : quote(k)}: ${tsValue(x, indent + 1)}`)
    .join(',\n')
  return `{\n${inner}\n${pad}}`
}

async function main() {
  const args = process.argv.slice(2)
  const refresh = args.includes('--refresh')
  const pi = args.indexOf('--patch')
  const patch = pi >= 0 ? args[pi + 1] : DEFAULT_PATCH
  const info = await ensureSources(refresh)
  await ensureExtra(refresh)

  const ctx = {
    mods: readSource('mods'),
    trEn: indexTranslations(readSource('statsEn')),
    trRu: indexTranslations(readSource('statsRu')),
    bases: readSource('basesEn'),
    basesRu: readSource('basesRu'),
    classes: readExtra('classesEn'),
    classesRu: readExtra('classesRu')
  }
  // свои строки свойств (EN и RU), без повторов
  const ownByKey = {}
  for (const prop of PROPS) {
    const own = { en: { text: [], display: [] }, ru: { text: [], display: [] } }
    for (const stat of prop.stats) {
      const l = statLines(ctx.trEn, ctx.trRu, stat)
      for (const lang of LANGS) {
        l[lang].text.forEach((t, i) => {
          if (own[lang].text.includes(t)) return
          own[lang].text.push(t)
          own[lang].display.push(l[lang].display[i])
        })
      }
    }
    ownByKey[prop.key] = own
  }

  const date = sourcesDate(info)
  const data = {}
  fs.mkdirSync(OUT_CORPUS, { recursive: true })
  for (const lang of LANGS) {
    const langCtx = {
      ...ctx,
      basesLang: lang === 'en' ? ctx.bases : ctx.basesRu,
      classesLang: lang === 'en' ? ctx.classes : ctx.classesRu
    }
    const r = buildLang(lang, langCtx, ownByKey)
    data[lang] = { mods: r.mods, classes: r.classTokens, rarity: r.rarity, notItemLevel: r.notItemLevel }
    const corpus = {
      meta: { source: 'RePoE fork + APT client_strings + tests/fixtures/poe1', date, patch, lang },
      own: Object.fromEntries(PROPS.map((p) => [p.key, ownByKey[p.key][lang].text])),
      labels: r.labels,
      lines: r.lines
    }
    const file = path.join(OUT_CORPUS, `vendor-corpus.${lang}.json`)
    fs.writeFileSync(file, JSON.stringify(corpus, null, 1) + '\n')
    console.log(`${lang}: строк корпуса ${r.lines.length} → ${path.relative(ROOT, file)}`)
    for (const l of r.report) console.log('  ' + l)
    console.log('  классы: ' + JSON.stringify(r.classTokens))
    console.log('  редкость: ' + JSON.stringify(r.rarity) + ' · не уровень предмета: ' + r.notItemLevel)
  }

  const ts = [
    '// СГЕНЕРИРОВАНО tools/regex/build-vendor-data.mjs — не править руками (S27).',
    `// Источник: RePoE fork (mods, stat_translations, base_items, item_classes EN/RU) от ${date}, патч ${patch};`,
    '// метки свойств — client_strings APT. Фрагменты проверены на корпусе строк предметов торговца',
    '// (tests/regex/fixtures/vendor-corpus.{en,ru}.json): нет ложных совпадений, кроме вариантов своей строки и also.',
    '',
    "import type { VendorData } from './vendorTypes'",
    '',
    `export const VENDOR_DATA_META = ${tsValue({ source: 'RePoE fork (repoe-fork.github.io)', date, patch }, 0)}`,
    '',
    `export const VENDOR_DATA: VendorData = ${tsValue(data, 0)}`,
    ''
  ].join('\n')
  fs.writeFileSync(OUT_TS, ts)
  console.log(`→ ${path.relative(ROOT, OUT_TS)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
