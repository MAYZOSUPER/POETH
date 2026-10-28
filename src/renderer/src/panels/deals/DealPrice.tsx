import type { Deal, UiLang } from '@shared/types'
import { guessCurrencyTag } from '@shared/currency'
import { CoinIcon, Currency, CurrencyTipBody, TipAnchor, useCurrencyTable } from '../../components/Currency'

// Цена сделки (S18) для вкладки «Сделки» и карточек оверлея: валюта по тексту шёпота («5 chaos», «1,5 divine»,
// «3 Сферы хаоса») → иконка игры и подсказка новичку. full (простой режим) — число и полное название с падежом,
// иначе — как написал покупатель. Непонятная валюта — текст шёпота с запасным кружком.

export function DealPrice({ d, lang, full }: { d: Deal; lang: UiLang; full: boolean }) {
  const table = useCurrencyTable(lang)
  const v = d.priceValue
  const tag = guessCurrencyTag(v?.currency, [table])
  if (!tag) {
    return (
      <>
        <i className="ui-coin" aria-hidden="true" />
        {d.price}
      </>
    )
  }
  if (full && v) {
    const text = v.amount.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 2 })
    return <Currency tag={tag} text={text} full lang={lang} />
  }
  return (
    <TipAnchor className="ui-cur" tip={<CurrencyTipBody tag={tag} lang={lang} />}>
      <CoinIcon tag={tag} lang={lang} />
      {d.price}
    </TipAnchor>
  )
}
