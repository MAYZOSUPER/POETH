import { useMemo } from 'react'
import type { SocketColor, VendorItemClass, VendorModKey, VendorQuery, VendorRarity } from '@shared/types'
import {
  VENDOR_ITEM_CLASSES,
  VENDOR_PRESETS,
  VENDOR_RARITIES,
  buildVendorRegex,
  emptyVendorQuery,
  isPresetQuery,
  isThresholdMod,
  presetQuery,
  selectedMods
} from '@shared/regex'
import { Select } from '../../components/Select'
import { useT } from '../../i18n'
import { useRegexStore } from '../../store/useRegexStore'
import { Box, Hint, NumberRow, ResultBox, Seg, Switch, useGameLang, useSimple } from './common'
import { PropGroups } from './PropGroups'

// Страница «Торговец» (макет: связи, R-G-B, скорость; в экспертном режиме — гнёзда, цвета, качество,
// уровень камня). S27: готовые наборы, свойства предметов (простой режим — скорость, здоровье,
// сопротивления, «+ к уровню камней»; экспертный — все группы; блок общий со страницей «Предметы» —
// PropGroups.tsx), класс и редкость — условия «И».

const LINKS: VendorQuery['links'][] = [0, 3, 4, 5, 6]
const COLORS: SocketColor[] = ['r', 'g', 'b', 'w']

export function VendorPage() {
  const t = useT()
  const simple = useSimple()
  const lang = useGameLang()
  const q = useRegexStore((s) => s.prefs.vendor)
  const setPrefs = useRegexStore((s) => s.setPrefs)
  const setQuery = (patch: Partial<VendorQuery>): void => setPrefs({ vendor: { ...q, ...patch } })
  const setMod = (key: VendorModKey, n: number): void => {
    const mods = { ...q.mods }
    if (n > 0) mods[key] = n
    else delete mods[key]
    setQuery({ mods })
  }
  const result = useMemo(() => buildVendorRegex(lang, q), [lang, q])

  const modName = (key: VendorModKey): string => t(`regex.vendor.mod.${key}`)
  const labels: Record<string, string> = {
    links: t('regex.vendor.links'),
    sixSockets: t('regex.vendor.sixSockets'),
    rgb: t('regex.vendor.rgb'),
    color: t('regex.vendor.color'),
    quality: t('regex.vendor.quality'),
    plusGemLevel: t('regex.vendor.plusGem')
  }
  const optionLabel = (key: string): string => (key.startsWith('mod.') ? modName(key.slice(4) as VendorModKey) : labels[key] ?? key)
  const overflowText = result.overflow
    ? t('regex.overflow', {
        n: result.overflow.by,
        list: result.overflow.suggest.map((s) => (s.kind === 'option' ? optionLabel(s.key) : '')).join('; ')
      })
    : undefined
  const sideList = [...result.also.map(modName), ...result.side.map((s) => t(`regex.vendor.side.${s}`))]
  const sideText = sideList.length ? t('regex.vendor.side', { list: sideList.join('; ') }) : undefined

  const classOptions = [
    { value: '' as const, label: t('regex.vendor.class.any') },
    ...VENDOR_ITEM_CLASSES.map((c) => ({ value: c, label: t(`regex.vendor.class.${c}`) }))
  ]
  const activePreset = VENDOR_PRESETS.find((p) => isPresetQuery(p, q))

  return (
    <div className="rx-two">
      <div className="rx-stack">
        <Box title={t('regex.vendor.presets')} tip={t('regex.vendor.presetsTip')}>
          <div className="ui-chips">
            {VENDOR_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="ui-chip"
                aria-pressed={activePreset?.id === p.id}
                title={t(`regex.vendor.preset.${p.id}.desc`)}
                onClick={() => setPrefs({ vendor: { ...presetQuery(p), mode: q.mode } })}
              >
                {t(`regex.vendor.preset.${p.id}.name`)}
              </button>
            ))}
          </div>
          {simple && (
            <div className="ui-field__help">
              {activePreset ? t(`regex.vendor.preset.${activePreset.id}.desc`) : t('regex.vendor.presetsHint')}
            </div>
          )}
        </Box>

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

        <Box title={t('regex.vendor.mods.title')} tip={t('regex.vendor.mods.tip')}>
          <div className="rx-row">
            <span>{t('regex.vendor.class')}</span>
            <Select<VendorItemClass | ''>
              className="rx-v-class"
              value={q.itemClass}
              label={t('regex.vendor.class')}
              options={classOptions}
              onChange={(v) => setQuery({ itemClass: v })}
            />
          </div>
          <div className="rx-row">
            <span>{t('regex.vendor.rarity')}</span>
            <span className="ui-chips">
              {VENDOR_RARITIES.map((r: VendorRarity) => (
                <button
                  key={r}
                  type="button"
                  className="ui-chip"
                  aria-pressed={q.rarity.includes(r)}
                  onClick={() =>
                    setQuery({ rarity: q.rarity.includes(r) ? q.rarity.filter((x) => x !== r) : [...q.rarity, r] })
                  }
                >
                  {t(`regex.vendor.rarity.${r}`)}
                </button>
              ))}
            </span>
          </div>
          {simple && <div className="ui-field__help">{t('regex.vendor.classHint')}</div>}
          <PropGroups
            values={q.mods}
            onSet={setMod}
            simple={simple}
            lang={lang}
            idPrefix="rx-v"
            gemsExtra={
              <button
                type="button"
                className="ui-chip"
                aria-pressed={q.plusGemLevel}
                title={t('regex.vendor.plusGem')}
                onClick={() => setQuery({ plusGemLevel: !q.plusGemLevel })}
              >
                {t('regex.vendor.chip.any')}
              </button>
            }
          />
          {simple && <Hint>{t('regex.vendor.mods.hint')}</Hint>}
        </Box>
      </div>
      <div className="rx-stack rx-sticky">
        <ResultBox
          result={result}
          defaultName={t('regex.vendor.genName', { summary: summarize(q, t, modName) })}
          onReset={() => setPrefs({ vendor: emptyVendorQuery() })}
          overflowText={overflowText}
          sideText={sideText}
          hint={t('regex.vendor.howto')}
        />
      </div>
    </div>
  )
}

function summarize(q: VendorQuery, t: ReturnType<typeof useT>, modName: (k: VendorModKey) => string): string {
  const parts: string[] = []
  if (q.itemClass) parts.push(t(`regex.vendor.class.${q.itemClass}`))
  if (q.links) parts.push(`${q.links}L`)
  if (q.rgb) parts.push('R-G-B')
  if (q.sixSockets) parts.push('6S')
  if (q.colorCount >= 2) parts.push(`${q.colorCount}×${q.color.toUpperCase()}`)
  for (const k of selectedMods(q)) parts.push(isThresholdMod(k) ? `${modName(k)} ${q.mods[k]}+` : modName(k))
  if (q.quality) parts.push(`Q${q.quality}%+`)
  if (q.plusGemLevel) parts.push('+gem')
  if (q.gemLevel) parts.push(`gem ${q.gemLevel}+`)
  return parts.join(', ') || '—'
}
