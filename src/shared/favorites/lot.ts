// «Открыть лот в трейд-окне»: запрос сайта трейда, который сужает выдачу до одного лота
// (продавец + имя + база [+ уровень предмета]). Запрос кладётся в адрес страницы
// …/trade/search/<лига>?q=<JSON> — его выполняет сам сайт в siteView.
// Приложение НЕ шлёт своих запросов к эндпоинтам whisper/телепорта и НЕ жмёт кнопки сайта:
// «Travel to Hideout» и «Direct whisper» игрок нажимает сам (docs/PLAN-POETH.md, риск бана).

import type { TradeLot } from '../types/fav'

/** Предел длины JSON запроса в адресе (сайт и Chromium спокойно принимают ~8 КБ). */
export const QUERY_JSON_MAX = 8000

const clean = (s: unknown): string | undefined => {
  if (typeof s !== 'string') return undefined
  const v = s.replace(/\s+/g, ' ').trim()
  return v ? v.slice(0, 200) : undefined
}

/** Запрос сайта трейда для одного лота; null — нечем сузить (нет базы предмета). */
export function lotQuery(lot: TradeLot): Record<string, unknown> | null {
  const type = clean(lot.typeLine)
  if (!type) return null
  const query: Record<string, unknown> = { status: { option: 'any' }, type }
  const name = clean(lot.name)
  if (name) query.name = name
  const filters: Record<string, unknown> = {}
  const account = clean(lot.account)
  if (account) filters.trade_filters = { filters: { account: { input: account } } }
  if (typeof lot.ilvl === 'number' && Number.isInteger(lot.ilvl) && lot.ilvl > 0 && lot.ilvl < 100) {
    filters.misc_filters = { filters: { ilvl: { min: lot.ilvl, max: lot.ilvl } } }
  }
  if (Object.keys(filters).length) query.filters = filters
  return { query, sort: { price: 'asc' } }
}

/** JSON запроса для адреса ?q=…; null — не объект или слишком длинный. */
export function queryParam(query: unknown): string | null {
  if (typeof query !== 'object' || query === null || Array.isArray(query)) return null
  let json: string
  try {
    json = JSON.stringify(query)
  } catch {
    return null
  }
  return json.length <= QUERY_JSON_MAX ? json : null
}
