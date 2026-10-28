// Кнопки у лота в окне цены (S4). Правила GGG: никаких whisper_token и /api/trade/whisper —
// «Написать» вставляет в чат готовый текст `listing.whisper` из обычного ответа fetch (то же, что сайт
// кладёт в «Copy»), одно сообщение на клик; «Открыть лот» — трейд-окно на этом лоте, где игрок сам жмёт
// «Travel to Hideout» / «Direct whisper» на странице сайта.

import type { Poe1Listing } from './results'

export interface LotActions {
  /** мгновенный выкуп у торговца (`fee` есть): значок «Выкуп» + комиссия в золоте */
  buyout: boolean
  /** «Написать» продавцу — только лоты «лично» с готовым whisper (мерчант выкупа офлайн) */
  write: boolean
  /** «Открыть лот» в трейд-окне — у всех лотов */
  open: true
  /** главная кнопка строки */
  primary: 'write' | 'open'
}

export function lotActions(l: Pick<Poe1Listing, 'fee' | 'whisper'>): LotActions {
  const buyout = l.fee != null
  const write = !buyout && !!l.whisper
  return { buyout, write, open: true, primary: write ? 'write' : 'open' }
}

/** Что уйдёт в typeInChat: текст whisper без изменений; send — настройка «Отправлять whisper сразу». */
export function whisperCommand(
  l: Pick<Poe1Listing, 'fee' | 'whisper'>,
  sendWhisper: boolean
): { text: string; send: boolean } | null {
  if (!lotActions(l).write || !l.whisper) return null
  return { text: l.whisper, send: sendWhisper }
}

/** Защита от двойного клика по «Написать» (как throttle CommandService в PoE Overlay). */
export const WRITE_THROTTLE_MS = 350

/**
 * Пропускает не чаще раза в `ms`; повторный вызов раньше — false (клик игнорируется, таймер
 * не продлевается). Одна защита на окно: двойной клик по разным лотам — тоже одно сообщение.
 */
export function createClickGuard(ms = WRITE_THROTTLE_MS, now: () => number = Date.now): () => boolean {
  let last = -Infinity
  return () => {
    const t = now()
    if (t - last < ms) return false
    last = t
    return true
  }
}
