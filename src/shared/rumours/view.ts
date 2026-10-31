// Слухи: что показать в окне (S65; чистый модуль, tests/rumours/view.test.ts) — строка слуха для компаньона и для
// короткого вида поверх игры. Тексты интерфейса — ключи словаря rumours, имена из игры — на языке клиента.

import type { GameId } from '../games'
import { islandName, rumourText, type RumourLang } from './match'
import { itemRefKey, mainItem, type RumourCategory, type RumourLevel, type RumourRecord, type RumourReward } from './schema'
import { shownPrice, type RumourPriceBook, type ShownPrice } from './prices'
import type { RumourMark } from './marks'

/** У каких игр есть «Слухи журнала» (острова экспедиции на атласе — только PoE 2). */
export function rumoursOn(game: GameId): boolean {
  return game === 'poe2'
}

/** Ссылка «Мнение сообщества»: только ссылка, оценки оттуда не копируем (нет лицензии). */
export const COMMUNITY_URL = 'https://poe.gnejs.app/poe2/expedition/rumours'

export interface RewardView {
  /** имя предмета на языке клиента; null — награда без предмета (ключ словаря kind) */
  name: string | null
  kind: string | null
  price: ShownPrice | null
}

export interface RumourRowView {
  id: string
  text: string
  island: string
  category: RumourCategory
  /** главная награда (первая), остальные — словами */
  main: RewardView | null
  more: RewardView[]
  /** цена главной награды-предмета (если главная — не предмет, цена первой награды-предмета) */
  price: ShownPrice | null
  priceItem: string | null
  difficulty: RumourLevel | null
  risks: RumourRecord['risks']
  bosses: string[]
  tier: RumourLevel | null
  ownTier: RumourLevel | null
  skip: boolean
  ownNote: string | null
  note: string | null
  checked: boolean
}

function rewardView(rw: RumourReward, lang: RumourLang, prices: RumourPriceBook | null): RewardView {
  if ('kind' in rw) return { name: null, kind: rw.kind, price: null }
  const q = prices?.quotes[itemRefKey(rw.item)]
  return {
    name: (lang === 'ru' ? rw.item.name.ru : rw.item.name.en) ?? rw.item.name.en,
    kind: null,
    price: prices ? shownPrice(q, prices.rates) : null
  }
}

/** Строка слуха для окна: имена на языке клиента, наша строка — на языке интерфейса. */
export function rumourRow(
  r: RumourRecord,
  gameLang: RumourLang,
  uiLang: RumourLang,
  mark: RumourMark | undefined,
  prices: RumourPriceBook | null
): RumourRowView {
  const rewards = r.rewards.map((rw) => rewardView(rw, gameLang, prices))
  const it = mainItem(r)
  const itemView = it ? rewardView({ item: it }, gameLang, prices) : null
  return {
    id: r.id,
    text: rumourText(r, gameLang),
    island: islandName(r, gameLang),
    category: r.category,
    main: rewards[0] ?? null,
    more: rewards.slice(1),
    price: itemView?.price ?? null,
    priceItem: itemView?.name ?? null,
    difficulty: r.difficulty,
    risks: r.risks,
    bosses: r.bosses.map((b) => (gameLang === 'ru' ? b.ru : b.en) ?? b.en),
    tier: r.tier,
    ownTier: mark?.tier ?? null,
    skip: !!mark?.skip,
    ownNote: mark?.note ?? null,
    note: (uiLang === 'ru' ? r.note?.ru : r.note?.en) ?? r.note?.en ?? r.note?.ru ?? null,
    checked: r.checked !== null
  }
}

/** Цена словами без валюты: 2,5 / 2.5 / 40 — по языку интерфейса. */
export function priceNumber(p: ShownPrice, lang: RumourLang): string {
  return p.value.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1 })
}
