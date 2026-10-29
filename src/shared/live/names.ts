import type { LiveHit, LiveRarity } from '../types/live'
import type { ItemNamespace, Poe1Data } from '../poe1/data'

// Имя находки live на языке клиента игры (S31). Сайт трейда отдаёт имена на своём языке (siteHost: www — EN,
// ru — RU); игрок с другим языком клиента видит в игре другое имя. Уник, база, камень, карта судьбы, валюта —
// переводим по данным APT (RU-данные: name — RU, refName — EN); имя редкого («Doom Coil»), магическое имя с
// аффиксами и всё, чего нет в данных, — как пришло. Язык строки — по кириллице: сайт и клиент — только EN/RU.
// Whisper в чат не трогаем: его текст даёт сайт. Чистые функции — годятся и для main, и для других окон.

type Lang = 'ru' | 'en'

const CYR = /[А-Яа-яЁё]/

/** Где искать базу (typeLine) по редкости находки. */
const TYPE_NS: Record<LiveRarity, readonly ItemNamespace[]> = {
  normal: ['ITEM'],
  magic: ['ITEM'],
  rare: ['ITEM'],
  unique: ['ITEM'],
  gem: ['GEM'],
  currency: ['ITEM'],
  divination: ['DIVINATION_CARD'],
  other: ['ITEM', 'GEM', 'DIVINATION_CARD', 'CAPTURED_BEAST']
}

/** Имя на языке клиента игры; ru — RU-данные APT (null — ещё не загружены: как пришло). */
export function nameInGame(text: string, namespaces: readonly ItemNamespace[], gameLang: Lang, ru: Poe1Data | null): string {
  if (!text || !ru) return text
  const isRu = CYR.test(text)
  if (isRu === (gameLang === 'ru')) return text
  for (const ns of namespaces) {
    const found = isRu ? ru.itemByTranslated(ns, text)?.[0]?.refName : ru.itemByRef(ns, text)?.[0]?.name
    if (found) return found
  }
  return text
}

/** Имя находки (имя уника/редкого + база) на языке клиента игры. */
export function hitNameIn(hit: LiveHit, gameLang: Lang, ru: Poe1Data | null): string {
  // имя есть у уника (переводится) и у редкого (случайное — как пришло)
  const name = hit.rarity === 'unique' ? nameInGame(hit.name, ['UNIQUE'], gameLang, ru) : hit.name
  const typeLine = nameInGame(hit.typeLine, TYPE_NS[hit.rarity] ?? TYPE_NS.other, gameLang, ru)
  return [name, typeLine].filter(Boolean).join(' ') || hit.itemId.slice(0, 8)
}

/** Язык имени находки не совпадает с языком клиента — нужен перевод. */
export function hitNeedsTranslation(hit: LiveHit, gameLang: Lang): boolean {
  const text = `${hit.name} ${hit.typeLine}`.trim()
  return !!text && CYR.test(text) !== (gameLang === 'ru')
}
