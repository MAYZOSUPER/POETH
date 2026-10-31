// Цены PoE 2 (S67): поиск по снимку poe.ninja одной лиги (формат — snapshot.ts).
//
//   const t = new Poe2PriceTable(snapshot)
//   t.byName('Liquid Paranoia')                       // эмоция (S66 «Вложение»)
//   t.byName('LiquidParanoia', { kinds: KIND_GROUPS.emotions })   // id рецепта из выгрузки GGG — тот же ключ
//   t.byName('Mageblood')                             // уник: при нескольких базах — с наибольшим числом лотов
//   t.byName('Quill Rain', { base: 'Shortbow' })      // конкретная база
//   t.byId('divine')
//
// Ключ имени — priceKey: нижний регистр, только буквы и цифры («Liquid Paranoia», «liquid-paranoia» и
// «LiquidParanoia» совпадают). Имена — английские (refName EE2): русское имя предмета переводите в refName
// данными EE2 (resources/data/poe2/ru) до поиска.

import { KIND_GROUPS, type Poe2PriceKind, type Poe2PriceLine, type Poe2PriceSnapshot } from './snapshot'

export interface Poe2Price extends Poe2PriceLine {
  /** цена в divine / exalted / chaos (null — курса этой валюты нет в снимке) */
  divine: number | null
  exalted: number | null
  chaos: number | null
  /**
   * «Мало данных»: у уника меньше LOW_LISTINGS лотов (топ poe.ninja полон выставленных «для вида» — 5000 div при
   * 12 лотах), у валюты оборот меньше LOW_TRADED штук за период poe.ninja (volume / value). Показывайте цену с
   * оговоркой и не ставьте в рекомендации.
   */
  low: boolean
}

export const LOW_LISTINGS = 20
export const LOW_TRADED = 0.25

const UNIQUE: ReadonlySet<string> = new Set(KIND_GROUPS.uniques)

/** Ключ для поиска по имени/id: нижний регистр, только буквы и цифры (латиница, кириллица, ö и т. п.). */
export function priceKey(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

export function isUniqueKind(kind: Poe2PriceKind): boolean {
  return UNIQUE.has(kind)
}

export interface Poe2PriceQuery {
  /** только эти типы (KIND_GROUPS.emotions, ['Runes'] …) */
  kinds?: readonly Poe2PriceKind[]
  /** уник: база («Shortbow») — без неё берётся строка с наибольшим числом лотов */
  base?: string
  variant?: string
  /** уник: порченый / непорченый; не задано — любой (непорченый в приоритете) */
  corrupted?: boolean
}

export class Poe2PriceTable {
  readonly league: string
  readonly at: number
  readonly primary: string
  readonly rates: Readonly<Record<string, number>>
  private readonly lines: Poe2PriceLine[]
  private readonly byKey = new Map<string, Poe2PriceLine[]>()
  private readonly ids = new Map<string, Poe2PriceLine>()

  constructor(snap: Poe2PriceSnapshot) {
    this.league = snap.league
    this.at = snap.at
    this.primary = snap.primary
    this.rates = snap.rates
    this.lines = snap.lines
    for (const l of snap.lines) {
      const k = priceKey(l.name)
      const list = this.byKey.get(k)
      if (list) list.push(l)
      else this.byKey.set(k, [l])
      if (!this.ids.has(l.id)) this.ids.set(l.id, l)
      // id обмена («liquid-paranoia») — тот же ключ, что имя; id уника содержит базу — по нему ищет byId
    }
  }

  get size(): number {
    return this.lines.length
  }

  /** Перевести сумму из primary в валюту ('divine' | 'exalted' | 'chaos' | id из rates); нет курса — null. */
  convert(valueInPrimary: number, to: string): number | null {
    if (to === this.primary) return valueInPrimary
    const r = this.rates[to]
    return r ? valueInPrimary * r : null
  }

  /** exalted за один divine (курс снимка); нет — null. */
  get exaltedPerDivine(): number | null {
    const d = this.convert(1, 'divine')
    const e = this.convert(1, 'exalted')
    return d && e ? e / d : null
  }

  private price(l: Poe2PriceLine): Poe2Price {
    const low = isUniqueKind(l.kind) ? (l.listings ?? 0) < LOW_LISTINGS : !l.volume || l.volume / l.value < LOW_TRADED
    return { ...l, divine: this.convert(l.value, 'divine'), exalted: this.convert(l.value, 'exalted'), chaos: this.convert(l.value, 'chaos'), low }
  }

  /** По id poe.ninja («divine», «liquid-paranoia», «mageblood-utility-belt»). */
  byId(id: string): Poe2Price | null {
    const l = this.ids.get(id)
    return l ? this.price(l) : null
  }

  /** По английскому имени (или id обмена / id рецепта — см. priceKey); не нашлось — null. */
  byName(name: string, q: Poe2PriceQuery = {}): Poe2Price | null {
    let list = this.byKey.get(priceKey(name)) ?? []
    if (q.kinds) list = list.filter((l) => q.kinds!.includes(l.kind))
    if (q.base) {
      const b = priceKey(q.base)
      list = list.filter((l) => l.base !== undefined && priceKey(l.base) === b)
    }
    if (q.variant !== undefined) list = list.filter((l) => l.variant === q.variant)
    if (q.corrupted !== undefined) list = list.filter((l) => !!l.corrupted === q.corrupted)
    if (!list.length) return null
    // несколько строк (базы Runeforged/Runemastered, варианты, порча): непорченая с наибольшим числом лотов
    const best = [...list].sort((a, b) => Number(!!a.corrupted) - Number(!!b.corrupted) || (b.listings ?? 0) - (a.listings ?? 0))[0]
    return this.price(best)
  }

  /** Все строки (или только этих типов) — для списков и подсказок. */
  all(kinds?: readonly Poe2PriceKind[]): Poe2Price[] {
    return (kinds ? this.lines.filter((l) => kinds.includes(l.kind)) : this.lines).map((l) => this.price(l))
  }
}
