import type { FlipRoute } from '@shared/types'
import { useT } from '../../i18n'
import { Confidence, CopyNumber, FIco } from './ui'
import { fixed, goldTotal, int, pct, price, UNIT } from './format'
import { fillHours, orderTotals, roundProfit } from './view'

// Карточка «Как сделать этот флип у Фаустуса» по выбранной строке (макет «Обмен» v2): шаги с готовыми целыми
// числами для окна обмена (кнопки копируют число, чтобы вставить его в игре), справа — итог круга, доходность,
// комиссия в золоте и уверенность. В эксперте вместо шагов — покупка, продажа и шаг ордера. Ордера ставит игрок.

export function HowCard({ r, name, lang, expert, divine }: { r: FlipRoute; name: string; lang: string; expert: boolean; divine: number }) {
  const t = useT()
  const tot = orderTotals(r)
  const base1 = t(`flip.baseName.${r.buy.base}`)
  const base2 = t(`flip.baseName.${r.sell.base}`)
  const u1 = UNIT[r.buy.base]
  const u2 = UNIT[r.sell.base]
  const res = roundProfit(r, divine)
  const fill = fillHours(r)

  const order = (giveName: string, give: number, getName: string, get: number) => (
    <div className="fx-order">
      <span>
        {t('flip.give')} {giveName}, <b>{int(give, lang)}</b>
      </span>
      <CopyNumber value={give} shown={int(give, lang)} />
      <span className="arrow" aria-hidden="true">
        →
      </span>
      <span>
        {t('flip.want')} {getName}, <b>{int(get, lang)}</b>
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
          <p>{t('flip.step.rate', { price: `${price(r.buy.price, lang)} ${u1}` })}</p>
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
          <p>{t('flip.step.rate', { price: `${price(r.sell.price, lang)} ${u2}` })}</p>
          {order(name, tot.units, base2, tot.sellGet)}
        </div>
      </li>
    </ol>
  )

  const expertOrders = (
    <div className="fx-kv">
      <span>{t('flip.kv.buy')}</span>
      <b>
        {int(tot.buyGive, lang)} {u1} → {int(tot.units, lang)}
      </b>
      <span>{t('flip.kv.sell')}</span>
      <b>
        {int(tot.units, lang)} → {int(tot.sellGet, lang)} {u2}
      </b>
      <span>{t('flip.kv.chunk')}</span>
      <b>
        {r.buy.order.give} {u1} → {r.buy.order.get} · {r.sell.order.give} → {r.sell.order.get} {u2}
      </b>
      <span>{t('flip.kv.fill')}</span>
      <b>{fill === null ? t('flip.kv.fill.hour') : t('flip.kv.fill.hours', { n: fixed(fill, 1, lang) })}</b>
    </div>
  )

  const profit =
    res.div !== null
      ? t('flip.sum.div', { div: fixed(res.div, 2, lang), chaos: int(res.chaos, lang) })
      : t('flip.sum.chaos', { chaos: fixed(res.chaos, res.chaos >= 100 ? 0 : 1, lang) })

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
                <i className="ui-coin ui-coin--gold" />≈ {int(Math.round(goldTotal(r) / 10) * 10, lang)}
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
      </div>
    </div>
  )
}
