// Типы прайс-чека: IPC-типы окна цены (S4; S47 — общие для PoE1 и PoE2: ответы trade и trade2 одинаковой формы).
// Сами фильтры и запрос — src/shared/poe1/pricecheck и src/shared/poe2/pricecheck.

export type {
  Poe1Listing,
  Poe1ListingKind,
  Poe1Price,
  Poe1SearchArgs,
  Poe1SearchResult,
  Poe1ExchangeArgs,
  Poe1ExchangeOffer,
  Poe1ExchangeResult
} from '../poe1/pricecheck/results'
export type { FallbackMatch as Poe1FallbackMatch } from '../poe1/pricecheck/fallback'
export type { CurrencyRate } from '../poe1/pricecheck/currency'
export type { FaustusPrice, Poe1FaustusArgs, Poe1FaustusResult } from '../poe1/pricecheck/faustus'

/** Настройки окна цены (Settings v2 `priceCheck`). */
export interface PriceCheckSettings {
  /** «Написать» сразу отправляет whisper (Enter); по умолчанию выкл — текст вставляется, Enter жмёт игрок */
  sendWhisper: boolean
}

/** Нераспознанная строка мода (ParsedItem.unknownModifiers) для фолбэка data/stats. */
export interface Poe1UnknownLine {
  text: string
  type: string
}
