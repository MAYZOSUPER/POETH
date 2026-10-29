// Предметы этапа на языке клиента игры (S40): имена уников и баз, строки модов и статы поиска — через данные APT
// (S2: у каждого стата английский `ref` и строки-матчеры на языке данных, у предметов — `refName` ↔ имя).
// Не нашлось — показываем как в PoB (английский), не выдумываем.

import type { Poe1Data } from '../poe1/data'
import { ModifierType } from '../poe1/parser/modifiers'
import { matchStatLine } from '../poe1/parser/stat-translations'
import { pobBaseName } from './pobItem'

/** Имя уника на языке данных. */
export function uniqueNameIn(name: string, d: Poe1Data | null): string {
  if (!d || d.lang === 'en') return name
  return d.itemByRef('UNIQUE', name)?.[0]?.name ?? name
}

/** База на языке данных («Two-Stone Ring (Cold/Lightning)» → «Двухкаменное кольцо»). */
export function baseNameIn(base: string, d: Poe1Data | null): string {
  const ref = pobBaseName(base)
  if (!d || d.lang === 'en') return ref
  return d.itemByRef('ITEM', ref)?.[0]?.name ?? ref
}

const NUM = '([+-]?\\d+(?:\\.\\d+)?)'
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function fill(template: string, nums: readonly string[]): string {
  let k = 0
  return template.replace(/#/g, () => nums[k++] ?? '#').trim()
}

/** Матчер того же стата на языке `target` (тот же номер, что у английского; иначе первый подходящий). */
function targetMatcher(ref: string, enIndex: number, negate: boolean, target: Poe1Data): string | null {
  const s = target.statByRefV2(ref)
  const stat = s ? ('stats' in s ? s.stats.find((x) => x.ref === ref) : s) : undefined
  if (!stat) return null
  const m = stat.matchers[enIndex] ?? stat.matchers.find((x) => x.value == null && !!x.negate === negate) ?? stat.matchers[0]
  return m?.string ?? null
}

/** Строка мода (EN, с числами) на языке `target`; не узнали — как есть. */
export function modLineIn(line: string, en: Poe1Data | null, target: Poe1Data | null): string {
  if (!en || !target || target.lang === 'en') return line
  try {
    const found = matchStatLine(line, en, [ModifierType.Explicit, ModifierType.Implicit, ModifierType.Enchant, ModifierType.Crafted])
    if (!found) return line
    const tpl = found.translation.string
    const m = new RegExp(`^${tpl.split('#').map(esc).join(NUM)}$`).exec(line)
    const nums = m ? m.slice(1) : []
    const index = found.stat.matchers.indexOf(found.translation)
    const t = targetMatcher(found.stat.ref, index, !!found.translation.negate, target)
    return t ? fill(t, nums) : line
  } catch {
    return line
  }
}

/**
 * Стат поиска (ref с #) на языке `target` с минимумом: «+24% к сопротивлению холоду». У «от # до #» —
 * шаблон и «≥ N» (фильтр трейда сравнивает среднее).
 */
export function statRefIn(ref: string, min: number | null, target: Poe1Data | null): string {
  let tpl = ref
  if (target) tpl = targetMatcher(ref, 0, false, target) ?? ref
  const count = tpl.split('#').length - 1
  if (min === null) return tpl.replace(/#/g, '…').replace(/^\+…/, '…').trim()
  if (count !== 1) return `${tpl.replace(/#/g, '…').trim()} ≥ ${min}`
  const plus = /\+#/.test(ref) && !/\+#/.test(tpl) && min >= 0 ? '+' : ''
  return tpl.replace('#', `${plus}${min}`).trim()
}
