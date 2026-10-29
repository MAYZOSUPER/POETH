import { useMemo } from 'react'
import type { ItemFlipState, UiLang } from '@shared/types'
import { BENCH_FUSING, BENCH_JEWELLERS } from '@shared/flip/items/sixlink'
import { useT } from '../../../i18n'
import { Confidence } from '../ui'
import { useBaseName, useUniqueName } from './format'
import { FormTags, IIco, Price } from './ui'

// «6L против без связей» (S33): выгода = продажа 6L − покупка без связей − верстак (350 Jeweller's на 6 гнёзд и
// 1500 Fusing на 6 связей) по курсу сфер из фида обмена GGG. Простой режим — только выгодные строки.

const SHOW = 60

export function SixLinkView({ s, lang, expert }: { s: ItemFlipState; lang: UiLang; expert: boolean }) {
  const t = useT()
  const nameOf = useUniqueName(lang)
  const baseOf = useBaseName(lang)
  // простой режим — только выгодные и с надёжными данными
  const rows = useMemo(() => (expert ? s.sixLinks : s.sixLinks.filter((r) => (r.profit ?? 0) > 0 && !r.thin)), [s.sixLinks, expert])
  const cost = rows.find((r) => r.cost !== null)?.cost ?? s.sixLinks.find((r) => r.cost !== null)?.cost ?? null
  const num = (v: number, d = v < 0.1 ? 3 : 2): string => v.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: d })

  return (
    <div className="fi-view">
      <div className="ui-hint fx-hint">
        <IIco name="link" />
        <span>
          {t('flip.items.six.how', { j: BENCH_JEWELLERS, f: BENCH_FUSING })}{' '}
          {s.fusing !== null && s.jewellers !== null && cost !== null ? (
            <>
              {t('flip.items.six.rates', { f: num(s.fusing), j: num(s.jewellers) })} <Price chaos={cost} divine={s.divine} lang={lang} prefix="≈ " />.
            </>
          ) : (
            t('flip.items.six.noRates')
          )}{' '}
          {t('flip.items.six.note')}
        </span>
      </div>
      <div className="ui-box">
        <div className="ui-box__head">
          <span className="ui-label">
            <IIco name="link" size="sm" />
            {t(expert ? 'flip.items.six.list' : 'flip.items.six.list.good', { n: rows.length })}
          </span>
        </div>
        <div className="fx-scroll ui-scroll">
          <table className="ui-table fx-table fi-table">
            <thead>
              <tr>
                <th>{t('flip.items.col.unique')}</th>
                <th className="is-num">{t('flip.items.six.col.base')}</th>
                <th className="is-num">{t('flip.items.six.col.six')}</th>
                <th className="is-num">{t('flip.items.six.col.cost')}</th>
                <th className="is-num">{t('flip.items.six.col.profit')}</th>
                <th>{t('flip.col.conf')}</th>
                {expert && <th>{t('flip.items.col.liq')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, SHOW).map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="fi-name">
                      <b className="ui-item ui-item--unique">{nameOf(r)}</b>
                      <span className="fi-sub">
                        {baseOf(r.base)} <FormTags row={r} />
                        {r.thin && (
                          <span className="ui-tag ui-tag--warn" title={t('flip.items.thin.help')}>
                            {t('flip.items.thin')}
                          </span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="is-num">
                    <Price chaos={r.buy} divine={s.divine} lang={lang} />
                  </td>
                  <td className="is-num">
                    <Price chaos={r.sell} divine={s.divine} lang={lang} />
                  </td>
                  <td className="is-num is-faint">{r.cost !== null ? <Price chaos={r.cost} divine={s.divine} lang={lang} /> : '—'}</td>
                  <td className={`is-num ${r.profit !== null && r.profit > 0 ? 'is-good' : 'is-bad'}`}>
                    {r.profit !== null ? <Price chaos={r.profit} divine={s.divine} lang={lang} prefix={r.profit > 0 ? '+' : ''} /> : '—'}
                  </td>
                  <td>
                    <Confidence value={r.confidence} word={!expert} />
                  </td>
                  {expert && <td className="fx-liq">{t(`flip.items.liq.${r.liquidity}`)}</td>}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={expert ? 7 : 6}>
                    <div className="ui-empty fx-empty">
                      <span className="ui-empty__title">{t('flip.items.six.empty')}</span>
                      <span>{t('flip.items.six.empty.tip')}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="ui-box__foot fx-foot">
          <IIco name="info" size="sm" />
          <span>{t('flip.items.six.foot')}</span>
        </div>
      </div>
    </div>
  )
}
