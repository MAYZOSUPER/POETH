// Импорт/экспорт папок в формате Better Trading (расширение браузера, MIT):
//   "3:" + base64(UTF-8 JSON { icn, tit, ver, trs: [{ tit, loc: "<версия трейда>:<search|exchange>:<slug>" }] })
// icn — иконка папки, tit — название, ver — игра ('1' PoE1, '2' PoE2), trs — поиски.
// Одна строка — одна папка; при импорте строк может быть несколько (через пробел/перевод строки).

import type { GameId, TradeSiteKind } from '../games'
import { isTradeSlug } from './slug'

export const BT_PREFIX = '3:'

export interface BtTrade {
  tit: string
  loc: string
}

export interface BtFolder {
  icn: string
  tit: string
  ver: string
  trs: BtTrade[]
}

export interface BtLocation {
  game: GameId
  type: TradeSiteKind
  slug: string
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function fromBase64(b64: string): string | null {
  try {
    const norm = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '')
    const padded = norm + '==='.slice((norm.length + 3) % 4)
    const bin = atob(padded)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

const verOf = (game: GameId): string => (game === 'poe2' ? '2' : '1')
const gameOf = (ver: unknown): GameId => (String(ver) === '2' ? 'poe2' : 'poe1')

/** "1:search:Lk9a2bQ" (или новый id «H4sI…» с - и _) → игра, тип, slug; null — не поиск сайта трейда. */
export function parseBtLocation(loc: unknown): BtLocation | null {
  if (typeof loc !== 'string') return null
  const m = /^([12]):(search|exchange):([^:]+)$/.exec(loc.trim())
  if (!m || !isTradeSlug(m[3])) return null
  return { game: gameOf(m[1]), type: m[2] as TradeSiteKind, slug: m[3] }
}

export function formatBtLocation(game: GameId, type: TradeSiteKind, slug: string): string {
  return `${verOf(game)}:${type}:${slug}`
}

/** Строка "3:…" → папка; null — не строка Better Trading (или битая). */
export function decodeBtFolder(str: unknown): BtFolder | null {
  if (typeof str !== 'string') return null
  const s = str.trim()
  if (!s.startsWith(BT_PREFIX)) return null
  const json = fromBase64(s.slice(BT_PREFIX.length))
  if (json === null) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!Array.isArray(r.trs)) return null
  const trs: BtTrade[] = r.trs
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .map((t) => ({ tit: typeof t.tit === 'string' ? t.tit : '', loc: typeof t.loc === 'string' ? t.loc : '' }))
  return {
    icn: typeof r.icn === 'string' ? r.icn : '',
    tit: typeof r.tit === 'string' ? r.tit : '',
    ver: typeof r.ver === 'string' || typeof r.ver === 'number' ? String(r.ver) : '1',
    trs
  }
}

export function encodeBtFolder(folder: BtFolder): string {
  return BT_PREFIX + toBase64(JSON.stringify({ icn: folder.icn, tit: folder.tit, ver: folder.ver, trs: folder.trs }))
}

/** Все строки "3:…" из вставленного текста (по одной на папку). */
export function splitBtStrings(text: unknown): string[] {
  if (typeof text !== 'string') return []
  return text.match(/3:[A-Za-z0-9+/=_-]+/g) ?? []
}

/** Папка избранного → строка Better Trading. */
export function exportBtFolder(
  folder: { title: string; game: GameId; icon?: string },
  searches: { title: string; type: TradeSiteKind; slug: string; game: GameId }[]
): string {
  return encodeBtFolder({
    icn: folder.icon ?? '',
    tit: folder.title,
    ver: verOf(folder.game),
    trs: searches.map((s) => ({ tit: s.title, loc: formatBtLocation(s.game, s.type, s.slug) }))
  })
}

export interface BtImportedFolder {
  title: string
  game: GameId
  icon?: string
  searches: { title: string; game: GameId; type: TradeSiteKind; slug: string }[]
}

/** Строка Better Trading → папка с поисками (поиски с неразборчивым loc пропускаются). */
export function importBtFolder(str: unknown): BtImportedFolder | null {
  const bt = decodeBtFolder(str)
  if (!bt) return null
  const game = gameOf(bt.ver)
  const searches = bt.trs.flatMap((t) => {
    const loc = parseBtLocation(t.loc)
    return loc ? [{ title: t.tit.trim() || loc.slug, game: loc.game, type: loc.type, slug: loc.slug }] : []
  })
  const out: BtImportedFolder = { title: bt.tit.trim() || 'Better Trading', game, searches }
  if (bt.icn) out.icon = bt.icn
  return out
}
