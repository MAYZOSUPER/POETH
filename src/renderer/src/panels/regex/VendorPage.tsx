import { useMemo } from 'react'
import type { RegexLang, SocketColor, VendorItemClass, VendorModKey, VendorQuery, VendorRarity } from '@shared/types'
import {
  VENDOR_ITEM_CLASSES,
  VENDOR_PRESETS,
  VENDOR_RARITIES,
  buildVendorRegex,
  emptyVendorQuery,
  isPresetQuery,
  isThresholdMod,
  presetQuery,
  selectedMods,
  vendorModText
} from '@shared/regex'
import { Select } from '../../components/Select'
import { useT } from '../../i18n'
import { useRegexStore } from '../../store/useRegexStore'
import { Box, Hint, NumberRow, ResultBox, Seg, Switch, useGameLang, useSimple } from './common'
import './vendor.css'

// Страница «Торговец» (макет: связи, R-G-B, скорость; в экспертном режиме — гнёзда, цвета, качество,
// уровень камня). S27: готовые наборы, свойства предметов (простой режим — скорость, здоровье,
// сопротивления, «+ к уровню камней»; экспертный — все группы), класс и редкость — условия «И».

const LINKS: VendorQuery['links'][] = [0, 3, 4, 5, 6]
const COLORS: SocketColor[] = ['r', 'g', 'b', 'w']

type Group = { id: string; num?: VendorModKey[]; chips?: VendorModKey[] }

/** Группы свойств экспертного режима (подписи — regex.vendor.group.<id>). */
const GROUPS: Group[] = [
  { id: 'defence', num: ['life', 'mana', 'energyShield'] },
  { id: 'res', num: ['resFire', 'resCold', 'resLightning', 'resChaos', 'resAll'] },
  {
    id: 'gems',
    chips: ['gemAll', 'gemSpell', 'gemFire', 'gemCold', 'gemLightning', 'gemChaos', 'gemPhys', 'gemMinion', 'gemBow', 'gemMelee']
  },
  { id: 'damage', num: ['spellDamage', 'physDamage', 'eleAttack'] },
  { id: 'addAttack', chips: ['addAttackPhys', 'addAttackFire', 'addAttackCold', 'addAttackLightning', 'addAttackChaos'] },
  { id: 'addSpell', chips: ['addSpellPhys', 'addSpellFire', 'addSpellCold', 'addSpellLightning', 'addSpellChaos'] },
  { id: 'speed', num: ['moveSpeed', 'attackSpeed', 'castSpeed', 'critChance'] },
  { id: 'attributes', num: ['str', 'dex', 'int', 'allAttributes'] }
]

/** Простой режим: то, что ищут на прокачке и в начале лиги. */
const SIMPLE_GROUPS: Group[] = [
  { id: 'main', num: ['moveSpeed', 'life'] },
  { id: 'res', num: ['resFire', 'resCold', 'resLightning', 'resAll'] },
  GROUPS[2]
]

/** Свойства, которые видны в простом режиме (остальные выбранные — строкой «Ещё выбрано»). */
const SIMPLE_KEYS = new Set<VendorModKey>(SIMPLE_GROUPS.flatMap((g) => [...(g.num ?? []), ...(g.chips ?? [])]))

/** Короткая подпись внутри группы: стихия или тип камня (полное имя — в подсказке и «что убрать»). */
const CHIP: Partial<Record<VendorModKey, string>> = {
  gemAll: 'regex.vendor.chip.all',
  gemSpell: 'regex.vendor.chip.spell',
  gemFire: 'regex.vendor.el.fire',
  gemCold: 'regex.vendor.el.cold',
  gemLightning: 'regex.vendor.el.lightning',
  gemChaos: 'regex.vendor.el.chaos',
  gemPhys: 'regex.vendor.el.phys',
  gemMinion: 'regex.vendor.chip.minion',
  gemBow: 'regex.vendor.chip.bow',
  gemMelee: 'regex.vendor.chip.melee',
  addAttackPhys: 'regex.vendor.el.phys',
  addAttackFire: 'regex.vendor.el.fire',
  addAttackCold: 'regex.vendor.el.cold',
  addAttackLightning: 'regex.vendor.el.lightning',
  addAttackChaos: 'regex.vendor.el.chaos',
  addSpellPhys: 'regex.vendor.el.phys',
  addSpellFire: 'regex.vendor.el.fire',
  addSpellCold: 'regex.vendor.el.cold',
  addSpellLightning: 'regex.vendor.el.lightning',
  addSpellChaos: 'regex.vendor.el.chaos',
  // в группе «Сопротивления» — короткие подписи
  resFire: 'regex.vendor.el.fire',
  resCold: 'regex.vendor.el.cold',
  resLightning: 'regex.vendor.el.lightning',
  resChaos: 'regex.vendor.el.chaos',
  resAll: 'regex.vendor.short.resAll'
}

/** Порог в процентах (иначе — просто число: здоровье, характеристики). */
function isPercent(lang: RegexLang, key: VendorModKey): boolean {
  return vendorModText(lang, key).every((l) => l.includes('#%'))
}

/** Строки мода в игре — подсказка «что именно ищем». */
function gameText(lang: RegexLang, key: VendorModKey): string {
  return vendorModText(lang, key).join(' · ')
}

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

  // порог: подпись | ≥ | число | %; пусто — свойство не ищем
  const numRow = (key: VendorModKey) => (
    <div key={key} className="rx-v-row" title={gameText(lang, key)}>
      <label htmlFor={`rx-v-${key}`}>{t(CHIP[key] ?? `regex.vendor.mod.${key}`)}</label>
      <span className="rx-v-unit">≥</span>
      <input
        id={`rx-v-${key}`}
        className="ui-input ui-input--num"
        type="number"
        min={0}
        max={999}
        value={q.mods[key] || ''}
        placeholder="—"
        onChange={(e) => {
          const n = Math.round(Number(e.target.value))
          setMod(key, Number.isFinite(n) ? Math.max(0, Math.min(999, n)) : 0)
        }}
      />
      <span className="rx-v-unit">{isPercent(lang, key) ? '%' : ''}</span>
    </div>
  )
  const chip = (key: VendorModKey) => (
    <button
      key={key}
      type="button"
      className="ui-chip"
      aria-pressed={(q.mods[key] ?? 0) > 0}
      title={gameText(lang, key)}
      onClick={() => setMod(key, (q.mods[key] ?? 0) > 0 ? 0 : 1)}
    >
      {t(CHIP[key] ?? `regex.vendor.mod.${key}`)}
    </button>
  )
  const group = (g: Group) => (
    <div key={g.id} className="rx-v-group">
      <span className="ui-label">{t(`regex.vendor.group.${g.id}`)}</span>
      {g.num && <div className="rx-v-nums">{g.num.map(numRow)}</div>}
      {g.chips && (
        <div className="ui-chips">
          {g.id === 'gems' && (
            <button
              type="button"
              className="ui-chip"
              aria-pressed={q.plusGemLevel}
              title={t('regex.vendor.plusGem')}
              onClick={() => setQuery({ plusGemLevel: !q.plusGemLevel })}
            >
              {t('regex.vendor.chip.any')}
            </button>
          )}
          {g.chips.map(chip)}
        </div>
      )}
    </div>
  )

  const classOptions = [
    { value: '' as const, label: t('regex.vendor.class.any') },
    ...VENDOR_ITEM_CLASSES.map((c) => ({ value: c, label: t(`regex.vendor.class.${c}`) }))
  ]
  const activePreset = VENDOR_PRESETS.find((p) => isPresetQuery(p, q))
  const hidden = selectedMods(q).filter((k) => !SIMPLE_KEYS.has(k))

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
          {(simple ? SIMPLE_GROUPS : GROUPS).map(group)}
          {simple && hidden.length > 0 && (
            <div className="rx-v-group">
              <span className="ui-label">{t('regex.vendor.moreSelected')}</span>
              <div className="ui-chips">
                {hidden.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="ui-chip"
                    aria-pressed
                    title={`${gameText(lang, k)} — ${t('regex.vendor.moreSelectedTip')}`}
                    onClick={() => setMod(k, 0)}
                  >
                    {isThresholdMod(k) ? `${modName(k)} ≥ ${q.mods[k]}${isPercent(lang, k) ? '%' : ''}` : modName(k)}
                  </button>
                ))}
              </div>
            </div>
          )}
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
