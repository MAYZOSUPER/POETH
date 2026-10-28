import { useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { WealthPoint } from '@shared/types'
import { useT } from '../../i18n'
import { WIco } from './ui'
import { axisLabel, CH, chartGeo, df, nf, rangePoints, tickLabel, timeOf, type ChartRange } from './format'

// График стоимости тайника по макету «Богатство» v2: одна линия 2 px, сетка в волос, точка и значение
// на конце, шкала не от нуля. Наведение и стрелки клавиатуры — перекрестие с подсказкой; «Таблица» —
// те же точки списком. Свой SVG, без библиотек.

export function WealthChart({ points, lang, expert }: { points: readonly WealthPoint[]; lang: string; expert: boolean }) {
  const t = useT()
  const [range, setRange] = useState<ChartRange>('24h')
  const [table, setTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const pts = useMemo(() => rangePoints(points, range), [points, range])
  const geo = useMemo(() => chartGeo(pts), [pts])
  const total = geo ? geo.t1 - geo.t0 : 0
  const withDate = total > 24 * 3_600_000
  const divOf = (p: WealthPoint): string => (p.divineRate > 0 ? df(p.chaos / p.divineRate, lang) : '—')

  const onMove = (e: MouseEvent<SVGSVGElement>): void => {
    if (!geo) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * CH.w
    let best = 0
    for (let i = 1; i < geo.pts.length; i++) if (Math.abs(geo.x(geo.pts[i].at) - x) < Math.abs(geo.x(geo.pts[best].at) - x)) best = i
    setHover(best)
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>): void => {
    if (!geo) return
    const n = geo.pts.length
    const cur = hover ?? n - 1
    const next = e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowRight' ? cur + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
    if (e.key === 'Escape') {
      setHover(null)
      return
    }
    if (next === null) return
    e.preventDefault()
    setHover(Math.max(0, Math.min(n - 1, next)))
  }

  const hp = geo && hover !== null ? geo.pts[hover] : null
  const svgW = svgRef.current?.getBoundingClientRect().width ?? CH.w
  const k = svgW / CH.w
  const last = geo ? geo.pts[geo.pts.length - 1] : null

  return (
    <div className="wl-box">
      <div className="wl-box-h">
        <span className="ui-label">
          <WIco name="chart" size="sm" />
          {t('wealth.chart')}
        </span>
        <span className="ui-label__grow" />
        {points.length > 1 && (
          <>
            <div className="ui-seg" role="group">
              {(['24h', '7d', 'league'] as const).map((r) => (
                <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
                  {t(`wealth.range.${r}`)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`ui-btn ui-btn--ghost ui-btn--sm${expert ? ' ui-btn--icon' : ''}`}
              aria-pressed={table}
              title={t('wealth.chart.table.title')}
              onClick={() => setTable(!table)}
            >
              <WIco name="table" />
              {expert ? null : t('wealth.chart.table')}
            </button>
          </>
        )}
      </div>
      {geo && last ? (
        <div className="w-chart">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CH.w} ${CH.h}`}
            role="img"
            tabIndex={0}
            aria-label={t('wealth.chart.aria', { from: nf(geo.pts[0].chaos, lang), to: nf(last.chaos, lang) })}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            onKeyDown={onKey}
            onBlur={() => setHover(null)}
          >
            {geo.grid.map((v) => {
              const yy = geo.y(v)
              return (
                <g key={v}>
                  <line className="w-grid-l" x1={CH.l} x2={CH.w - CH.r} y1={yy} y2={yy} />
                  <text className="w-axis-t" x={CH.l - 8} y={yy + 3.5} textAnchor="end">
                    {axisLabel(v, lang)}
                  </text>
                </g>
              )
            })}
            {geo.ticks.map((tk) => (
              <text key={tk.at} className="w-axis-t" x={geo.x(tk.at)} y={CH.h - 8} textAnchor={tk.anchor}>
                {tickLabel(t, tk.at, geo.t1, total, lang)}
              </text>
            ))}
            <path className="w-line" d={geo.pts.map((p, i) => `${i ? 'L' : 'M'}${geo.x(p.at).toFixed(1)} ${geo.y(p.chaos).toFixed(1)}`).join('')} />
            <circle className="w-end" cx={geo.x(last.at)} cy={geo.y(last.chaos)} r={5} />
            <text className="w-end-t" x={geo.x(last.at) + 10} y={geo.y(last.chaos) + 4}>
              {nf(last.chaos, lang)}
            </text>
            {hp && (
              <g>
                <line className="w-cross" x1={geo.x(hp.at)} x2={geo.x(hp.at)} y1={CH.t} y2={CH.h - CH.b} />
                <circle className="w-end" cx={geo.x(hp.at)} cy={geo.y(hp.chaos)} r={5} />
              </g>
            )}
            <rect className="w-hit" x={CH.l} y={0} width={CH.w - CH.l - CH.r + 8} height={CH.h - CH.b} />
          </svg>
          {hp && (
            <div
              className="ui-tip w-tip"
              style={{ left: Math.max(90, Math.min(svgW - 90, geo.x(hp.at) * k + 4)), top: geo.y(hp.chaos) * k + 6 }}
            >
              <b>{nf(hp.chaos, lang)} chaos</b> <span>≈ {divOf(hp)} div · {timeOf(hp.at, lang, withDate)}</span>
            </div>
          )}
          {table && (
            <div className="w-ptable ui-scroll">
              <table className="wl-tbl">
                <thead>
                  <tr>
                    <th>{t('wealth.col.when')}</th>
                    <th style={{ textAlign: 'right' }}>chaos</th>
                    <th style={{ textAlign: 'right' }}>div</th>
                  </tr>
                </thead>
                <tbody>
                  {[...geo.pts].reverse().map((p) => (
                    <tr key={p.at}>
                      <td>{timeOf(p.at, lang, true)}</td>
                      <td style={{ textAlign: 'right' }}>{nf(p.chaos, lang)}</td>
                      <td style={{ textAlign: 'right' }}>{divOf(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="ui-empty">
          <WIco name="chart" size="lg" />
          <span>{t('wealth.chart.empty')}</span>
        </div>
      )}
    </div>
  )
}
