import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { FlipState, UiLang } from '@shared/types'
import { useT } from '../../i18n'
import { CoinIcon, RateTipBody, TipAnchor, useCurrencyNames, useRateDeltaText } from '../../components/Currency'
import { WSwitch } from '../wealth/ui'
import { FIco } from './ui'
import { fixed } from './format'
import { hoursAgo, niceStep, rateView, type RateView } from './view'
import { useFlipStore } from './useFlipStore'

// Курс divine : chaos по макету «Обмен» v2: линия — средний курс за час, полоса — коридор мин–макс за окно
// БЕЗ последнего часа (последняя точка может выйти за полосу — это и есть сигнал: точка и подпись жёлтые).
// Изменение нейтральное — рост не «хорошо» и не «плохо». Под графиком — уведомление по коридору недели.

const CH = { w: 340, h: 150, l: 36, r: 40, t: 10, b: 22 }
const HOUR = 3_600_000

function chartGeo(v: RateView) {
  const rates = v.points.map((p) => p.rate)
  const mn = Math.min(...rates, v.lo ?? Infinity)
  const mx = Math.max(...rates, v.hi ?? -Infinity)
  const pad = Math.max((mx - mn) * 0.08, 0.5)
  const st = niceStep(mx - mn + 2 * pad)
  const y0 = Math.floor((mn - pad) / st) * st
  const y1 = Math.ceil((mx + pad) / st) * st
  const pw = CH.w - CH.l - CH.r
  const ph = CH.h - CH.t - CH.b
  const grid: number[] = []
  for (let g = y0; g <= y1 + st / 1000; g += st) grid.push(Math.round(g * 1000) / 1000)
  return {
    st,
    grid,
    x: (at: number): number => CH.l + ((at - v.t0) / (v.t1 - v.t0)) * pw,
    y: (r: number): number => CH.t + ph - ((r - y0) / (y1 - y0)) * ph
  }
}

export function RateBox({ s, lang, expert }: { s: FlipState; lang: string; expert: boolean }) {
  const t = useT()
  const ul = lang as UiLang
  const names = useCurrencyNames(ul)
  const deltaSay = useRateDeltaText(ul)
  const range = useFlipStore((st) => st.range)
  const setRange = useFlipStore((st) => st.setRange)
  const setOptions = useFlipStore((st) => st.setOptions)
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const d = s.divine
  const v = useMemo(() => (d ? rateView(d, range) : null), [d, range])
  const geo = useMemo(() => (v ? chartGeo(v) : null), [v])
  const f1 = (n: number): string => fixed(n, 1, lang)

  const ago = (at: number): string => {
    if (!v) return ''
    const h = hoursAgo(at, v.t1)
    if (h === 0) return t('flip.chart.now')
    return h < 24 ? t('flip.ago.h', { h }) : t('flip.ago.dh', { d: Math.floor(h / 24), h: h % 24 })
  }
  const onMove = (e: MouseEvent<SVGSVGElement>): void => {
    if (!v || !geo) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * CH.w
    let best = 0
    for (let i = 1; i < v.points.length; i++) if (Math.abs(geo.x(v.points[i].at) - x) < Math.abs(geo.x(v.points[best].at) - x)) best = i
    setHover(best)
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>): void => {
    if (!v) return
    const n = v.points.length
    if (e.key === 'Escape') {
      setHover(null)
      return
    }
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : null
    if (step === null && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    setHover((h) => {
      const next = step !== null ? (h ?? n - 1) + step : e.key === 'Home' ? 0 : n - 1
      return Math.max(0, Math.min(n - 1, next))
    })
  }

  const head = (
    <div className="ui-box__head">
      <span className="ui-label">
        <FIco name="chart" size="sm" />
        {t('flip.rate.title')}
      </span>
      <span className="ui-label__grow" />
      <div className="ui-seg" role="group" aria-label={t('flip.rate.range')}>
        {(['24h', '7d'] as const).map((r) => (
          <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
            {t(`flip.range.${r}`)}
          </button>
        ))}
      </div>
    </div>
  )

  if (!d || !v || !geo) {
    return (
      <div className="ui-box">
        {head}
        <div className="ui-box__body">
          {s.loading ? (
            <div className="fx-rate-wait">
              <i className="ui-skeleton" style={{ width: 160, height: 26 }} />
              <i className="ui-skeleton" style={{ width: '100%', height: 110 }} />
            </div>
          ) : (
            <div className="ui-empty fx-empty">
              <FIco name="chart" size="lg" />
              <span>{t('flip.rate.none')}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  const pts = v.points
  const last = pts[pts.length - 1]
  const hp = hover !== null ? pts[Math.min(hover, pts.length - 1)] : null
  const svgW = svgRef.current?.getBoundingClientRect().width ?? CH.w
  const k = svgW / CH.w
  const ticks: Array<[number, string, 'start' | 'middle' | 'end']> =
    range === '24h'
      ? [
          [v.t0, t('flip.tick.h24'), 'start'],
          [v.t0 + 12 * HOUR, t('flip.tick.h12'), 'middle'],
          [v.t1, t('flip.chart.now'), 'end']
        ]
      : [
          [v.t0, t('flip.tick.d7'), 'start'],
          [v.t0 + 84 * HOUR, t('flip.tick.d35'), 'middle'],
          [v.t1, t('flip.chart.now'), 'end']
        ]
  const band = v.lo !== null && v.hi !== null ? { lo: v.lo, hi: v.hi } : null
  const corridor = band ? `${f1(band.lo)}–${f1(band.hi)}` : ''
  const week = d.outside && d.week ? d.week : null
  const sent = s.options.divineAlert ? (s.alertSent ? 'flip.out.sent' : 'flip.out.next') : 'flip.out.off'
  const yLabel = (g: number): string => fixed(g, geo.st < 1 ? 1 : 0, lang)
  const rateText = f1(d.current)
  const deltaText = f1(Math.abs(v.delta))
  const deltaWords = deltaSay(v.delta, deltaText, t(`flip.delta.${range}`))

  return (
    <div className="ui-box">
      {head}
      <div className="ui-box__body fx-rate-body">
        <div className="fx-rate">
          <TipAnchor
            className="ui-figure__value ui-cur"
            focusable
            tip={<RateTipBody rate={d.current} text={rateText} lang={ul} extra={<span className="ui-cur-tip__faint">{t('flip.rate.current.title')}</span>} />}
          >
            <CoinIcon tag="divine" lang={ul} />1 = {rateText}
            {expert ? <small className="ui-figure__unit">chaos</small> : <CoinIcon tag="chaos" lang={ul} />}
          </TipAnchor>
          {expert ? (
            <span className="ui-delta" title={deltaWords}>
              <FIco name={v.delta >= 0 ? 'arrow-up' : 'arrow-down'} />
              {v.delta >= 0 ? '+' : '−'}
              {deltaText} <span>{t(`flip.delta.${range}`)}</span>
            </span>
          ) : (
            <span className="fx-rate__say">{`1 ${names.after('divine', 1)} = ${rateText} ${names.after('chaos', rateText)}`}</span>
          )}
        </div>
        {!expert && (
          <span className="ui-delta fx-rate__delta">
            {deltaText !== f1(0) && <FIco name={v.delta >= 0 ? 'arrow-up' : 'arrow-down'} />}
            {deltaWords}
          </span>
        )}
        <div className="ui-chart">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CH.w} ${CH.h}`}
            role="img"
            tabIndex={0}
            aria-label={t(band ? 'flip.chart.aria' : 'flip.chart.aria.short', { now: f1(last.rate), range: corridor })}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
          >
            {geo.grid.map((g) => {
              const yy = geo.y(g)
              return (
                <g key={g}>
                  <line className="ui-chart__grid" x1={CH.l} x2={CH.w - CH.r} y1={yy} y2={yy} />
                  <text className="ui-chart__tick" x={CH.l - 6} y={yy + 3.5} textAnchor="end">
                    {yLabel(g)}
                  </text>
                </g>
              )
            })}
            {ticks.map(([at, label, anchor]) => (
              <text key={label} className="ui-chart__tick" x={geo.x(at)} y={CH.h - 6} textAnchor={anchor}>
                {label}
              </text>
            ))}
            {band && (
              <rect
                className="ui-chart__band"
                x={CH.l}
                y={geo.y(band.hi)}
                width={CH.w - CH.l - CH.r}
                height={Math.max(1, geo.y(band.lo) - geo.y(band.hi))}
              />
            )}
            <path className="ui-chart__line" d={pts.map((p, i) => `${i ? 'L' : 'M'}${geo.x(p.at).toFixed(1)} ${geo.y(p.rate).toFixed(1)}`).join('')} />
            <circle className={v.outside ? 'ui-chart__dot ui-chart__dot--warn' : 'ui-chart__dot'} cx={geo.x(last.at)} cy={geo.y(last.rate)} r={4.5} />
            <text className={v.outside ? 'ui-chart__value ui-chart__value--warn' : 'ui-chart__value'} x={geo.x(last.at) + 8} y={geo.y(last.rate) + 4}>
              {f1(last.rate)}
            </text>
            {hp && (
              <g>
                <line className="ui-chart__cross" x1={geo.x(hp.at)} x2={geo.x(hp.at)} y1={CH.t} y2={CH.h - CH.b} />
                <circle className="ui-chart__dot" cx={geo.x(hp.at)} cy={geo.y(hp.rate)} r={4.5} />
              </g>
            )}
            <rect className="ui-chart__hit" x={CH.l} y={0} width={CH.w - CH.l - CH.r + 6} height={CH.h - CH.b} />
          </svg>
          {hp && (
            <div
              className="ui-tip ui-chart__tip"
              style={{
                left: Math.max(110, Math.min(svgW - 110, geo.x(hp.at) * k + 4)),
                top: Math.min(band ? geo.y(band.hi) : CH.h, geo.y(hp.rate)) * k + 6
              }}
            >
              <b>{expert ? `${f1(hp.rate)} chaos` : `${f1(hp.rate)} ${names.after('chaos', f1(hp.rate))}`}</b>{' '}
              <span>{band ? t('flip.chart.tip', { range: corridor, ago: ago(hp.at) }) : ago(hp.at)}</span>
            </div>
          )}
        </div>
        <div className="fx-band-l">
          <span className="fx-legend">
            <i className="ln" />
            {t('flip.legend.line')}
          </span>
          {band && (
            <span className="fx-legend">
              <i />
              {t('flip.legend.band', { range: corridor })}
            </span>
          )}
        </div>
        {week && (
          <div className="ui-banner fx-warn" role="status">
            <FIco name="warn" />
            <span>
              <b>{t('flip.out.title')}</b> ({f1(week.lo)}–{f1(week.hi)}). {t(sent)}
            </span>
            <span />
          </div>
        )}
        <WSwitch
          on={s.options.divineAlert}
          label={t('flip.alert.switch')}
          title={t('flip.alert.switch.title')}
          onChange={(on) => void setOptions({ divineAlert: on })}
        />
      </div>
    </div>
  )
}
