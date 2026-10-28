// Форматирование сделок для вкладки «Сделки» и карточек оверлея (без React и сторов —
// подключается на обеих страницах).

import type { BlacklistHit, Deal, UiLang } from '@shared/types'
import { blacklistReasonKey } from '@shared/deals/blacklist'
import { translate } from '../../i18n'

const pad = (n: number): string => String(n).padStart(2, '0')

/** «21:40» сегодня, иначе «28.10 21:40». */
export function formatTime(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const n = new Date(now)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  return sameDay ? hm : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${hm}`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Тег статуса: класс ui-tag и текст. Чёрный список важнее статуса. */
export function statusTag(d: Deal, lang: UiLang): { cls: string; text: string } {
  const t = (k: string): string => translate(lang, k)
  if (d.blacklist && d.status === 'new') return { cls: 'ui-tag--bad', text: t('deals.status.black') }
  switch (d.status) {
    case 'new':
      return { cls: 'ui-tag--warn', text: t('deals.status.new') }
    case 'invited':
      return { cls: 'ui-tag--person', text: t('deals.status.invited') }
    case 'traded':
      return { cls: 'ui-tag--good', text: t(d.dir === 'in' ? 'deals.status.traded.in' : 'deals.status.traded.out') }
    case 'sold':
      return { cls: 'ui-tag--good', text: t('deals.status.sold') }
    default:
      return { cls: '', text: t('deals.status.ignored') }
  }
}

/** Причина из списка PoE Hub на языке интерфейса (неизвестная — как в списке). */
export function reasonText(reason: string, lang: UiLang): string {
  const key = blacklistReasonKey(reason)
  return key ? translate(lang, `deals.bl.reason.${key}`) : reason
}

/** «⚠ в чёрном списке PoE Hub: <причина>» (или «возможно…» при совпадении по персонажу). */
export function blacklistWarning(hit: BlacklistHit, lang: UiLang): string {
  const reason = reasonText(hit.reason, lang)
  return hit.matchedBy === 'account'
    ? translate(lang, 'deals.bl.hit', { reason })
    : translate(lang, 'deals.bl.hitMaybe', { reason, account: hit.account })
}
