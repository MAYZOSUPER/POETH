import type { UiLang } from '@shared/types'
import type { Poe1Price } from '@shared/poe1/pricecheck/results'
import type { RuCase } from '@shared/currency'
import { convertPrice } from '@shared/poe1/pricecheck/currency'
import { Currency, useCurrencyNames } from '../../components/Currency'
import { useOverlayT } from '../useOverlayT'
import { usePriceCheckStore } from './store'
import { currencyLabel, fmtNum } from './format'

// Цена в окне цены PoE1: с иконкой и подсказкой-переводом по курсу (Price) и текстом в фразах (usePriceText).
// Общие для «Покупаю» (PriceWindow) и «Продаю» (SellBox, S50).

type T = (key: string, params?: Record<string, string | number>) => string

function fmtDiv(v: number, lang: UiLang): string {
  const s = v < 10 ? v.toFixed(2) : String(v)
  return lang === 'ru' ? s.replace('.', ',') : s
}

/** «34 c ≈ 0.10 div» / «1.5 div ≈ 507 c» — подсказка к цене по курсу фида обмена. */
function conversionTitle(price: Poe1Price, rate: number | undefined, lang: UiLang, t: T): string | undefined {
  const other = convertPrice(price, rate)
  if (!other) return undefined
  return price.currency === 'chaos'
    ? t('pc1.conv.toDiv', { c: fmtNum(price.amount, lang), d: fmtDiv(other.amount, lang) })
    : t('pc1.conv.toChaos', { d: fmtNum(price.amount, lang), c: fmtNum(other.amount, lang) })
}

/**
 * Цена с иконкой и подсказкой (там же — перевод в другую валюту по курсу); full — полное название (простой режим),
 * approx — «~» перед числом (после иконки).
 */
export function Price({ price, lang, full = false, approx = false }: { price: Poe1Price; lang: UiLang; full?: boolean; approx?: boolean }) {
  const t = useOverlayT()
  const rate = usePriceCheckStore((s) => s.rate?.chaosPerDivine)
  const conv = conversionTitle(price, rate, lang, t)
  const text = `${approx ? '~' : ''}${fmtNum(price.amount, lang)}`
  return <Currency tag={price.currency} text={text} full={full} lang={lang} className="pc-price" extra={conv && <b>{conv}</b>} />
}

/** Цена текстом: простой режим — полное название с падежом («за ~14 Сфер хаоса»), эксперт — «14 c». */
export type PriceText = (p: Poe1Price, c?: RuCase) => string
export function usePriceText(lang: UiLang): PriceText {
  const simple = usePriceCheckStore((s) => s.simple)
  const names = useCurrencyNames(lang)
  return (p, c = 'nom') => {
    const n = fmtNum(p.amount, lang)
    return `${n} ${simple ? names.after(p.currency, n, c) : currencyLabel(p.currency)}`
  }
}
