// Порт и расширение из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/pseudo/timeless-jewel.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH (почти всё своё):
//  - семейства завоевателей — своей таблицей, включая 5 legacy (Zerphi, Kiloava, Deshret, Venarius, Chitus),
//    которых нет в данных APT (id сверены по /api/trade/data/stats 28.10.2026), и Abyss-джуэлы (Amanamu, Kurgal,
//    Tecrod, Ulaman, Zorath — в данных APT без modFamily);
//  - count-группа по сиду (`kind: 'timeless'`), режим «любой завоеватель» / «точный»: по умолчанию точный для
//    Glorious Vanity / Militant Faith / Elegant Hubris, любой — для остальных;
//  - моды преданности Militant Faith — опциональные фильтры (видны, выключены);
//  - ссылка в калькулятор Vilsol; для Abyss-джуэлов калькулятора нет — подсказка про PoB.

import type { Poe1Data } from '../../../data/Poe1Data'
import type { ParsedItem } from '../../../parser'
import type { StatCalculated } from '../../../parser/modifiers'
import type { FiltersCreationContext } from '../create-stat-filters'
import { FilterTag, type FilterGroup, type StatFilter } from '../interfaces'
import { metaCountOneFilter } from './utils'

export type TimelessConquerorMode = 'any' | 'exact'
export type TimelessJewelKind = 'GV' | 'LP' | 'BR' | 'MF' | 'EH' | 'HT' | 'ABYSS'

interface ConquerorDef {
  /** английское имя (как в trade id и калькуляторе Vilsol) */
  name: string
  /** шаблон стата, если отличается от шаблона джуэла */
  template?: string
  /** нет в данных APT — текст и id из своей таблицы */
  legacy?: { ru: string; ruStems: string[] }
}

interface JewelDef {
  kind: TimelessJewelKind
  /** английское имя уника (для Abyss — неизвестно) */
  refName?: string
  /** номер джуэла в калькуляторе Vilsol (1 GV, 2 LP, 3 BR, 4 MF, 5 EH, 6 HT) */
  vilsol?: number
  defaultMode: TimelessConquerorMode
  /** EN-шаблон стата, `{c}` — завоеватель */
  template: string
  conquerors: ConquerorDef[]
}

export const TIMELESS_JEWELS: readonly JewelDef[] = [
  {
    kind: 'GV',
    refName: 'Glorious Vanity',
    vilsol: 1,
    defaultMode: 'exact',
    template: 'Bathed in the blood of # sacrificed in the name of {c}',
    conquerors: [
      { name: 'Xibaqua' },
      { name: 'Ahuana' },
      { name: 'Doryani' },
      { name: 'Zerphi', legacy: { ru: 'Омыт в крови # жертв во имя Зерфи', ruStems: ['Зерфи'] } }
    ]
  },
  {
    kind: 'LP',
    refName: 'Lethal Pride',
    vilsol: 2,
    defaultMode: 'any',
    template: 'Commanded leadership over # warriors under {c}',
    conquerors: [
      { name: 'Kaom' },
      { name: 'Rakiata' },
      { name: 'Akoya' },
      { name: 'Kiloava', legacy: { ru: 'Повелевает # воинами Килоавы', ruStems: ['Килоав'] } }
    ]
  },
  {
    kind: 'BR',
    refName: 'Brutal Restraint',
    vilsol: 3,
    defaultMode: 'any',
    template: 'Denoted service of # dekhara in the akhara of {c}',
    conquerors: [
      { name: 'Asenath' },
      { name: 'Nasima' },
      { name: 'Balbala' },
      { name: 'Deshret', legacy: { ru: 'Обозначает служение # дехара в ахаре Дешрет', ruStems: ['Дешрет'] } }
    ]
  },
  {
    kind: 'MF',
    refName: 'Militant Faith',
    vilsol: 4,
    defaultMode: 'exact',
    template: 'Carved to glorify # new faithful converted by High Templar {c}',
    conquerors: [
      { name: 'Avarius' },
      { name: 'Dominus' },
      { name: 'Maxarius' },
      {
        name: 'Venarius',
        legacy: { ru: 'Выточен во славу # послушников, обращённых Верховным жрецом Венарием', ruStems: ['Венари'] }
      }
    ]
  },
  {
    kind: 'EH',
    refName: 'Elegant Hubris',
    vilsol: 5,
    defaultMode: 'exact',
    template: 'Commissioned # coins to commemorate {c}',
    conquerors: [
      { name: 'Cadiro' },
      { name: 'Victario' },
      { name: 'Caspiro' },
      // на трейде RU-имя «Титус», в клиенте может быть «Читус»
      { name: 'Chitus', legacy: { ru: 'Выделено # монет в память о Титусе', ruStems: ['Титус', 'Читус'] } }
    ]
  },
  {
    kind: 'HT',
    refName: 'Heroic Tragedy',
    vilsol: 6,
    defaultMode: 'any',
    template: 'Remembrancing # songworthy deeds by the line of {c}',
    conquerors: [{ name: 'Vorana' }, { name: 'Uhtred' }, { name: 'Medved' }]
  },
  {
    kind: 'ABYSS',
    defaultMode: 'any',
    template: 'Subjugating # souls in the thrall of {c}',
    conquerors: [
      { name: 'Amanamu' },
      { name: 'Kurgal' },
      { name: 'Tecrod' },
      { name: 'Ulaman' },
      { name: 'Zorath', template: 'Binding # souls to phylacteries to sustain {c}' }
    ]
  }
]

const TRADE_ID_RE = /pseudo_timeless_jewel_([a-z]+)$/

export function conquerorTradeId(name: string): string {
  return `explicit.pseudo_timeless_jewel_${name.toLowerCase()}`
}

function conquerorRef(jewel: JewelDef, c: ConquerorDef): string {
  return (c.template ?? jewel.template).replace('{c}', c.name)
}

/** Что известно о timeless-джуэле предмета (не зависит от языка текста). */
export interface TimelessSearch {
  jewel: TimelessJewelKind
  /** EN-имя уника (если известно) */
  jewelRef?: string
  seed: number
  /** EN-имя завоевателя; undefined — не удалось определить (тогда поиск только «любой») */
  conqueror?: string
  /** legacy-завоеватель (нет в данных APT) */
  legacy: boolean
  /** режим по умолчанию для этого типа джуэла */
  defaultMode: TimelessConquerorMode
  mode: TimelessConquerorMode
  /** ссылка в калькулятор Vilsol (нет для Abyss) */
  vilsolUrl?: string
  /** Abyss-джуэлы калькулятор Vilsol не поддерживает — смотреть в Path of Building */
  pobHint: boolean
  /** i18n-ключ сообщения при пустом результате поиска */
  emptyResultKey: 'pc1.timeless.noExact'
}

interface TimelessAnalysis {
  jewel: JewelDef
  seed: number
  conqueror?: ConquerorDef
  /** стат из данных (если распознан парсером) */
  calc?: StatCalculated
}

function jewelByConqueror(name: string): { jewel: JewelDef; conqueror: ConquerorDef } | undefined {
  for (const jewel of TIMELESS_JEWELS) {
    const conqueror = jewel.conquerors.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (conqueror) return { jewel, conqueror }
  }
  return undefined
}

function analyze(item: ParsedItem, statsByType: StatCalculated[]): TimelessAnalysis | undefined {
  // 1) стат распознан парсером: trade id `explicit.pseudo_timeless_jewel_<завоеватель>`
  for (const calc of statsByType) {
    const tradeId = Object.values(calc.stat.trade.ids)
      .flat()
      .find((id) => TRADE_ID_RE.test(id))
    if (!tradeId) continue
    const found = jewelByConqueror(TRADE_ID_RE.exec(tradeId)![1])
    const seed = calc.sources[0]?.stat.roll?.value
    if (!found || seed == null) continue
    return { jewel: found.jewel, conqueror: found.conqueror, seed, calc }
  }

  // 2) legacy: парсер не нашёл мод в данных, но выделил сид (item.timeless.recognized === false)
  const t = item.timeless
  if (t && !t.recognized) {
    const jewel = TIMELESS_JEWELS.find((j) => j.refName != null && j.refName === item.info.refName)
    if (!jewel) return undefined
    const word = t.conquerorText ?? ''
    const conqueror = jewel.conquerors.find(
      (c) => c.legacy && (word.includes(c.name) || c.legacy.ruStems.some((stem) => word.includes(stem)))
    )
    return { jewel, conqueror, seed: t.seed }
  }
  return undefined
}

export function vilsolUrl(jewel: TimelessJewelKind, seed: number, conqueror: string | undefined): string | undefined {
  const def = TIMELESS_JEWELS.find((j) => j.kind === jewel)
  if (!def?.vilsol) return undefined
  const params = new URLSearchParams({
    jewel: String(def.vilsol),
    conqueror: conqueror ?? 'Any',
    seed: String(seed),
    mode: 'seed'
  })
  return `https://vilsol.github.io/timeless-jewels/tree?${params.toString()}`
}

/** Сведения о timeless-джуэле предмета (для пресета/UI). */
export function describeTimeless(item: ParsedItem, mode?: TimelessConquerorMode): TimelessSearch | undefined {
  const a = analyze(item, item.statsByType)
  if (!a) return undefined
  const effectiveMode: TimelessConquerorMode = a.conqueror ? (mode ?? a.jewel.defaultMode) : 'any'
  return {
    jewel: a.jewel.kind,
    jewelRef: a.jewel.refName,
    seed: a.seed,
    conqueror: a.conqueror?.name,
    legacy: Boolean(a.conqueror?.legacy),
    defaultMode: a.jewel.defaultMode,
    mode: effectiveMode,
    vilsolUrl: vilsolUrl(a.jewel.kind, a.seed, effectiveMode === 'exact' ? a.conqueror?.name : undefined),
    pobHint: a.jewel.kind === 'ABYSS',
    emptyResultKey: 'pc1.timeless.noExact'
  }
}

function localizedText(jewel: JewelDef, c: ConquerorDef, d: Poe1Data): string {
  const ref = conquerorRef(jewel, c)
  if (c.legacy) return d.lang === 'ru' ? c.legacy.ru : ref
  const statOrGroup = d.statByRefV2(ref)
  const stat = statOrGroup && ('stats' in statOrGroup ? statOrGroup.stats.find((s) => s.ref === ref) : statOrGroup)
  return stat?.matchers[0].string.split('\n')[0] ?? ref
}

/**
 * Count-группа «сид у любого/точного завоевателя»: по фильтру на каждого завоевателя типа джуэла
 * (min = max = сид). В режиме `exact` включён только завоеватель предмета.
 */
export function filterTimelessJewel(ctx: FiltersCreationContext, mode?: TimelessConquerorMode): void {
  const a = analyze(ctx.item, ctx.statsByType)
  if (!a) return
  const effectiveMode: TimelessConquerorMode = a.conqueror ? (mode ?? a.jewel.defaultMode) : 'any'

  const group: FilterGroup = {
    group: 'one',
    kind: 'timeless',
    expanded: true,
    meta: metaCountOneFilter({ disabled: false }),
    stats: a.jewel.conquerors.map((c) => {
      const own = c === a.conqueror
      const filter: StatFilter = {
        tradeId: [conquerorTradeId(c.name)],
        statRef: conquerorRef(a.jewel, c),
        text: localizedText(a.jewel, c, ctx.d),
        tag: own ? FilterTag.Variant : FilterTag.Pseudo,
        sources: own && a.calc ? a.calc.sources : [],
        roll: {
          value: a.seed,
          min: a.seed,
          max: a.seed,
          default: { min: a.seed, max: a.seed },
          dp: false,
          isNegated: false
        },
        disabled: effectiveMode === 'exact' && !own
      }
      return filter
    })
  }

  if (a.calc) ctx.statsByType = ctx.statsByType.filter((calc) => calc !== a.calc)
  ctx.groups.push(group)
}

/** Переключить режим завоевателя в готовой группе (UI-чип «любой / точный»). */
export function setTimelessConquerorMode(group: FilterGroup, mode: TimelessConquerorMode): void {
  if (group.kind !== 'timeless') return
  const own = group.stats.find((f) => f.tag === FilterTag.Variant)
  for (const filter of group.stats) {
    filter.disabled = mode === 'exact' && own != null && filter !== own
  }
}

const DEVOTION_RE = / per 10 Devotion$/

/** После общих правил: моды преданности Militant Faith — видимые, но выключенные (опциональные). */
export function applyTimelessRules(ctx: FiltersCreationContext): void {
  if (ctx.item.info.refName !== 'Militant Faith') return
  for (const filter of ctx.filters) {
    if (!DEVOTION_RE.test(filter.statRef)) continue
    filter.hidden = undefined
    filter.disabled = true
    // значение мода фиксированное — ищем ровно его (hideNotVariableStat сбросил min/max)
    if (filter.roll) {
      filter.roll.min = filter.roll.default.min
      filter.roll.max = filter.roll.default.max
    }
  }
}
