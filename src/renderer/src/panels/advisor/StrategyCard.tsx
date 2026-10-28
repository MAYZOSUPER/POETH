import type { ReactNode } from 'react'
import type { AdvisorGlossaryTerm, AdvisorLine, AdvisorPricedLine } from '@shared/types'
import type { FarmState } from '@shared/types/farm'
import { useT } from '../../i18n'
import { useAdvisorStore } from '../../store/useAdvisorStore'
import { AIco, Confidence, Level, type AIcoName } from './ui'
import { chaosText, farmButton, hm, itemNs, minutesText, qtyText, tx, versus, type AdvisorRow } from './view'

// Карточка стратегии вкладки «Что фармить» (S16). Свёрнутая — главное число «~X chaos/ч», сложность и что нужно
// билду; раскрытая — что вложить и что получите с ценами, время карты, «почему выгодно», атлас, шаги,
// предупреждения, термины с подсказками и «Мой результат» с кнопкой сессии фарма. Простой режим — меньше цифр.

type T = ReturnType<typeof useT>
type NameOf = (l: { name: string; ns: ReturnType<typeof itemNs> }) => string

export interface CardProps {
  row: AdvisorRow
  lang: string
  expert: boolean
  open: boolean
  farm: FarmState | null
  glossary: Record<string, AdvisorGlossaryTerm>
  nameOf: NameOf
}

function lineName(l: AdvisorLine, lang: string, nameOf: NameOf): string {
  if (l.item.label) return tx(l.item.label, lang)
  return l.item.name ? nameOf({ name: l.item.name, ns: itemNs(l.item) }) : ''
}

/** Главное число: доход в час, «не меньше», убыток или почему его нет. */
function Headline({ row, lang, names }: { row: AdvisorRow; lang: string; names: string[] }) {
  const t = useT()
  const e = row.estimate
  if (e.profit === null) {
    return (
      <span className="ad-hour ad-hour--none" title={names.length ? t('advisor.perHour.none.title', { items: names.join(', ') }) : undefined}>
        {t('advisor.perHour.none')}
      </span>
    )
  }
  if (row.perHour === null) return <span className="ad-hour ad-hour--none">{t('advisor.perHour.noTime')}</span>
  const v = chaosText(Math.abs(row.perHour), lang)
  const key = row.perHour < 0 ? 'advisor.perHour.loss' : e.incomePartial ? 'advisor.perHour.min' : 'advisor.perHour'
  return (
    <span className={`ad-hour${row.perHour < 0 ? ' ad-hour--bad' : ''}`} title={t('advisor.perHour.title')}>
      {t(key, { v })}
    </span>
  )
}

function Lines({
  lines,
  priced,
  input,
  lang,
  expert,
  nameOf
}: {
  lines: AdvisorLine[]
  priced: AdvisorPricedLine[]
  input: boolean
  lang: string
  expert: boolean
  nameOf: NameOf
}) {
  const t = useT()
  return (
    <ul className="ad-lines">
      {lines.map((l, i) => {
        const p = priced[i]
        const own = input && l.own
        const unit = p.unit !== null ? t('advisor.unit', { v: chaosText(p.unit, lang) }) : null
        return (
          <li key={i} className="ad-line">
            <span className="ad-line__name">
              <span className="ui-item ui-item--currency">{lineName(l, lang, nameOf)}</span>
              {own && (
                <span className="ui-tag" title={t('advisor.own.title')}>
                  {t('advisor.own')}
                </span>
              )}
              {p.low && <span className="ui-tag ui-tag--warn">{t('advisor.low')}</span>}
              {l.note && <span className="ad-note">{tx(l.note, lang)}</span>}
            </span>
            <span className="ad-line__qty">×{qtyText(l.qty, lang)}</span>
            <span className="ad-line__sum" title={unit ?? undefined}>
              {own ? '' : p.total === null ? <span className="ad-faint">{t('advisor.noPrice')}</span> : t('advisor.chaos', { v: chaosText(p.total, lang) })}
            </span>
            {expert && (
              <span className="ad-line__unit">
                {unit ?? '—'}
                {p.source && ` · ${t(`advisor.src.${p.source}`)}`}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function Section({ icon, title, children }: { icon: AIcoName; title: string; children: ReactNode }) {
  return (
    <section className="ad-sec">
      <span className="ui-label">
        <AIco name={icon} size="sm" />
        {title}
      </span>
      {children}
    </section>
  )
}

function timeNote(row: AdvisorRow, t: T): string {
  const tm = row.time
  if (!tm) return ''
  if (tm.source === 'default') return t('advisor.time.default')
  return t(tm.source === 'mine' ? 'advisor.time.mine' : 'advisor.time.tracker', { n: tm.maps })
}

function MyResult({ row, lang, farm }: { row: AdvisorRow; lang: string; farm: FarmState | null }) {
  const t = useT()
  const startFarm = useAdvisorStore((s) => s.startFarm)
  const answer = useAdvisorStore((s) => s.farm[row.strategy.id])
  const btn = farmButton(row.strategy.id, farm)
  const mine = row.mine
  const vs = mine ? versus(mine.perHour, row.perHour) : null
  const time = mine ? hm(mine.durationMs) : null
  return (
    <div className="ui-box ad-farm">
      <div className="ui-box__head">
        <span className="ui-label">
          <AIco name="history" size="sm" />
          {t('advisor.farm.title')}
        </span>
        {mine?.live && <span className="ui-tag ui-tag--good">{t('advisor.mine.live')}</span>}
      </div>
      <div className="ui-box__body">
        {!mine && <p className="ad-muted">{t('advisor.mine.none')}</p>}
        {mine && time && (
          <>
            <p className="ad-muted">
              {t('advisor.mine.stats', { s: mine.sessions, m: mine.maps, h: time.h, min: time.m })}
              {mine.mapMinutes !== null && ` · ${t('advisor.mine.mapTime', { v: minutesText(mine.mapMinutes, lang) })}`}
            </p>
            {mine.perHour !== null ? (
              <p className="ad-mine">
                <b>{t('advisor.mine.perHour', { v: chaosText(mine.perHour, lang) })}</b>
                {vs && <span className={`ui-tag${vs === 'below' ? ' ui-tag--warn' : vs === 'above' ? ' ui-tag--good' : ''}`}>{t(`advisor.vs.${vs}`)}</span>}
              </p>
            ) : (
              <p className="ad-muted">{t('advisor.mine.noProfit')}</p>
            )}
          </>
        )}
        <div className="ad-farm__act">
          <button
            type="button"
            className={`ui-btn ${btn === 'start' ? 'ui-btn--primary' : ''}`}
            disabled={btn === 'running'}
            onClick={() => void startFarm(row.strategy.id)}
          >
            <AIco name={btn === 'running' ? 'check' : 'play'} />
            {t(`advisor.farm.${btn}`)}
          </button>
          {answer && <span className={answer === 'unknown' ? 'ad-bad' : 'ad-muted'}>{t(`advisor.farm.${answer}`)}</span>}
        </div>
        {!answer && btn !== 'running' && <p className="ui-hint ad-hint">{t('advisor.farm.hint')}</p>}
      </div>
    </div>
  )
}

function Details({ row, lang, expert, farm, glossary, nameOf }: Omit<CardProps, 'open'>) {
  const t = useT()
  const s = row.strategy
  const e = row.estimate
  const terms = s.terms.filter((k) => glossary[k])
  const money = (v: number | null, partial = false): string =>
    v === null ? t('advisor.noPrice') : t(partial ? 'advisor.chaos.min' : 'advisor.chaos', { v: chaosText(v, lang) })
  return (
    <div className="ad-details">
      <div className="ad-io">
        <Section icon="coins" title={t('advisor.in')}>
          <Lines lines={s.inputs} priced={e.inputs} input lang={lang} expert={expert} nameOf={nameOf} />
        </Section>
        <Section icon="map" title={t('advisor.out')}>
          <Lines lines={s.outputs} priced={e.outputs} input={false} lang={lang} expert={expert} nameOf={nameOf} />
        </Section>
      </div>
      <div className="ad-kv">
        <span>{t('advisor.sum.cost')}</span>
        <b>{money(e.cost)}</b>
        <span>{t('advisor.sum.income')}</span>
        <b>{money(e.income, e.incomePartial)}</b>
        <span>{t('advisor.sum.profit')}</span>
        <b className={e.profit !== null && e.profit < 0 ? 'bad' : 'good'}>{money(e.profit, e.incomePartial)}</b>
        <span>{t('advisor.sum.time')}</span>
        <b>
          {row.time ? t('advisor.time.min', { v: minutesText(row.time.minutes, lang) }) : '—'}
          {row.time && <i>{timeNote(row, t)}</i>}
        </b>
        {expert && e.cost !== null && row.time && (
          <>
            <span>{t('advisor.sum.costHour')}</span>
            <b>{t('advisor.chaos', { v: chaosText((e.cost * 60) / row.time.minutes, lang) })}</b>
          </>
        )}
      </div>
      <Section icon="help" title={t('advisor.why')}>
        <p className="ad-text">{tx(s.why, lang)}</p>
      </Section>
      {s.atlas.length > 0 && (
        <Section icon="compass" title={t('advisor.atlas')}>
          <ul className="ad-list">
            {s.atlas.map((a, i) => (
              <li key={i}>{tx(a, lang)}</li>
            ))}
          </ul>
        </Section>
      )}
      <Section icon="step" title={t('advisor.steps')}>
        <ol className="ad-steps">
          {s.steps.map((st, i) => (
            <li key={i}>{tx(st, lang)}</li>
          ))}
        </ol>
      </Section>
      {s.warnings.length > 0 && (
        <div className="ui-banner ad-warn" role="note">
          <AIco name="warn" />
          <span>
            <b>{t('advisor.warn')}:</b> {s.warnings.map((w) => tx(w, lang)).join(' ')}
          </span>
          <span />
        </div>
      )}
      {terms.length > 0 && (
        <div className="ad-terms">
          <span className="ui-label">{t('advisor.terms')}</span>
          {terms.map((k) => (
            <span key={k} className="ad-term">
              {tx(glossary[k].term, lang)}
              <span className="ui-q" title={tx(glossary[k].tip, lang)}>
                ?
              </span>
            </span>
          ))}
        </div>
      )}
      <p className="ad-source">{t('advisor.source', { text: tx(s.source.text, lang), date: s.source.date })}</p>
      <MyResult row={row} lang={lang} farm={farm} />
    </div>
  )
}

export function StrategyCard(props: CardProps) {
  const { row, lang, expert, open, nameOf } = props
  const t = useT()
  const toggle = useAdvisorStore((s) => s.toggle)
  const s = row.strategy
  const e = row.estimate
  const missing = [
    ...s.inputs.filter((l, i) => !l.own && e.inputs[i].total === null),
    ...s.outputs.filter((_, i) => e.outputs[i].total === null)
  ].map((l) => lineName(l, lang, nameOf))
  const detailsId = `ad-details-${s.id}`
  return (
    <article className={`ui-box ad-card${open ? ' is-open' : ''}`}>
      <div className="ui-box__head">
        <h4 className="ad-name">{tx(s.name, lang)}</h4>
        {s.draft && <span className="ui-tag ui-tag--warn">{t('advisor.draftTag', { patch: s.patch })}</span>}
        <span className="ui-label__grow" />
        <span className="ad-diff">
          <span className="ad-faint">{t('advisor.diff')}</span>
          <Level n={s.difficulty} word={t(`advisor.diff.${s.difficulty}`)} />
        </span>
      </div>
      <div className="ui-box__body">
        <div className="ad-top">
          <div className="ad-main">
            <p className="ad-summary">{tx(s.summary, lang)}</p>
            <div className="ad-build">
              <span className="ui-label">{t('advisor.build')}</span>
              {(['damage', 'survival', 'speed'] as const).map((k) => (
                <span key={k} className="ad-build__item">
                  {t(`advisor.build.${k}`)}
                  <Level n={s.build[k]} word={t(`advisor.level.${s.build[k]}`)} />
                </span>
              ))}
            </div>
            {s.build.note && open && <p className="ad-muted">{tx(s.build.note, lang)}</p>}
          </div>
          <div className="ad-figure">
            <Headline row={row} lang={lang} names={missing} />
            {expert && e.profit !== null && (
              <span className="ad-faint">
                {t('advisor.sum.profit')}: {t(e.incomePartial ? 'advisor.chaos.min' : 'advisor.chaos', { v: chaosText(e.profit, lang) })}
              </span>
            )}
            <Confidence value={e.confidence} reasons={e.reasons} />
          </div>
        </div>
        {open && (
          <div id={detailsId}>
            <Details {...props} />
          </div>
        )}
      </div>
      <div className="ui-box__foot ad-foot">
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" aria-expanded={open} aria-controls={detailsId} onClick={() => toggle(s.id)}>
          <AIco name={open ? 'chev-d' : 'chev-r'} size="sm" />
          {t(open ? 'advisor.less' : 'advisor.more')}
        </button>
      </div>
    </article>
  )
}
