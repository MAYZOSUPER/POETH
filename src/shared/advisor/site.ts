// Точка входа бандла для сайта (S17): site/strategies/strategy-core.js собирает tools/advisor/build-site.mjs —
// тот же код POETH1, тот же строгий валидатор и тот же расчёт, что в приложении (никаких копий).
// На странице — глобальный объект POETHStrategy. Распаковка — DecompressionStream браузера с пределом размера.

import type { AdvisorMapEstimate, AdvisorStrategy } from '../types/advisor'
import { buildPriceIndex, type PriceEntry } from '../wealth/prices'
import { CODE_PREFIX, decodeStrategyCode, extractCode, strategyFingerprint, type DecodeResult } from './codec'
import { inflateBrowser } from './codecBrowser'
import { foreignLang, isOutdated, tx } from './data'
import { estimateStrategy } from './estimate'
import { perHour } from './time'
import { validateStrategy } from './validate'

/** Код или ссылка с кодом → проверенная стратегия (или почему нет). */
export function decode(input: string): Promise<DecodeResult> {
  return decodeStrategyCode(input, inflateBrowser)
}

/** Оценка карты по снимку цен (prices.json сайта); без снимка — null. */
export function estimate(s: AdvisorStrategy, prices: readonly PriceEntry[] | null): AdvisorMapEstimate | null {
  return prices && prices.length ? estimateStrategy(s, buildPriceIndex([prices])) : null
}

export { CODE_PREFIX, extractCode, foreignLang, isOutdated, perHour, strategyFingerprint as fingerprint, tx, validateStrategy }
