// Поиск реальных аналогов timeless-самоцвета (S45): один count-запрос на трейд — «сид из списка у завоевателя
// из списка», не больше MAX_ANALOG_FILTERS фильтров (stat id `explicit.pseudo_timeless_jewel_<завоеватель>`,
// значение = сид как на предмете). Тело строит обычный buildRequest окна цены по копии пресета, где группа
// сида заменена на группу аналогов: статус, лига, имя уника и прочие фильтры — как у основного поиска.

import { TIMELESS_JEWELS, conquerorTradeId, type TimelessSearch } from '../pricecheck/filters/pseudo/timeless-jewel'
import { FilterTag, type FilterGroup, type FilterPreset, type StatFilter } from '../pricecheck/filters/interfaces'

/** Не больше стольких фильтров в count-группе аналогов (сиды × завоеватели). */
export const MAX_ANALOG_FILTERS = 180

/** Завоеватели в запросе аналогов: «точный» — завоеватель предмета, «любой» — все завоеватели этого самоцвета. */
export function analogConquerors(info: TimelessSearch): string[] {
  if (info.mode === 'exact' && info.conqueror) return [info.conqueror]
  return TIMELESS_JEWELS.find((j) => j.kind === info.jewel)?.conquerors.map((c) => c.name) ?? []
}

/** Сколько сидов поместится в запрос при этом режиме завоевателя. */
export function maxAnalogSeeds(info: TimelessSearch): number {
  const n = analogConquerors(info).length
  return n ? Math.floor(MAX_ANALOG_FILTERS / n) : 0
}

function seedFilter(conqueror: string, seed: number): StatFilter {
  return {
    tradeId: [conquerorTradeId(conqueror)],
    statRef: `timeless ${conqueror} ${seed}`,
    text: '',
    tag: FilterTag.Pseudo,
    sources: [],
    roll: { value: seed, min: seed, max: seed, default: { min: seed, max: seed }, dp: false, isNegated: false },
    disabled: false
  }
}

/**
 * Копия пресета для поиска аналогов: группа сида → «любой из `itemSeeds` у завоевателей режима».
 * `itemSeeds` — сиды как на предмете (у Elegant Hubris — «монеты»); лишние сверх лимита отбрасываются.
 */
export function analogPreset(preset: FilterPreset, info: TimelessSearch, itemSeeds: readonly number[]): FilterPreset {
  const conquerors = analogConquerors(info)
  const seeds = itemSeeds.slice(0, maxAnalogSeeds(info))
  const stats = preset.stats.map((s) => {
    if (s.group !== 'one' || s.kind !== 'timeless') return s
    const group: FilterGroup = {
      ...s,
      expanded: false,
      meta: { ...s.meta, disabled: false },
      stats: seeds.flatMap((seed) => conquerors.map((c) => seedFilter(c, seed)))
    }
    return group
  })
  return { ...preset, stats }
}
