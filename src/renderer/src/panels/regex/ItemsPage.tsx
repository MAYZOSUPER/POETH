import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import type {
  InfluenceKey,
  ItemClassKey,
  ItemModData,
  ItemRarity,
  ItemRegexData,
  ItemsQuery,
  RegexLang,
  TriState,
  VendorModKey
} from '@shared/types'
import {
  CLASSIC_INFLUENCES,
  GEM_CLASSES,
  INFLUENCE_KEYS,
  ITEMS_PRESETS,
  ITEMS_PRESET_GROUPS,
  ITEM_CLASS_KEYS,
  ITEM_RARITIES,
  VENDOR_ITEM_CLASSES,
  buildItemsRegex,
  emptyItemsQuery,
  getItemsIndex,
  hasThreshold,
  isItemsPresetQuery,
  isThresholdMod,
  itemsPresetQuery,
  modFitsClass,
  modInfluences,
  selectedProps
} from '@shared/regex'
import { Select } from '../../components/Select'
import { useLang, useT } from '../../i18n'
import { useRegexStore } from '../../store/useRegexStore'
import { Box, Hint, NumberRow, ResultBox, Seg, shortText, useGameLang, useSimple } from './common'
import { Ico } from './Ico'
import { PropGroups, isPercentProp } from './PropGroups'
import './items.css'

// Страница «Предметы» (S46): строки поиска для тайника. Готовые наборы с объяснением «зачем» (базы под крафт,
// жёлтые на продажу и себе, камни, флаконы), предмет (класс, база, редкость, уровень, влияние, осквернённые),
// свойства «Торговца» (общий блок PropGroups), камни и все моды предметов из RePoE (хочу / не хочу, «≥ N»).
// Справа — та же готовая строка, что у «Карт» и «Торговца».

type T = ReturnType<typeof useT>
type ModState = 'want' | 'avoid' | 'any'
type Filter = 'all' | 'selected' | 'prefix' | 'suffix'

const TRI_ICON = { want: 'check', avoid: 'cross', any: 'dash' } as const
const NEXT: Record<ModState, ModState> = { any: 'want', want: 'avoid', avoid: 'any' }
/** Сколько строк модов показывать сразу: список большой, дальше — уточнить поиск. */
const LIST_MAX = 150

function classLabel(t: T, k: ItemClassKey): string {
  return (VENDOR_ITEM_CLASSES as readonly string[]).includes(k) ? t(`regex.vendor.class.${k}`) : t(`regex.items.class.${k}`)
}

function rarityLabel(t: T, r: ItemRarity): string {
  return r === 'unique' ? t('regex.items.rarity.unique') : t(`regex.vendor.rarity.${r}`)
}

/**
 * Порядок списка: обычные моды, только с влиянием, ремесло, особые; внутри — по алфавиту без ведущих «+#%»
 * (иначе числовые всплывают наверх).
 */
function sortMods(mods: ItemModData[]): ItemModData[] {
  const rank = (m: ItemModData): number => (m.src === 'special' ? 3 : m.src === 'crafted' ? 2 : m.infl ? 1 : 0)
  const key = (m: ItemModData): string => m.display.replace(/^[^\p{L}]+/u, '')
  return [...mods].sort((a, b) => rank(a) - rank(b) || key(a).localeCompare(key(b)))
}

export function ItemsPage() {
  const t = useT()
  const simple = useSimple()
  const uiLang = useLang()
  const lang = useGameLang()
  const q = useRegexStore((s) => s.prefs.items)
  const setPrefs = useRegexStore((s) => s.setPrefs)
  const itemData = useRegexStore((s) => s.itemData)
  const ensureItemData = useRegexStore((s) => s.ensureItemData)

  useEffect(() => {
    void ensureItemData(lang)
    if (uiLang !== lang) void ensureItemData(uiLang)
  }, [lang, uiLang, ensureItemData])

  const data = itemData[lang]
  const other = uiLang !== lang ? itemData[uiLang] : null
  const setQuery = (patch: Partial<ItemsQuery>): void => setPrefs({ items: { ...q, ...patch } })
  const result = useMemo(() => (data ? buildItemsRegex(data, lang, q) : null), [data, lang, q])

  if (data === undefined) return <div className="ui-empty">{t('regex.maps.loading')}</div>
  if (data === null || !result) {
    return <div className="ui-empty">{t('regex.items.noData', { lang: t(`regex.lang.${lang}`) })}</div>
  }

  const index = getItemsIndex(data)
  const modName = (key: VendorModKey): string => t(`regex.vendor.mod.${key}`)
  const lineName = (id: string): string => shortText(index.byId.get(id)?.display ?? id, 40)
  const optionLabel = (key: string): string => {
    if (key.startsWith('prop.')) return modName(key.slice(5) as VendorModKey)
    if (key.startsWith('mod.')) return lineName(key.slice(4))
    if (key.startsWith('avoid.')) return `✕ ${lineName(key.slice(6))}`
    const labels: Record<string, string> = {
      class: t('regex.vendor.class'),
      base: t('regex.items.base'),
      rarity: t('regex.vendor.rarity'),
      itemLevel: t('regex.items.itemLevel'),
      influence: t('regex.items.influence'),
      corrupted: t('regex.flag.corrupted'),
      gems: t('regex.items.gems.title'),
      gemLevel: t('regex.items.gemLevel'),
      gemQuality: t('regex.items.gemQuality'),
      vaal: t('regex.items.vaal')
    }
    return labels[key] ?? key
  }
  const overflowText = result.overflow
    ? t('regex.overflow', {
        n: result.overflow.by,
        list: result.overflow.suggest.map((s) => (s.kind === 'option' ? optionLabel(s.key) : '')).join('; ')
      })
    : undefined
  const sideTexts: string[] = []
  const vendorSide = [...result.also.map(modName), ...result.side.map((s) => t(`regex.vendor.side.${s}`))]
  if (vendorSide.length) sideTexts.push(t('regex.vendor.side', { list: vendorSide.join('; ') }))
  if (result.sideMatches.length) {
    const names = result.sideMatches.slice(0, 3).map(lineName).join('; ')
    const list = result.sideMatches.length > 3 ? t('regex.items.sideMore', { list: names, n: result.sideMatches.length - 3 }) : names
    sideTexts.push(t('regex.items.side', { list }))
  }
  const activePreset = ITEMS_PRESETS.find((p) => isItemsPresetQuery(p, q))
  const triOptions = (['any', 'only', 'exclude'] as TriState[]).map((v) => ({ value: v, label: t(`regex.tri.${v}`) }))

  return (
    <div className="rx-two">
      <div className="rx-stack">
        <Box title={t('regex.items.presets')} tip={t('regex.items.presetsTip')}>
          {ITEMS_PRESET_GROUPS.map((g) => (
            <div key={g} className="rx-i-presets">
              <span className="ui-label">{t(`regex.items.group.${g}`)}</span>
              <div className="ui-chips">
                {ITEMS_PRESETS.filter((p) => p.group === g).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="ui-chip"
                    aria-pressed={activePreset?.id === p.id}
                    title={t(`regex.items.preset.${p.id}.why`)}
                    onClick={() => setPrefs({ items: itemsPresetQuery(p) })}
                  >
                    {t(`regex.items.preset.${p.id}.name`)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {activePreset ? (
            <div className="ui-hint rx-hint rx-i-why">
              <Ico name="info" />
              <span>{t(`regex.items.preset.${activePreset.id}.why`)}</span>
            </div>
          ) : (
            simple && <div className="ui-field__help">{t('regex.items.presetsHint')}</div>
          )}
        </Box>

        <ItemBox data={data} q={q} setQuery={setQuery} triOptions={triOptions} />

        <Box title={t('regex.vendor.mods.title')} tip={t('regex.vendor.mods.tip')}>
          <div className="rx-row" title={t('regex.items.modeTip')}>
            <span>{t('regex.items.mode')}</span>
            <Seg
              value={q.mode}
              label={t('regex.items.mode')}
              onChange={(v) => setQuery({ mode: v })}
              options={[
                { value: 'any', label: t('regex.vendor.any') },
                { value: 'all', label: t('regex.vendor.all') }
              ]}
            />
          </div>
          <PropGroups
            values={q.props}
            onSet={(key, n) => {
              const props = { ...q.props }
              if (n > 0) props[key] = n
              else delete props[key]
              setQuery({ props })
            }}
            simple={simple}
            lang={lang}
            idPrefix="rx-i-p"
          />
          {simple && <Hint>{t('regex.vendor.mods.hint')}</Hint>}
        </Box>

        <Box title={t('regex.items.gems.title')} tip={t('regex.items.gems.tip')}>
          <NumberRow id="rx-i-gem" label={t('regex.items.gemLevel')} value={q.gemLevel} max={40} onChange={(n) => setQuery({ gemLevel: n })} />
          <NumberRow
            id="rx-i-gemq"
            label={t('regex.items.gemQuality')}
            value={q.gemQuality}
            max={30}
            onChange={(n) => setQuery({ gemQuality: n })}
          />
          <div className="rx-row">
            <span>{t('regex.items.vaal')}</span>
            <Seg value={q.vaal} label={t('regex.items.vaal')} onChange={(v) => setQuery({ vaal: v })} options={triOptions} />
          </div>
          {simple && <div className="ui-field__help">{t('regex.items.gemsHint')}</div>}
        </Box>

        <ModsBox data={data} other={other} q={q} setQuery={setQuery} />
      </div>

      <div className="rx-stack rx-sticky">
        <ResultBox
          result={result}
          defaultName={t('regex.items.genName', { summary: summarize(t, data, q, lang) })}
          onReset={() => setPrefs({ items: emptyItemsQuery() })}
          overflowText={overflowText}
          sideText={sideTexts.join(' ') || undefined}
          hint={t('regex.items.howto')}
        />
      </div>
    </div>
  )
}

/** Блок «Предмет»: класс, база, редкость, уровень предмета, влияние, осквернённые. */
function ItemBox({
  data,
  q,
  setQuery,
  triOptions
}: {
  data: ItemRegexData
  q: ItemsQuery
  setQuery: (patch: Partial<ItemsQuery>) => void
  triOptions: { value: TriState; label: string }[]
}) {
  const t = useT()
  const simple = useSimple()
  const classOptions = [
    { value: '' as const, label: t('regex.vendor.class.any') },
    ...ITEM_CLASS_KEYS.map((c) => ({ value: c, label: classLabel(t, c) }))
  ]
  const hasBases = !!q.itemClass && !GEM_CLASSES.includes(q.itemClass)
  const baseOptions = [
    { value: '', label: t('regex.items.base.any') },
    ...data.bases
      .filter((b) => b.cls === q.itemClass)
      .map((b) => ({ value: b.id, label: b.name, hint: t('regex.items.base.option', { level: b.level }) }))
  ]
  const influences = simple ? CLASSIC_INFLUENCES : INFLUENCE_KEYS
  const toggleInfluence = (k: InfluenceKey): void => {
    const list = q.influence.includes(k) ? q.influence.filter((x) => x !== k) : [...q.influence, k]
    setQuery({ influence: list, noInfluence: false })
  }

  return (
    <Box title={t('regex.items.base.title')} tip={t('regex.items.base.tip')}>
      <div className="rx-row">
        <span>{t('regex.vendor.class')}</span>
        <Select<ItemClassKey | ''>
          className="rx-v-class"
          value={q.itemClass}
          label={t('regex.vendor.class')}
          options={classOptions}
          onChange={(v) => setQuery({ itemClass: v, base: '' })}
        />
      </div>
      <div className="rx-row">
        <span>{t('regex.items.base')}</span>
        {hasBases ? (
          <Select<string>
            className="rx-v-class"
            value={q.base}
            label={t('regex.items.base')}
            options={baseOptions}
            onChange={(v) => setQuery({ base: v })}
          />
        ) : (
          <span className="rx-i-muted">{GEM_CLASSES.includes(q.itemClass as ItemClassKey) ? '—' : t('regex.items.base.pickClass')}</span>
        )}
      </div>
      {simple && hasBases && <div className="ui-field__help">{t('regex.items.baseHint')}</div>}
      <div className="rx-row">
        <span>{t('regex.vendor.rarity')}</span>
        <span className="ui-chips">
          {ITEM_RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              className="ui-chip"
              aria-pressed={q.rarity.includes(r)}
              onClick={() => setQuery({ rarity: q.rarity.includes(r) ? q.rarity.filter((x) => x !== r) : [...q.rarity, r] })}
            >
              {rarityLabel(t, r)}
            </button>
          ))}
        </span>
      </div>
      <NumberRow id="rx-i-ilvl" label={t('regex.items.itemLevel')} value={q.itemLevel} max={100} onChange={(n) => setQuery({ itemLevel: n })} />
      {simple && <div className="ui-field__help">{t('regex.items.itemLevelHint')}</div>}
      <div className="rx-i-group">
        <span className="ui-label">{t('regex.items.influence')}</span>
        <div className="ui-chips">
          {influences.map((k) => (
            <button key={k} type="button" className="ui-chip" aria-pressed={q.influence.includes(k)} onClick={() => toggleInfluence(k)}>
              {t(`regex.items.infl.${k}`)}
            </button>
          ))}
          <button
            type="button"
            className="ui-chip"
            aria-pressed={q.noInfluence}
            onClick={() => setQuery({ noInfluence: !q.noInfluence, influence: [] })}
          >
            {t('regex.items.infl.none')}
          </button>
        </div>
        {simple && <div className="ui-field__help">{t('regex.items.influenceHint')}</div>}
      </div>
      <div className="rx-row">
        <span>{t('regex.flag.corrupted')}</span>
        <Seg value={q.corrupted} label={t('regex.flag.corrupted')} onChange={(v) => setQuery({ corrupted: v })} options={triOptions} />
      </div>
    </Box>
  )
}

/** Все моды предметов: поиск, фильтры, хочу / не хочу, порог у «хочу». */
function ModsBox({
  data,
  other,
  q,
  setQuery
}: {
  data: ItemRegexData
  other: ItemRegexData | null | undefined
  q: ItemsQuery
  setQuery: (patch: Partial<ItemsQuery>) => void
}) {
  const t = useT()
  const simple = useSimple()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const sorted = useMemo(() => sortMods(data.mods), [data])
  const otherById = useMemo(() => new Map((other?.mods ?? []).map((m) => [m.id, m])), [other])
  const index = getItemsIndex(data)

  const avoid = new Set(q.avoid)
  const stateOf = (id: string): ModState => (avoid.has(id) ? 'avoid' : id in q.want ? 'want' : 'any')
  const setState = (id: string, state: ModState): void => {
    const want = { ...q.want }
    delete want[id]
    const a = q.avoid.filter((x) => x !== id)
    if (state === 'want') want[id] = 0
    if (state === 'avoid') a.push(id)
    setQuery({ want, avoid: a })
  }
  const selectedCount = Object.keys(q.want).length + q.avoid.length

  const fold = (s: string): string => s.toLowerCase().replace(/ё/g, 'е')
  const words = fold(search).split(/\s+/).filter(Boolean)
  // простой режим без класса и поиска: список слишком большой — показываем только выбранные
  const narrow = simple && !q.itemClass && !words.length && filter !== 'selected'
  const visible = sorted.filter((m) => {
    const state = stateOf(m.id)
    if ((filter === 'selected' || narrow) && state === 'any') return false
    if (state === 'any' && !modFitsClass(m, q.itemClass)) return false
    if (filter === 'prefix' && m.kind === 'suffix') return false
    if (filter === 'suffix' && m.kind === 'prefix') return false
    if (!words.length) return true
    const hay = fold(`${m.display} ${otherById.get(m.id)?.display ?? ''}`)
    return words.every((w) => hay.includes(w))
  })
  const shown = visible.slice(0, LIST_MAX)
  const filters: Filter[] = ['all', 'selected', 'prefix', 'suffix']

  return (
    <Box title={t('regex.items.mods.title')} tip={t('regex.items.mods.tip')}>
      <div className="rx-search">
        <input
          className="ui-input"
          value={search}
          placeholder={t('regex.items.mods.search')}
          aria-label={t('regex.items.mods.search')}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filters.map((f) => (
          <button key={f} type="button" className="ui-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`regex.items.filter.${f}`)}
            {f === 'selected' && selectedCount > 0 && <span className="ui-count">{selectedCount}</span>}
          </button>
        ))}
      </div>
      {simple && (
        <div className="rx-legend">
          <span>{t('regex.maps.legend')}</span>
          {(['any', 'want', 'avoid'] as ModState[]).map((s) => (
            <span key={s} className="ui-tri" data-state={s}>
              <span className="ui-tri__box">
                <Ico name={TRI_ICON[s]} />
              </span>
              {t(`regex.state.${s}`)}
            </span>
          ))}
        </div>
      )}
      {narrow && <div className="ui-field__help">{t('regex.items.mods.pickClass')}</div>}
      <div className="rx-trilist">
        {shown.length === 0 && !narrow && <div className="ui-empty">{t('regex.maps.empty')}</div>}
        {shown.map((m) => (
          <ModRow
            key={m.id}
            mod={m}
            alt={otherById.get(m.id)?.display}
            state={stateOf(m.id)}
            value={q.want[m.id] ?? 0}
            onState={(s) => setState(m.id, s)}
            onValue={(n) => setQuery({ want: { ...q.want, [m.id]: n } })}
            influences={modInfluences(m, q.itemClass)}
            alsoNames={(m.also ?? [])
              .map((id) => index.byId.get(id))
              .filter((x): x is ItemModData => !!x && modFitsClass(x, q.itemClass))
              .map((x) => shortText(x.display, 40))}
          />
        ))}
      </div>
      {visible.length > shown.length && (
        <div className="ui-field__help">{t('regex.items.mods.more', { n: shown.length, total: visible.length })}</div>
      )}
      {simple ? (
        <Hint>{t('regex.items.mods.hint')}</Hint>
      ) : (
        <div className="ui-field__help">
          {t('regex.items.dataInfo', { patch: data.meta.patch, date: data.meta.date, n: data.mods.length, b: data.bases.length })}
        </div>
      )}
    </Box>
  )
}

function ModRow({
  mod,
  alt,
  state,
  value,
  onState,
  onValue,
  influences,
  alsoNames
}: {
  mod: ItemModData
  alt?: string
  state: ModState
  value: number
  onState: (s: ModState) => void
  onValue: (n: number) => void
  influences?: InfluenceKey[]
  alsoNames: string[]
}) {
  const t = useT()
  const simple = useSimple()
  const onContext = (e: MouseEvent): void => {
    e.preventDefault()
    onState(state === 'avoid' ? 'any' : 'avoid')
  }
  const percent = /#%/.test(mod.text)
  return (
    <div className="rx-i-mod">
      <button
        type="button"
        className="ui-tri rx-tri"
        data-state={state}
        title={t('regex.maps.triTitle')}
        onClick={() => onState(NEXT[state])}
        onContextMenu={onContext}
      >
        <span className="ui-tri__box">
          <Ico name={TRI_ICON[state]} />
        </span>
        <span className="rx-tri__text">
          {mod.display.split('\n').map((l, i) => (
            <span key={i} className="rx-tri__line">
              {l}
            </span>
          ))}
          {alt && alt !== mod.display && <span className="rx-tri__alt">{alt.replace(/\n/g, ' · ')}</span>}
        </span>
        <span className="rx-tri__tags">
          {simple && <em className="rx-tri__word">{t(`regex.state.${state}`)}</em>}
          <span className="ui-tag" title={t(`regex.items.tag.${mod.kind}.title`)}>
            {t(`regex.items.tag.${mod.kind}`)}
          </span>
          {mod.src && (
            <span className="ui-tag" title={t(`regex.items.tag.${mod.src}.title`)}>
              {t(`regex.items.tag.${mod.src}`)}
            </span>
          )}
          {influences && (
            <span
              className="ui-tag ui-tag--warn"
              title={t('regex.items.tag.infl.title', { list: influences.map((k) => t(`regex.items.infl.${k}`)).join(', ') })}
            >
              {t('regex.items.tag.infl')}
            </span>
          )}
          {alsoNames.length > 0 && (
            <span className="ui-tag ui-tag--warn" title={t('regex.alsoMatches', { list: alsoNames.join('; ') })}>
              ≈
            </span>
          )}
          {!simple && <code className="rx-token">{mod.token}</code>}
        </span>
      </button>
      {state === 'want' && hasThreshold(mod) && (
        <label className="rx-i-thr" title={t('regex.items.thrTitle')}>
          <span className="rx-v-unit">≥</span>
          <input
            className="ui-input ui-input--num"
            type="number"
            min={0}
            max={999}
            value={value || ''}
            placeholder="—"
            aria-label={`${t('regex.items.atLeast')}: ${shortText(mod.display, 40)}`}
            onChange={(e) => {
              const n = Math.round(Number(e.target.value))
              onValue(Number.isFinite(n) ? Math.max(0, Math.min(999, n)) : 0)
            }}
          />
          <span className="rx-v-unit">{percent ? '%' : ''}</span>
        </label>
      )}
    </div>
  )
}

/** Короткое описание набора для названия в библиотеке. */
function summarize(t: T, data: ItemRegexData, q: ItemsQuery, lang: RegexLang): string {
  const index = getItemsIndex(data)
  const parts: string[] = []
  if (q.itemClass) parts.push(classLabel(t, q.itemClass))
  const base = q.base ? index.baseById.get(q.base) : undefined
  if (base) parts.push(base.name)
  for (const r of ITEM_RARITIES) if (q.rarity.includes(r)) parts.push(rarityLabel(t, r))
  if (q.itemLevel) parts.push(`ilvl ${q.itemLevel}+`)
  for (const k of q.influence) parts.push(t(`regex.items.infl.${k}`))
  if (q.noInfluence) parts.push(t('regex.items.infl.none'))
  for (const k of selectedProps(q)) {
    const name = t(`regex.vendor.mod.${k}`)
    parts.push(isThresholdMod(k) ? `${name} ${q.props[k]}${isPercentProp(lang, k) ? '%' : ''}+` : name)
  }
  const want = Object.keys(q.want).length
  if (want) parts.push(`✓${want}`)
  if (q.avoid.length) parts.push(`✕${q.avoid.length}`)
  if (q.gemLevel) parts.push(`gem ${q.gemLevel}+`)
  if (q.gemQuality) parts.push(`Q${q.gemQuality}%+`)
  if (q.vaal === 'only') parts.push(t('regex.items.vaal'))
  return parts.join(', ') || '—'
}
