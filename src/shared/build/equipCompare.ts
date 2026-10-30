// «Против надетого» в окне цены Ctrl+D (S41, B4; исследование build-tab-research.md §7.2–7.3, упрощённый путь
// без движка PoB). Чистый модуль: renderer (окно цены) и tests/build/equipCompare.test.ts.
//   • Числа вещи — из распознанного предмета (ParsedItem: стат-ref и свойства), одинаково для RU и EN клиента;
//     требования и свойства флакона — из секций текста (две строки шаблонов на язык). Текст дальше не уходит.
//   • Слоты: кольца — против каждого (по умолчанию — где выгоднее); двуручное — против пары «оружие + щит»;
//     самоцвет — против надетого того же вида (по умолчанию — худшего); флакон — против того же вида (у особых —
//     той же базы); кластеры и уникальные самоцветы не сравниваем; Swap не трогаем.
//   • Вердикт «Лучше / Хуже / По-разному»: (1) требования и кап сопротивлений → (2) жизнь/ES → (3) сопротивления до
//     капа → (4) DPS оружия → (5) прочее. «До капа» и «нельзя надеть» — только с итогами персонажа (расчёт автора
//     билда в PoB или «мои сопротивления»), иначе честные дельты вещей. Урон, кроме DPS оружия, не оцениваем.

import { ItemCategory, ItemRarity, WEAPON_ONE_HANDED, type ParsedItem } from '../poe1/parser'
import type { PobBuild } from '../pob/model'
import {
  EQUIP_JEWELS_MAX,
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
  type FlaskNumbers,
  type FlaskType
} from '../types/equip'
import { propKind } from './pobItem'

export const ELEMENTS: readonly EquipElement[] = ['fire', 'cold', 'lightning', 'chaos']
export const ATTRIBUTES: readonly EquipAttribute[] = ['str', 'dex', 'int']
/** Кап сопротивлений без модов на максимум (как RES_CAP в slotNeeds.ts). */
export const RES_CAP = 75

// ---------------------------------------------------------------------------- вид и слоты

const TWO_HANDED = new Set<ItemCategory>([
  ItemCategory.Staff,
  ItemCategory.Warstaff,
  ItemCategory.TwoHandedAxe,
  ItemCategory.TwoHandedMace,
  ItemCategory.TwoHandedSword,
  ItemCategory.FishingRod
])

const KIND_BY_CATEGORY: Partial<Record<ItemCategory, EquipKind>> = {
  [ItemCategory.Helmet]: 'helmet',
  [ItemCategory.BodyArmour]: 'body',
  [ItemCategory.Gloves]: 'gloves',
  [ItemCategory.Boots]: 'boots',
  [ItemCategory.Amulet]: 'amulet',
  [ItemCategory.Ring]: 'ring',
  [ItemCategory.Belt]: 'belt',
  [ItemCategory.Shield]: 'shield',
  [ItemCategory.Quiver]: 'quiver',
  [ItemCategory.Flask]: 'flask',
  [ItemCategory.Jewel]: 'jewel',
  [ItemCategory.AbyssJewel]: 'abyss',
  [ItemCategory.ClusterJewel]: 'complex',
  [ItemCategory.Bow]: 'bow'
}

/** Вид вещи по классу предмета (Item Class → категория парсера); null — не экипировка (валюта, карты, камни…). */
export function equipKind(item: Pick<ParsedItem, 'category' | 'rarity'>): EquipKind | null {
  const c = item.category
  if (!c) return null
  if (WEAPON_ONE_HANDED.has(c)) return 'weapon1h'
  if (TWO_HANDED.has(c)) return 'weapon2h'
  const kind = KIND_BY_CATEGORY[c] ?? null
  if ((kind === 'jewel' || kind === 'abyss') && item.rarity === ItemRarity.Unique) return 'complex'
  return kind
}

const SINGLE_SLOT: Partial<Record<EquipKind, EquipSlot>> = {
  helmet: 'Helmet',
  body: 'Body Armour',
  gloves: 'Gloves',
  boots: 'Boots',
  amulet: 'Amulet',
  belt: 'Belt',
  weapon2h: 'Weapon 1',
  bow: 'Weapon 1',
  shield: 'Weapon 2',
  quiver: 'Weapon 2'
}

export const FLASK_SLOTS: readonly EquipSlot[] = ['Flask 1', 'Flask 2', 'Flask 3', 'Flask 4', 'Flask 5']
export const RING_SLOTS: readonly EquipSlot[] = ['Ring 1', 'Ring 2']
export const WEAPON_SLOTS: readonly EquipSlot[] = ['Weapon 1', 'Weapon 2']

export const jewelSlot = (n: number): EquipSlot => `Jewel ${n}`
export const jewelIndex = (slot: string): number | null => {
  const m = /^Jewel (\d{1,2})$/.exec(slot)
  const n = m ? Number(m[1]) : NaN
  return n >= 1 && n <= EQUIP_JEWELS_MAX ? n : null
}

/** Может ли вещь этого вида стоять в слоте (проверка файла и выбора слота). */
export function slotAllows(kind: EquipKind, slot: string): boolean {
  if (kind === 'complex') return false
  if (kind === 'ring') return RING_SLOTS.includes(slot as EquipSlot)
  if (kind === 'flask') return FLASK_SLOTS.includes(slot as EquipSlot)
  if (kind === 'jewel' || kind === 'abyss') return jewelIndex(slot) !== null
  if (kind === 'weapon1h') return WEAPON_SLOTS.includes(slot as EquipSlot)
  return SINGLE_SLOT[kind] === slot
}

/**
 * Куда можно запомнить вещь: один слот — без выбора; кольца, одноручное (вторая рука — два оружия), флаконы,
 * самоцветы — короткий выбор. У самоцветов — уже запомненные того же вида и одно новое гнездо.
 */
export function saveSlots(item: Pick<EquipItem, 'kind'>, equipped: readonly EquipEntry[]): EquipSlot[] {
  const k = item.kind
  if (k === 'complex') return []
  if (k === 'ring') return [...RING_SLOTS]
  if (k === 'weapon1h') return [...WEAPON_SLOTS]
  if (k === 'flask') return [...FLASK_SLOTS]
  if (k === 'jewel' || k === 'abyss') {
    const used = equipped.filter((e) => jewelIndex(e.slot) !== null)
    const same = used.filter((e) => e.kind === k).map((e) => e.slot)
    const taken = new Set(used.map((e) => jewelIndex(e.slot)))
    let free = 0
    for (let n = 1; n <= EQUIP_JEWELS_MAX && !free; n++) if (!taken.has(n)) free = n
    const out = same.sort((a, b) => (jewelIndex(a) ?? 0) - (jewelIndex(b) ?? 0))
    return free ? [...out, jewelSlot(free)] : out
  }
  const one = SINGLE_SLOT[k]
  return one ? [one] : []
}

// ---------------------------------------------------------------------------- числа вещи

export function emptyNumbers(): EquipNumbers {
  return {
    life: 0,
    lifePct: 0,
    es: 0,
    mana: 0,
    res: { fire: 0, cold: 0, lightning: 0, chaos: 0 },
    attr: { str: 0, dex: 0, int: 0 },
    speed: 0,
    block: 0,
    pdps: 0,
    edps: 0,
    dmg: 0,
    caster: false
  }
}

const RES_REFS: Record<string, readonly EquipElement[]> = {
  '+#% to Fire Resistance': ['fire'],
  '+#% to Cold Resistance': ['cold'],
  '+#% to Lightning Resistance': ['lightning'],
  '+#% to Chaos Resistance': ['chaos'],
  '+#% to all Elemental Resistances': ['fire', 'cold', 'lightning'],
  '+#% to All Resistances': ['fire', 'cold', 'lightning', 'chaos'],
  '+#% to Fire and Cold Resistances': ['fire', 'cold'],
  '+#% to Fire and Lightning Resistances': ['fire', 'lightning'],
  '+#% to Cold and Lightning Resistances': ['cold', 'lightning'],
  '+#% to Fire and Chaos Resistances': ['fire', 'chaos'],
  '+#% to Cold and Chaos Resistances': ['cold', 'chaos'],
  '+#% to Lightning and Chaos Resistances': ['lightning', 'chaos']
}

const ATTR_REFS: Record<string, readonly EquipAttribute[]> = {
  '+# to Strength': ['str'],
  '+# to Dexterity': ['dex'],
  '+# to Intelligence': ['int'],
  '+# to all Attributes': ['str', 'dex', 'int'],
  '+# to Strength and Dexterity': ['str', 'dex'],
  '+# to Strength and Intelligence': ['str', 'int'],
  '+# to Dexterity and Intelligence': ['dex', 'int']
}

/** Локальные моды оружия — уже в DPS из свойств, «оценить нельзя» про них не пишем. */
const WEAPON_LOCAL_RE = /^#% increased Physical Damage$|^#% increased Attack Speed$|^Adds # to # (?:Physical|Fire|Cold|Lightning|Chaos) Damage$/
const CASTER_RE = /Spell|Cast Speed/

const ARMOUR_KINDS = new Set<EquipKind>(['helmet', 'body', 'gloves', 'boots', 'shield'])
const WEAPON_KINDS = new Set<EquipKind>(['weapon1h', 'weapon2h', 'bow'])

/**
 * Одна строка стата (EN-шаблон ref с # и значение) → числа. `localEs` — у брони плоский ЭЩ локальный
 * (уже в свойстве «Энергетический щит» вещи), не складываем второй раз.
 */
function addStat(out: EquipNumbers, ref: string, value: number, kind: EquipKind | null): void {
  const weapon = !!kind && WEAPON_KINDS.has(kind)
  if (ref === '+# to maximum Life') out.life += value
  else if (ref === '#% increased maximum Life') out.lifePct += value
  else if (ref === '+# to maximum Energy Shield') {
    if (!kind || !ARMOUR_KINDS.has(kind)) out.es += value
  } else if (ref === '+# to maximum Mana') out.mana += value
  else if (ref === '#% increased Movement Speed') out.speed += value
  else if (RES_REFS[ref]) for (const e of RES_REFS[ref]) out.res[e] += value
  else if (ATTR_REFS[ref]) for (const a of ATTR_REFS[ref]) out.attr[a] += value
  else {
    if (CASTER_RE.test(ref) && propKind(ref) === 'build') out.caster = true
    if (weapon && WEAPON_LOCAL_RE.test(ref)) return
    if (propKind(ref) === 'build') out.dmg++
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/** Числа распознанного предмета: статы по ref (RU и EN дают одно и то же), свойства брони и оружия. */
export function equipNumbers(item: ParsedItem, kind: EquipKind | null = equipKind(item)): EquipNumbers {
  const out = emptyNumbers()
  for (const s of item.statsByType) {
    const value = s.sources.reduce((sum, src) => sum + (src.contributes?.value ?? 0), 0)
    if (Number.isFinite(value)) addStat(out, s.stat.ref, value, kind)
  }
  if (kind && ARMOUR_KINDS.has(kind)) out.es = item.armourES ?? 0
  if (kind === 'shield') out.block = item.armourBLOCK ?? 0
  if (kind && WEAPON_KINDS.has(kind) && item.weaponAS) {
    out.pdps = round1((item.weaponPHYSICAL ?? 0) * item.weaponAS)
    out.edps = round1((item.weaponELEMENTAL ?? 0) * item.weaponAS)
  }
  out.life = Math.round(out.life)
  out.es = Math.round(out.es)
  return out
}

/** Строка мода EN с числом («+81 to maximum Life», «10% reduced …») → ref и значение (для предметов PoB). */
export function lineStat(line: string): { ref: string; value: number } | null {
  const m = /^([+-]?)(\d+(?:\.\d+)?)(%?) (.+)$/.exec(line.trim())
  if (!m) return null
  let value = Number(m[2]) * (m[1] === '-' ? -1 : 1)
  let rest = m[4]
  if (/^reduced /.test(rest)) {
    rest = rest.replace(/^reduced /, 'increased ')
    value = -value
  }
  const ref = `${m[1] || /^to /.test(rest) ? '+' : ''}#${m[3]} ${rest}`
  return { ref, value }
}

/** Числа по строкам модов на английском (предмет этапа из PoB — для «ближе к гайду»). */
export function numbersFromLines(lines: readonly string[], kind: EquipKind | null): EquipNumbers {
  const out = emptyNumbers()
  for (const l of lines) {
    const s = lineStat(l)
    if (s) addStat(out, s.ref, s.value, kind)
    else if (propKind(l) === 'build') out.dmg++
  }
  if (kind && ARMOUR_KINDS.has(kind)) out.es = 0
  return out
}

// ---------------------------------------------------------------------------- текст: требования, флаконы

function sections(text: string): string[][] {
  return text
    .split(/\r?\n--------\r?\n/)
    .map((s) =>
      s
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
    )
    .filter((s) => s.length)
}

const REQ_HEAD = /^(?:Requirements|Требования):$/
const REQ_LINES: Array<[keyof EquipReq, RegExp]> = [
  ['level', /^(?:Level|Уровень): (\d+)/],
  ['str', /^(?:Str|Strength|Сила): (\d+)/],
  ['dex', /^(?:Dex|Dexterity|Ловк|Ловкость): (\d+)/],
  ['int', /^(?:Int|Intelligence|Инт|Интеллект): (\d+)/]
]

/** Требования из секции «Requirements:» / «Требования:» (RU и EN). */
export function equipReq(text: string): EquipReq {
  const out: EquipReq = { level: 0, str: 0, dex: 0, int: 0 }
  const sec = sections(text).find((s) => REQ_HEAD.test(s[0]))
  for (const line of sec?.slice(1) ?? []) {
    for (const [key, re] of REQ_LINES) {
      const m = re.exec(line)
      if (m) out[key] = Number(m[1])
    }
  }
  return out
}

const num = (s: string | undefined): number => (s ? Number(s) : 0)

/** Вид флакона по EN-базе: «… Life Flask», «… Mana Flask», «… Hybrid Flask», остальные — особые. */
export function flaskType(base: string): FlaskType {
  return / Life Flask$/.test(base) ? 'life' : / Mana Flask$/.test(base) ? 'mana' : / Hybrid Flask$/.test(base) ? 'hybrid' : 'utility'
}

/** Свойства флакона из первой секции после имени (RU и EN). */
export function flaskNumbers(text: string, base: string, quality: number): FlaskNumbers {
  const out: FlaskNumbers = { type: flaskType(base), life: 0, mana: 0, duration: 0, use: 0, charges: 0, quality }
  for (const sec of sections(text).slice(1, 3)) {
    for (const line of sec) {
      const l = line.replace(/ \(augmented\)/g, '')
      let m: RegExpExecArray | null
      if (/^Recovers /.test(l)) {
        out.life = num(/(\d+) Life/.exec(l)?.[1])
        out.mana = num(/(\d+) Mana/.exec(l)?.[1])
        out.duration = num(/over ([\d.]+)/.exec(l)?.[1])
      } else if (/^Восстанавливает /.test(l)) {
        out.life = num(/здоровье: (\d+)/.exec(l)?.[1])
        out.mana = num(/ману: (\d+)/.exec(l)?.[1])
        out.duration = num(/ за ([\d.]+)/.exec(l)?.[1])
      } else if ((m = /^(?:Lasts|Длится) ([\d.]+)/.exec(l))) out.duration = Number(m[1])
      else if ((m = /^(?:Consumes (\d+) of (\d+) Charges|Расходует (\d+) из (\d+) зарядов)/.exec(l))) {
        out.use = Number(m[1] ?? m[3])
        out.charges = Number(m[2] ?? m[4])
      }
    }
  }
  return out
}

const RARITY: Record<string, EquipRarity> = {
  [ItemRarity.Normal]: 'normal',
  [ItemRarity.Magic]: 'magic',
  [ItemRarity.Rare]: 'rare',
  [ItemRarity.Unique]: 'unique'
}

/** Вещь окна цены → числа для сравнения и записи; null — не экипировка. Сырой текст дальше не уходит. */
export function equipItem(item: ParsedItem): EquipItem | null {
  const kind = equipKind(item)
  if (!kind) return null
  const unique = item.rarity === ItemRarity.Unique
  const base = (unique ? item.uniqueBase?.refName : undefined) ?? item.info.refName
  return {
    kind,
    rarity: RARITY[item.rarity ?? ItemRarity.Normal] ?? 'normal',
    name: unique ? item.info.refName : null,
    base,
    n: equipNumbers(item, kind),
    req: equipReq(item.rawText),
    flask: kind === 'flask' ? flaskNumbers(item.rawText, base, item.quality ?? 0) : null
  }
}

/** Та же вещь (запомненная = эта): вид, имя, база и все числа. */
export function sameItem(a: EquipItem, b: EquipItem): boolean {
  return (
    a.kind === b.kind &&
    a.rarity === b.rarity &&
    a.name === b.name &&
    a.base === b.base &&
    JSON.stringify(a.n) === JSON.stringify(b.n) &&
    JSON.stringify(a.req) === JSON.stringify(b.req) &&
    JSON.stringify(a.flask) === JSON.stringify(b.flask)
  )
}

// ---------------------------------------------------------------------------- итоги персонажа

/** Итоги персонажа для «до капа» и «нельзя надеть». */
export interface EquipTotals {
  /** «mine» — ввод игрока, «build» — расчёт автора билда в PoB (PlayerStat) */
  source: 'mine' | 'build'
  /** сопротивления с запасом над капом (если он известен) */
  res: Partial<Record<EquipElement, number>>
  cap: Partial<Record<EquipElement, number>>
  /** атрибуты и сколько их требуют камни и вещи — только из PlayerStat */
  attr: Partial<Record<EquipAttribute, number>>
  need: Partial<Record<EquipAttribute, number>>
  /** уровень персонажа автора (для подписи «по билду автора, ур. N») */
  buildLevel?: number
}

const STAT_EL: Record<EquipElement, string> = { fire: 'Fire', cold: 'Cold', lightning: 'Lightning', chaos: 'Chaos' }
const STAT_ATTR: Record<EquipAttribute, string> = { str: 'Str', dex: 'Dex', int: 'Int' }

/** Итоги из <PlayerStat> PoB: Resist + OverCap (у PoB Resist уже срезан по капу), ResistMax, Str/ReqStr… */
export function totalsFromStats(stats: PobBuild['stats'], buildLevel?: number): EquipTotals | null {
  const t: EquipTotals = { source: 'build', res: {}, cap: {}, attr: {}, need: {}, buildLevel }
  for (const e of ELEMENTS) {
    const v = stats[`${STAT_EL[e]}Resist`]
    if (v === undefined) continue
    t.res[e] = v + (stats[`${STAT_EL[e]}ResistOverCap`] ?? 0)
    t.cap[e] = stats[`${STAT_EL[e]}ResistMax`] ?? RES_CAP
  }
  for (const a of ATTRIBUTES) {
    if (stats[STAT_ATTR[a]] !== undefined) t.attr[a] = stats[STAT_ATTR[a]]
    if (stats[`Req${STAT_ATTR[a]}`] !== undefined) t.need[a] = stats[`Req${STAT_ATTR[a]}`]
  }
  return Object.keys(t.res).length || Object.keys(t.attr).length ? t : null
}

/** Итоги из «мои сопротивления сейчас» (как в окне персонажа; запас над капом — если игрок его вписал). */
export function totalsFromMine(mine: EquipMine | null): EquipTotals | null {
  if (!mine) return null
  const res: Partial<Record<EquipElement, number>> = {}
  for (const e of ELEMENTS) if (typeof mine.res[e] === 'number') res[e] = mine.res[e]
  if (!Object.keys(res).length) return null
  return { source: 'mine', res, cap: {}, attr: {}, need: {} }
}

// ---------------------------------------------------------------------------- что снимет вещь

export type TargetNote = 'twoHand' | 'shieldWith2h' | 'quiverNoBow'

export interface EquipTarget {
  /** слоты, которые снимет вещь (двуручное — оба) */
  slots: EquipSlot[]
  /** запомненные вещи в этих слотах */
  entries: EquipEntry[]
}

export interface EquipTargets {
  /** варианты для выбора (кольцо 1 / 2, флаконы того же вида, самоцветы); пусто — сравнить не с чем */
  options: EquipTarget[]
  /** слоты, куда вещь встала бы, но там ничего не запомнено (для пустого состояния и выбора) */
  missing: EquipSlot[]
  note?: TargetNote
}

const at = (equipped: readonly EquipEntry[], slot: EquipSlot): EquipEntry | undefined => equipped.find((e) => e.slot === slot)
const one = (equipped: readonly EquipEntry[], slot: EquipSlot): EquipTarget | null => {
  const e = at(equipped, slot)
  return e ? { slots: [slot], entries: [e] } : null
}

/** С чем сравнивать вещь по правилам слотов §7.2. */
export function equipTargets(item: EquipItem, equipped: readonly EquipEntry[]): EquipTargets {
  const k = item.kind
  const w1 = at(equipped, 'Weapon 1')
  const w2 = at(equipped, 'Weapon 2')
  const opts = (list: Array<EquipTarget | null>): EquipTarget[] => list.filter((x): x is EquipTarget => !!x)
  if (k === 'complex') return { options: [], missing: [] }
  if (k === 'ring') {
    const options = opts(RING_SLOTS.map((s) => one(equipped, s)))
    return { options, missing: RING_SLOTS.filter((s) => !at(equipped, s)) }
  }
  if (k === 'flask') {
    const fl = item.flask
    const same = equipped.filter(
      (e) => e.kind === 'flask' && e.flask && fl && e.flask.type === fl.type && (fl.type !== 'utility' || e.base === item.base)
    )
    return { options: same.map((e) => ({ slots: [e.slot], entries: [e] })), missing: FLASK_SLOTS.filter((s) => !at(equipped, s)) }
  }
  if (k === 'jewel' || k === 'abyss') {
    const same = equipped.filter((e) => e.kind === k).sort((a, b) => (jewelIndex(a.slot) ?? 0) - (jewelIndex(b.slot) ?? 0))
    return { options: same.map((e) => ({ slots: [e.slot], entries: [e] })), missing: [] }
  }
  if (k === 'weapon2h' || k === 'bow') {
    // двуручное снимает и вторую руку; лук оставляет колчан
    const keepQuiver = k === 'bow' && w2?.kind === 'quiver'
    const entries = [w1, keepQuiver ? undefined : w2].filter((e): e is EquipEntry => !!e)
    const slots: EquipSlot[] = keepQuiver ? ['Weapon 1'] : ['Weapon 1', 'Weapon 2']
    const twoHand = !keepQuiver && !!w2
    return { options: entries.length ? [{ slots, entries }] : [], missing: w1 ? [] : ['Weapon 1'], note: twoHand ? 'twoHand' : undefined }
  }
  if (k === 'weapon1h') {
    // двуручное в руках — одноручное снимает его; два одноручных — выбор руки
    if (w1 && (w1.kind === 'weapon2h' || w1.kind === 'bow')) return { options: [{ slots: ['Weapon 1'], entries: [w1] }], missing: [] }
    const options = opts([one(equipped, 'Weapon 1'), w2?.kind === 'weapon1h' ? one(equipped, 'Weapon 2') : null])
    return { options, missing: w1 ? [] : ['Weapon 1'] }
  }
  if (k === 'shield') {
    if (w1 && w1.kind === 'weapon2h') return { options: [], missing: [], note: 'shieldWith2h' }
    return { options: opts([one(equipped, 'Weapon 2')]), missing: w2 ? [] : ['Weapon 2'] }
  }
  if (k === 'quiver') {
    const note: TargetNote | undefined = w1 && w1.kind !== 'bow' ? 'quiverNoBow' : undefined
    return { options: opts([one(equipped, 'Weapon 2')]), missing: w2 ? [] : ['Weapon 2'], note }
  }
  const slot = SINGLE_SLOT[k]
  if (!slot) return { options: [], missing: [] }
  return { options: opts([one(equipped, slot)]), missing: at(equipped, slot) ? [] : [slot] }
}

// ---------------------------------------------------------------------------- сравнение

export type CmpDir = 'up' | 'down' | 'same'
export type CmpRowId = 'req' | 'res' | 'life' | 'es' | 'flask' | 'dps' | 'speed' | 'mana' | 'attr' | 'block' | 'charges'
/** Приоритет §7.3: 1 — требования и кап, 2 — жизнь/ES, 3 — сопротивления до капа, 4 — DPS оружия, 5 — прочее. */
export type CmpTier = 1 | 2 | 3 | 4 | 5

export interface ResCell {
  el: EquipElement
  /** с итогами — итог персонажа (срез по капу), без итогов — сумма с вещей */
  before: number
  after: number
  delta: number
  cap?: number
  /** с итогами: был на капе и упадёт ниже */
  belowCap?: boolean
  /** с итогами: дойдёт до капа */
  reachCap?: boolean
  /** с итогами: изменение ушло в запас над капом */
  overcap?: boolean
}

export interface ReqCell {
  key: keyof EquipReq
  need: number
  /** что есть у персонажа (без снимаемой вещи); null — неизвестно */
  have: number | null
  ok: boolean | null
  /** атрибут: после замены не хватит на камни и вещи (по PlayerStat) */
  gems?: { need: number; after: number }
}

export interface CmpRow {
  id: CmpRowId
  dir: CmpDir
  tier: CmpTier
  before: number
  after: number
  delta: number
  /** жизнь: «% к жизни» отдельно; флакон: мана у гибридного */
  before2?: number
  after2?: number
  res?: ResCell[]
  req?: ReqCell[]
  attr?: Array<{ a: EquipAttribute; before: number; after: number; delta: number }>
  /** DPS: физ. и стих. по отдельности, оружие чар — DPS в вердикт не идёт */
  split?: { pdps: [number, number]; edps: [number, number] }
  caster?: boolean
  /** нельзя надеть (требования) — вердикт «Хуже» без вариантов */
  hard?: boolean
}

export type VerdictKind = 'better' | 'worse' | 'mixed' | 'same'

/** Главная выгода или потеря — для фразы под вердиктом. */
export interface CmpSignal {
  row: CmpRowId
  tier: CmpTier
  sign: 1 | -1
  el?: EquipElement
  /** выгода: дойдёт до капа; потеря: упадёт ниже капа */
  cap?: boolean
  size: number
}

export interface EquipCompare {
  verdict: VerdictKind
  rows: CmpRow[]
  gain: CmpSignal | null
  loss: CmpSignal | null
  /** у вещей есть моды урона, которые без PoB не оценить */
  dmgUnknown: boolean
  /** итоги персонажа есть («до капа» посчитано) */
  totals: EquipTotals['source'] | null
  /** для выбора варианта: выгода минус потери с весом приоритета */
  score: number
}

/** Сумма чисел снимаемых вещей (двуручное — оружие + щит). DPS — по основной руке. */
export function sumNumbers(entries: readonly EquipItem[]): EquipNumbers {
  const out = emptyNumbers()
  entries.forEach((e, i) => {
    out.life += e.n.life
    out.lifePct += e.n.lifePct
    out.es += e.n.es
    out.mana += e.n.mana
    out.speed += e.n.speed
    out.block += e.n.block
    out.dmg += e.n.dmg
    out.caster ||= e.n.caster
    for (const el of ELEMENTS) out.res[el] += e.n.res[el]
    for (const a of ATTRIBUTES) out.attr[a] += e.n.attr[a]
    if (i === 0 || (!out.pdps && !out.edps)) {
      out.pdps = e.n.pdps
      out.edps = e.n.edps
    }
  })
  return out
}

const dirOf = (d: number): CmpDir => (d > 0 ? 'up' : d < 0 ? 'down' : 'same')

function resRow(nw: EquipNumbers, old: EquipNumbers, totals: EquipTotals | null): CmpRow | null {
  const cells: ResCell[] = []
  for (const el of ELEMENTS) {
    const d = nw.res[el] - old.res[el]
    if (!nw.res[el] && !old.res[el]) continue
    const total = totals?.res[el]
    if (totals && total !== undefined) {
      const cap = totals.cap[el] ?? RES_CAP
      const before = Math.min(cap, total)
      const after = Math.min(cap, total + d)
      cells.push({
        el,
        before: Math.round(before),
        after: Math.round(after),
        delta: Math.round(after - before),
        cap,
        belowCap: before >= cap && after < cap,
        reachCap: before < cap && after >= cap,
        overcap: d !== 0 && after === before
      })
    } else cells.push({ el, before: old.res[el], after: nw.res[el], delta: d })
  }
  if (!cells.some((c) => c.delta !== 0 || c.overcap)) return cells.length ? { id: 'res', dir: 'same', tier: 3, before: 0, after: 0, delta: 0, res: cells } : null
  const worst = [...cells].sort((a, b) => a.delta - b.delta)[0]
  const best = [...cells].sort((a, b) => b.delta - a.delta)[0]
  const main = worst.delta < 0 ? worst : best
  return { id: 'res', dir: dirOf(main.delta), tier: cells.some((c) => c.belowCap) ? 1 : 3, before: main.before, after: main.after, delta: main.delta, res: cells }
}

function reqRow(item: EquipItem, old: EquipNumbers, totals: EquipTotals | null, level: number | null): CmpRow | null {
  const r = item.req
  const cells: ReqCell[] = []
  if (r.level > 0) cells.push({ key: 'level', need: r.level, have: level, ok: level === null ? null : level >= r.level })
  for (const a of ATTRIBUTES) {
    const have = totals?.attr[a]
    const need = r[a]
    // свои атрибуты вещь на свои требования не даёт: есть = итог без снимаемой вещи
    const without = have === undefined ? null : Math.round(have - old.attr[a])
    const gemsNeed = totals?.need[a]
    const after = without === null ? null : without + item.n.attr[a]
    const gems = gemsNeed !== undefined && after !== null && after < gemsNeed && (have ?? 0) >= gemsNeed ? { need: Math.round(gemsNeed), after } : undefined
    if (need > 0 || gems) cells.push({ key: a, need, have: without, ok: without === null ? null : without >= need && !gems, gems })
  }
  if (!cells.length) return null
  const hard = cells.some((c) => c.ok === false)
  return { id: 'req', dir: hard ? 'down' : 'same', tier: 1, before: 0, after: 0, delta: 0, req: cells, hard }
}

function numRow(id: CmpRowId, tier: CmpTier, before: number, after: number): CmpRow | null {
  if (!before && !after) return null
  return { id, dir: dirOf(after - before), tier, before, after, delta: round1(after - before) }
}

function flaskRows(item: EquipItem, old: EquipItem | undefined): CmpRow[] {
  const f = item.flask
  const o = old?.flask
  if (!f || !o) return []
  const rows: CmpRow[] = []
  if (f.type === 'utility') {
    const r = numRow('flask', 2, o.duration, f.duration)
    if (r) rows.push(r)
  } else {
    // восстановление за глоток: жизнь (у гибридного — и мана вторым числом)
    const before = f.type === 'mana' ? o.mana : o.life
    const after = f.type === 'mana' ? f.mana : f.life
    const r = numRow('flask', 2, before, after)
    if (r) {
      if (f.type === 'hybrid') Object.assign(r, { before2: o.mana, after2: f.mana })
      rows.push(r)
    }
  }
  // заряды: сколько глотков из полного флакона
  const sips = (x: FlaskNumbers): number => (x.use > 0 ? Math.floor(x.charges / x.use) : 0)
  const c = numRow('charges', 5, sips(o), sips(f))
  if (c) rows.push(c)
  return rows
}

const RANK: Record<VerdictKind, number> = { better: 3, mixed: 2, same: 1, worse: 0 }
const WEIGHT: Record<CmpTier, number> = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 1 }

/**
 * Сравнить вещь с тем, что она снимет. `level` — уровень персонажа по журналу (для требования уровня);
 * `totals` — итоги персонажа (иначе «до капа» не считаем).
 */
export function compareEquip(item: EquipItem, replaced: readonly EquipEntry[], totals: EquipTotals | null, level: number | null): EquipCompare {
  const old = sumNumbers(replaced)
  const nw = item.n
  const rows: CmpRow[] = []
  const add = (r: CmpRow | null): void => void (r && rows.push(r))

  add(reqRow(item, old, totals, level))
  if (item.kind === 'flask') {
    rows.push(...flaskRows(item, replaced[0]))
  } else {
    add(resRow(nw, old, totals))
    const life = numRow('life', 2, old.life, nw.life)
    const lifePct = old.lifePct || nw.lifePct ? { before2: old.lifePct, after2: nw.lifePct } : null
    if (life || lifePct) {
      const r = life ?? { id: 'life' as const, dir: 'same' as const, tier: 2 as const, before: 0, after: 0, delta: 0 }
      if (lifePct) Object.assign(r, lifePct)
      if (r.dir === 'same' && lifePct) r.dir = dirOf(lifePct.after2 - lifePct.before2)
      rows.push(r)
    }
    add(numRow('es', 2, old.es, nw.es))
    const weapon = WEAPON_KINDS.has(item.kind) || replaced.some((e) => WEAPON_KINDS.has(e.kind))
    if (weapon) {
      const before = round1(old.pdps + old.edps)
      const after = round1(nw.pdps + nw.edps)
      const r = numRow('dps', 4, before, after)
      if (r) {
        r.split = { pdps: [old.pdps, nw.pdps], edps: [old.edps, nw.edps] }
        r.caster = nw.caster || old.caster
        // шум: меньше 2 % — «так же»
        if (Math.abs(r.delta) < Math.max(before, after) * 0.02) r.dir = 'same'
        rows.push(r)
      }
    }
    add(numRow('speed', 5, old.speed, nw.speed))
    add(numRow('block', 5, old.block, nw.block))
    add(numRow('mana', 5, old.mana, nw.mana))
    const attr = ATTRIBUTES.filter((a) => old.attr[a] || nw.attr[a]).map((a) => ({
      a,
      before: old.attr[a],
      after: nw.attr[a],
      delta: nw.attr[a] - old.attr[a]
    }))
    if (attr.length) {
      const sum = attr.reduce((s, x) => s + x.delta, 0)
      rows.push({ id: 'attr', dir: dirOf(sum), tier: 5, before: 0, after: 0, delta: sum, attr })
    }
  }

  // сигналы для вердикта: по ячейкам сопротивлений и по строкам
  const signals: CmpSignal[] = []
  for (const r of rows) {
    if (r.id === 'req') continue
    if (r.id === 'dps' && r.caster) continue
    if (r.id === 'res' && r.res) {
      for (const c of r.res) {
        if (!c.delta) continue
        const tier: CmpTier = c.belowCap ? 1 : 3
        signals.push({ row: 'res', tier, sign: c.delta > 0 ? 1 : -1, el: c.el, cap: c.belowCap || c.reachCap, size: Math.abs(c.delta) })
      }
      continue
    }
    if (r.id === 'life' && r.before2 !== undefined && r.after2 !== undefined && r.after2 !== r.before2) {
      const d = r.after2 - r.before2
      signals.push({ row: 'life', tier: 2, sign: d > 0 ? 1 : -1, size: Math.abs(d) * 10 })
    }
    if (r.dir !== 'same' && r.delta !== 0) signals.push({ row: r.id, tier: r.tier, sign: r.delta > 0 ? 1 : -1, size: Math.abs(r.delta) })
  }
  const hard = rows.some((r) => r.hard)
  const gains = signals.filter((s) => s.sign > 0)
  const losses = signals.filter((s) => s.sign < 0)
  const top = (list: CmpSignal[]): CmpSignal | null => [...list].sort((a, b) => a.tier - b.tier || b.size - a.size)[0] ?? null
  let verdict: VerdictKind
  if (hard) verdict = 'worse'
  else if (!gains.length && !losses.length) verdict = 'same'
  else if (!losses.length) verdict = 'better'
  else if (!gains.length) verdict = 'worse'
  else {
    // потеря капа без выгоды в защите (жизнь/ES, сопротивления) — хуже; иначе выигрыш и потеря в разных пунктах
    const capLoss = losses.some((s) => s.tier === 1)
    const defenceGain = gains.some((s) => s.tier <= 3)
    verdict = capLoss && !defenceGain ? 'worse' : 'mixed'
  }
  const score = signals.reduce((s, x) => s + x.sign * WEIGHT[x.tier] * x.size, 0) - (hard ? 1e6 : 0)
  return {
    verdict,
    rows: rows.sort((a, b) => a.tier - b.tier || (a.hard ? -1 : 0)),
    gain: top(gains),
    loss: top(losses),
    dmgUnknown: nw.dmg > 0 || old.dmg > 0,
    totals: totals?.source ?? null,
    score
  }
}

/** Лучший вариант среди слотов (кольцо 1 / 2, самоцвет): выше вердикт, затем выгода. */
export function bestOption(results: readonly EquipCompare[]): number {
  let best = -1
  results.forEach((r, i) => {
    const b = results[best]
    if (best < 0 || RANK[r.verdict] > RANK[b.verdict] || (RANK[r.verdict] === RANK[b.verdict] && r.score > b.score)) best = i
  })
  return best
}

/** Строки для показа: в простом режиме — 4 главные (требования, если не проходят, — всегда). */
export function shownRows(rows: readonly CmpRow[], expert: boolean): CmpRow[] {
  if (expert) return [...rows]
  const main = rows.filter((r) => r.dir !== 'same' || r.id === 'req')
  return (main.length ? main : rows).slice(0, 4)
}
