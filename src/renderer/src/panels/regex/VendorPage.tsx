import { useMemo } from 'react'
import type { SocketColor, VendorQuery } from '@shared/types'
import { buildVendorRegex, emptyVendorQuery } from '@shared/regex'
import { useT } from '../../i18n'
import { useRegexStore } from '../../store/useRegexStore'
import { Box, Hint, NumberRow, ResultBox, Seg, Switch, useGameLang, useSimple } from './common'

// Страница «Торговец» (макет: связи, R-G-B, скорость; в экспертном режиме — гнёзда, цвета,
// качество, «+ к уровню камней», уровень камня).

const LINKS: VendorQuery['links'][] = [0, 3, 4, 5, 6]
const COLORS: SocketColor[] = ['r', 'g', 'b', 'w']

export function VendorPage() {
  const t = useT()
  const simple = useSimple()
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
    <div className="rx-two">
      <div className="rx-stack">
        <Box title={t('regex.vendor.title')}>
          <div className="rx-row">
            <span>{t('regex.vendor.links')}</span>
            <Seg
              value={q.links}
              label={t('regex.vendor.links')}
              onChange={(v) => setQuery({ links: v })}
              options={LINKS.map((n) => ({ value: n, label: n === 0 ? '—' : `${n}L` }))}
            />
          </div>
          <Switch on={q.rgb} onChange={(v) => setQuery({ rgb: v })}>
            {t('regex.vendor.rgb')}
          </Switch>
          {simple && <div className="ui-field__help">{t('regex.vendor.colorHint')}</div>}
          <NumberRow
            id="rx-ms"
            label={t('regex.vendor.moveAtLeast')}
            value={q.movementSpeed}
            max={99}
            onChange={(n) => setQuery({ movementSpeed: n })}
          />
          <Switch on={q.plusGemLevel} onChange={(v) => setQuery({ plusGemLevel: v })}>
            {t('regex.vendor.plusGem')}
          </Switch>
          {!simple && (
            <>
              <Switch on={q.sixSockets} onChange={(v) => setQuery({ sixSockets: v })}>
                {t('regex.vendor.sixSockets')}
              </Switch>
              <div className="rx-row">
                <span>{t('regex.vendor.color')}</span>
                <span className="rx-inline">
                  <Seg
                    value={q.colorCount}
                    label={t('regex.vendor.color')}
                    onChange={(v) => setQuery({ colorCount: v })}
                    options={[0, 2, 3, 4].map((n) => ({ value: n, label: n === 0 ? '—' : String(n) }))}
                  />
                  <Seg<SocketColor>
                    value={q.color}
                    label={t('regex.vendor.colorWhich')}
                    onChange={(v) => setQuery({ color: v, colorCount: q.colorCount || 2 })}
                    options={COLORS.map((c) => ({ value: c, label: c.toUpperCase(), title: t(`regex.vendor.color.${c}`) }))}
                  />
                </span>
              </div>
              <NumberRow
                id="rx-quality"
                label={t('regex.vendor.qualityAtLeast')}
                value={q.quality}
                max={30}
                onChange={(n) => setQuery({ quality: n })}
              />
              <NumberRow
                id="rx-gem"
                label={t('regex.vendor.gemLevel')}
                value={q.gemLevel}
                max={40}
                onChange={(n) => setQuery({ gemLevel: n })}
              />
              <div className="ui-field__help">{t('regex.vendor.gemLevelHint')}</div>
            </>
          )}
          <div className="rx-row">
            <span>{t('regex.vendor.mode')}</span>
            <Seg
              value={q.mode}
              label={t('regex.vendor.mode')}
              onChange={(v) => setQuery({ mode: v })}
              options={[
                { value: 'any', label: t('regex.vendor.any') },
                { value: 'all', label: t('regex.vendor.all') }
              ]}
            />
          </div>
          {simple && <Hint>{t('regex.vendor.hint')}</Hint>}
        </Box>
      </div>
      <div className="rx-stack rx-sticky">
        <ResultBox
          result={result}
          defaultName={t('regex.vendor.genName', { summary: summarize(q, labels) })}
          onReset={() => setPrefs({ vendor: emptyVendorQuery() })}
          overflowText={overflowText}
          hint={t('regex.vendor.howto')}
        />
      </div>
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
