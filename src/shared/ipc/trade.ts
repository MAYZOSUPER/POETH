// IPC домена «трейд/прайс-чек» (S4; S47 — и PoE2): окно цены в оверлее — фильтры и запрос строит renderer, main
// ходит в сеть через шлюз S3 и подбирает моды из data/stats сайта. PoE2 — те же операции по trade2 (каналы poe2*).
// Своего POESESSID у PoE2 больше нет (S47): вход — общий, через официальную страницу (домен auth).

import type {
  Poe1SearchArgs,
  Poe1SearchResult,
  Poe1ExchangeArgs,
  Poe1ExchangeResult,
  Poe1UnknownLine,
  Poe1FallbackMatch,
  CurrencyRate,
  Poe1FaustusArgs,
  Poe1FaustusResult
} from '../types'

export const tradeChannels = {
  trade: {
    poe1Search: 'trade:pcSearch',
    poe1Exchange: 'trade:pcExchange',
    poe1MatchUnknown: 'trade:pcMatchUnknown',
    poe2Search: 'trade:pcTwoSearch',
    poe2Exchange: 'trade:pcTwoExchange',
    poe2MatchUnknown: 'trade:pcTwoMatchUnknown',
    copyText: 'trade:copyText',
    currencyRate: 'trade:currencyRate',
    poe1Faustus: 'trade:pcFaustus'
  }
} as const

export const tradeEvents = {} as const

export interface TradeIpcApi {
  trade: {
    /** PoE1: поиск (тело — createTradeRequest) + первые лоты (fetch), через шлюз с лимитами */
    poe1Search(args: Poe1SearchArgs): Promise<Poe1SearchResult>
    /** PoE1: bulk-обмен (тело — createBulkRequest) */
    poe1Exchange(args: Poe1ExchangeArgs): Promise<Poe1ExchangeResult>
    /** PoE1: моды, которых нет в данных APT, → статы сайта трейда (data/stats, кэш на диске) */
    poe1MatchUnknown(lang: 'en' | 'ru', lines: Poe1UnknownLine[]): Promise<Poe1FallbackMatch[]>
    /** PoE2: поиск trade2 (тело — src/shared/poe2/pricecheck) + первые лоты (fetch), тот же шлюз с лимитами */
    poe2Search(args: Poe1SearchArgs): Promise<Poe1SearchResult>
    /** PoE2: обмен trade2 (валюта и стакаемое) */
    poe2Exchange(args: Poe1ExchangeArgs): Promise<Poe1ExchangeResult>
    /** PoE2: моды, которых нет в данных EE2, → статы trade2 (data/stats, кэш на диске) */
    poe2MatchUnknown(lang: 'en' | 'ru', lines: Poe1UnknownLine[]): Promise<Poe1FallbackMatch[]>
    /** Положить текст в буфер обмена (кнопка «Скопировать whisper») */
    copyText(text: string): Promise<boolean>
    /** Курс chaos за divine в лиге (почасовой фид обмена GGG, сервис цен S11a); null — данных нет */
    currencyRate(league: string): Promise<CurrencyRate | null>
    /** S24: цена у Фаустуса (почасовой фид обмена GGG) по английским именам; запросов к сайту трейда нет */
    poe1Faustus(args: Poe1FaustusArgs): Promise<Poe1FaustusResult>
  }
}
