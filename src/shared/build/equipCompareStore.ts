// Запомненные надетые вещи «Против надетого» (S41; чистый модуль: main, tests/build/equipStore.test.ts).
// Файл userData/equipped.json: { v, sets[] } — набор на персонажа текущего входа (Client.txt) и один общий
// «без персонажа». Только числа и короткие поля (types/equip.ts) — текста предмета по Ctrl+D в файле нет.
// Файл с диска и запись от окна — недоверенные данные: каждое поле проверяется здесь (типы, пределы, слот под
// вид вещи), лишнее отбрасывается; объекты собираются заново (ключи «__proto__» из JSON ничего не портят).

import {
  EQUIP_GEAR_SLOTS,
  type EquipAttribute,
  type EquipElement,
  type EquipEntry,
  type EquipItem,
  type EquipKind,
  type EquipMine,
  type EquipNumbers,
  type EquipRarity,
  type EquipReq,
  type EquipSlot,
  type EquipState,
  type FlaskNumbers,
  type FlaskType
} from '../types/equip'
import { ATTRIBUTES, ELEMENTS, jewelIndex, sameItem, slotAllows } from './equipCompare'

export const EQUIPPED_FILE = 'equipped.json'
export const EQUIPPED_FORMAT = 1
/** Сколько персонажей помнить (давно не входившие уходят). */
export const EQUIP_SETS_MAX = 20

export interface EquipSet {
  /** имя персонажа; null — «без персонажа» */
  char: string | null
  items: EquipEntry[]
  mine: EquipMine | null
  usedAt: number
}

export interface EquipFile {
  v: typeof EQUIPPED_FORMAT
  sets: EquipSet[]
  /** «Точный расчёт (PoB)» включён (бета S44, по умолчанию выключен; общий для всех персонажей) */
  pob?: true
}

export function emptyEquipFile(): EquipFile {
  return { v: EQUIPPED_FORMAT, sets: [] }
}

// ---------------------------------------------------------------------------- проверка полей

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** Число в пределах (иначе 0): у сопротивлений бывают минусы, у DPS — сотни. */
const num = (v: unknown, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 10) / 10 : 0
const time = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1e14 ? Math.floor(v) : null)

const KINDS: ReadonlySet<string> = new Set<EquipKind>([
  'weapon1h',
  'weapon2h',
  'bow',
  'shield',
  'quiver',
  'helmet',
  'body',
  'gloves',
  'boots',
  'amulet',
  'ring',
  'belt',
  'flask',
  'jewel',
  'abyss'
])
const RARITIES: ReadonlySet<string> = new Set<EquipRarity>(['normal', 'magic', 'rare', 'unique'])
const FLASK_TYPES: ReadonlySet<string> = new Set<FlaskType>(['life', 'mana', 'hybrid', 'utility'])
const GEAR_SLOTS: ReadonlySet<string> = new Set(EQUIP_GEAR_SLOTS)

/** EN-имя базы или уника (бывает «Mjölner»): буквы, цифры и знаки имён предметов, без управляющих символов. */
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} '’,.:\-()]{0,99}$/u
/** Имя персонажа PoE: буквы, цифры, подчёркивание. */
const CHAR_RE = /^[\p{L}\p{N}_]{1,32}$/u

export const isSlot = (v: unknown): v is EquipSlot => typeof v === 'string' && (GEAR_SLOTS.has(v) || jewelIndex(v) !== null)

function cleanNumbers(v: unknown): EquipNumbers {
  const n = isObj(v) ? v : {}
  const res = isObj(n.res) ? n.res : {}
  const attr = isObj(n.attr) ? n.attr : {}
  return {
    life: num(n.life, -5000, 5000),
    lifePct: num(n.lifePct, -200, 200),
    es: num(n.es, -10000, 20000),
    mana: num(n.mana, -5000, 5000),
    res: Object.fromEntries(ELEMENTS.map((e) => [e, num(res[e], -500, 500)])) as Record<EquipElement, number>,
    attr: Object.fromEntries(ATTRIBUTES.map((a) => [a, num(attr[a], -1000, 1000)])) as Record<EquipAttribute, number>,
    speed: num(n.speed, -100, 200),
    block: num(n.block, 0, 100),
    pdps: num(n.pdps, 0, 100000),
    edps: num(n.edps, 0, 100000),
    dmg: Math.floor(num(n.dmg, 0, 50)),
    caster: n.caster === true
  }
}

function cleanReq(v: unknown): EquipReq {
  const r = isObj(v) ? v : {}
  return { level: Math.floor(num(r.level, 0, 100)), str: Math.floor(num(r.str, 0, 1000)), dex: Math.floor(num(r.dex, 0, 1000)), int: Math.floor(num(r.int, 0, 1000)) }
}

function cleanFlask(v: unknown): FlaskNumbers | null {
  if (!isObj(v) || typeof v.type !== 'string' || !FLASK_TYPES.has(v.type)) return null
  return {
    type: v.type as FlaskType,
    life: num(v.life, 0, 100000),
    mana: num(v.mana, 0, 100000),
    duration: num(v.duration, 0, 120),
    use: Math.floor(num(v.use, 0, 1000)),
    charges: Math.floor(num(v.charges, 0, 1000)),
    quality: Math.floor(num(v.quality, 0, 100))
  }
}

/** Вещь из окна (запись «Запомнить как надетое»): числа и короткие поля; не экипировка или чужая форма — null. */
export function cleanItem(v: unknown): EquipItem | null {
  if (!isObj(v) || typeof v.kind !== 'string' || !KINDS.has(v.kind)) return null
  if (typeof v.rarity !== 'string' || !RARITIES.has(v.rarity)) return null
  if (typeof v.base !== 'string' || !NAME_RE.test(v.base)) return null
  const name = v.rarity === 'unique' && typeof v.name === 'string' && NAME_RE.test(v.name) ? v.name : null
  const kind = v.kind as EquipKind
  const flask = kind === 'flask' ? cleanFlask(v.flask) : null
  if (kind === 'flask' && !flask) return null
  return { kind, rarity: v.rarity as EquipRarity, name, base: v.base, n: cleanNumbers(v.n), req: cleanReq(v.req), flask }
}

/** Запись с диска: вещь + слот под её вид + время. */
export function cleanEntry(v: unknown): EquipEntry | null {
  if (!isObj(v) || !isSlot(v.slot)) return null
  const item = cleanItem(v)
  const at = time(v.at)
  if (!item || at === null || !slotAllows(item.kind, v.slot)) return null
  return { slot: v.slot, ...item, at }
}

export function cleanMine(v: unknown): EquipMine | null {
  if (!isObj(v) || !isObj(v.res)) return null
  const res: Partial<Record<EquipElement, number>> = {}
  for (const e of ELEMENTS) {
    const x = v.res[e]
    if (typeof x === 'number' && Number.isFinite(x) && x >= -200 && x <= 200) res[e] = Math.round(x)
  }
  const at = time(v.at)
  return Object.keys(res).length && at !== null ? { res, at } : null
}

export const cleanChar = (v: unknown): string | null => (typeof v === 'string' && CHAR_RE.test(v) ? v : null)

function cleanSet(v: unknown): EquipSet | null {
  if (!isObj(v)) return null
  const char = v.char === null ? null : cleanChar(v.char)
  if (char === null && v.char !== null) return null
  const items: EquipEntry[] = []
  for (const x of Array.isArray(v.items) ? v.items.slice(0, 64) : []) {
    const e = cleanEntry(x)
    if (e && !items.some((i) => i.slot === e.slot)) items.push(e)
  }
  return { char, items: fixConflicts(items), mine: cleanMine(v.mine), usedAt: time(v.usedAt) ?? 0 }
}

/** equipped.json → наборы (битый файл или чужой формат — пусто). */
export function parseEquipFile(raw: unknown): EquipFile {
  if (!isObj(raw) || raw.v !== EQUIPPED_FORMAT) return emptyEquipFile()
  const sets: EquipSet[] = []
  for (const x of Array.isArray(raw.sets) ? raw.sets.slice(0, EQUIP_SETS_MAX * 2) : []) {
    const s = cleanSet(x)
    if (s && !sets.some((o) => o.char === s.char)) sets.push(s)
  }
  return limitSets({ v: EQUIPPED_FORMAT, sets, ...(raw.pob === true ? { pob: true as const } : {}) })
}

function limitSets(file: EquipFile): EquipFile {
  if (file.sets.length <= EQUIP_SETS_MAX) return file
  return { ...file, sets: [...file.sets].sort((a, b) => b.usedAt - a.usedAt).slice(0, EQUIP_SETS_MAX) }
}

// ---------------------------------------------------------------------------- изменения

/**
 * Руки: двуручное (кроме лука) — без второй руки; лук — только с колчаном; колчан — только с луком; щит и второе
 * одноручное — без двуручного. Побеждает запомненное позже.
 */
function fixConflicts(items: EquipEntry[]): EquipEntry[] {
  const w1 = items.find((e) => e.slot === 'Weapon 1')
  const w2 = items.find((e) => e.slot === 'Weapon 2')
  if (!w1 || !w2) return items
  const ok = w1.kind === 'bow' ? w2.kind === 'quiver' : w1.kind === 'weapon1h' ? w2.kind !== 'quiver' : false
  if (ok) return items
  const drop = w1.at >= w2.at ? w2 : w1
  return items.filter((e) => e !== drop)
}

function setOf(file: EquipFile, char: string | null): EquipSet {
  return file.sets.find((s) => s.char === char) ?? { char, items: [], mine: null, usedAt: 0 }
}

function withSet(file: EquipFile, set: EquipSet): EquipFile {
  return limitSets({ ...file, sets: [set, ...file.sets.filter((s) => s.char !== set.char)] })
}

/** Запомнить вещь в слот (проверка формы — здесь). Та же вещь в другом слоте переезжает. */
export function putEquip(file: EquipFile, char: string | null, slot: unknown, item: unknown, now: number): EquipFile {
  const clean = cleanItem(item)
  if (!clean || !isSlot(slot) || !slotAllows(clean.kind, slot)) return file
  const set = setOf(file, char)
  const entry: EquipEntry = { slot, ...clean, at: now }
  const rest = set.items.filter((e) => e.slot !== slot && !(e.kind === clean.kind && sameItem(e, clean)))
  return withSet(file, { ...set, items: fixConflicts([...rest, entry]), usedAt: now })
}

export function forgetEquip(file: EquipFile, char: string | null, slot: unknown, now: number): EquipFile {
  if (!isSlot(slot)) return file
  const set = setOf(file, char)
  if (!set.items.some((e) => e.slot === slot)) return file
  return withSet(file, { ...set, items: set.items.filter((e) => e.slot !== slot), usedAt: now })
}

/** «Мои сопротивления сейчас»: null — убрать ввод. */
export function setMine(file: EquipFile, char: string | null, mine: unknown, now: number): EquipFile {
  const set = setOf(file, char)
  const clean = mine === null ? null : cleanMine(isObj(mine) ? { ...mine, at: now } : null)
  if (mine !== null && !clean) return file
  return withSet(file, { ...set, mine: clean, usedAt: now })
}

/** «Точный расчёт (PoB)» (S44): включить или выключить; не логическое значение — без изменений. */
export function setPob(file: EquipFile, on: unknown): EquipFile {
  if (typeof on !== 'boolean' || on === !!file.pob) return file
  const { pob: _old, ...rest } = file
  return on ? { ...rest, pob: true } : rest
}

/** Состояние окна: набор персонажа текущего входа (или общий). */
export function equipStateOf(file: EquipFile, char: string | null, level: number | null): EquipState {
  const set = setOf(file, char)
  return { on: true, character: char, level, items: set.items, mine: set.mine, pob: !!file.pob }
}
