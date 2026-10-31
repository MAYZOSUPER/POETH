// Ответ /api/trade/fetch → находка live (чистый модуль; тесты — tests/live/hits.test.ts).
// Проверено на живом API (28.10.2026): item.extended.text — base64 текста предмета (\r\n),
// у лота торговца есть listing.fee (золото) и нет listing.whisper.
// PoE2 (/api/trade2/fetch, проверено анонимно 31.10.2026, S63): item.extended — только hashes (текста
// предмета нет); моды — объекты {description, hash, mods} с разметкой «[Ключ|Текст]»; у лота выкупа
// (Merchant's Tab) — listing.fee в золоте, account.online = null и нет whisper; whisper — на языке
// аккаунта продавца (account.language), шаблоны EN/RU — те же, что у PoE1.

import type { GameId } from '@shared/games'
import type { LiveHit, LiveRarity, LiveSellerState } from '@shared/types'

const FRAME: Record<number, LiveRarity> = {
  0: 'normal',
  1: 'magic',
  2: 'rare',
  3: 'unique',
  4: 'gem',
  5: 'currency',
  6: 'divination',
  9: 'unique' // реликвия
}

const MAX_MODS = 6
const MAX_TEXT = 20_000

export interface HitContext {
  searchId: string
  searchTitle: string
  league: string
  siteUrl: string
  now: number
  /** игра поиска; у PoE2 свой формат модов (без поля — как у PoE1) */
  game?: GameId
}

function str(v: unknown, max = 300): string | undefined {
  return typeof v === 'string' && v ? v.slice(0, max) : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** «+25% to [Resistances|Cold Resistance]» → «+25% to Cold Resistance» (разметка ссылок trade2). */
export function plainModText(s: string): string {
  return s.replace(/\[([^[\]|]*)\|([^[\]]*)\]/g, '$2').replace(/\[([^[\]|]*)\]/g, '$1')
}

/** Моды PoE2: объекты {description} (или строки); разметка ссылок — в обычный текст. */
function poe2Mods(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  const out: string[] = []
  for (const m of list) {
    const d = typeof m === 'string' ? m : m && typeof m === 'object' ? (m as { description?: unknown }).description : undefined
    if (typeof d === 'string' && d) out.push(plainModText(d).slice(0, 300))
    if (out.length >= MAX_MODS) break
  }
  return out
}

/** base64 → текст предмета; мусор → undefined. */
export function decodeItemText(b64: unknown): string | undefined {
  if (typeof b64 !== 'string' || !b64 || b64.length > MAX_TEXT * 2) return undefined
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) return undefined
  const text = Buffer.from(b64, 'base64').toString('utf8')
  // первая строка текста предмета — «Item Class:» / «Класс предмета:»
  return /^(Item Class|Класс предмета):/.test(text) ? text.slice(0, MAX_TEXT) : undefined
}

function seller(online: unknown): LiveSellerState {
  if (!online || typeof online !== 'object') return 'offline'
  return (online as { status?: unknown }).status === 'afk' ? 'afk' : 'online'
}

interface FetchEntry {
  id?: unknown
  listing?: {
    indexed?: unknown
    whisper?: unknown
    fee?: unknown
    price?: { amount?: unknown; currency?: unknown }
    account?: { name?: unknown; online?: unknown }
  }
  item?: {
    name?: unknown
    typeLine?: unknown
    baseType?: unknown
    frameType?: unknown
    ilvl?: unknown
    corrupted?: unknown
    explicitMods?: unknown
    extended?: { text?: unknown }
  }
}

/** Одна запись result[] ответа fetch → находка (null — запись пустая/битая). */
export function toLiveHit(raw: unknown, ctx: HitContext): LiveHit | null {
  const e = raw as FetchEntry | null
  const itemId = str(e?.id, 128)
  if (!e || !itemId || !e.item) return null
  const listing = e.listing ?? {}
  const item = e.item
  const amount = num(listing.price?.amount)
  const currency = str(listing.price?.currency, 40)
  const whisper = str(listing.whisper, 500)
  const fee = num(listing.fee)
  const mods =
    ctx.game === 'poe2'
      ? poe2Mods(item.explicitMods)
      : Array.isArray(item.explicitMods)
        ? item.explicitMods.filter((m): m is string => typeof m === 'string').slice(0, MAX_MODS)
        : []
  const frame = num(item.frameType)
  const hit: LiveHit = {
    key: `${ctx.searchId}:${itemId}`,
    itemId,
    searchId: ctx.searchId,
    searchTitle: ctx.searchTitle,
    league: ctx.league,
    at: ctx.now,
    name: str(item.name, 120) ?? '',
    typeLine: str(item.typeLine, 120) ?? '',
    rarity: frame !== undefined ? (FRAME[frame] ?? 'other') : 'other',
    mods,
    merchant: !whisper,
    siteUrl: ctx.siteUrl
  }
  const ilvl = num(item.ilvl)
  if (ilvl !== undefined) hit.ilvl = ilvl
  const baseType = str(item.baseType, 120)
  if (baseType) hit.baseType = baseType
  if (item.corrupted === true) hit.corrupted = true
  const text = decodeItemText(item.extended?.text)
  if (text) hit.text = text
  if (amount !== undefined && currency) hit.price = { amount, currency }
  const account = str(listing.account?.name, 80)
  if (account) hit.account = account
  if (whisper) {
    hit.whisper = whisper
    hit.seller = seller(listing.account?.online)
  }
  if (fee !== undefined) hit.fee = fee
  if (ctx.game === 'poe2') hit.game = 'poe2'
  return hit
}
