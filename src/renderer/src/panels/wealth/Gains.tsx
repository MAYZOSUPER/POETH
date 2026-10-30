import { useState } from 'react'
import type { WealthDiff, WealthDiffLine, WealthItemNs } from '@shared/types'
import { useT } from '../../i18n'
import { tKey } from '../../i18n/hotkey'
import { useAppStore } from '../../store/useAppStore'
import { WIco } from './ui'
import { itemClass, lineFacts, nf, sg, span, unitPrice } from './format'

// «Что прибавилось» по макету «Богатство» v2: предмет, кол-во, прибавка; в эксперте ещё цена за штуку
// и источник. Внизу — «Ушло» (проданы или использованы) и «Все изменения».

const SHOWN = 8

export function Gains({
  title,
  diff,
  first,
  lang,
  expert,
  nameOf
}: {
  title: string
  diff: WealthDiff | null
  /** снимок пока один — сравнивать не с чем */
  first: boolean
  lang: string
  expert: boolean
  nameOf: (l: { name: string; ns: WealthItemNs }) => string
}) {
  const t = useT()
  const pcKey = useAppStore((s) => s.settings?.hotkeys.priceCheck.accel)
  const [all, setAll] = useState(false)
  const head = (
    <div className="ui-box__head">
      <span className="ui-label">
        <WIco name="plus" size="sm" />
        {title}
      </span>
      <span className="ui-label__grow" />
      {diff && !first && (
        <span className={`ui-delta ${diff.chaosDelta >= 0 ? 'ui-delta--up' : 'ui-delta--down'}`}>
          <WIco name={diff.chaosDelta >= 0 ? 'arrow-up' : 'arrow-down'} />
          {sg(diff.chaosDelta, lang)} chaos <span>{span(t, diff.toAt - diff.fromAt)}</span>
        </span>
      )}
    </div>
  )
  if (first || !diff) {
    return (
      <div className="ui-box">
        {head}
        <div className="ui-empty">{t(first ? 'wealth.gains.first' : 'wealth.gains.none')}</div>
      </div>
    )
  }
  const added = diff.lines.filter((l) => l.qtyDelta > 0).sort((a, b) => b.chaosDelta - a.chaosDelta)
  const gone = diff.lines.filter((l) => l.qtyDelta < 0)
  const goneChaos = gone.reduce((a, l) => a + l.chaosDelta, 0)
  const rows = all ? [...added, ...gone.sort((a, b) => a.chaosDelta - b.chaosDelta)] : added.slice(0, SHOWN)
  const src = (l: WealthDiffLine): string => t(l.unit === undefined ? 'wealth.src.none' : `wealth.src.${l.source ?? 'none'}`)
  const goneNames = gone
    .slice()
    .sort((a, b) => a.chaosDelta - b.chaosDelta)
    .slice(0, 3)
    .map((l) => `${nameOf(l)} ×${-l.qtyDelta}`)
    .join(', ')

  return (
    <div className="ui-box">
      {head}
      {rows.length ? (
        <table className="ui-table">
          <thead>
            <tr>
              <th>{t('wealth.col.item')}</th>
              <th className="is-num">{t('wealth.col.qty')}</th>
              {expert && <th className="is-num">{t('wealth.col.unit')}</th>}
              {expert && <th>{t('wealth.col.source')}</th>}
              <th className="is-num">{t('wealth.col.added')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.key}>
                <td>
                  <span className={`ui-item ${itemClass(l)}`}>
                    {nameOf(l)}
                    {lineFacts(t, l).map((f) => (
                      <span key={f} className="ui-tag">
                        {f}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="is-num">{sg(l.qtyDelta, lang)}</td>
                {expert && <td className="is-num">{l.unit !== undefined ? `${unitPrice(l.unit, lang)} c` : '—'}</td>}
                {expert && (
                  <td>
                    <span className={`ui-tag${l.source === 'exchange' && l.unit !== undefined ? ' ui-tag--merchant' : ''}`}>{src(l)}</span>
                  </td>
                )}
                {l.unit === undefined ? (
                  <td className="is-num">
                    <span className="ui-tag" title={l.reason === 'rare' ? tKey(t, 'wealth.unpriced.rare', pcKey) : t(`wealth.reason.${l.reason ?? 'no-price'}`)}>
                      {t('wealth.unpriced')}
                    </span>
                  </td>
                ) : (
                  <td className={`is-num ${l.chaosDelta < 0 ? 'is-bad' : 'is-good'}`} title={l.low ? t('wealth.low') : undefined}>
                    {l.low ? '~' : ''}
                    {sg(l.chaosDelta, lang)} c
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="ui-empty">{t('wealth.gains.none')}</div>
      )}
      {(gone.length > 0 || added.length > SHOWN) && (
        <div className="ui-box__foot">
          {gone.length > 0 && <span>{t('wealth.gone', { n: nf(goneChaos, lang), items: goneNames })}</span>}
          <span className="ui-label__grow" />
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" aria-expanded={all} onClick={() => setAll(!all)}>
            {t(all ? 'wealth.gains.less' : 'wealth.gains.all')}
            <WIco name="chev-r" />
          </button>
        </div>
      )}
    </div>
  )
}
