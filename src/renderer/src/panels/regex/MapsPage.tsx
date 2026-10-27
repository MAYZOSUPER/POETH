import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import type { MapLabelKey, MapModData, MapQuery, TriState } from '@shared/types'
import { MAP_LABEL_KEYS, buildMapRegex, emptyMapQuery } from '@shared/regex'
import { useLang, useT } from '../../i18n'
import { useRegexStore } from '../../store/useRegexStore'
import { Box, NumberRow, ResultBox, Seg, shortText, useGameLang, useSimple } from './common'
import { Ico } from './Ico'

// Страница «Карты» (макет: моды в трёх состояниях, пороги, флаги, живая строка со счётчиком 250).
// Клик по моду: неважно → хочу → не хочу → неважно; правая кнопка — сразу «не хочу».

type Filter = 'all' | 'scary' | 'selected' | 't17' | 'vaal'
type ModState = 'want' | 'avoid' | 'any'

const TRI_ICON = { want: 'check', avoid: 'cross', any: 'dash' } as const
const NEXT: Record<ModState, ModState> = { any: 'want', want: 'avoid', avoid: 'any' }
/** Пороги простого режима (как в макете); в экспертном — все семь. */
const SIMPLE_LABELS: MapLabelKey[] = ['quantity', 'packSize', 'rarity', 'moreScarabs']

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
  const simple = useSimple()
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

  if (data === undefined) return <div className="ui-empty">{t('regex.maps.loading')}</div>
  if (data === null || !result) {
    return <div className="ui-empty">{t('regex.maps.noData', { lang: t(`regex.lang.${lang}`) })}</div>
  }

  const want = new Set(q.want)
  const avoid = new Set(q.avoid)
  const stateOf = (id: string): ModState => (avoid.has(id) ? 'avoid' : want.has(id) ? 'want' : 'any')
  const setState = (id: string, state: ModState): void => {
    const w = q.want.filter((x) => x !== id)
    const a = q.avoid.filter((x) => x !== id)
    if (state === 'want') w.push(id)
    if (state === 'avoid') a.push(id)
    setQuery({ want: w, avoid: a })
  }

  const filters: Filter[] = simple ? ['all', 'scary', 'selected'] : ['all', 'scary', 'selected', 't17', 'vaal']
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const visible = sorted.filter((m) => {
    if (filter === 'selected' && stateOf(m.id) === 'any') return false
    if (filter === 'scary' && !m.scary) return false
    if (filter === 't17' && !m.tags.includes('t17')) return false
    if (filter === 'vaal' && m.kind !== 'implicit') return false
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
  const labels = simple ? SIMPLE_LABELS : MAP_LABEL_KEYS
  const triOptions = (['any', 'only', 'exclude'] as TriState[]).map((v) => ({ value: v, label: t(`regex.tri.${v}`) }))

  return (
    <div className="rx-two">
      <div className="rx-stack">
        <div className="rx-search">
          <input
            className="ui-input ui-input--lg"
            value={search}
            placeholder={t('regex.maps.search')}
            aria-label={t('regex.maps.search')}
            onChange={(e) => setSearch(e.target.value)}
          />
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              className="ui-chip"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {t(`regex.maps.filter.${f}`)}
              {f === 'selected' && want.size + avoid.size > 0 && <span className="ui-count">{want.size + avoid.size}</span>}
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
        <div className="rx-trilist">
          {visible.length === 0 && <div className="ui-empty">{t('regex.maps.empty')}</div>}
          {visible.map((m) => (
            <ModTri
              key={m.id}
              mod={m}
              alt={otherById.get(m.id)?.display}
              state={stateOf(m.id)}
              onState={(s) => setState(m.id, s)}
              alsoNames={m.alsoMatches?.map(nameOf)}
            />
          ))}
        </div>
        {!simple && (
          <div className="ui-field__help">
            {t('regex.maps.dataInfo', { patch: data.meta.patch, date: data.meta.date, n: data.mods.length })}
          </div>
        )}
      </div>

      <div className="rx-stack rx-sticky">
        <Box title={t('regex.maps.thresholds')} tip={t('regex.maps.thresholdsTip')}>
          {labels.map((key) => (
            <NumberRow
              key={key}
              id={`rx-thr-${key}`}
              label={t('regex.maps.atLeast', { label: t(`regex.label.${key}`) })}
              value={q.thresholds[key] ?? 0}
              max={999}
              onChange={(n) => setQuery({ thresholds: { ...q.thresholds, [key]: n } })}
            />
          ))}
          <div className="rx-row">
            <span>{t('regex.maps.wantMode')}</span>
            <Seg
              value={q.wantMode}
              label={t('regex.maps.wantMode')}
              onChange={(v) => setQuery({ wantMode: v })}
              options={[
                { value: 'all', label: t('regex.maps.wantAll'), title: t('regex.maps.wantAllTip') },
                { value: 'any', label: t('regex.maps.wantAny'), title: t('regex.maps.wantAnyTip') }
              ]}
            />
          </div>
          <div className="rx-row">
            <span>{t('regex.flag.corrupted')}</span>
            <Seg
              value={q.corrupted}
              label={t('regex.flag.corrupted')}
              onChange={(v) => setQuery({ corrupted: v })}
              options={triOptions}
            />
          </div>
          <div className="rx-row">
            <span>{t('regex.flag.unidentified')}</span>
            <Seg
              value={q.unidentified}
              label={t('regex.flag.unidentified')}
              onChange={(v) => setQuery({ unidentified: v })}
              options={triOptions}
            />
          </div>
          {simple && <div className="ui-field__help">{t('regex.maps.unidHint')}</div>}
        </Box>
        <ResultBox
          result={result}
          defaultName={t('regex.maps.genName', { summary: summarize(t, q) })}
          onReset={() => setPrefs({ maps: emptyMapQuery() })}
          overflowText={overflowText}
          sideText={sideText}
          hint={t('regex.maps.howto')}
        />
      </div>
    </div>
  )
}

function ModTri({
  mod,
  alt,
  state,
  onState,
  alsoNames
}: {
  mod: MapModData
  alt?: string
  state: ModState
  onState: (s: ModState) => void
  alsoNames?: string[]
}) {
  const t = useT()
  const simple = useSimple()
  const onContext = (e: MouseEvent): void => {
    e.preventDefault()
    onState(state === 'avoid' ? 'any' : 'avoid')
  }
  return (
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
        {mod.scary && (
          <span
            className="ui-tag ui-tag--bad"
            title={t('regex.scary.title', { reason: t(`regex.scary.${mod.scary}`) })}
          >
            <Ico name="warn" size="sm" />
          </span>
        )}
        {mod.tags.includes('t17') && (
          <span className="ui-tag ui-tag--warn" title={t('regex.tag.t17.title')}>
            {t('regex.tag.t17')}
          </span>
        )}
        {mod.tags.includes('maven') && (
          <span className="ui-tag" title={t('regex.tag.maven.title')}>
            {t('regex.tag.maven')}
          </span>
        )}
        {mod.kind === 'implicit' && (
          <span className="ui-tag ui-tag--bad" title={t('regex.tag.corrupted.title')}>
            {t('regex.tag.corrupted')}
          </span>
        )}
        {alsoNames && (
          <span className="ui-tag ui-tag--warn" title={t('regex.alsoMatches', { list: alsoNames.join('; ') })}>
            ≈
          </span>
        )}
        {!simple && <code className="rx-token">{mod.token}</code>}
      </span>
    </button>
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
