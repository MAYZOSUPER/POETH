// Суммы «Богатства PoE 2» (S70): база — exalted, дорогое — divine. «≈ 12,4 div (8 556 ex)»; меньше 1 div — в ex.

import type { UiLang } from '@shared/types'
import { ruCount } from '@shared/currency/ru'
import { df, nf } from '../format'

type T = (key: string, vars?: Record<string, string | number>) => string

export interface Money {
  /** главная запись: «12,4 div» или «320 ex» */
  main: string
  /** вторая: «8 556 ex» или «≈ 0,46 div» */
  alt?: string
}

/** Сумма в exalted → div (если ≥ 1 div и курс известен), иначе ex. */
export function money(ex: number, rate: number | null | undefined, lang: string): Money {
  const exText = `${Math.abs(ex) < 10 && ex !== Math.round(ex) ? df(ex, lang, 2) : nf(ex, lang)} ex`
  if (rate && rate > 0) {
    const div = ex / rate
    if (Math.abs(div) >= 1) return { main: `${df(div, lang, Math.abs(div) >= 100 ? 0 : 1)} div`, alt: exText }
    if (ex !== 0) return { main: exText, alt: `≈ ${df(div, lang, 2)} div` }
  }
  return { main: exText }
}

/** Со знаком: «+1,2 div» / «−40 ex». */
export function signedMoney(ex: number, rate: number | null | undefined, lang: string): string {
  const m = money(Math.abs(ex), rate, lang).main
  return Math.abs(ex) < 0.005 ? '±0' : `${ex < 0 ? '−' : '+'}${m}`
}

/** Цена штуки: ≥ 10 ex — целое, меньше — до сотых. */
export function unitEx(ex: number, lang: string): string {
  return `${ex >= 10 ? nf(ex, lang) : df(ex, lang, 2)} ex`
}

/** «5 вкладок» / «5 tabs». */
export function tabsCount(t: T, n: number, lang: UiLang): string {
  const form = lang === 'ru' ? ruCount(n) : n === 1 ? 'one' : 'many'
  return t(`wealth.p2.tabs.${form === 'frac' ? 'many' : form}`, { n })
}
