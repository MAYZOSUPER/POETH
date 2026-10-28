import { useMemo, useState, type MouseEvent } from 'react'
import type { WealthPoint } from '@shared/types'
import { useT } from '../../i18n'
import { chartGeometry, chartSeries, fmtNum, type ChartRange, type ChartUnit } from './format'

// Лёгкий график стоимости по времени — свой SVG, без библиотек. Наведение показывает точку снимка.

const W = 640
const H = 160

export function WealthChart({
  points,
  lang,
  now,
  sessionStart
}: {
  points: readonly WealthPoint[]
  lang: string
  now: number
  sessionStart?: number
}) {
  const t = useT()
  const [range, setRange] = useState<ChartRange>('day')
  const [unit, setUnit] = useState<ChartUnit>('chaos')
  const [hover, setHover] = useState<number | null>(null)
  const series = useMemo(() => chartSeries(points, range, unit, now), [points, range, unit, now])
  const geo = useMemo(() => chartGeometry(series, W, H), [series])
  const dot = hover !== null && geo ? geo.dots[hover] : null
  const startX =
    geo && sessionStart !== undefined && series.length && sessionStart >= series[0].at && sessionStart <= series[series.length - 1].at
      ? 6 + ((sessionStart - series[0].at) / Math.max(1, series[series.length - 1].at - series[0].at)) * (W - 12)
      : null

  const onMove = (e: MouseEvent<SVGSVGElement>): void => {
    if (!geo) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    for (let i = 1; i < geo.dots.length; i++) if (Math.abs(geo.dots[i].x - x) < Math.abs(geo.dots[best].x - x)) best = i
    setHover(best)
  }

  return (
    <div className="wl-chart">
      <div className="wl-chart__bar">
        <div className="ui-seg" role="group">
          {(['day', 'week', 'all'] as const).map((r) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
              {t(`wealth.range.${r}`)}
            </button>
          ))}
        </div>
        <div className="ui-seg" role="group">
          {(['chaos', 'divine'] as const).map((u) => (
            <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>
              {t(`wealth.unit.${u}`)}
            </button>
          ))}
        </div>
      </div>
      {geo ? (
        <div className="wl-chart__plot">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={t('wealth.chart')}>
            <path className="wl-chart__area" d={geo.area} />
            {startX !== null && <line className="wl-chart__start" x1={startX} x2={startX} y1={0} y2={H} />}
            <path className="wl-chart__line" d={geo.line} vectorEffect="non-scaling-stroke" />
            {dot && <line className="wl-chart__cursor" x1={dot.x} x2={dot.x} y1={0} y2={H} vectorEffect="non-scaling-stroke" />}
          </svg>
          <span className="wl-chart__max">{fmtNum(geo.max, lang)}</span>
          <span className="wl-chart__min">{fmtNum(geo.min, lang)}</span>
          {dot && (
            <span className="wl-chart__tip" style={{ left: `${(dot.x / W) * 100}%` }}>
              <b>{fmtNum(dot.v, lang)}</b> {t(`wealth.unit.${unit}`)} ·{' '}
              {new Date(dot.at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          )}
        </div>
      ) : (
        <div className="wl-chart__empty">{t('wealth.chart.empty')}</div>
      )}
    </div>
  )
}
