// Разбор и сборка адресов сайта трейда pathofexile.com (для «Сохранить текущий поиск»,
// открытия избранного и импорта Better Trading).
//   PoE1: https://<host>/trade/search/<league>/<slug>      и  /trade/exchange/<league>/<slug>
//         (+ «/live», если на странице включён live search; slug — и старый ключ, и сжатое состояние «H4sI…»)
//   PoE2: https://<host>/trade2/search/poe2/<league>/<slug> и  /trade2/exchange/poe2/<league>/<slug>
// Хост — pathofexile.com или его поддомен (www, ru, …). Лига в URL закодирована («Hardcore%20Mercenaries»).

import { getGameDef, type GameId, type SiteHost, type TradeSiteKind, siteUrl } from '../games'
import type { TradeUrlInfo } from '../types/fav'
import { isTradeSlug } from './slug'

function isPoeHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  return h === 'pathofexile.com' || h.endsWith('.pathofexile.com')
}

function decode(seg: string): string | null {
  try {
    return decodeURIComponent(seg)
  } catch {
    return null
  }
}

/** URL сайта трейда → игра, тип, лига, slug; null — это не страница поиска/обмена. */
export function parseTradeUrl(url: unknown): TradeUrlInfo | null {
  if (typeof url !== 'string') return null
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:' || !isPoeHost(u.hostname)) return null
  const parts = u.pathname.split('/').filter(Boolean)
  let game: GameId
  if (parts[0] === 'trade') game = 'poe1'
  else if (parts[0] === 'trade2') game = 'poe2'
  else return null
  const type = parts[1]
  if (type !== 'search' && type !== 'exchange') return null
  let i = 2
  const realm = getGameDef(game).siteRealm
  if (realm) {
    if (parts[i] !== realm) return null
    i++
  }
  const league = parts[i] ? decode(parts[i]) : null
  if (!league) return null
  const slugSeg = parts[i + 1]
  // …/<slug>/live — тот же поиск с включённым live search на странице
  const tail = parts.slice(i + 2)
  if (tail.length > 1 || (tail.length === 1 && (tail[0] !== 'live' || slugSeg === undefined))) return null
  let slug: string | null = null
  if (slugSeg !== undefined) {
    if (!isTradeSlug(slugSeg)) return null
    slug = slugSeg
  }
  return { host: u.hostname.toLowerCase(), game, type, league, slug }
}

/**
 * Страница поиска, которую сайт откроет сразу с результатами запроса: …/search/<лига>?q=<JSON>.
 * json — уже сериализованный запрос (см. queryParam в ./lot).
 */
export function buildQueryUrl(host: SiteHost, game: GameId, type: TradeSiteKind, league: string, json: string): string {
  return `${buildTradeUrl(host, game, type, league)}?q=${encodeURIComponent(json)}`
}

/** Адрес поиска на сайте (обратная операция). */
export function buildTradeUrl(
  host: SiteHost,
  game: GameId,
  type: TradeSiteKind,
  league: string,
  slug?: string | null
): string {
  return siteUrl(getGameDef(game), host, league, slug ?? undefined, type)
}
