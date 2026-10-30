// Порт из Exiled Exchange 2 — https://github.com/Kvan7/Exiled-Exchange-2 (форк Awakened PoE Trade)
// Copyright (c) Alexander Drozdov (SnosMe), Kvan7 and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/pseudo/index.ts @ cca30662bf31eaf38bd711e2ec1a6b899a06c40e
// Изменения POETH: импорты под нашу структуру; псевдо-стат берётся из данных языка (`ctx.d.statByRef`, у EE2 —
// глобальный STAT_BY_REF); закомментированные у EE2 правила не переносились; refEffectsPseudos /
// translatedEffectsPseudos (нужны только редактору предметов) не перенесены.

import { ModifierType, type StatCalculated, type StatSource } from '../../../parser'
import { stat } from '../../../parser/statRef'
import { calculatedStatToFilter, type FiltersCreationContext } from '../create-stat-filters'
import type { StatFilter } from '../interfaces'
import { percentRoll, roundRoll } from '../util'

const RESISTANCES_INFO: Array<{
  ref: string
  elements: Array<'fire' | 'cold' | 'lightning'>
  chaos?: true
}> = [
  {
    ref: stat('#% to All Resistances'),
    elements: ['fire', 'cold', 'lightning'],
    chaos: true
  },
  {
    ref: stat('#% to all Elemental Resistances'),
    elements: ['fire', 'cold', 'lightning']
  },
  { ref: stat('#% to Fire Resistance'), elements: ['fire'] },
  { ref: stat('#% to Cold Resistance'), elements: ['cold'] },
  { ref: stat('#% to Lightning Resistance'), elements: ['lightning'] },
  {
    ref: stat('#% to Fire and Lightning Resistances'),
    elements: ['fire', 'lightning']
  },
  { ref: stat('#% to Fire and Cold Resistances'), elements: ['fire', 'cold'] },
  {
    ref: stat('#% to Cold and Lightning Resistances'),
    elements: ['cold', 'lightning']
  },
  { ref: stat('#% to Chaos Resistance'), elements: [], chaos: true },
  {
    ref: stat('#% to Fire and Chaos Resistances'),
    elements: ['fire'],
    chaos: true
  },
  {
    ref: stat('#% to Cold and Chaos Resistances'),
    elements: ['cold'],
    chaos: true
  },
  {
    ref: stat('#% to Lightning and Chaos Resistances'),
    elements: ['lightning'],
    chaos: true
  }
]

const ATTRIBUTES_INFO = [
  { ref: stat('# to all Attributes'), attributes: ['str', 'dex', 'int'] },
  { ref: stat('# to Strength'), attributes: ['str'] },
  { ref: stat('# to Dexterity'), attributes: ['dex'] },
  { ref: stat('# to Intelligence'), attributes: ['int'] },
  { ref: stat('# to Strength and Intelligence'), attributes: ['str', 'int'] },
  { ref: stat('# to Strength and Dexterity'), attributes: ['str', 'dex'] },
  { ref: stat('# to Dexterity and Intelligence'), attributes: ['dex', 'int'] }
]

interface PseudoRule {
  group?: string
  pseudo: string
  disabled?: boolean
  replaces?: string
  stats: Array<{
    ref: string
    multiplier?: number
    required?: boolean
  }>
  mutate?: (filter: StatFilter) => void
}

const PSEUDO_RULES: PseudoRule[] = [
  {
    pseudo: stat('#% total to all Elemental Resistances'),
    disabled: true,
    group: 'to_all_res',
    stats: RESISTANCES_INFO.filter((info) => info.elements.length).map((info) => ({ ref: info.ref })),
    mutate(filter) {
      filter.hidden = 'filters.hide_total_all_res'
    }
  },
  {
    pseudo: stat('#% total Elemental Resistance'),
    disabled: false,
    stats: RESISTANCES_INFO.filter((info) => info.elements.length).map((info) => ({
      ref: info.ref,
      multiplier: info.elements.length
    }))
  },
  {
    pseudo: stat('#% total to Fire Resistance'),
    group: 'to_x_ele_res',
    stats: RESISTANCES_INFO.filter((info) => info.elements.includes('fire')).map((info) => ({ ref: info.ref }))
  },
  {
    pseudo: stat('#% total to Cold Resistance'),
    group: 'to_x_ele_res',
    stats: RESISTANCES_INFO.filter((info) => info.elements.includes('cold')).map((info) => ({ ref: info.ref }))
  },
  {
    pseudo: stat('#% total to Lightning Resistance'),
    group: 'to_x_ele_res',
    stats: RESISTANCES_INFO.filter((info) => info.elements.includes('lightning')).map((info) => ({ ref: info.ref }))
  },
  {
    pseudo: stat('#% total to Chaos Resistance'),
    stats: RESISTANCES_INFO.filter((info) => info.chaos === true).map((info) => ({ ref: info.ref })),
    mutate(filter) {
      if (
        filter.sources.length === 1 &&
        (filter.sources[0].modifier.info.type === ModifierType.Augment ||
          filter.sources[0].modifier.info.type === ModifierType.AddedAugment)
      ) {
        filter.hidden = 'filters.hide_crafted_chaos'
      } else {
        filter.disabled = false
      }
    }
  },
  {
    pseudo: stat('+# total to all Attributes'),
    group: 'to_all_attrs',
    stats: [
      { ref: stat('# to all Attributes') }
      // NOTE: not including other sources from `ATTRIBUTES_INFO`
    ]
  },
  {
    pseudo: stat('+# total to Strength'),
    group: 'to_x_attr',
    stats: ATTRIBUTES_INFO.filter((info) => info.attributes.includes('str')).map((info) => ({ ref: info.ref }))
  },
  {
    pseudo: stat('+# total to Dexterity'),
    group: 'to_x_attr',
    stats: ATTRIBUTES_INFO.filter((info) => info.attributes.includes('dex')).map((info) => ({ ref: info.ref }))
  },
  {
    pseudo: stat('+# total to Intelligence'),
    group: 'to_x_attr',
    stats: ATTRIBUTES_INFO.filter((info) => info.attributes.includes('int')).map((info) => ({ ref: info.ref }))
  },
  {
    pseudo: stat('+# total maximum Life'),
    disabled: false,
    stats: [
      { ref: stat('# to maximum Life'), required: true },
      ...ATTRIBUTES_INFO.filter((info) => info.attributes.includes('str')).map((info) => ({
        ref: info.ref,
        multiplier: 2
      }))
    ]
  },
  {
    pseudo: stat('+# total maximum Mana'),
    stats: [
      { ref: stat('# to maximum Mana'), required: true },
      ...ATTRIBUTES_INFO.filter((info) => info.attributes.includes('int')).map((info) => ({
        ref: info.ref,
        multiplier: 2
      }))
    ]
  },
  {
    pseudo: stat('#% total increased maximum Energy Shield'),
    stats: [{ ref: stat('#% increased maximum Energy Shield') }]
  },
  {
    pseudo: stat('+# total maximum Energy Shield'),
    stats: [
      { ref: stat('# to maximum Energy Shield') } // global
    ]
  },
  {
    pseudo: stat('#% increased Movement Speed'),
    stats: [{ ref: stat('#% increased Movement Speed') }],
    mutate(filter) {
      if (
        filter.sources.length !== 1 ||
        (filter.sources.length === 1 && filter.sources[0].modifier.info.type !== ModifierType.Implicit)
      ) {
        filter.disabled = false
      }
    }
  },
  {
    pseudo: stat('# uses remaining'),
    disabled: false,
    stats: [
      { ref: stat('Adds Irradiated to a Map \n# use remaining') },
      { ref: stat('Adds Ritual Altars to a Map \n# use remaining') },
      { ref: stat('Adds a Kalguuran Expedition to a Map \n# use remaining') },
      { ref: stat('Adds a Mirror of Delirium to a Map \n# use remaining') },
      { ref: stat('Adds an Otherworldy Breach to a Map \n# use remaining') },
      { ref: stat('Empowers the Map Boss of a Map \n# use remaining') },
      { ref: stat('Adds Abysses to a Map \n# use remaining') }
    ]
  }
]

export function filterPseudo(ctx: FiltersCreationContext) {
  const filterByGroup = new Map<string, StatFilter[]>()

  rulesLoop: for (const rule of PSEUDO_RULES) {
    const sources = filterPseudoSources(ctx.statsByType, ({ stat }, source) => {
      const info = rule.stats.find((info) => info.ref === stat.ref)
      if (!info) return null

      const multi = info.multiplier ?? 1
      return {
        ...source,
        contributes: {
          value: source.contributes!.value * multi,
          min: source.contributes!.min * multi,
          max: source.contributes!.max * multi
        }
      }
    })
    if (!sources.length) continue

    if (rule.stats.some((s) => s.required)) {
      for (const stat of rule.stats) {
        if (stat.required && !sources.some((source) => source.stat.stat.ref === stat.ref)) {
          continue rulesLoop
        }
      }
    }

    const filter = calculatedStatToFilter(
      {
        stat: ctx.d.statByRef(rule.pseudo)!,
        type: ModifierType.Pseudo,
        sources
      },
      ctx.searchInRange,
      ctx.item,
      ctx.d
    )

    filter.disabled = rule.disabled ?? true

    if (rule.mutate) {
      rule.mutate(filter)
    }

    ctx.filters.push(filter)

    if (rule.replaces && filterByGroup.has(rule.replaces)) {
      const replacedFilters = filterByGroup.get(rule.replaces)!
      ctx.filters = ctx.filters.filter((filter) => !replacedFilters.includes(filter))
    }

    if (rule.group) {
      if (filterByGroup.has(rule.group)) {
        filterByGroup.get(rule.group)!.push(filter)
      } else {
        filterByGroup.set(rule.group, [filter])
      }
    }
  }

  ctx.statsByType = ctx.statsByType.filter(
    (m) => !PSEUDO_RULES.some((rule) => rule.stats.some(({ ref }) => m.stat.ref === ref))
  )

  if (filterByGroup.has('to_x_ele_res')) {
    const resFilters = filterByGroup.get('to_x_ele_res')!

    resFilters.sort((a, b) => b.roll!.value - a.roll!.value)
    const maxFilter = resFilters[0]?.roll?.value === resFilters[1]?.roll?.value ? undefined : resFilters[0]

    if (maxFilter) {
      maxFilter.hidden = 'filters.hide_ele_res'
    }

    ctx.filters = ctx.filters.filter((filter) => !resFilters.includes(filter) || filter === maxFilter)
  }

  if (filterByGroup.has('to_x_attr')) {
    const attrFilters = filterByGroup.get('to_x_attr')!
    attrFilters.sort((a, b) => b.roll!.value - a.roll!.value)
    if (attrFilters.length === 3) {
      const toAll = filterByGroup.get('to_all_attrs')
      if (attrFilters.every((f) => f.roll!.value === attrFilters[0].roll!.value) && toAll != null) {
        ctx.filters = ctx.filters.filter((filter) => !attrFilters.includes(filter))
      } else {
        if (toAll != null) {
          ctx.filters = ctx.filters.filter((filter) => !toAll.includes(filter))
        }

        if (attrFilters[2].roll!.value / attrFilters[0].roll!.value < 0.3) {
          if (attrFilters[1].roll!.value === attrFilters[2].roll!.value) {
            attrFilters[1].hidden = 'hide_attr_same_2nd_n_3rd'
            attrFilters[2].hidden = 'hide_attr_same_2nd_n_3rd'
          } else {
            attrFilters[2].hidden = 'hide_attr_smallest_total'
          }
        }
      }
    }
  }

  if (filterByGroup.has('to_all_res')) {
    const filters = filterByGroup.get('to_all_res')!
    if (filters.length > 1) {
      throw new Error('Multiple to_all_res filters')
    }
    const filter = filters[0]

    const all = {
      value: 0,
      min: 0,
      max: 0
    }
    const elements = {
      fire: { value: 0, min: 0, max: 0 },
      cold: { value: 0, min: 0, max: 0 },
      lightning: { value: 0, min: 0, max: 0 }
    }

    for (const source of filter.sources) {
      const info = RESISTANCES_INFO.find((info) => info.ref === source.stat.stat.ref)
      // shouldn't skip any
      if (!info) continue

      if (info.elements.length === 3) {
        all.value += source.contributes!.value
        all.min += source.contributes!.min
        all.max += source.contributes!.max
      } else {
        for (const element of info.elements) {
          elements[element].value += source.contributes!.value
          elements[element].min += source.contributes!.min
          elements[element].max += source.contributes!.max
        }
      }
    }

    let minRoll: 'fire' | 'cold' | 'lightning' = 'fire'

    if (elements.cold.value < elements[minRoll].value) {
      minRoll = 'cold'
    }

    if (elements.lightning.value < elements[minRoll].value) {
      minRoll = 'lightning'
    }

    const totalRoll = {
      value: all.value + elements[minRoll].value,
      min: all.min + elements[minRoll].min,
      max: all.max + elements[minRoll].max
    }

    if (totalRoll.value === 0) {
      // dont even bother if have none
      ctx.filters = ctx.filters.filter((f) => f !== filter)
      return
    }

    const dp = false

    const filterBounds = {
      min: percentRoll(totalRoll.min, -0, Math.floor, dp),
      max: percentRoll(totalRoll.max, +0, Math.ceil, dp)
    }

    const filterDefault = {
      min: percentRoll(totalRoll.value, -ctx.searchInRange, Math.floor, dp),
      max: percentRoll(totalRoll.value, +ctx.searchInRange, Math.ceil, dp)
    }

    filterDefault.min = Math.max(filterDefault.min, filterBounds.min)
    filterDefault.max = Math.min(filterDefault.max, filterBounds.max)

    filter.roll = {
      value: roundRoll(totalRoll.value, dp),
      min: filterDefault.min,
      max: undefined,
      default: filterDefault,
      bounds: undefined,
      dp,
      isNegated: false
    }
  }
}

function filterPseudoSources(
  stats: StatCalculated[],
  mapFn: (calc: StatCalculated, source: StatSource) => StatSource | null
): StatSource[] {
  const out: StatSource[] = []
  for (const calc of stats) {
    for (const source of calc.sources) {
      const result = mapFn(calc, source)
      if (result) {
        out.push(result)
      }
    }
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const __testExports = {
  filterPseudoSources
}
