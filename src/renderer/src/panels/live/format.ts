import type { LiveHit, LiveRarity, LiveSearchView } from '@shared/types'

// Общее форматирование live для вкладки компаньона и тостов оверлея (S6).

type T = (key: string, params?: Record<string, string | number>) => string

export function ago(t: T, at: number, now: number): string {
  const min = Math.floor((now - at) / 60_000)
  if (min < 1) return t('live.ago.now')
  if (min < 60) return t('live.ago.min', { n: min })
  return t('live.ago.hour', { n: Math.floor(min / 60) })
}

/** 42 000 мс → «0:42». */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Число цены лота: «0,5» в RU, «0.5» в EN (валюту рисует общий <Currency>, S18). */
export function priceAmount(amount: number, lang: string): string {
  const n = String(Math.round(amount * 100) / 100)
  return lang === 'ru' ? n.replace('.', ',') : n
}

const RARITY_VAR: Record<LiveRarity, string> = {
  normal: 'var(--rarity-normal)',
  magic: 'var(--rarity-magic)',
  rare: 'var(--rarity-rare)',
  unique: 'var(--rarity-unique)',
  gem: 'var(--rarity-gem)',
  currency: 'var(--rarity-currency)',
  divination: 'var(--rarity-normal)',
  other: 'var(--fg)'
}

export function rarityColor(r: LiveRarity): string {
  return RARITY_VAR[r]
}

export function hitName(hit: LiveHit): string {
  return [hit.name, hit.typeLine].filter(Boolean).join(' ') || hit.itemId.slice(0, 8)
}

/** Подпись состояния поиска + уровень (ok / warn / bad / off) для точки. */
export function searchStatus(
  t: T,
  s: LiveSearchView,
  now: number,
  masterOn: boolean
): { text: string; level: 'ok' | 'warn' | 'bad' | 'off' } {
  if (!masterOn && s.enabled) return { text: t('live.st.masterOff'), level: 'off' }
  const left = s.retryAt ? s.retryAt - now : 0
  switch (s.state) {
    case 'idle':
      return { text: t('live.st.idle'), level: 'off' }
    case 'connecting':
      return { text: t('live.st.connecting'), level: 'warn' }
    case 'open':
      return s.lastHitAt
        ? { text: t('live.st.openHits', { ago: ago(t, s.lastHitAt, now), n: s.hits }), level: 'ok' }
        : { text: t('live.st.open'), level: 'ok' }
    case 'backoff':
      return {
        text: t(s.reason === 'blocked' ? 'live.st.blocked' : 'live.st.backoff', { s: Math.max(1, Math.ceil(left / 1000)) }),
        level: 'warn'
      }
    case 'ratelimited':
      return { text: t('live.st.ratelimited', { t: countdown(left) }), level: 'warn' }
    case 'auth':
      return { text: t('live.st.auth'), level: 'bad' }
    case 'invalid':
      return { text: t('live.st.invalid'), level: 'bad' }
  }
}
