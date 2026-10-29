import type { FlipRoute, UiLang } from '@shared/types'
import { useT } from '../../i18n'
import { CoinIcon, Currency, useCurrencyNames } from '../../components/Currency'
import { Confidence, CopyNumber, FIco } from './ui'
import { fixed, goldTotal, int, pct, price } from './format'
import { fillHours, orderTotals, roundProfit } from './view'
import { GameCheck } from './GameCheck'

// Карточка «Как сделать этот флип у Фаустуса» по выбранной строке (макет «Обмен» v2): шаги с готовыми целыми
// числами для окна обмена (кнопки копируют число, чтобы вставить его в игре) и диапазоном «в игре, скорее всего»,
// справа — итог круга, доходность, комиссия в золоте и уверенность; ниже — «Цена в игре сейчас» (S25): курс из
// игры вручную и пересчёт прибыли. В эксперте вместо шагов — покупка, продажа и шаг ордера. Ордера ставит игрок.

export function HowCard({
  r,
  name,
  lang,
  expert,
  divine,
  minSpread
}: {
  r: FlipRoute
  name: string
  lang: string
  expert: boolean
  divine: number
  minSpread: number
}) {
  const t = useT()
  const ul = lang as UiLang
  const names = useCurrencyNames(ul)
  const tot = orderTotals(r)
  // названия базовой валюты — из данных APT на языке интерфейса (как в окне обмена в игре)
  const base1 = names.name(r.buy.base)
  const base2 = names.name(r.sell.base)
  const res = roundProfit(r, divine)
  const fill = fillHours(r)
  /** «0,7 Сферы хаоса» (простой режим) / «0,7 c» */
  const per = (v: number, tag: string): string => {
    const shown = price(v, lang)
    return `${shown} ${expert ? (tag === 'divine' ? 'div' : 'c') : names.after(tag, shown)}`
  }
  /** «286–317 Сфер хаоса» / «286–317 c»; края совпали — одно число */
  const span = (rg: { lo: number; hi: number }, tag: string): string => {
    const lo = price(rg.lo, lang)
    const hi = price(rg.hi, lang)
    return `${lo === hi ? lo : `${lo}–${hi}`} ${expert ? (tag === 'divine' ? 'div' : 'c') : names.after(tag, hi)}`
  }
  const cur = (tag: string, text: string) => <Currency tag={tag} text={text} lang={ul} />

  const coinOf = (n: string) =>
    n === base1 ? <CoinIcon tag={r.buy.base} lang={ul} /> : n === base2 ? <CoinIcon tag={r.sell.base} lang={ul} /> : null
  const order = (giveName: string, give: number, getName: string, get: number) => (
    <div className="fx-order">
      <span>
        {t('flip.give')} {coinOf(giveName)}
        {giveName}, <b>{int(give, lang)}</b>
      </span>
      <CopyNumber value={give} shown={int(give, lang)} />
      <span className="arrow" aria-hidden="true">
        →
      </span>
      <span>
        {t('flip.want')} {coinOf(getName)}
        {getName}, <b>{int(get, lang)}</b>
      </span>
      <CopyNumber value={get} shown={int(get, lang)} />
    </div>
  )

  const steps = (
    <ol className="fx-steps">
      <li>
        <div>
          <b>{t('flip.step.1')}</b>
          <p>{t('flip.step.1.p')}</p>
        </div>
      </li>
      <li>
        <div>
          <b>{t('flip.step.2')}</b>
          <p>{t('flip.step.rate', { price: per(r.buy.price, r.buy.base), range: span(r.buy.range, r.buy.base) })}</p>
          {order(base1, tot.buyGive, name, tot.units)}
        </div>
      </li>
      <li>
        <div>
          <b>{t('flip.step.3')}</b>
          <p>{fill === null ? t('flip.step.3.hour') : t('flip.step.3.hours', { n: fixed(fill, 1, lang) })}</p>
        </div>
      </li>
      <li>
        <div>
          <b>{t('flip.step.4')}</b>
          <p>{t('flip.step.rate', { price: per(r.sell.price, r.sell.base), range: span(r.sell.range, r.sell.base) })}</p>
          {order(name, tot.units, base2, tot.sellGet)}
        </div>
      </li>
    </ol>
  )

  const expertOrders = (
    <div className="fx-kv">
      <span>{t('flip.kv.buy')}</span>
      <b>
        {cur(r.buy.base, int(tot.buyGive, lang))} → {int(tot.units, lang)}
      </b>
      <span>{t('flip.kv.buyRange')}</span>
      <b>{span(r.buy.range, r.buy.base)}</b>
      <span>{t('flip.kv.sell')}</span>
      <b>
        {int(tot.units, lang)} → {cur(r.sell.base, int(tot.sellGet, lang))}
      </b>
      <span>{t('flip.kv.sellRange')}</span>
      <b>{span(r.sell.range, r.sell.base)}</b>
      <span>{t('flip.kv.chunk')}</span>
      <b>
        {cur(r.buy.base, String(r.buy.order.give))} → {r.buy.order.get} · {r.sell.order.give} → {cur(r.sell.base, String(r.sell.order.get))}
      </b>
      <span>{t('flip.kv.fill')}</span>
      <b>{fill === null ? t('flip.kv.fill.hour') : t('flip.kv.fill.hours', { n: fixed(fill, 1, lang) })}</b>
    </div>
  )

  // простой режим — с полным названием: «+12 Сфер хаоса», «+0,08 Божественной сферы (≈ +12 c)»
  const profit =
    res.div !== null ? (
      <>
        <Currency tag="divine" text={`+${fixed(res.div, 2, lang)}`} full={!expert} lang={ul} focusable />
        {t('flip.sum.alt', { chaos: int(res.chaos, lang) })}
      </>
    ) : (
      <Currency tag="chaos" text={`+${fixed(res.chaos, res.chaos >= 100 ? 0 : 1, lang)}`} full={!expert} lang={ul} focusable />
    )

  return (
    <div className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <FIco name="book" size="sm" />
          {t('flip.how.title')}
        </span>
        <span className="ui-label__grow" />
        <b className="fx-how-name">{name}</b>
      </div>
      <div className="ui-box__body">
        <div className="fx-how">
          <div>{expert ? expertOrders : steps}</div>
          <div className="fx-sum">
            <div className="fx-kv">
              <span>{t('flip.sum.result')}</span>
              <b className="good">{profit}</b>
              <span>{t('flip.sum.roi')}</span>
              <b>{pct(r.roi, lang)}</b>
              <span title={t('flip.gold.title')}>{t('flip.sum.fee')}</span>
              <b>
                <Currency tag="gold" text={`≈ ${int(Math.round(goldTotal(r) / 10) * 10, lang)}`} full={!expert} lang={ul} focusable />
              </b>
              <span>{t('flip.col.conf')}</span>
              <b>
                <Confidence value={r.confidence} word />
              </b>
            </div>
            {!expert && (
              <div className="ui-hint fx-hint">
                <FIco name="help" />
                <span>{t('flip.how.hint')}</span>
              </div>
            )}
          </div>
        </div>
        <GameCheck key={r.id} r={r} name={name} lang={lang} divine={divine} minSpread={minSpread} />
      </div>
    </div>
  )
}
