// «6L против без связей» (S33): выгода = продажа 6L − покупка без связей − стоимость шести связей.
//
// Метод линковки — верстак (Crafting Bench) в убежище, без риска: «Шесть гнёзд» за 350 Jeweller's Orb и
// «Шесть связей» за 1500 Orb of Fusing. Стоимость по курсу сфер из почасового фида обмена GGG (тот же, что у
// «Обмена»). Гнёзда считаем всегда: у предмета без связей обычно меньше шести гнёзд (если шесть уже есть —
// дешевле на 350 Jeweller's). Шесть гнёзд бывают только у предметов 50+ уровня (у уников — почти всегда).
// Ручной «спам» Fusing в среднем дешевле, но с разбросом в разы — честнее считать гарантированный верстак.

import type { ItemLiquidity, ItemRow, SixLinkRow } from '../../types/flip'

export const BENCH_FUSING = 1500
export const BENCH_JEWELLERS = 350

/** id сфер в почасовом фиде обмена GGG */
export const FUSING_ID = 'Currency/CurrencyRerollSocketLinks'
export const JEWELLER_ID = 'Currency/CurrencyRerollSocketNumbers'

const formOf = (r: Pick<ItemRow, 'name' | 'base' | 'variant' | 'foulborn'>): string =>
  `${r.foulborn ? 'F' : ''}\u0000${r.name}\u0000${r.base}\u0000${r.variant ?? ''}`

const worse = (a: ItemLiquidity, b: ItemLiquidity): ItemLiquidity => {
  const order: ItemLiquidity[] = ['fast', 'normal', 'slow']
  return order[Math.max(order.indexOf(a), order.indexOf(b))]
}

export function benchCost(fusing: number | null, jewellers: number | null): number | null {
  if (!fusing || fusing <= 0 || !jewellers || jewellers <= 0) return null
  return BENCH_FUSING * fusing + BENCH_JEWELLERS * jewellers
}

/**
 * Пары «без связей ↔ 6L» одного уника и варианта; сначала надёжные по выгоде, ниже — с малой выборкой (цена 6L по
 * одному-двум наблюдениям — частая ловушка: Starforge 6L «за 200 div» по одному лоту).
 */
export function sixLinkRows(rows: readonly ItemRow[], fusing: number | null, jewellers: number | null): SixLinkRow[] {
  const bases = new Map<string, ItemRow>()
  for (const r of rows) if (!r.links && r.unlinked) bases.set(formOf(r), r)
  const cost = benchCost(fusing, jewellers)
  const out: SixLinkRow[] = []
  for (const six of rows) {
    if (six.links !== 6) continue
    const base = bases.get(formOf(six))
    if (!base) continue
    const row: SixLinkRow = {
      id: six.id,
      baseId: base.id,
      name: six.name,
      base: six.base,
      foulborn: six.foulborn,
      buy: base.chaos,
      sell: Math.round(six.sell * 10) / 10,
      fusing: BENCH_FUSING,
      jewellers: BENCH_JEWELLERS,
      cost: cost === null ? null : Math.round(cost),
      profit: cost === null ? null : Math.round(six.sell - base.chaos - cost),
      confidence: Math.round(Math.min(six.confidence, base.confidence) * 100) / 100,
      liquidity: worse(six.liquidity, base.liquidity),
      thin: six.thin || base.thin
    }
    if (six.variant) row.variant = six.variant
    out.push(row)
  }
  return out.sort((a, b) => Number(a.thin) - Number(b.thin) || (b.profit ?? -Infinity) - (a.profit ?? -Infinity) || b.sell - a.sell)
}
