// «Что нужно от слота, пока уника нет» (S40, K3 исследования build-key-items.md §2): 3–5 строк с числами из модов
// уника и нехватки по <PlayerStat> PoB. Без движка PoB:
//   • сопротивления: без_уника = Res + OverCap − U; нужно = max(0, кап − без_уника) — только если статы автора
//     посчитаны для набора этого этапа; иначе «замените то, что давал уник» (нужно = U);
//   • атрибуты: нужно = Req − (Attr − U) + запас 5 — только по статам автора;
//   • жизнь (или ЭЩ, если ЭЩ у автора больше жизни): как на унике, иначе типичное для слота, но не больше, чем
//     реально выпадает на уровне этапа;
//   • обувь — скорость передвижения; оружие чар — «+N к уровню чар»; слот главной связки — число связей.
// Чистый модуль, тесты — tests/build/slotNeeds.test.ts.

import type { PobBuild } from '../pob/model'
import { itemNumbers, propKind, type Attribute, type Element, type PobItemInfo, type PropKind } from './pobItem'
import type { SlotKind } from './stageItems'

export type NeedId = 'res' | 'attr' | 'life' | 'es' | 'speed' | 'spell' | 'dmg' | 'links'

export interface SlotNeed {
  id: NeedId
  prop: PropKind
  /** жизнь, ЭЩ, скорость, уровни чар, связи; у res и attr — сумма */
  value: number
  res?: Partial<Record<Element, number>>
  /** сопротивления суммой (статов автора для этапа нет — не требуем каждую стихию отдельно) */
  sum?: boolean
  /** урон оружия: чары или атаки — как у уника (без числа) */
  dmg?: 'spell' | 'attack'
  attr?: Partial<Record<Attribute, number>>
  /** атрибуты: сколько будет без уника и сколько требуют камни и вещи (для подписи «иначе 153 из 155») */
  gap?: Partial<Record<Attribute, { have: number; req: number }>>
}

export interface SlotNeeds {
  needs: SlotNeed[]
  /** строки уника, которые жёлтой вещью не заменить (EN) — «Потеряете: …» */
  lose: string[]
  /** нехватки посчитаны по статам автора (иначе — «замените то, что давал уник») */
  exact: boolean
}

const RES_CAP = 75
const ATTR_MARGIN = 5
const NEEDS_MAX = 5

/** Типичная жизнь на редкой вещи слота (ориентир из исследования §2.2). */
const LIFE_BY_SLOT: Partial<Record<SlotKind, number>> = { helmet: 70, body: 90, gloves: 70, boots: 70, belt: 80, ring: 50, amulet: 50 }

/** Жизнь, которая реально выпадает к уровню (тир мода ≈ уровень предмета): 16 → 10, 45 → 40, 70+ → без предела. */
export function lifeCap(level: number): number {
  return Math.max(10, Math.floor(level / 10) * 10)
}

/** Сумма стихийных сопротивлений, которую реально найти на одной редкой вещи к уровню. */
export function resSumCap(level: number): number {
  return level < 15 ? 15 : level < 30 ? 30 : level < 45 ? 50 : level < 60 ? 70 : 90
}

/** Скорость передвижения на обуви по уровню (тиры мода: 10/15/20/25/30 %). */
export function speedCap(level: number): number {
  return level < 15 ? 10 : level < 30 ? 15 : level < 40 ? 20 : level < 55 ? 25 : 30
}

const ELEMENTS: Array<[Element, string]> = [
  ['fire', 'Fire'],
  ['cold', 'Cold'],
  ['lightning', 'Lightning']
]
const ATTRS: Array<[Attribute, string]> = [
  ['str', 'Str'],
  ['dex', 'Dex'],
  ['int', 'Int']
]

export interface NeedsInput {
  info: PobItemInfo
  kind: SlotKind
  /** уровень персонажа на этапе */
  level: number
  /** статы автора — для набора этого этапа (иначе null) */
  stats: PobBuild['stats'] | null
  /** камней в главной связке, если она в этом слоте */
  mainLinks?: number | null
}

export function slotNeeds(input: NeedsInput): SlotNeeds {
  const { info, kind, level } = input
  const st = input.stats && Object.keys(input.stats).length ? input.stats : null
  const u = itemNumbers(info)
  const needs: SlotNeed[] = []

  // сопротивления: по статам автора — нехватка каждой стихии; без них — сумма того, что давал уник, но не больше,
  // чем реально найти на уровне (Goldrim на 20 ур. — не «по 35 к каждой», а «в сумме от 30»)
  if (st && ELEMENTS.some(([, name]) => st[`${name}Resist`] !== undefined)) {
    const res: Partial<Record<Element, number>> = {}
    for (const [e, name] of ELEMENTS) {
      if (st[`${name}Resist`] === undefined) continue
      const cap = st[`${name}ResistMax`] ?? RES_CAP
      const without = st[`${name}Resist`] + (st[`${name}ResistOverCap`] ?? 0) - u.res[e]
      const need = Math.max(0, Math.round(cap - without))
      if (need > 0) res[e] = need
    }
    if (u.res.chaos > 0 && (st.ChaosResist ?? 0) > 0) res.chaos = u.res.chaos
    const resSum = Object.values(res).reduce((a, b) => a + (b ?? 0), 0)
    if (resSum > 0) needs.push({ id: 'res', prop: 'res', value: resSum, res })
  } else {
    const given = Math.max(0, u.res.fire) + Math.max(0, u.res.cold) + Math.max(0, u.res.lightning)
    if (given > 0) needs.push({ id: 'res', prop: 'res', value: Math.min(given, resSumCap(level)), sum: true })
  }

  // атрибуты — только по статам автора
  if (st) {
    const attr: Partial<Record<Attribute, number>> = {}
    const gap: Partial<Record<Attribute, { have: number; req: number }>> = {}
    for (const [a, name] of ATTRS) {
      const have = st[name]
      const req = st[`Req${name}`]
      if (have === undefined || req === undefined || u.attr[a] <= 0) continue
      const without = Math.round(have - u.attr[a])
      if (without < req) {
        attr[a] = Math.round(req - without) + ATTR_MARGIN
        gap[a] = { have: without, req: Math.round(req) }
      }
    }
    const sum = Object.values(attr).reduce((x, y) => x + (y ?? 0), 0)
    if (sum > 0) needs.push({ id: 'attr', prop: 'build', value: sum, attr, gap })
  }

  // жизнь или энергощит
  const typical = LIFE_BY_SLOT[kind]
  const esBuild = !!st && (st.EnergyShield ?? 0) > (st.Life ?? 0)
  if (esBuild) {
    if (u.es > 0) needs.push({ id: 'es', prop: 'build', value: u.es })
  } else if (u.life > 0 || typical) {
    const cap = lifeCap(level)
    const value = Math.min(u.life > 0 ? u.life : (typical ?? 0), cap)
    if (value > 0) needs.push({ id: 'life', prop: 'life', value })
  }

  // особое для слота
  if (kind === 'boots') needs.push({ id: 'speed', prop: 'speed', value: Math.min(u.speed > 0 ? u.speed : 25, speedCap(level)) })
  if ((kind === 'weapon' || kind === 'offhand') && u.spellLevels > 0) needs.push({ id: 'spell', prop: 'build', value: u.spellLevels })
  if (kind === 'weapon' || kind === 'offhand') {
    const lines = [...info.implicits, ...info.explicits].map((m) => m.text)
    if (lines.some((l) => /Spell Damage|to Spells|Cast Speed|for Spells/.test(l))) needs.push({ id: 'dmg', prop: 'build', value: 0, dmg: 'spell' })
    else if (lines.some((l) => /Physical Damage|Attack Speed|^Adds \d+ to \d+ \w+ Damage$/.test(l))) needs.push({ id: 'dmg', prop: 'build', value: 0, dmg: 'attack' })
  }
  if (input.mainLinks && input.mainLinks >= 3) needs.push({ id: 'links', prop: 'build', value: Math.min(6, input.mainLinks) })

  // что жёлтой не заменить: «больше / меньше», триггеры, умения, кейстоуны — строки «важно для билда»,
  // кроме уже учтённых чисел
  const counted = /to maximum (?:Life|Energy Shield)$|increased Movement Speed$|Resistances?$|to (?:Strength|Dexterity|Intelligence|all Attributes)(?: and \w+)?$|to Level of all/
  const lose = info.explicits
    .map((m) => m.text)
    .filter((l) => !counted.test(l) && (propKind(l) === 'build' || /\b(?:more|less)\b|^Trigger|^Grants|^Your |^You /.test(l)))
    .slice(0, 2)

  return { needs: needs.slice(0, NEEDS_MAX), lose, exact: !!st }
}
