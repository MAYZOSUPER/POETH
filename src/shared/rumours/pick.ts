// Слухи: какой взять и почему (S65; чистый модуль, tests/rumours/pick.test.ts).
//
// Ожидаемую ценность острова честно посчитать нельзя (открытых шансов дропа нет), поэтому решает тир:
//  1) тир игрока (его пометка), иначе наш тир ●●●;
//  2) при равном тире — цена главной награды сейчас (по источникам цен);
//  3) при равных — что проще: сложность и опасности.
// Слух с пометкой «не беру» в выборе не участвует. Слух без тира (новый после патча, ещё не оценили) лучшим не
// становится, пока есть оценённые.

import { itemRefKey, mainItem, type RumourLevel, type RumourRecord } from './schema'
import { inExalted, type RumourPriceBook } from './prices'
import type { RumourMark } from './marks'

export interface RankedRumour {
  id: string
  /** тир, по которому решали; null — не оценён ни нами, ни игроком */
  tier: RumourLevel | null
  /** чей тир: игрока или наш */
  tierBy: 'own' | 'ours' | null
  /** цена главной награды в exalted; null — нет цены или курса */
  priceEx: number | null
  /** «не беру» */
  skipped: boolean
}

/**
 * Почему этот:
 *  - single — выбран один слух, сравнивать не с чем;
 *  - only — остальные «не беру» или ещё не оценены;
 *  - own — решила пометка игрока (его тир выше);
 *  - tier — наш тир выше;
 *  - price — тир равный, главная награда дороже (than — у кого дешевле);
 *  - safer — тир и цена равны или неизвестны, но проще и безопаснее (than — кто опаснее);
 *  - equal — ничем не лучше: берите любой.
 */
export type RumourWhy =
  | { kind: 'single' }
  | { kind: 'only' }
  | { kind: 'own' }
  | { kind: 'tier'; than: string }
  | { kind: 'price'; than: string }
  | { kind: 'safer'; than: string }
  | { kind: 'equal'; than: string }

export interface RumourPick {
  /** лучший слух; null — выбирать не из чего (ничего не выбрано, все «не беру» или никто не оценён) */
  best: string | null
  why: RumourWhy | null
  /** выбранные по убыванию: лучший первый, «не беру» — в конце */
  ranked: RankedRumour[]
}

/** Сложность и опасности в очки: чем больше, тем хуже (решает только при равном тире и цене). */
function riskOf(r: RumourRecord): number {
  return (r.difficulty ?? 2) * 2 + r.risks.length
}

/** Цены считаем «равными», если различаются меньше чем на 15 %: колебания рынка — не причина. */
function samePrice(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b
  const hi = Math.max(a, b)
  return hi === 0 || Math.abs(a - b) / hi < 0.15
}

export function pickRumour(
  records: readonly RumourRecord[],
  ids: readonly string[],
  marks: Readonly<Record<string, RumourMark>> = {},
  prices: RumourPriceBook | null = null
): RumourPick {
  const byId = new Map(records.map((r) => [r.id, r]))
  const chosen = ids.map((id) => byId.get(id)).filter((r): r is RumourRecord => !!r)
  const ranked: (RankedRumour & { rec: RumourRecord })[] = chosen.map((rec) => {
    const mark = marks[rec.id]
    const own = mark?.tier ?? null
    const tier = own ?? rec.tier
    const item = mainItem(rec)
    const q = item && prices ? prices.quotes[itemRefKey(item)] : null
    const priceEx = prices ? inExalted(q, prices.rates) : null
    const skipped = !!mark?.skip
    return { id: rec.id, tier, tierBy: own !== null ? 'own' : rec.tier !== null ? 'ours' : null, priceEx, skipped, rec }
  })
  // лучший первый; «не беру» в самом конце, неоценённые — перед ними. Дальше — как в объяснении: тир, заметно
  // более дорогая награда, меньше опасностей, просто дороже; при полном равенстве — порядок выбора игрока
  const order = (x: RankedRumour): number => (x.skipped ? 2 : x.tier === null ? 1 : 0)
  ranked.sort(
    (a, b) =>
      order(a) - order(b) ||
      (b.tier ?? 0) - (a.tier ?? 0) ||
      (samePrice(a.priceEx, b.priceEx) ? 0 : (b.priceEx ?? 0) - (a.priceEx ?? 0)) ||
      riskOf(a.rec) - riskOf(b.rec) ||
      (b.priceEx ?? 0) - (a.priceEx ?? 0)
  )
  const out = ranked.map(({ rec: _rec, ...x }) => x)

  const live = ranked.filter((x) => !x.skipped && x.tier !== null)
  if (!live.length) return { best: null, why: null, ranked: out }
  const best = live[0]
  if (chosen.length === 1) return { best: best.id, why: { kind: 'single' }, ranked: out }
  const second = live[1]
  if (!second) return { best: best.id, why: { kind: 'only' }, ranked: out }

  let why: RumourWhy
  if ((best.tier ?? 0) > (second.tier ?? 0)) {
    why = best.tierBy === 'own' || second.tierBy === 'own' ? { kind: 'own' } : { kind: 'tier', than: second.id }
  } else if (!samePrice(best.priceEx, second.priceEx) && (best.priceEx ?? 0) > (second.priceEx ?? 0)) {
    why = { kind: 'price', than: second.id }
  } else if (riskOf(best.rec) < riskOf(second.rec)) {
    why = { kind: 'safer', than: second.id }
  } else {
    why = { kind: 'equal', than: second.id }
  }
  return { best: best.id, why, ranked: out }
}
