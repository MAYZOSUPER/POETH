// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/pseudo/flasks.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: данные языка (`ctx.d`) для поиска стата.

import { stat } from '../../../parser/statRef'
import { ItemRarity } from '../../../parser/ParsedItem'
import { ModifierType } from '../../../parser/modifiers'
import type { FiltersCreationContext } from '../create-stat-filters'
import { findAndResolveByRef, statToNotFilter } from './utils'

const STATS = {
  INCR_CHARGE_RECOVERY: stat('#% increased Charge Recovery'),
  INCR_EFFECT: stat('#% increased effect')
}

// https://github.com/SnosMe/awakened-poe-trade/issues/758
export function applyFlaskHybridMod (ctx: FiltersCreationContext) {
  const applicable = ctx.item.rarity === ItemRarity.Magic &&
    ctx.filters.some(filter => filter.statRef === STATS.INCR_CHARGE_RECOVERY) &&
    !ctx.filters.some(filter => filter.statRef === STATS.INCR_EFFECT)
  if (!applicable) return

  const effectStat = findAndResolveByRef(STATS.INCR_EFFECT, ModifierType.Explicit, ctx.item.category, ctx.d)
  const filter = statToNotFilter({
    stat: effectStat,
    type: ModifierType.Explicit,
    negateString: true,
    disabled: false
  })
  const insertAfter = ctx.filters.findIndex(filter => filter.statRef === STATS.INCR_CHARGE_RECOVERY)
  ctx.filters.splice(insertAfter + 1, 0, filter)
}
