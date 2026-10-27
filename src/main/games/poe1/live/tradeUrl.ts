// Что пользователь вставил в «Добавить live-поиск»: ссылку на поиск сайта трейда PoE1,
// «лига/код» или просто код поиска. Чистый модуль (тесты — tests/live/tradeUrl.test.ts).

import { isSiteHost, type SiteHost } from '@shared/games'
import type { LiveAddError } from '@shared/types'

export type LiveInput =
  | { ok: true; slug: string; league?: string; host?: SiteHost }
  | { ok: false; error: Exclude<LiveAddError, 'duplicate'> }

const SLUG = /^[A-Za-z0-9_-]{3,64}$/

function decode(s: string): string | null {
  try {
    const v = decodeURIComponent(s).trim()
    return v && !v.includes('/') ? v : null
  } catch {
    return null
  }
}

/**
 * https://www.pathofexile.com/trade/search/Standard/kE6YLz5Tw(/live)?  → лига + код
 * Standard/kE6YLz5Tw · kE6YLz5Tw                                          → код (лига — из ссылки или текущая)
 */
export function parseLiveInput(raw: string): LiveInput {
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
    if (parts[0] === 'trade2') return { ok: false, error: 'poe2' }
    if (parts[0] !== 'trade') return { ok: false, error: 'bad-url' }
    if (parts[1] === 'exchange') return { ok: false, error: 'exchange' }
    if (parts[1] !== 'search' || parts.length < 4) return { ok: false, error: 'bad-url' }
    if (parts.length > 5 || (parts.length === 5 && parts[4] !== 'live')) return { ok: false, error: 'bad-url' }
    const league = decode(parts[2])
    const slug = decode(parts[3])
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
