import type { FlipRoute, FlipState } from '@shared/types'
import { useT } from '../../i18n'
import { Confidence, FIco } from './ui'
import { clock, fixed, int, KIND_LABEL, num, pct, price, UNIT } from './format'
import { isTrend, type ViewSort } from './view'
import { useFlipStore } from './useFlipStore'

// Таблица «Возможности» по макету «Обмен» v2: строка кликается (и Enter) — ниже карточка «как сделать»;
// сортировка — по заголовкам «Прибыль в час» и «На 1000 золота». Простой режим — 7 колонок, эксперт — ещё
// маршрут, спред и активные часы. Под таблицей — дисклеймер, при сбое фида — красный баннер с «Повторить».

const SKELETON_ROWS = 6

export function Opportunities({
  s,
  rows,
  selected,
  lang,
  expert,
  nameOf
}: {
  s: FlipState
  rows: FlipRoute[]
  selected: string | null
  lang: string
  expert: boolean
  nameOf: (r: FlipRoute) => string
}) {
  const t = useT()
  const sort = useFlipStore((st) => st.view.sort)
  const setView = useFlipStore((st) => st.setView)
  const pick = useFlipStore((st) => st.pick)
  const refresh = useFlipStore((st) => st.refresh)
  const busy = useFlipStore((st) => st.busy)
  const rate = s.divine?.current ?? 0

  if (s.loading && !s.lastHour) {
    return (
      <div className="ui-box">
        <div className="ui-box__head">
          <span className="ui-label">{t('flip.loading')}</span>
        </div>
        <table className="ui-table">
          <tbody>
            {Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <tr key={i}>
                <td>
                  <i className="ui-skeleton" style={{ width: 150 }} />
                </td>
                {[0, 1, 2, 3].map((j) => (
                  <td key={j}>
                    <i className="ui-skeleton" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const sortBtn = (key: ViewSort, label: string) => (
    <button type="button" aria-pressed={sort === key} title={t('flip.sort')} onClick={() => setView({ sort: key })}>
      {label}
      {sort === key && <FIco name="chev-d" size="sm" />}
    </button>
  )
  const hourOf = (ms: number): string => `${clock(ms, lang)}–${clock(ms + 3_600_000, lang)}`

  return (
    <div className="ui-box">
      {s.problem && (
        <div className="ui-banner ui-banner--bad fx-err" role="alert">
          <FIco name="warn" />
          <span>
            <b>{t('flip.err.title')}</b> {s.lastHour ? t('flip.err.cached', { hours: hourOf(s.lastHour) }) : t('flip.err.empty')}
            {s.nextUpdateAt ? ` ${t('flip.err.retry', { at: clock(s.nextUpdateAt, lang) })}` : ''}
          </span>
          <button type="button" className="ui-btn ui-btn--sm" disabled={busy || s.loading} onClick={() => void refresh()}>
            <FIco name="refresh" />
            {t('flip.retry')}
          </button>
        </div>
      )}
      <div className="ui-box__head">
        <span className="ui-label">
          <FIco name="swap" size="sm" />
          {t('flip.list', { n: rows.length })}
        </span>
        <span className="ui-label__grow" />
        <span className="fx-liq">{t('flip.list.note')}</span>
      </div>
      <div className="fx-scroll ui-scroll">
        <table className="ui-table fx-table">
          <thead>
            <tr>
              <th>{t('flip.col.item')}</th>
              {expert && <th>{t('flip.col.kind')}</th>}
              <th className="is-num">{t('flip.col.buy')}</th>
              <th className="is-num">{t('flip.col.sell')}</th>
              {expert && <th className="is-num">{t('flip.col.spread')}</th>}
              <th className="is-num">{sortBtn('perHour', t('flip.col.perHour'))}</th>
              <th className="is-num" title={t('flip.gold.title')}>
                {sortBtn('perGold', t('flip.col.perGold'))}
              </th>
              <th>{t('flip.col.conf')}</th>
              <th className="is-num">{t('flip.col.liq')}</th>
              {expert && <th className="is-num">{t('flip.col.hours')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((r) => (
                <tr
                  key={r.id}
                  aria-selected={r.id === selected}
                  tabIndex={0}
                  onClick={() => pick(r.id)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return
                    e.preventDefault()
                    pick(r.id)
                  }}
                >
                  <td>
                    <span className="fx-pair">
                      <b>{nameOf(r)}</b>
                      {expert ? (
                        isTrend(r) && <span className="fx-trend">{t('flip.trend.pct', { n: pct(r.trend, lang) })}</span>
                      ) : (
                        <span>
                          {t(`flip.for.${r.kind}`)}
                          {isTrend(r) && (
                            <>
                              {' · '}
                              <span className="fx-trend">{t('flip.trend')}</span>
                            </>
                          )}
                        </span>
                      )}
                    </span>
                  </td>
                  {expert && <td className="is-faint fx-kind">{KIND_LABEL[r.kind]}</td>}
                  <td className="is-num">
                    {price(r.buy.price, lang)} {UNIT[r.buy.base]}
                  </td>
                  <td className="is-num">
                    {price(r.sell.price, lang)} {UNIT[r.sell.base]}
                  </td>
                  {expert && <td className="is-num">{pct(r.spread, lang)}</td>}
                  <td className="is-num is-good">≈ +{int(r.perHour, lang)} c</td>
                  <td className="is-num">
                    <i className="ui-coin ui-coin--gold" />
                    {fixed(r.per1000Gold, 1, lang)} c
                  </td>
                  <td>
                    <Confidence value={r.confidence} word={!expert} />
                  </td>
                  <td className="is-num">
                    <span className="fx-liq">{rate > 0 ? `${num(r.liquidity / rate, lang)} div/${t('flip.h')}` : '—'}</span>
                  </td>
                  {expert && <td className="is-num is-faint">{r.activeHours}/24</td>}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={expert ? 10 : 7}>
                  <div className="ui-empty fx-empty">
                    <span className="ui-empty__title">{t('flip.empty.title')}</span>
                    <span>{t('flip.empty')}</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="ui-box__foot fx-foot">
        <FIco name="info" size="sm" />
        <span>{t('flip.foot')}</span>
      </div>
    </div>
  )
}
