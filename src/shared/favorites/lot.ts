// «Открыть лот в трейд-окне»: запрос сайта трейда, который сужает выдачу до лота продавца, и состояние
// поиска для адреса страницы.
//
// Адрес — как у самого сайта (S21, по JS страницы трейда: stateUrl): …/trade/search/<лига>/<состояние>,
// состояние — gzip + base64url от JSON запроса (`query` без обёртки и без `sort`). Тот же формат у id, которые
// отдаёт POST /api/trade/search. Сервер сайта разбирает состояние и проверяет запрос; запрос, который API не
// принял бы (имя редкого предмета → 400 «Unknown item name»), страница показывает тостом «Failed to load
// search state. The search is no longer valid.» — так ломалось «Открыть лот» в rc.7.
//
// Поэтому лот из окна цены — это исходный поиск (API его уже принял, лот в его выдаче) + аккаунт продавца,
// статус «Все» и ilvl лота. Лот без исходного поиска (live S6) — база + продавец + ilvl + редкость, без имени.
// Приложение НЕ шлёт своих запросов к эндпоинтам whisper/телепорта и НЕ жмёт кнопки сайта:
// «Travel to Hideout» и «Direct whisper» игрок нажимает сам (docs/PLAN-POETH.md, риск бана).

import type { TradeLot, TradeWindowTarget } from '../types/fav'

/** Предел длины JSON запроса (до сжатия): длиннее — открываем исходный поиск по его адресу. */
export const QUERY_JSON_MAX = 8000

type Json = Record<string, unknown>

const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

const clean = (s: unknown): string | undefined => {
  if (typeof s !== 'string') return undefined
  const v = s.replace(/\s+/g, ' ').trim()
  return v ? v.slice(0, 200) : undefined
}

const validIlvl = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0 && n < 100

const RARITIES = new Set(['normal', 'magic', 'rare', 'unique'])

/** Тело POST /api/trade/search ({query, sort}) или сам query → query; иначе null. */
export function innerQuery(q: unknown): Json | null {
  if (!isObj(q)) return null
  if ('query' in q) return isObj(q.query) ? q.query : null
  return q
}

/** Группа фильтров запроса (`trade_filters`, `misc_filters`…): создать при нужде и включить. */
function filterGroup(query: Json, id: string): Json {
  const filters = isObj(query.filters) ? query.filters : (query.filters = {})
  const group = isObj(filters[id]) ? filters[id] : (filters[id] = {})
  delete group.disabled
  return isObj(group.filters) ? group.filters : (group.filters = {})
}

/** Продавец, ilvl и «все статусы» (лот виден, даже если продавец вышел из игры). */
function narrowToLot(query: Json, lot: TradeLot, account: string): Json {
  query.status = { option: 'any' }
  filterGroup(query, 'trade_filters').account = { input: account }
  if (validIlvl(lot.ilvl)) filterGroup(query, 'misc_filters').ilvl = { min: lot.ilvl, max: lot.ilvl }
  return query
}

/**
 * Запрос для лота без исходного поиска (live S6): база + продавец + ilvl + редкость. Имени нет: у редкого
 * оно случайное, и сайт отвечает «Unknown item name». null — нечем сузить (нет базы предмета).
 */
export function lotQuery(lot: TradeLot): Json | null {
  const type = clean(lot.typeLine)
  if (!type) return null
  const query: Json = { status: { option: 'any' }, type }
  if (lot.rarity && RARITIES.has(lot.rarity)) filterGroup(query, 'type_filters').rarity = { option: lot.rarity }
  const account = clean(lot.account)
  if (account) return narrowToLot(query, lot, account)
  if (validIlvl(lot.ilvl)) filterGroup(query, 'misc_filters').ilvl = { min: lot.ilvl, max: lot.ilvl }
  return query
}

/**
 * Исходный поиск окна цены, суженный до лота: тот же запрос (API его принял, лот в выдаче) + продавец,
 * его ilvl и статус «Все». null — без продавца не сузить (тогда открываем исходный поиск как есть).
 */
export function lotSearchQuery(search: unknown, lot: TradeLot): Json | null {
  const inner = innerQuery(search)
  const account = clean(lot.account)
  if (!inner || !account) return null
  let copy: Json
  try {
    copy = JSON.parse(JSON.stringify(inner)) as Json
  } catch {
    return null
  }
  return narrowToLot(copy, lot, account)
}

/** JSON запроса; null — не объект или длиннее предела. */
export function queryParam(query: unknown): string | null {
  if (!isObj(query)) return null
  let json: string
  try {
    json = JSON.stringify(query)
  } catch {
    return null
  }
  return json.length <= QUERY_JSON_MAX ? json : null
}

/**
 * Какой запрос открыть для цели трейд-окна: лот + исходный поиск → поиск, суженный до продавца;
 * только лот → lotQuery; только запрос → он сам. null — открыть адрес (url) или поиск по slug.
 */
export function targetQuery(target: Pick<TradeWindowTarget, 'query' | 'lot'>): Json | null {
  const lot = isObj(target.lot) ? (target.lot as unknown as TradeLot) : null
  const query = lot ? (target.query ? lotSearchQuery(target.query, lot) : lotQuery(lot)) : innerQuery(target.query)
  return query && queryParam(query) ? query : null
}

/** base64url без «=» — как у сайта (btoa есть и в Node, и в браузере). */
function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Состояние поиска для адреса …/search/<лига>/<состояние>: gzip + base64url от JSON запроса, как у сайта.
 * gzip — снаружи (в main — zlib.gzipSync): модуль общий и без зависимостей Node. null — запрос не годится.
 */
export function searchStateId(query: unknown, gzip: (json: string) => Uint8Array): string | null {
  const json = queryParam(innerQuery(query))
  if (!json) return null
  return base64url(gzip(json))
}
