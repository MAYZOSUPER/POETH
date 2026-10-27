// Команды чата для кнопок карточки сделки. Правило GGG: одно нажатие пользователя = одна
// команда в чат (её отправляет S1 через typeInChat). Здесь — только текст команды.
// Слэш-команды PoE не локализуются (одинаковы в RU и EN клиенте); обращение «@ник текст»
// работает в любом клиенте.

import type { Deal, DealLang, DealsConfig, ReplyKind } from '../types/deals'

export type DealAction =
  | 'invite'
  | 'trade'
  | 'kick'
  | 'whois'
  | 'hideout'
  | 'thanks'
  | 'sold'
  | 'still'
  | 'wait'

export const REPLY_KINDS: ReplyKind[] = ['thanks', 'sold', 'still', 'wait']

/** Кнопки карточки по направлению (макет: входящая / исходящая). */
export const CARD_ACTIONS: Record<'in' | 'out', DealAction[]> = {
  in: ['invite', 'trade', 'kick', 'thanks', 'sold', 'wait', 'whois'],
  out: ['still', 'hideout', 'thanks', 'whois']
}

/** Язык ответа: настройка или язык сообщения собеседника. */
export function replyLang(deal: Pick<Deal, 'lang'>, config: Pick<DealsConfig, 'replyLang'>): DealLang {
  return config.replyLang === 'auto' ? deal.lang : config.replyLang
}

/** Цена для подстановки: «5 chaos», у bulk — с количеством предмета не путается. */
function itemText(deal: Pick<Deal, 'item' | 'itemAmount'>): string {
  return deal.itemAmount !== undefined ? `${deal.itemAmount} ${deal.item}` : deal.item
}

/** Подставить {player} {item} {price} {league}; неизвестные {…} остаются как есть. */
export function renderTemplate(
  tpl: string,
  deal: Pick<Deal, 'player' | 'item' | 'itemAmount' | 'price' | 'league'>
): string {
  const vars: Record<string, string> = {
    player: deal.player,
    item: itemText(deal),
    price: deal.price,
    league: deal.league
  }
  return tpl
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Текст одной команды чата для кнопки. */
export function chatCommand(action: DealAction, deal: Deal, config: DealsConfig): string {
  const p = deal.player
  switch (action) {
    case 'invite':
      return `/invite ${p}`
    case 'trade':
      return `/tradewith ${p}`
    case 'kick':
      return `/kick ${p}`
    case 'whois':
      return `/whois ${p}`
    case 'hideout':
      return `/hideout ${p}`
    default: {
      const tpl = config.templates[replyLang(deal, config)][action]
      return `@${p} ${renderTemplate(tpl, deal)}`
    }
  }
}
