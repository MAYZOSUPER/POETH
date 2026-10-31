// «Открыть в трейд-окне» для находки live PoE2 (S63): запрос trade2, суженный до лота продавца. Чистый модуль
// (тесты — tests/live/poe2Lot.test.ts). Трейд-окно (S5) превращает запрос в адрес …/trade2/search/poe2/<лига>/
// <состояние> (gzip + base64url, как у сайта) — сайт сам выполнит поиск. Покупку («Buy» у лота выкупа,
// «Travel to Hideout», «Direct whisper») игрок жмёт сам на странице сайта: мы не кликаем и не шлём запросов.
//
// Отличие от PoE1 (@shared/favorites/lot.ts): у trade2 уровень предмета — в type_filters, а не в misc_filters
// (как в запросах окна цены S47). Проверено 31.10.2026: API trade2 принимает такой запрос (200).
// Имени нет: у редкого оно случайное, сайт ответил бы «Unknown item name».

import type { LiveHit } from '@shared/types'

type Json = Record<string, unknown>

const RARITIES = new Set(['normal', 'magic', 'rare', 'unique'])

const clean = (s: string | undefined): string => (s ?? '').replace(/<<[^>]*>>/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)

/** Запрос лота: база + продавец + редкость + ilvl, статус «Все». null — нечем сузить (нет базы или продавца). */
export function poe2LotQuery(hit: Pick<LiveHit, 'account' | 'typeLine' | 'baseType' | 'rarity' | 'ilvl'>): Json | null {
  const type = clean(hit.baseType) || clean(hit.typeLine)
  const account = clean(hit.account)
  if (!type || !account) return null
  const typeFilters: Json = {}
  if (RARITIES.has(hit.rarity)) typeFilters.rarity = { option: hit.rarity }
  if (typeof hit.ilvl === 'number' && Number.isInteger(hit.ilvl) && hit.ilvl > 0 && hit.ilvl < 100) {
    typeFilters.ilvl = { min: hit.ilvl, max: hit.ilvl }
  }
  const filters: Json = { trade_filters: { filters: { account: { input: account } } } }
  if (Object.keys(typeFilters).length) filters.type_filters = { filters: typeFilters }
  return { status: { option: 'any' }, type, filters }
}
