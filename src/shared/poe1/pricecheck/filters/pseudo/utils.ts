// Порт из Awakened PoE Trade — https://github.com/SnosMe/awakened-poe-trade
// Copyright (c) Alexander Drozdov (SnosMe) and contributors, MIT License.
// Исходник: renderer/src/web/price-check/filters/pseudo/utils.ts @ 3188208957422b21b69b12083a03edf3d1bac187
// Изменения POETH: данные языка (`d: Poe1Data`) передаются параметром.

import type { Poe1Data } from '../../../data/Poe1Data'
import type { Stat } from '../../../data/interfaces'
import type { ItemCategory } from '../../../parser/meta'
import type { ModifierType } from '../../../parser/modifiers'
import { _resolveTranslation } from '../../../parser/stat-translations'
import { FilterTag, type StatFilter } from '../interfaces'

type ResolveHint =
  | { expected: 'percent-merge'; pick: 'percent' | 'value' }
  | { expected: 'flag-merge'; pick: 'flag' | 'value' }

function _findAndResolveByRef(
  name: string,
  modType: ModifierType,
  itemCategory: ItemCategory | undefined,
  d: Poe1Data,
  hint?: ResolveHint
): Stat | undefined {
  const statOrGroup = d.statByRefV2(name)
  if (!statOrGroup) return undefined

  let stat: Stat | undefined
  if (!('stats' in statOrGroup)) {
    stat = statOrGroup
  } else {
    const { resolve, stats } = statOrGroup
    if (resolve.strat === 'select' || resolve.strat === 'trivial-merge') {
      stat = _resolveTranslation(statOrGroup, { matchStr: '', itemCategory, modType, roll: undefined })
    } else {
      if (!hint || hint.expected !== resolve.strat) return undefined
      if (resolve.strat === 'percent-merge') {
        // NOTE 'value' stat can actually be a flag
        stat = stats[resolve.kind.indexOf(hint.pick === 'percent' ? 'percent' : 'value')]
      } else if (resolve.strat === 'flag-merge') {
        stat = stats[resolve.kind.indexOf(hint.pick === 'flag' ? 'flag' : 'value')]
      }
    }
  }
  if (stat && modType in stat.trade.ids) {
    return stat
  }
  return undefined
}

export function findAndResolveByRef(
  name: string,
  modType: ModifierType,
  itemCategory: ItemCategory | undefined,
  d: Poe1Data,
  hint?: ResolveHint
): Stat {
  const stat = _findAndResolveByRef(name, modType, itemCategory, d, hint)
  if (!stat) {
    throw new Error(`Unexpected stat shape: ${name}`)
  }
  return stat
}

export function statToNotFilter(opts: {
  stat: Stat
  type: ModifierType
  negateString?: boolean
  disabled: StatFilter['disabled']
}): StatFilter {
  return {
    tradeId: opts.stat.trade.ids[opts.type],
    statRef: opts.stat.ref,
    text: (opts.stat.matchers.find((matcher) => Boolean(matcher.negate) === Boolean(opts.negateString)) ??
      opts.stat.matchers[0]).string,
    tag: opts.type,
    sources: [],
    disabled: opts.disabled,
    not: true
  }
}

export function metaNotFilter(opts: { disabled: StatFilter['disabled'] }): StatFilter {
  return {
    tradeId: ['item.not_group'],
    statRef: 'Not',
    text: 'Not',
    tag: FilterTag.FilterGroup,
    sources: [],
    disabled: opts.disabled
  }
}

export function metaCountOneFilter(opts: { disabled: StatFilter['disabled'] }): StatFilter {
  return {
    tradeId: ['item.count_one_group'],
    statRef: 'Count (1)',
    text: 'Count (1)',
    tag: FilterTag.FilterGroup,
    sources: [],
    disabled: opts.disabled
  }
}
