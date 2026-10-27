import { useEffect, useMemo, useState } from 'react'
import type { MapLabelKey, MapModData, MapQuery, MapRegexData, TriState } from '@shared/types'
import { MAP_LABEL_KEYS, buildMapRegex, emptyMapQuery } from '@shared/regex'
import { useLang, useT } from '../../i18n'
import { useRegexStore } from '../../store/useRegexStore'
import { ResultBox, Seg, shortText, useGameLang } from './common'

// Страница «Карты»: моды хочу / не хочу / неважно, пороги свойств, флаги, живая строка.

type Filter = 'all' | 'selected' | 'scary' | 't17' | 'corrupted'
type ModState = 'want' | 'avoid' | null

/** Верхняя граница слайдера порога (поле ввода позволяет больше). */
const SLIDER_MAX: Record<MapLabelKey, number> = {
  quantity: 200,
  rarity: 200,
  packSize: 100,
  moreMaps: 150,
  moreScarabs: 150,
  moreCurrency: 150,
  moreDivCards: 150
}

/**
 * Порядок списка: обычные моды, затем T17, затем осквернённые имплиситы; внутри — по алфавиту
 * без учёта ведущих «+#%», «-#%» (иначе числовые моды всплывают наверх).
 */
function sortMods(mods: MapModData[]): MapModData[] {
  const rank = (m: MapModData): number => (m.kind === 'implicit' ? 2 : m.tags.includes('t17') ? 1 : 0)
  const key = (m: MapModData): string => m.display.replace(/^[^\p{L}]+/u, '')
  return [...mods].sort((a, b) => rank(a) - rank(b) || key(a).localeCompare(key(b)))
}

export function MapsPage() {
  const t = useT()
  const uiLang = useLang()
  const lang = useGameLang()
  const prefs = useRegexStore((s) => s.prefs)
  const setPrefs = useRegexStore((s) => s.setPrefs)
  const mapData = useRegexStore((s) => s.mapData)
  const ensureMapData = useRegexStore((s) => s.ensureMapData)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    void ensureMapData(lang)
    if (uiLang !== lang) void ensureMapData(uiLang)
  }, [lang, uiLang, ensureMapData])

  const data = mapData[lang]
  const other = uiLang !== lang ? mapData[uiLang] : null
  const q = prefs.maps
  const setQuery = (patch: Partial<MapQuery>): void => setPrefs({ maps: { ...q, ...patch } })

  const result = useMemo(() => (data ? buildMapRegex(data, q) : null), [data, q])
  const otherById = useMemo(() => new Map((other?.mods ?? []).map((m) => [m.id, m])), [other])
  const sorted = useMemo(() => (data ? sortMods(data.mods) : []), [data])

  if (data === undefined) return <div className="rx-loading">{t('regex.maps.loading')}</div>
  if (data === null || !result) {
    return <div className="rx-loading">{t('regex.maps.noData', { lang: t(`regex.lang.${lang}`) })}</div>
  }

  const want = new Set(q.want)
  const avoid = new Set(q.avoid)
  const stateOf = (id: string): ModState => (avoid.has(id) ? 'avoid' : want.has(id) ? 'want' : null)
  const setState = (id: string, state: ModState): void => {
    const w = q.want.filter((x) => x !== id)
    const a = q.avoid.filter((x) => x !== id)
    if (state === 'want') w.push(id)
    if (state === 'avoid') a.push(id)
    setQuery({ want: w, avoid: a })
  }

  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const visible = sorted.filter((m) => {
    if (filter === 'selected' && !stateOf(m.id)) return false
    if (filter === 'scary' && !m.scary) return false
    if (filter === 't17' && !m.tags.includes('t17')) return false
    if (filter === 'corrupted' && m.kind !== 'implicit') return false
    if (!words.length) return true
    const hay = `${m.display} ${otherById.get(m.id)?.display ?? ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })

  const byId = new Map(data.mods.map((m) => [m.id, m]))
  const nameOf = (id: string): string => shortText(byId.get(id)?.display ?? id, 40)
  const overflowText = result.overflow
    ? t('regex.overflow', {
        n: result.overflow.by,
        list: result.overflow.suggest
          .map((s) => (s.kind === 'mod' ? nameOf(s.id) : s.kind === 'threshold' ? t(`regex.label.${s.key}`) : s.key))
          .join('; ')
      })
    : undefined
  const sideText = result.sideMatches.length
    ? t('regex.side', { list: result.sideMatches.map(nameOf).join('; ') })
    : undefined

  return (
    <div className="rx-page">
      <ResultBox
        result={result}
        defaultName={t('regex.maps.genName', { summary: summarize(t, q) })}
        onReset={() => setPrefs({ maps: emptyMapQuery() })}
        overflowText={overflowText}
        sideText={sideText}
      />
      <div className="rx-cols">
        <div className="rx-col-main">
          <div className="rx-toolbar">
            <input
              className="pc-input"
              value={search}
              placeholder={t('regex.maps.search')}
              onChange={(e) => setSearch(e.target.value)}
            />
            <span className="muted small">{t('regex.maps.count', { want: want.size, avoid: avoid.size })}</span>
          </div>
          <Seg<Filter>
            small
            value={filter}
            onChange={setFilter}
            options={(['all', 'selected', 'scary', 't17', 'corrupted'] as Filter[]).map((f) => ({
              value: f,
              label: t(`regex.maps.filter.${f}`)
            }))}
          />
          <div className="rx-mods">
            {visible.length === 0 && <div className="muted rx-empty">{t('regex.maps.empty')}</div>}
            {visible.map((m) => (
              <ModRow
                key={m.id}
                mod={m}
                alt={otherById.get(m.id)?.display}
                state={stateOf(m.id)}
                onState={(s) => setState(m.id, s)}
                data={data}
              />
            ))}
          </div>
          <div className="muted small rx-footnote">
            {t('regex.maps.dataInfo', { patch: data.meta.patch, date: data.meta.date, n: data.mods.length })}
          </div>
        </div>
        <div className="rx-col-side">
          <p className="rx-hint">{t('regex.maps.hint')}</p>
          <div className="rx-field">
            <div className="rx-field-label">{t('regex.maps.wantMode')}</div>
            <Seg
              small
              value={q.wantMode}
              onChange={(v) => setQuery({ wantMode: v })}
              options={[
                { value: 'any', label: t('regex.maps.wantAny') },
                { value: 'all', label: t('regex.maps.wantAll') }
              ]}
            />
          </div>
          <div className="block-title rx-side-title">{t('regex.maps.thresholds')}</div>
          {MAP_LABEL_KEYS.map((key) => (
            <Threshold
              key={key}
              label={t(`regex.label.${key}`)}
              value={q.thresholds[key] ?? 0}
              max={SLIDER_MAX[key]}
              off={t('regex.off')}
              onChange={(n) => setQuery({ thresholds: { ...q.thresholds, [key]: n } })}
            />
          ))}
          <div className="block-title rx-side-title">{t('regex.maps.flags')}</div>
          {(['corrupted', 'unidentified'] as const).map((flag) => (
            <div className="rx-field" key={flag}>
              <div className="rx-field-label">{t(`regex.flag.${flag}`)}</div>
              <Seg<TriState>
                small
                value={q[flag]}
                onChange={(v) => setQuery({ [flag]: v })}
                options={(['any', 'only', 'exclude'] as TriState[]).map((v) => ({ value: v, label: t(`regex.tri.${v}`) }))}
              />
            </div>
          ))}
          <p className="rx-hint small">{t('regex.maps.unidHint')}</p>
          <p className="rx-hint small">{t('regex.howto')}</p>
        </div>
      </div>
    </div>
  )
}

function ModRow({
  mod,
  alt,
  state,
  onState,
  data
}: {
  mod: MapModData
  alt?: string
  state: ModState
  onState: (s: ModState) => void
  data: MapRegexData
}) {
  const t = useT()
  const also = mod.alsoMatches
    ?.map((id) => data.mods.find((m) => m.id === id)?.display.split('\n')[0] ?? id)
    .join('; ')
  return (
    <div className={`rx-mod${state ? ` ${state}` : ''}`}>
      <div className="rx-mod-btns">
        <button
          className={`rx-tri want${state === 'want' ? ' on' : ''}`}
          title={t('regex.maps.want')}
          onClick={() => onState(state === 'want' ? null : 'want')}
        >
          ✓
        </button>
        <button
          className={`rx-tri avoid${state === 'avoid' ? ' on' : ''}`}
          title={t('regex.maps.avoid')}
          onClick={() => onState(state === 'avoid' ? null : 'avoid')}
        >
          ✕
        </button>
      </div>
      <div className="rx-mod-text" onClick={() => onState(state === 'avoid' ? null : 'avoid')}>
        {mod.display.split('\n').map((l, i) => (
          <div key={i}>{l}</div>
        ))}
        {alt && alt !== mod.display && <div className="rx-mod-alt">{alt.replace(/\n/g, ' · ')}</div>}
      </div>
      <div className="rx-mod-tags">
        {mod.scary && (
          <span className="rx-tag scary" title={t('regex.scary.title', { reason: t(`regex.scary.${mod.scary}`) })}>
            ⚠
          </span>
        )}
        {mod.tags.includes('t17') && (
          <span className="rx-tag t17" title={t('regex.tag.t17.title')}>
            {t('regex.tag.t17')}
          </span>
        )}
        {mod.tags.includes('maven') && (
          <span className="rx-tag" title={t('regex.tag.maven.title')}>
            {t('regex.tag.maven')}
          </span>
        )}
        {mod.kind === 'implicit' && (
          <span className="rx-tag vaal" title={t('regex.tag.corrupted.title')}>
            {t('regex.tag.corrupted')}
          </span>
        )}
        {also && (
          <span className="rx-tag also" title={t('regex.alsoMatches', { list: also })}>
            ≈
          </span>
        )}
      </div>
    </div>
  )
}

function Threshold({
  label,
  value,
  max,
  off,
  onChange
}: {
  label: string
  value: number
  max: number
  off: string
  onChange: (n: number) => void
}) {
  const clamp = (n: number): number => Math.max(0, Math.min(999, Math.round(Number.isFinite(n) ? n : 0)))
  return (
    <div className={`rx-threshold${value > 0 ? ' on' : ''}`}>
      <div className="rx-threshold-head">
        <span>{label}</span>
        <span className="rx-threshold-val">
          {value > 0 ? '≥ ' : ''}
          <input
            type="number"
            min={0}
            max={999}
            value={value || ''}
            placeholder={off}
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
          />
          {value > 0 ? '%' : ''}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        step={5}
        value={Math.min(value, max)}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
      />
    </div>
  )
}

/** Короткое описание набора для названия в библиотеке. */
function summarize(t: (k: string, p?: Record<string, string | number>) => string, q: MapQuery): string {
  const parts: string[] = []
  if (q.avoid.length) parts.push(`✕${q.avoid.length}`)
  if (q.want.length) parts.push(`✓${q.want.length}`)
  for (const key of MAP_LABEL_KEYS) {
    const n = q.thresholds[key] ?? 0
    if (n > 0) parts.push(`${t(`regex.label.${key}`)} ≥ ${n}%`)
  }
  return parts.join(', ') || '—'
}
