import { useMemo, useState, type MouseEvent } from 'react'
import type { Poe2ModData } from '@shared/types'
import { selectable } from '@shared/regex/poe2'
import { useT } from '../../../i18n'
import { shortText, useSimple } from '../common'
import { Ico } from '../Ico'

// Список модов путевых камней и плиток PoE 2 (S62) — как у карт PoE 1: клик неважно → хочу → не хочу,
// ПКМ — сразу «не хочу»; пометки ⚠ (опасный), «осквернённый», «вложение», ≈ (заденет похожие); в экспертном —
// токен. Моды без русского текста в RU-клиенте выбрать нельзя (строка их не найдёт).

export type ModState = 'want' | 'avoid' | 'any'
type Filter = 'all' | 'scary' | 'selected' | 'desecrated' | 'instilled'

const TRI_ICON = { want: 'check', avoid: 'cross', any: 'dash' } as const
const NEXT: Record<ModState, ModState> = {
  any: 'want',
  want: 'avoid',
  avoid: 'any'
}

function sortMods(mods: Poe2ModData[]): Poe2ModData[] {
  const rank = (m: Poe2ModData): number => (m.kind === 'desecrated' ? 1 : m.kind === 'instilled' ? 2 : 0)
  const key = (m: Poe2ModData): string => m.display.replace(/^[^\p{L}]+/u, '')
  return [...mods].sort((a, b) => rank(a) - rank(b) || key(a).localeCompare(key(b)))
}

export function ModList({
  mods,
  other,
  want,
  avoid,
  onChange,
  withScary,
  kinds
}: {
  mods: Poe2ModData[]
  /** те же моды на другом языке (язык интерфейса ≠ язык клиента) — для поиска и второй строки */
  other: Poe2ModData[] | null
  want: string[]
  avoid: string[]
  onChange: (want: string[], avoid: string[]) => void
  withScary?: boolean
  /** фильтры по виду мода (экспертный режим путевых камней) */
  kinds?: boolean
}) {
  const t = useT()
  const simple = useSimple()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const sorted = useMemo(() => sortMods(mods), [mods])
  const otherById = useMemo(() => new Map((other ?? []).map((m) => [m.id, m])), [other])
  const byId = useMemo(() => new Map(mods.map((m) => [m.id, m])), [mods])
  const wantSet = new Set(want)
  const avoidSet = new Set(avoid)
  const stateOf = (id: string): ModState => (avoidSet.has(id) ? 'avoid' : wantSet.has(id) ? 'want' : 'any')
  const setState = (id: string, s: ModState): void => {
    const w = want.filter((x) => x !== id)
    const a = avoid.filter((x) => x !== id)
    if (s === 'want') w.push(id)
    if (s === 'avoid') a.push(id)
    onChange(w, a)
  }

  const filters: Filter[] = ['all', ...(withScary ? (['scary'] as Filter[]) : []), 'selected']
  if (kinds && !simple) filters.push('desecrated', 'instilled')
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const visible = sorted.filter((m) => {
    if (filter === 'selected' && stateOf(m.id) === 'any') return false
    if (filter === 'scary' && !m.scary) return false
    if (filter === 'desecrated' && m.kind !== 'desecrated') return false
    if (filter === 'instilled' && m.kind !== 'instilled') return false
    if (!words.length) return true
    const hay = `${m.display} ${otherById.get(m.id)?.display ?? ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
  const nameOf = (id: string): string => shortText(byId.get(id)?.display ?? id, 40)
  const selected = want.length + avoid.length

  return (
    <>
      <div className="rx-search">
        <input
          className="ui-input ui-input--lg"
          value={search}
          placeholder={t('regex.maps.search')}
          aria-label={t('regex.maps.search')}
          onChange={(e) => setSearch(e.target.value)}
        />
        {filters.map((f) => (
          <button key={f} type="button" className="ui-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`regex.poe2.filter.${f}`)}
            {f === 'selected' && selected > 0 && <span className="ui-count">{selected}</span>}
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
      <div className="rx-trilist rx-trilist--p2">
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
    </>
  )
}

function ModTri({
  mod,
  alt,
  state,
  onState,
  alsoNames
}: {
  mod: Poe2ModData
  alt?: string
  state: ModState
  onState: (s: ModState) => void
  alsoNames?: string[]
}) {
  const t = useT()
  const simple = useSimple()
  const ok = selectable(mod)
  const onContext = (e: MouseEvent): void => {
    e.preventDefault()
    if (ok || state !== 'any') onState(state === 'avoid' ? 'any' : 'avoid')
  }
  return (
    <button
      type="button"
      className="ui-tri rx-tri"
      data-state={state}
      disabled={!ok && state === 'any'}
      title={ok ? t('regex.maps.triTitle') : t('regex.poe2.noRu.title')}
      onClick={() => onState(ok ? NEXT[state] : 'any')}
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
        {simple && state !== 'any' && <em className="rx-tri__word">{t(`regex.state.${state}`)}</em>}
        {mod.scary && (
          <span
            className="ui-tag ui-tag--bad"
            title={t('regex.scary.title', {
              reason: t(`regex.poe2.scary.${mod.scary}`)
            })}
          >
            <Ico name="warn" size="sm" />
          </span>
        )}
        {mod.kind === 'desecrated' && (
          <span className="ui-tag" title={t('regex.poe2.tag.desecrated.title')}>
            {t('regex.poe2.tag.desecrated')}
          </span>
        )}
        {mod.kind === 'instilled' && (
          <span className="ui-tag" title={t('regex.poe2.tag.instilled.title')}>
            {t('regex.poe2.tag.instilled')}
          </span>
        )}
        {!ok && (
          <span className="ui-tag ui-tag--warn" title={t('regex.poe2.noRu.title')}>
            {t('regex.poe2.noRu')}
          </span>
        )}
        {(alsoNames?.length || mod.alsoExtra) && (
          <span
            className="ui-tag ui-tag--warn"
            title={
              alsoNames?.length ? t('regex.alsoMatches', { list: alsoNames.join('; ') }) : t('regex.poe2.alsoExtra')
            }
          >
            ≈
          </span>
        )}
        {!simple && <code className="rx-token">{mod.token}</code>}
      </span>
    </button>
  )
}
