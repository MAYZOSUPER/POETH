// Ответ /api/trade/fetch → находка live (чистый модуль; тесты — tests/live/hits.test.ts).
// Проверено на живом API (28.10.2026): item.extended.text — base64 текста предмета (\r\n),
// у лота торговца есть listing.fee (золото) и нет listing.whisper.

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
}

function str(v: unknown, max = 300): string | undefined {
  return typeof v === 'string' && v ? v.slice(0, max) : undefined
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
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
  const mods = Array.isArray(item.explicitMods)
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
  return hit
}
