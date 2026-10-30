// Глубокие ссылки на сайты вкладок трейд-окна (S43): из окна цены Ctrl+D и вкладки «Билд» — сразу на страницу
// предмета, камня или ноды. Чистый модуль. Имена в адресах — английские (`refName` данных APT, `en` данных билда);
// язык страницы poedb — по языку клиента игры (`/ru/` или `/us/`), вики и poe.ninja — только EN.
// Форматы проверены 30.10.2026:
//  - poedb.tw/<us|ru>/<Имя_Через_Подчёркивания> без апострофов: «Atziri's Disfavour» → Atziris_Disfavour,
//    «Seven-League Step» → Seven-League_Step, «Mjölner» → Mj%C3%B6lner; так же у камней и нод дерева;
//  - www.poewiki.net/wiki/<Имя_Через_Подчёркивания> (апостроф остаётся);
//  - poe.ninja/poe1/economy/<лига>/<раздел>?name=<имя> — список раздела с фильтром по имени (страница предмета
//    poe.ninja есть не у всех вариантов, а список с фильтром открывается всегда). Лига: «Allflame» → allflame,
//    «Hardcore Allflame» → allflamehc, Standard / Hardcore → standard / hardcore.

import { ItemCategory, WEAPON } from './poe1/parser/meta'
import type { ParsedItem } from './poe1/parser/ParsedItem'
import type { GameLang } from './types/settings'
import { poedbLang } from './sites'

export type LinkSite = 'poedb' | 'wiki' | 'ninja'

/** Раздел poe.ninja (PoE 1). */
export type NinjaSection =
  | 'unique-weapons'
  | 'unique-armours'
  | 'unique-accessories'
  | 'unique-flasks'
  | 'unique-jewels'
  | 'unique-maps'
  | 'unique-relics'
  | 'unique-tinctures'
  | 'skill-gems'
  | 'divination-cards'
  | 'currency'
  | 'base-types'
  | 'maps'

/** Что открыть: английское имя страницы и раздел poe.ninja (null — на poe.ninja такого нет). */
export interface LinkRef {
  name: string
  ninja: NinjaSection | null
  /** имя для фильтра poe.ninja, если оно не name */
  ninjaName?: string
}

const NAME_MAX = 120

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
}

/** Имя страницы poedb: пробелы → `_`, без апострофов (прямой и типографский). */
export function poedbSlug(name: string): string {
  return encodeURIComponent(cleanName(name).replace(/['’]/g, '').replace(/ /g, '_'))
}

export function poedbUrl(name: string, lang: GameLang): string | null {
  const n = cleanName(name)
  return n ? `https://poedb.tw/${poedbLang(lang)}/${poedbSlug(n)}` : null
}

/** Страница PoE Wiki (EN): пробелы → `_`, остальное — как в имени. */
export function wikiUrl(name: string): string | null {
  const n = cleanName(name)
  return n ? `https://www.poewiki.net/wiki/${encodeURIComponent(n.replace(/ /g, '_')).replace(/%27/g, "'")}` : null
}

/** Лига в адресе poe.ninja: Standard → standard, «Hardcore X» → xhc, SSF — как без SSF (у poe.ninja SSF нет). */
export function ninjaLeague(league: string): string {
  const words = league
    .replace(/\(.*?\)/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const hc = words.some((w) => /^(hardcore|hc)$/i.test(w))
  const rest = words.filter((w) => !/^(hardcore|hc|ssf|solo|self-found)$/i.test(w))
  const base = rest.join('').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (!base || base === 'standard') return hc ? 'hardcore' : 'standard'
  return hc ? `${base}hc` : base
}

export function ninjaUrl(ref: LinkRef, league: string): string | null {
  if (!ref.ninja) return null
  const name = cleanName(ref.ninjaName ?? ref.name)
  if (!name) return null
  return `https://poe.ninja/poe1/economy/${ninjaLeague(league)}/${ref.ninja}?name=${encodeURIComponent(name)}`
}

const ARMOUR = new Set([ItemCategory.Helmet, ItemCategory.BodyArmour, ItemCategory.Gloves, ItemCategory.Boots, ItemCategory.Shield, ItemCategory.Quiver])
const ACCESSORY = new Set([ItemCategory.Amulet, ItemCategory.Belt, ItemCategory.Ring])
const JEWEL = new Set([ItemCategory.Jewel, ItemCategory.AbyssJewel, ItemCategory.ClusterJewel])
/** у обычных/редких предметов этих классов на poe.ninja есть «Base Types» */
const GEAR = new Set<ItemCategory>([...ARMOUR, ...ACCESSORY, ItemCategory.Jewel, ItemCategory.AbyssJewel, ...WEAPON])

function uniqueSection(cat: ItemCategory | undefined): NinjaSection | null {
  if (!cat) return null
  if (WEAPON.has(cat)) return 'unique-weapons'
  if (ARMOUR.has(cat)) return 'unique-armours'
  if (ACCESSORY.has(cat)) return 'unique-accessories'
  if (cat === ItemCategory.Flask) return 'unique-flasks'
  if (JEWEL.has(cat)) return 'unique-jewels'
  if (cat === ItemCategory.Map) return 'unique-maps'
  if (cat === ItemCategory.SanctumRelic) return 'unique-relics'
  if (cat === ItemCategory.Tincture) return 'unique-tinctures'
  return null
}

/** Предмет окна цены → страница: уник — по имени уника, камень и карта гадания — по имени, прочее — по базе. */
export function linkRefOfItem(item: ParsedItem | null): LinkRef | null {
  if (!item?.info?.refName) return null
  const info = item.info
  const name = info.refName
  switch (info.namespace) {
    case 'UNIQUE':
      return { name, ninja: uniqueSection(item.category) }
    case 'GEM':
      return { name, ninja: 'skill-gems' }
    case 'DIVINATION_CARD':
      return { name, ninja: 'divination-cards' }
    case 'ITEM': {
      const cat = item.category
      if (cat === ItemCategory.Currency) return { name, ninja: 'currency' }
      if (cat === ItemCategory.Map) return { name, ninja: 'maps' }
      return { name, ninja: cat && GEAR.has(cat) ? 'base-types' : null }
    }
    default:
      return null
  }
}

export interface LinkContext {
  /** язык клиента игры (страница poedb) */
  gameLang: GameLang
  /** лига трейда (poe.ninja) */
  league: string
}

/** Адрес страницы на сайте; null — у сайта такой страницы нет (например, ноды на poe.ninja). */
export function deepLinkUrl(site: LinkSite, ref: LinkRef, ctx: LinkContext): string | null {
  if (site === 'poedb') return poedbUrl(ref.name, ctx.gameLang)
  if (site === 'wiki') return wikiUrl(ref.name)
  return ninjaUrl(ref, ctx.league)
}
