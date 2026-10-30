// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/create-unique-filters.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: данные языка параметром; опции — общий тип CreatePresetsOptions; без `performance.mark`.

import type { Poe2Data } from '../../data/Poe2Data'
import { type ParsedItem, type StatCalculated, ModifierType } from '../../parser'
import type { FilterPreset, StatFilter } from './interfaces'
import { calculatedStatToFilter, type FiltersCreationContext } from './create-stat-filters'
import { propToFilter } from './pseudo/item-property'
import { createFilters } from './create-item-filters'
import type { CreatePresetsOptions } from './create-presets'

/** Уники со своим набором пресетов. */
export const PRESET_UNIQUES = new Set(['Mageblood'])

export function createUniquePresets(
  item: ParsedItem,
  d: Poe2Data,
  opts: CreatePresetsOptions
): {
  presets: FilterPreset[]
  active: string
} {
  if (!PRESET_UNIQUES.has(item.info.refName)) {
    throw new Error("item doesn't have unique presets")
  }
  switch (item.info.refName) {
    case 'Mageblood':
      return {
        active: 'filters.preset_exact',
        presets: [
          {
            id: 'filters.preset_exact',
            filters: createFilters(item, d, { ...opts, exact: true }),
            stats: createMagebloodFilters(item, d, item.statsByType, opts)
          }
        ]
      }
  }

  throw new Error('not implemented')
}

function createMagebloodFilters(
  item: ParsedItem,
  d: Poe2Data,
  statsByType: StatCalculated[],
  opts: { searchStatRange: number }
): StatFilter[] {
  const searchInRange = Math.min(2, opts.searchStatRange)
  const ctx: FiltersCreationContext = {
    item,
    d,
    searchInRange,
    filters: [],
    statsByType
  }

  /** --------
   *  { Implicit Modifier }
   *  20% of Flask Recovery applied Instantly
   *  { Implicit Modifier — Charm }
   *  Has 3(1-3) Charm Slots
   *  --------
   *  { Unique Modifier }
   *  Legacy of Topaz(Amethyst-Topaz) — Unscalable Value
   *  { Unique Modifier }
   *  Legacy of Topaz(Amethyst-Topaz) — Unscalable Value
   *  { Unique Modifier }
   *  Legacy of Gold(Amethyst-Topaz) — Unscalable Value
   *  { Unique Modifier }
   *  Legacy of Topaz(Amethyst-Topaz) — Unscalable Value
   *  { Unique Modifier }
   *  All Mage's Legacies have 40(25-50)% increased effect per duplicate Mage's Legacy you have
   *  --------
   */

  // push all but the "Legacy of #" stats
  ctx.filters.push(
    ...ctx.statsByType
      .filter((s) => s.type !== ModifierType.Explicit || s.stat.ref.startsWith("All Mage's Legacies"))
      .map((mod) => calculatedStatToFilter(mod, ctx.searchInRange, item, d))
  )

  const legacies = ctx.statsByType.filter((s) => s.type === ModifierType.Explicit && s.stat.ref.startsWith('Legacy'))

  const duplicates = 4 - legacies.length
  const dupFilter = propToFilter(
    {
      ref: 'Duplicates: #',
      tradeId: 'item.duplicates',
      roll: {
        min: duplicates,
        max: duplicates,
        value: duplicates
      },
      sources: legacies.flatMap((s) => s.sources),
      disabled: false,
      hidden: 'dont_hide_me'
    },
    ctx
  )
  dupFilter.roll!.bounds = {
    min: 0,
    max: 3
  }
  dupFilter.roll!.min = duplicates
  ctx.filters.push(dupFilter)

  ctx.filters.push(
    ...legacies.map((mod) => {
      // copy to not modify original, causing infinite refEffect loop
      const copiedMod = JSON.parse(JSON.stringify(mod)) as StatCalculated
      const source = copiedMod.sources[0]
      source.contributes = {
        value: 0,
        min: 0,
        max: 0,
        option: source.contributes?.option
      }

      copiedMod.sources = [source]
      const f = calculatedStatToFilter(copiedMod, ctx.searchInRange, item, d)
      f.roll = undefined

      return f
    })
  )

  for (const filter of ctx.filters) {
    if (!filter.hidden) {
      filter.disabled = false
    }
    if (filter.hidden === 'dont_hide_me') {
      filter.hidden = undefined
    }
  }

  return ctx.filters
}
