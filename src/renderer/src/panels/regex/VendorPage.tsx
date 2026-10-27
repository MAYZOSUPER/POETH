import { useMemo } from 'react'
import type { SocketColor, VendorQuery } from '@shared/types'
import { buildVendorRegex, emptyVendorQuery } from '@shared/regex'
import { useT } from '../../i18n'
import { useRegexStore } from '../../store/useRegexStore'
import { ResultBox, Seg, useGameLang } from './common'

// Страница «Торговец»: связи и цвета гнёзд, скорость, качество, «+ к уровню камней», уровень камня.

const LINKS: VendorQuery['links'][] = [0, 3, 4, 5, 6]
const COLORS: SocketColor[] = ['r', 'g', 'b', 'w']
const SPEEDS = [0, 10, 15, 20, 25, 30]

export function VendorPage() {
  const t = useT()
  const lang = useGameLang()
  const q = useRegexStore((s) => s.prefs.vendor)
  const setPrefs = useRegexStore((s) => s.setPrefs)
  const setQuery = (patch: Partial<VendorQuery>): void => setPrefs({ vendor: { ...q, ...patch } })
  const result = useMemo(() => buildVendorRegex(lang, q), [lang, q])

  const labels: Record<string, string> = {
    links: t('regex.vendor.links'),
    sixSockets: t('regex.vendor.sixSockets'),
    rgb: t('regex.vendor.rgb'),
    color: t('regex.vendor.color'),
    movementSpeed: t('regex.vendor.move'),
    quality: t('regex.vendor.quality'),
    plusGemLevel: t('regex.vendor.plusGem')
  }
  const overflowText = result.overflow
    ? t('regex.overflow', {
        n: result.overflow.by,
        list: result.overflow.suggest.map((s) => (s.kind === 'option' ? labels[s.key] ?? s.key : '')).join('; ')
      })
    : undefined

  return (
    <div className="rx-page">
      <ResultBox
        result={result}
        defaultName={t('regex.vendor.genName', { summary: summarize(q, labels) })}
        onReset={() => setPrefs({ vendor: emptyVendorQuery() })}
        overflowText={overflowText}
      />
      <div className="rx-cols">
        <div className="rx-col-main rx-vendor">
          <div className="rx-field">
            <div className="rx-field-label">{t('regex.vendor.mode')}</div>
            <Seg
              small
              value={q.mode}
              onChange={(v) => setQuery({ mode: v })}
              options={[
                { value: 'any', label: t('regex.vendor.any') },
                { value: 'all', label: t('regex.vendor.all') }
              ]}
            />
          </div>
          <div className="rx-field">
            <div className="rx-field-label">{t('regex.vendor.links')}</div>
            <Seg
              small
              value={q.links}
              onChange={(v) => setQuery({ links: v })}
              options={LINKS.map((n) => ({
                value: n,
                label: n === 0 ? t('regex.vendor.linksAny') : t('regex.vendor.linksN', { n })
              }))}
            />
          </div>
          <label className="row-toggle">
            <input type="checkbox" checked={q.rgb} onChange={(e) => setQuery({ rgb: e.target.checked })} />
            <span>{t('regex.vendor.rgb')}</span>
          </label>
          <label className="row-toggle">
            <input
              type="checkbox"
              checked={q.sixSockets}
              onChange={(e) => setQuery({ sixSockets: e.target.checked })}
            />
            <span>{t('regex.vendor.sixSockets')}</span>
          </label>
          <div className="rx-field">
            <div className="rx-field-label">{t('regex.vendor.color')}</div>
            <div className="rx-inline">
              <Seg
                small
                value={q.colorCount}
                onChange={(v) => setQuery({ colorCount: v })}
                options={[0, 2, 3, 4].map((n) => ({ value: n, label: n === 0 ? t('regex.vendor.linksAny') : String(n) }))}
              />
              <Seg<SocketColor>
                small
                value={q.color}
                onChange={(v) => setQuery({ color: v, colorCount: q.colorCount || 2 })}
                options={COLORS.map((c) => ({ value: c, label: t(`regex.vendor.color.${c}`) }))}
              />
            </div>
          </div>
          <div className="rx-field">
            <div className="rx-field-label">{t('regex.vendor.move')}</div>
            <Seg
              small
              value={q.movementSpeed}
              onChange={(v) => setQuery({ movementSpeed: v })}
              options={SPEEDS.map((n) => ({ value: n, label: n === 0 ? t('regex.vendor.linksAny') : `${n}%+` }))}
            />
          </div>
          <NumberField
            label={t('regex.vendor.quality')}
            value={q.quality}
            max={30}
            suffix="%"
            off={t('regex.off')}
            onChange={(n) => setQuery({ quality: n })}
          />
          <label className="row-toggle">
            <input
              type="checkbox"
              checked={q.plusGemLevel}
              onChange={(e) => setQuery({ plusGemLevel: e.target.checked })}
            />
            <span>{t('regex.vendor.plusGem')}</span>
          </label>
          <NumberField
            label={t('regex.vendor.gemLevel')}
            value={q.gemLevel}
            max={40}
            off={t('regex.off')}
            onChange={(n) => setQuery({ gemLevel: n })}
          />
          <p className="muted small">{t('regex.vendor.gemLevelHint')}</p>
        </div>
        <div className="rx-col-side">
          <p className="rx-hint">{t('regex.vendor.hint')}</p>
          <p className="rx-hint small">{t('regex.howto')}</p>
        </div>
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  max,
  suffix = '',
  off,
  onChange
}: {
  label: string
  value: number
  max: number
  suffix?: string
  off: string
  onChange: (n: number) => void
}) {
  return (
    <div className="rx-field rx-number">
      <div className="rx-field-label">{label}</div>
      <span className="rx-threshold-val">
        {value > 0 ? '≥ ' : ''}
        <input
          type="number"
          min={0}
          max={max}
          value={value || ''}
          placeholder={off}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value))
            onChange(Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0)
          }}
        />
        {value > 0 ? suffix : ''}
      </span>
    </div>
  )
}

function summarize(q: VendorQuery, labels: Record<string, string>): string {
  const parts: string[] = []
  if (q.links) parts.push(`${q.links}L`)
  if (q.rgb) parts.push('R-G-B')
  if (q.sixSockets) parts.push('6S')
  if (q.colorCount >= 2) parts.push(`${q.colorCount}×${q.color.toUpperCase()}`)
  if (q.movementSpeed) parts.push(`${labels.movementSpeed} ${q.movementSpeed}%+`)
  if (q.quality) parts.push(`Q${q.quality}%+`)
  if (q.plusGemLevel) parts.push('+gem')
  if (q.gemLevel) parts.push(`gem ${q.gemLevel}+`)
  return parts.join(', ') || '—'
}
