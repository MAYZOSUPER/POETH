// «Торговец» PoE 2 (S62): фрагменты строк поиска для свойств снаряжения, классов, редкости, гнёзд и качества.
// Вызывается из build-poe2-regex-data.mjs (общие источники). Подход — как у «Торговца» PoE 1
// (tools/regex/build-vendor-data.mjs): порог «≥ N» — <pre><atLeast(N)>(<posts>), без порога — кратчайшая подстрока
// или «a.*b»; корпус «чужих» строк — все моды снаряжения PoE 2 (префиксы, суффиксы, осквернённые, имплиситы баз,
// уникальные), метки свойств, классы, редкости, названия баз.

import { escapeRegex, fold, normLine, pickVariant, renderVariant, substrings } from '../build-regex-data.mjs'
import { cost, postCandidates, preCandidates } from '../build-vendor-data.mjs'
import {
  ITEM_CLASS_RU,
  findLabel,
  headerLine,
  looksEnglish,
  readClientStrings,
  renderMod,
  ruTemplate,
  toRegex2 as toRegex
} from './build-poe2-regex-data.mjs'

const TOKEN_MAX = 20
const PAIR_PART_MAX = 6

/**
 * Свойства (ключ — Poe2VendorKey в src/shared/types/regex.ts): stat id своих строк; min — порог «≥ N»
 * (у строки с одним числом). Порядок — как на странице: защита, сопротивления, уровни умений, урон, скорость,
 * характеристики, прочее.
 */
export const PROPS = [
  ['life', ['base_maximum_life'], true],
  ['mana', ['base_maximum_mana'], true],
  ['energyShield', ['local_energy_shield', 'base_maximum_energy_shield'], true],
  ['spirit', ['base_spirit_from_equipment'], true],
  ['resFire', ['base_fire_damage_resistance_%'], true],
  ['resCold', ['base_cold_damage_resistance_%'], true],
  ['resLightning', ['base_lightning_damage_resistance_%'], true],
  ['resChaos', ['base_chaos_damage_resistance_%'], true],
  ['resAll', ['base_resist_all_elements_%'], true],
  ['gemAll', ['all_skill_gem_level_+'], true],
  ['gemSpell', ['spell_skill_gem_level_+'], true],
  ['gemFire', ['fire_spell_skill_gem_level_+'], true],
  ['gemCold', ['cold_spell_skill_gem_level_+'], true],
  ['gemLightning', ['lightning_spell_skill_gem_level_+'], true],
  ['gemChaos', ['chaos_spell_skill_gem_level_+'], true],
  ['gemPhys', ['physical_spell_skill_gem_level_+'], true],
  ['gemMinion', ['minion_skill_gem_level_+'], true],
  ['gemMelee', ['melee_skill_gem_level_+'], true],
  ['gemProjectile', ['projectile_skill_gem_level_+'], true],
  ['spellDamage', ['spell_damage_+%'], true],
  ['physDamage', ['local_physical_damage_+%'], true],
  ['addPhys', ['local_minimum_added_physical_damage'], false],
  ['addFire', ['local_minimum_added_fire_damage'], false],
  ['addCold', ['local_minimum_added_cold_damage'], false],
  ['addLightning', ['local_minimum_added_lightning_damage'], false],
  ['addChaos', ['local_minimum_added_chaos_damage'], false],
  ['addAttackPhys', ['attack_minimum_added_physical_damage'], false],
  ['addAttackFire', ['attack_minimum_added_fire_damage'], false],
  ['addAttackCold', ['attack_minimum_added_cold_damage'], false],
  ['addAttackLightning', ['attack_minimum_added_lightning_damage'], false],
  ['moveSpeed', ['base_movement_velocity_+%'], true],
  ['attackSpeed', ['local_attack_speed_+%', 'attack_speed_+%'], true],
  ['castSpeed', ['base_cast_speed_+%'], true],
  ['critChance', ['critical_strike_chance_+%', 'spell_critical_strike_chance_+%', 'attack_critical_strike_chance_+%'], true],
  ['str', ['additional_strength'], true],
  ['dex', ['additional_dexterity'], true],
  ['int', ['additional_intelligence'], true],
  ['allAttributes', ['additional_all_attributes'], true],
  ['rarity', ['base_item_found_rarity_+%'], true]
]

/** Классы (ключ — Poe2ItemClass): класс RePoE → название в строке «Item Class: …» (EN — item_classes RePoE). */
export const CLASSES = [
  ['boots', 'Boots'],
  ['gloves', 'Gloves'],
  ['helmet', 'Helmets'],
  ['bodyArmour', 'Body Armours'],
  ['shield', 'Shields'],
  ['buckler', 'Bucklers'],
  ['focus', 'Foci'],
  ['quiver', 'Quivers'],
  ['ring', 'Rings'],
  ['amulet', 'Amulets'],
  ['belt', 'Belts'],
  ['wand', 'Wands'],
  ['staff', 'Staves'],
  ['sceptre', 'Sceptres'],
  ['quarterstaff', 'Quarterstaves'],
  ['bow', 'Bows'],
  ['crossbow', 'Crossbows'],
  ['spear', 'Spears'],
  ['mace1h', 'One Hand Maces'],
  ['mace2h', 'Two Hand Maces'],
  ['flail', 'Flails'],
  ['lifeFlask', 'Life Flasks'],
  ['manaFlask', 'Mana Flasks'],
  ['charm', 'Charms']
]

const RARITIES = [
  ['normal', 'RARITY_NORMAL'],
  ['magic', 'RARITY_MAGIC'],
  ['rare', 'RARITY_RARE'],
  ['unique', 'RARITY_UNIQUE']
]

/** Домены модов корпуса (снаряжение, флаконы, осквернение); у PoE 2 в RePoE есть и остатки PoE 1 — они тоже в корпусе. */
const CORPUS_DOMAINS = new Set(['item', 'flask', 'desecrated', 'crafted', 'misc'])

// ---------------------------------------------------------------------------
// Свои строки и корпус
// ---------------------------------------------------------------------------

/** Запись перевода, где стат — первый (у пар min/max — запись на обе). */
function entryFor(tr, statId) {
  const list = tr.byStat.get(statId) ?? []
  return list.find((t) => t.ids[0] === statId) ?? list[0] ?? null
}

/** Свои строки свойства: шаблоны EN и RU (числа → #) по положительному значению. */
function ownLines(tr, ee2, ids) {
  const out = { en: [], ru: [], displayEn: [], displayRu: [], ruOk: true }
  for (const id of ids) {
    const entry = entryFor(tr, id)
    if (!entry) throw new Error(`торговец: нет перевода для ${id}`)
    // значение — только своему стату и его паре min/max («Adds # to #»); остальным статам записи 0 (иначе вариант
    // «No Physical Damage» у local_physical_damage_+%)
    const partner = id.replace('_minimum_', '_maximum_')
    const vals = entry.ids.map((x) => (x === id ? 10 : x === partner ? 20 : 0))
    const v = pickVariant(entry.English, vals)
    if (!v) throw new Error(`торговец: нет варианта для ${id}`)
    const en = renderVariant(v, vals).trim()
    const ru = ruTemplate(ee2, entry, en)?.ru
    const ruOk = !!ru && !looksEnglish(ru)
    if (!ruOk) out.ruOk = false
    for (const l of en.split('\n')) {
      out.en.push(normLine(l))
      out.displayEn.push(normLine(l, false))
    }
    for (const l of (ruOk ? ru : en).split('\n')) {
      out.ru.push(normLine(l))
      out.displayRu.push(normLine(l, false))
    }
  }
  return out
}

function collectCorpus(lang, base, strings) {
  const { mods, bases, trMain, ee2, names } = base
  const lines = new Set()
  const add = (l) => {
    for (const x of l.split('\n')) if (x.trim()) lines.add(normLine(x))
  }
  for (const [, mod] of Object.entries(mods).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!CORPUS_DOMAINS.has(mod.domain)) continue
    const r = renderMod(mod, [trMain], ee2)
    r[lang].forEach((l, i) => {
      // в RU — только переведённые строки (английского текста RU-клиент не покажет)
      if (lang === 'en' || r.ruOk[i]) lines.add(l)
    })
    // заголовок мода в расширенном тексте: имя аффикса и теги («— Damage, Physical, Attack»)
    if (r.en.length) lines.add(headerLine(mod, lang, strings))
  }
  // свойства подсказки снаряжения (client_strings EE2)
  for (const k of ['PHYSICAL_DAMAGE', 'ELEMENTAL_DAMAGE', 'LIGHTNING_DAMAGE', 'COLD_DAMAGE', 'FIRE_DAMAGE', 'CRIT_CHANCE', 'ATTACK_SPEED', 'ARMOUR', 'EVASION', 'ENERGY_SHIELD', 'RUNIC_WARD', 'BLOCK_CHANCE', 'QUALITY', 'STACK_SIZE', 'SOCKETS', 'GEM_LEVEL', 'CHARM_SLOTS', 'BASE_SPIRIT', 'RELOAD_SPEED', 'REQUIRES', 'ITEM_LEVEL', 'RARITY', 'ITEM_CLASS', 'CORRUPTED', 'MIRRORED', 'UNMODIFIABLE', 'SANCTIFIED', 'FRACTURED_ITEM']) {
    if (typeof strings[k] !== 'string') continue
    add(strings[k] + '1')
    add(strings[k] + '+1%')
    add(strings[k] + '1.5%')
  }
  add((strings.SOCKETS ?? 'Sockets: ') + 'S S S S S S')
  add(lang === 'ru' ? 'Требуется: Уровень 1, 1 Сил, 1 Ловк, 1 Инт' : 'Requires: Level 1, 1 Str, 1 Dex, 1 Int')
  for (const [, sKey] of RARITIES) add((strings.RARITY ?? 'Rarity: ') + strings[sKey])
  for (const [, en] of CLASSES) add((strings.ITEM_CLASS ?? 'Item Class: ') + (lang === 'ru' ? ITEM_CLASS_RU[en] : en))
  // названия баз снаряжения
  for (const [, b] of Object.entries(bases).sort(([a], [c]) => (a < c ? -1 : 1))) {
    if (b.domain !== 'item' && b.domain !== 'flask') continue
    if (b.release_state !== 'released' || !b.name) continue
    add(lang === 'ru' ? names.ru.get(b.name) ?? b.name : b.name)
  }
  lines.delete('')
  return [...lines].sort()
}

// ---------------------------------------------------------------------------
// Фрагменты (порог и токен) — как findThreshold / findToken «Торговца» PoE 1
// ---------------------------------------------------------------------------

const caseOk = (raw, displays) => displays.every((d) => d.includes(raw))

function findThreshold(key, lang, own, displays, others) {
  const split = (t) => {
    const i = t.indexOf('#')
    if (i < 0 || t.indexOf('#', i + 1) >= 0) return null
    return [t.slice(0, i), t.slice(i + 1)]
  }
  const parts = own.map(split)
  if (parts.some((p) => !p)) return null
  const dparts = displays.map(split)
  const bad = (s, p) => {
    const f = fold(s) + '#' + fold(p)
    return others.filter((o) => o.includes(f))
  }
  const ok = (raw, texts) => lang !== 'ru' || caseOk(raw, texts)
  const pres = preCandidates(parts[0][0]).filter(
    (s) => parts.every(([pre]) => pre.endsWith(s)) && ok(s, dparts.map(([pre]) => pre))
  )
  let best = null
  for (const s of pres) {
    for (const p of postCandidates(parts[0][1])) {
      if (!parts.every(([, post]) => post.startsWith(p)) || !ok(p, dparts.map(([, post]) => post))) continue
      if (bad(s, p).length) continue
      const c = cost(s) + cost(p)
      if (!best || c < best.c) best = { c, pre: s, posts: [p] }
      break
    }
    if (parts.length > 1) {
      const per = parts.map(([, post], i) => postCandidates(post).find((p) => ok(p, [dparts[i][1]]) && bad(s, p).length === 0))
      if (per.every(Boolean)) {
        const uniq = [...new Set(per)].filter((p, _, all) => !all.some((q) => q !== p && p.startsWith(q))).sort()
        const c = cost(s) + uniq.reduce((n, p) => n + cost(p), 0) + (uniq.length > 1 ? uniq.length + 1 : 0)
        if (!best || c < best.c) best = { c, pre: s, posts: uniq }
      }
    }
  }
  if (best) return { pre: toRegex(best.pre), posts: best.posts.map(toRegex) }
  const [pre, post] = parts[0]
  return { pre: toRegex(pre), posts: [toRegex(post)], also: bad(pre, post).length }
}

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

function findToken(key, lang, own, displays, others) {
  const clean = (c) => !others.some((o) => c.test.test(o))
  const covers = (c) =>
    own.filter((t, i) => c.test.test(fold(t)) && (lang !== 'ru' || c.parts.every((p) => displays[i].includes(p))))
  for (const raw of substrings([own[0]], 2, TOKEN_MAX, { allowNum: true })) {
    const c = single(raw)
    if (covers(c).length === own.length && clean(c)) return { token: c.out }
  }
  const cands = []
  for (const raw of substrings(own, 2, TOKEN_MAX, { allowNum: true })) {
    const c = single(raw)
    c.covers = covers(c)
    if (c.covers.length && clean(c)) cands.push(c)
  }
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
    if (!best) {
      // уникального фрагмента нет — вся строка (заденет то, что её содержит)
      const t = [...left][0]
      const c = single(t)
      tokens.push(c)
      left.delete(t)
      continue
    }
    tokens.push(best.c)
    for (const t of best.c.covers) left.delete(t)
  }
  const out = tokens.map((t) => t.out).sort()
  return { token: out.length === 1 ? out[0] : out.join('|') }
}

// ---------------------------------------------------------------------------
// Сборка раздела
// ---------------------------------------------------------------------------

export function buildVendor(lang, base) {
  const strings = readClientStrings(lang)
  const corpus = collectCorpus(lang, base, strings)
  const warn = []
  const props = {}
  const ownByKey = {}
  for (const [key, ids, threshold] of PROPS) {
    const own = ownLines(base.trMain, base.ee2, ids)
    const lines = own[lang]
    const displays = lang === 'en' ? own.displayEn : own.displayRu
    // свои строки и строки, где своя есть целиком (тот же мод у уникального, «… during Effect»), — не чужие
    const others = corpus.filter((l) => !lines.some((o) => l.includes(o))).map(fold)
    const uniq = [...new Set(lines)]
    const p = { text: uniq.map((l, i) => displays[lines.indexOf(l)] ?? l) }
    if (lang === 'ru' && !own.ruOk) p.noRu = true
    const t = threshold ? findThreshold(key, lang, uniq, uniq.map((l) => displays[lines.indexOf(l)]), others) : null
    if (t) {
      p.pre = t.pre
      p.posts = t.posts
      // число в расширенном тексте идёт с диапазоном тира («+25(21-25)%»): движок ставит после atLeast «(\(.+\))?»
      // и цифру \d (с «.» atLeast схватил бы скобку диапазона)
      if (t.also) {
        p.alsoLines = t.also
        warn.push(`${lang}/${key}: порог заденет ${t.also} строк`)
      }
    } else {
      p.token = findToken(key, lang, uniq, uniq.map((l) => displays[lines.indexOf(l)]), others).token
    }
    props[key] = p
    ownByKey[key] = uniq
  }
  const all = corpus
  const classes = {}
  for (const [key, en] of CLASSES) {
    const name = lang === 'ru' ? ITEM_CLASS_RU[en] : en
    const raw = (strings.ITEM_CLASS ?? 'Item Class: ') + name
    const line = normLine(raw)
    classes[key] = pickLabel(key, line, normLine(raw, false), all.filter((l) => l !== line), lang)
  }
  const rarity = {}
  for (const [key, sKey] of RARITIES) {
    const raw = (strings.RARITY ?? 'Rarity: ') + strings[sKey]
    const line = normLine(raw)
    rarity[key] = pickLabel(key, line, normLine(raw, false), all.filter((l) => l !== line), lang)
  }
  const label = (sKey, sample) => {
    const raw = strings[sKey] + sample
    const line = normLine(raw)
    const part = normLine(strings[sKey]).replace(/ $/, '')
    return findLabel(sKey, [line], [normLine(raw, false)], all.filter((l) => !l.startsWith(part)), { lang, colon: true, part, min: 4 })
  }
  const section = {
    props,
    classes,
    rarity,
    /** «Sockets: S S» — метка перед буквами гнёзд; «Quality: +20%» — метка качества */
    sockets: label('SOCKETS', 'S S'),
    quality: label('QUALITY', '+1%')
  }
  return { section, corpus: { lines: corpus, own: ownByKey }, warn }
}

/**
 * Метка класса или редкости: с «:» (привязка к строке-свойству). В RU заглавная буква значения («Класс предмета:
 * Обувь») становится «.» — если без «:» есть фрагмент без «.» (только строчные буквы значения), берём его.
 */
const hasWildcard = (re) => /(^|[^\\])\./.test(re)

function pickLabel(name, line, display, others, lang) {
  const withColon = findLabel(name, [line], [display], others, { lang, colon: true, min: 4 })
  if (lang !== 'ru' || !hasWildcard(withColon)) return withColon
  try {
    const plain = findLabel(name, [line], [display], others, { lang, min: 5 })
    return hasWildcard(plain) ? withColon : plain
  } catch {
    return withColon
  }
}
