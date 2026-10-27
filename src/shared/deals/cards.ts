// Карточки сделок поверх игры (S8, фаза 2): какие сделки показывать, какая карточка
// «верхняя» (для хоткеев) и что меняет каждая кнопка. Чистые функции — их используют main
// (действия, хоткеи) и оверлей (отрисовка), тесты.
//
// Правило GGG: кнопка/хоткей = одна команда в чат. Здесь никаких таймеров и автоответов —
// только «что показать» и «что поменять в истории после нажатия игрока».

import type { Deal, DealCardAction, DealDir, DealStatus, DealsConfig } from '../types/deals'

/** Карточка висит не дольше этого с последнего события (дальше — только история). */
export const CARD_TTL_MS = 30 * 60_000
/** Сколько карточек показывать сразу (остальные — «ещё N»). */
export const MAX_CARDS = 4
/** Примерная высота карточки в простом режиме, CSS px (две строки кнопок + подсветка). */
export const CARD_HEIGHT_PX = 240

/** Сколько карточек влезает по высоте окна игры (не меньше одной, не больше MAX_CARDS). */
export function cardsFit(viewportHeight: number): number {
  return Math.max(1, Math.min(MAX_CARDS, Math.floor((viewportHeight - 40) / CARD_HEIGHT_PX)))
}

const OPEN: DealStatus[] = ['new', 'invited']
const DONE: DealStatus[] = ['traded', 'sold']

/**
 * Сделки для карточек, свежие сверху: открытые (new/invited) не старше CARD_TTL_MS, не
 * закрытые игроком; завершённые — только если «скрывать после Продано» выключено;
 * исходящие — если включено «показывать исходящие». Примеры и игнор — никогда.
 */
export function activeCards(deals: readonly Deal[], config: Pick<DealsConfig, 'showOutgoing' | 'hideAfterSold'>, now: number): Deal[] {
  return deals
    .filter((d) => {
      if (d.demo || d.cardHidden || d.status === 'ignored') return false
      if (d.dir === 'out' && !config.showOutgoing) return false
      if (now - Math.max(d.ts, d.updatedAt ?? 0) > CARD_TTL_MS) return false
      if (OPEN.includes(d.status)) return true
      return DONE.includes(d.status) && !config.hideAfterSold
    })
    .sort((a, b) => b.ts - a.ts)
}

/** Верхняя карточка: свежая открытая (по направлению, если задано). */
export function topCard(cards: readonly Deal[], dir?: DealDir): Deal | null {
  return cards.find((d) => OPEN.includes(d.status) && (!dir || d.dir === dir)) ?? null
}

/** Какие кнопки есть у карточки (порядок — как в макете). */
export function cardActions(deal: Pick<Deal, 'dir' | 'blacklist'>): DealCardAction[] {
  if (deal.dir === 'out') return ['still', 'hideout', 'thanks', 'whois']
  if (deal.blacklist) return ['invite', 'whois']
  return ['invite', 'trade', 'kick', 'thanks', 'sold', 'wait', 'whois']
}

export interface CardEffect {
  status?: DealStatus
  /** закрыть карточку (сделка остаётся в истории) */
  hide?: boolean
}

/**
 * Что меняется после успешной команды: «Пригласить»/«Обмен» → в группе; «Спасибо» → сделка
 * состоялась; «Продано» у входящей → продано (предмет в игнор); «Кик» закрывает карточку;
 * после «Спасибо»/«Продано» карточка закрывается, если так настроено. Остальное — только чат.
 */
export function cardEffect(
  action: DealCardAction,
  deal: Pick<Deal, 'dir' | 'status'>,
  config: Pick<DealsConfig, 'hideAfterSold'>
): CardEffect {
  const open = OPEN.includes(deal.status)
  switch (action) {
    case 'invite':
    case 'trade':
      return deal.status === 'new' ? { status: 'invited' } : {}
    case 'kick':
      return { hide: true }
    case 'thanks':
      return { ...(open ? { status: 'traded' as const } : {}), ...(config.hideAfterSold ? { hide: true } : {}) }
    case 'sold':
      return deal.dir === 'in' ? { status: 'sold', ...(config.hideAfterSold ? { hide: true } : {}) } : {}
    default:
      return {}
  }
}

/** «0 с», «45 с», «3 мин», «1 ч» — сколько прошло (для шапки карточки). */
export function ageParts(ts: number, now: number): { n: number; unit: 's' | 'm' | 'h' } {
  const s = Math.max(0, Math.floor((now - ts) / 1000))
  if (s < 60) return { n: s, unit: 's' }
  const m = Math.floor(s / 60)
  return m < 60 ? { n: m, unit: 'm' } : { n: Math.floor(m / 60), unit: 'h' }
}
