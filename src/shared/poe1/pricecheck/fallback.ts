// POETH: фолбэк для модов, которых нет в данных APT (новый патч, 3.30 — 13.11): тексты статов с самого сайта
// трейда (GET /api/trade/data/stats; на ru.pathofexile.com — русские тексты). Main кэширует ответ на диск и
// обновляет раз в сутки, renderer шлёт нераспознанные строки — сюда (чистый код, без electron).

import type { ParsedItem } from '../parser'
import { ModifierType } from '../parser/modifiers'
import { FilterTag, type StatFilter } from './filters/interfaces'
import { percentRoll } from './filters/util'

export interface TradeStatEntry {
  /** полный trade id: `explicit.stat_123` */
  id: string
  /** текст с `#` на языке хоста */
  text: string
  /** explicit / implicit / crafted / enchant / fractured / pseudo … */
  type: string
}

/** Ответ /api/trade/data/stats → плоский список (`{result:[{label, entries:[{id,text,type}]}]}`). */
export function parseTradeDataStats(json: unknown): TradeStatEntry[] {
  const groups = (json as { result?: unknown })?.result
  if (!Array.isArray(groups)) throw new Error('data/stats: нет result')
  const out: TradeStatEntry[] = []
  for (const g of groups) {
    const entries = (g as { entries?: unknown })?.entries
    if (!Array.isArray(entries)) continue
    for (const e of entries) {
      const { id, text, type } = (e ?? {}) as Record<string, unknown>
      if (typeof id === 'string' && typeof text === 'string' && typeof type === 'string') out.push({ id, text, type })
    }
  }
  return out
}

const NUM_RE = /[+-]?\d+(?:[.,]\d+)?/g

/** Ключ сравнения: числа и `#` (со знаком) → `#`, пробелы схлопнуты, регистр не важен. */
export function fallbackKey(text: string): string {
  return text
    .replace(/[+-]?#/g, '#')
    .replace(NUM_RE, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export interface FallbackMatch {
  /** строка из текста предмета */
  text: string
  /** тип мода в тексте (explicit, implicit…) */
  type: string
  tradeId: string
  /** текст стата с сайта */
  label: string
  /** первое число строки (если есть) */
  value?: number
}

/** Индекс: ключ → записи (одинаковый текст бывает у explicit/implicit/crafted…). */
export class TradeStatsFallback {
  private readonly byKey = new Map<string, TradeStatEntry[]>()

  constructor(entries: readonly TradeStatEntry[]) {
    for (const e of entries) {
      for (const line of e.text.split('\n')) {
        const key = fallbackKey(line)
        const list = this.byKey.get(key)
        if (list) list.push(e)
        else this.byKey.set(key, [e])
      }
    }
  }

  get size(): number {
    return this.byKey.size
  }

  /** Подобрать стат сайта для строки мода; предпочтение — тому же типу, затем explicit. */
  match(text: string, type: string): FallbackMatch | undefined {
    const list = this.byKey.get(fallbackKey(text))
    if (!list) return undefined
    const entry =
      list.find((e) => e.type === type) ??
      list.find((e) => e.type === ModifierType.Explicit) ??
      list.find((e) => e.type !== ModifierType.Pseudo)
    if (!entry) return undefined
    const num = text.match(NUM_RE)?.[0]
    return {
      text,
      type,
      tradeId: entry.id,
      label: entry.text,
      value: num !== undefined ? Number(num.replace(',', '.')) : undefined
    }
  }

  matchAll(lines: ReadonlyArray<{ text: string; type: string }>): FallbackMatch[] {
    const out: FallbackMatch[] = []
    for (const l of lines) {
      const m = this.match(l.text, l.type)
      if (m) out.push(m)
    }
    return out
  }
}

/**
 * Фильтр для мода, найденного только в данных сайта: виден в окне с пометкой «с сайта», выключен по
 * умолчанию (как обычные явные моды), мин. значение — −searchStatRange % от ролла.
 */
export function fallbackToFilter(m: FallbackMatch, item: ParsedItem, searchStatRange: number): StatFilter {
  const value = m.value
  const negative = value !== undefined && value < 0
  return {
    tradeId: [m.tradeId],
    statRef: m.label,
    text: m.text.replace(NUM_RE, '#'),
    tag: (Object.values(ModifierType) as string[]).includes(m.type) ? (m.type as ModifierType) : FilterTag.Explicit,
    sources: [],
    roll:
      value === undefined
        ? undefined
        : {
            value,
            min: negative ? undefined : percentRoll(value, -searchStatRange, Math.floor),
            max: negative ? percentRoll(value, +searchStatRange, Math.ceil) : undefined,
            default: {
              min: percentRoll(value, -searchStatRange, Math.floor),
              max: percentRoll(value, +searchStatRange, Math.ceil)
            },
            dp: !Number.isInteger(value),
            isNegated: false
          },
    fromSite: true,
    hidden: undefined,
    disabled: item.rarity !== 'Unique'
  }
}
