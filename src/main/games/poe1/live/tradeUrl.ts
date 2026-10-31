// Что пользователь вставил в «Добавить live-поиск»: ссылку на поиск сайта трейда, «лига/код» или
// просто код поиска. Чистый модуль (тесты — tests/live/tradeUrl.test.ts).
//   PoE1: …/trade/search/<лига>/<код>(/live)
//   PoE2: …/trade2/search/poe2/<лига>/<код>(/live)   (S63; адрес live — games.ts liveUrl)
// Ссылка другой игры: в режиме PoE1 — ошибка 'poe2' (переключите игру), в режиме PoE2 — 'bad-url'.

import { getGameDef, isSiteHost, type GameId, type SiteHost } from '@shared/games'
import { SLUG_MAX } from '@shared/favorites/slug'
import type { LiveAddError } from '@shared/types'

export type LiveInput =
  | { ok: true; slug: string; league?: string; host?: SiteHost }
  | { ok: false; error: Exclude<LiveAddError, 'duplicate'> }

// короткие коды (kE6YLz5Tw) и длинные id вида H4sIAAAA… — само состояние поиска (gzip + base64url), длина растёт
// с запросом: окно цены PoE 1 — до ~480, PoE 2 — до ~550 символов по фикстурам. Предел — общий с избранным (S63).
const SLUG = new RegExp(`^[A-Za-z0-9_-]{3,${SLUG_MAX}}$`)

function decode(s: string): string | null {
  try {
    const v = decodeURIComponent(s).trim()
    return v && !v.includes('/') ? v : null
  } catch {
    return null
  }
}

/**
 * https://www.pathofexile.com/trade/search/Standard/kE6YLz5Tw(/live)?          → лига + код (PoE1)
 * https://www.pathofexile.com/trade2/search/poe2/Standard/kE6YLz5Tw(/live)?    → лига + код (PoE2)
 * Standard/kE6YLz5Tw · kE6YLz5Tw                                                → код (лига — из ссылки или текущая)
 */
export function parseLiveInput(raw: string, game: GameId = 'poe1'): LiveInput {
  const input = raw.trim()
  if (!input) return { ok: false, error: 'bad-url' }

  if (/^https?:\/\//i.test(input) || /^(www\.|ru\.)?pathofexile\.com\//i.test(input)) {
    let u: URL
    try {
      u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`)
    } catch {
      return { ok: false, error: 'bad-url' }
    }
    const hostname = u.hostname.toLowerCase()
    if (hostname !== 'pathofexile.com' && !isSiteHost(hostname)) return { ok: false, error: 'bad-url' }
    const parts = u.pathname.split('/').filter(Boolean)
    const def = getGameDef(game)
    if (parts[0] !== def.tradeSeg) {
      // поиск другой игры: PoE1 подсказывает «это PoE 2», в PoE2 ссылка PoE1 — просто не та ссылка
      if (game === 'poe1' && parts[0] === 'trade2') return { ok: false, error: 'poe2' }
      return { ok: false, error: 'bad-url' }
    }
    if (parts[1] === 'exchange') return { ok: false, error: 'exchange' }
    if (parts[1] !== 'search') return { ok: false, error: 'bad-url' }
    // PoE2: после search — realm (poe2)
    let i = 2
    if (def.siteRealm) {
      if (parts[i] !== def.siteRealm) return { ok: false, error: 'bad-url' }
      i++
    }
    const rest = parts.slice(i)
    if (rest.length < 2) return { ok: false, error: 'bad-url' }
    if (rest.length > 3 || (rest.length === 3 && rest[2] !== 'live')) return { ok: false, error: 'bad-url' }
    const league = decode(rest[0])
    const slug = decode(rest[1])
    if (!league || !slug || !SLUG.test(slug)) return { ok: false, error: 'bad-url' }
    return { ok: true, league, slug, ...(isSiteHost(hostname) ? { host: hostname } : {}) }
  }

  const parts = input.split('/').filter(Boolean)
  if (parts.length === 1 && SLUG.test(parts[0])) return { ok: true, slug: parts[0] }
  if (parts.length === 2) {
    const league = decode(parts[0])
    if (league && SLUG.test(parts[1])) return { ok: true, league, slug: parts[1] }
  }
  return { ok: false, error: 'bad-url' }
}
