import type { UiLang } from '@shared/types'
import type { Poe1Price } from '@shared/poe1/pricecheck/results'
import type { RuCase } from '@shared/currency'
import { convertPrice2 } from '@shared/poe2/pricecheck/currency'
import { Currency, useCurrencyNames } from '../../../components/Currency'
import { useOverlayT } from '../../useOverlayT'
import { currencyLabel, fmtNum } from '../format'
import { ratesOf, usePoe2PriceCheckStore as useStore } from './store'

// Цена в окне цены PoE 2: с иконкой и подсказкой-пересчётом по курсу у Ange (Price) и текстом в фразах (usePriceText).
// Общие для «Покупаю» (Poe2PriceWindow) и «Продаю» (SellBox2, S61) — как PriceText.tsx у PoE 1 (S50).

type T = (key: string, params?: Record<string, string | number>) => string

function fmtDiv(v: number, lang: UiLang): string {
  const s = v < 10 ? v.toFixed(2) : String(v)
  return lang === 'ru' ? s.replace('.', ',') : s
}

/** S61: «345 ex ≈ 0.50 div» / «1 div ≈ 690 ex» / «2 c ≈ 143 ex» — подсказка к цене по курсу у Ange. */
function conversionTitle(price: Poe1Price, lang: UiLang, t: T): string | undefined {
  const other = convertPrice2(price, ratesOf(useStore.getState()))
  if (!other) return undefined
  return price.currency === 'exalted'
    ? t('pc2.s61.conv.toDiv', { e: fmtNum(price.amount, lang), d: fmtDiv(other.amount, lang) })
    : t('pc2.s61.conv.toEx', { p: `${fmtNum(price.amount, lang)} ${currencyLabel(price.currency)}`, e: fmtNum(other.amount, lang) })
}

/**
 * Цена с иконкой и подсказкой (там же — пересчёт по курсу у Ange); full — полное название (простой режим),
 * approx — «~» перед числом.
 */
export function Price({ price, lang, full = false, approx = false }: { price: Poe1Price; lang: UiLang; full?: boolean; approx?: boolean }) {
  const t = useOverlayT()
  // перерисовать, когда придёт курс
  useStore((s) => s.rate)
  useStore((s) => s.more)
  const conv = conversionTitle(price, lang, t)
  const text = `${approx ? '~' : ''}${fmtNum(price.amount, lang)}`
  return <Currency tag={price.currency} text={text} full={full} lang={lang} className="pc-price" extra={conv && <b>{conv}</b>} />
}

/** Цена текстом: простой режим — полное название с падежом («за ~14 Сфер возвышения»), эксперт — «14 ex». */
export type PriceText = (p: Poe1Price, c?: RuCase) => string
export function usePriceText(lang: UiLang): PriceText {
  const simple = useStore((s) => s.simple)
  const names = useCurrencyNames(lang)
  return (p, c = 'nom') => {
    const n = fmtNum(p.amount, lang)
    return `${n} ${simple ? names.after(p.currency, n, c) : currencyLabel(p.currency)}`
  }
}
