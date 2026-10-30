import { useEffect, useMemo } from 'react'
import { STARTER_BUDGETS, comparePatch, patchOf, type StarterBudget, type StarterClass } from '@shared/starters/schema'
import {
  STARTER_SORTS,
  activeFilters,
  ascendanciesOf,
  classesOf,
  filterStarters,
  picksOf,
  simpleFilters,
  sortStarters,
  type StarterFilters
} from '@shared/starters/view'
import type { StarterCard as Card, StartersState } from '@shared/types/build'
import { Select } from '../../components/Select'
import { useLang, useT } from '../../i18n'
import { useGameLang } from '../../gameLang'
import { useBuildStore } from '../../store/useBuildStore'
import { starterClass } from './names'
import { PlayDialog } from './PlayDialog'
import { StarterCard, useStarterTitle } from './StarterCard'
import { BIco } from './ui'
import './starters.css'

// Раздел «Стартеры» вкладки «Билд» (S59, starters-research.md §6.2, §6.6). Простой режим: «Рекомендуем новичкам»
// сверху, ниже «Все стартеры», фильтры — класс и бюджет. Экспертный: восхождение, сложность, «для новичка»,
// «ведёт по актам», «проверено POETH», видео на русском, хардкор/SSF, карты/боссы и сортировка. Мест «№1» нет.
// Особые состояния: до анонса (пустой список лиги; пока — прошлая лига), данные дерева и камней старше лиги,
// список не прочитался, список новее приложения.

type T = ReturnType<typeof useT>

/** Список для показа: текущая лига, а до анонса — прошлая. */
function shownList(st: StartersState): Card[] {
  if (st.status === 'ready') return st.starters
  if (st.status === 'empty' && st.previous) return st.previous.starters
  return []
}

function Filters({ list, expert, f, total, shown }: { list: Card[]; expert: boolean; f: StarterFilters; total: number; shown: number }) {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const tree = useBuildStore((s) => s.tree)
  const sort = useBuildStore((s) => s.stSort)
  const { setStFilters, resetStFilters, setStSort } = useBuildStore.getState()
  const classes = classesOf(list)
  const ascs = f.cls ? ascendanciesOf(list, f.cls) : []
  const n = activeFilters(expert ? f : simpleFilters(f))
  const chip = (key: 'newbie' | 'acts' | 'checked' | 'ru', label: string) => (
    <button type="button" className="ui-chip" aria-pressed={f[key]} onClick={() => setStFilters({ [key]: !f[key] })}>
      {label}
    </button>
  )
  return (
    <div className="bd-st-filters">
      <div className="ui-chips">
        <span className="ui-label">{t('bd.st.f.class')}</span>
        <Select<StarterClass | ''>
          value={f.cls ?? ''}
          label={t('bd.st.f.class')}
          options={[
            { value: '', label: t('bd.st.f.class.any') },
            ...classes.map((c) => ({ value: c, label: starterClass(tree, gameLang, c, null).cls }))
          ]}
          onChange={(v) => setStFilters({ cls: v || null })}
        />
        {expert && f.cls && ascs.length > 0 && (
          <Select<string>
            value={f.asc ?? ''}
            label={t('bd.st.f.asc')}
            options={[
              { value: '', label: t('bd.st.f.asc.any') },
              ...ascs.map((a) => ({ value: a, label: starterClass(tree, gameLang, f.cls as string, a).asc ?? a }))
            ]}
            onChange={(v) => setStFilters({ asc: v || null })}
          />
        )}
        <span className="ui-label">{t('bd.st.f.budget')}</span>
        <div className="ui-seg" role="group" aria-label={t('bd.st.f.budget')} title={t('bd.st.f.budget.tip')}>
          <button type="button" aria-pressed={!f.budget} onClick={() => setStFilters({ budget: null })}>
            {t('bd.st.f.any')}
          </button>
          {STARTER_BUDGETS.map((b: StarterBudget) => (
            <button key={b} type="button" aria-pressed={f.budget === b} onClick={() => setStFilters({ budget: b })}>
              {t(`bd.st.budget.${b}`)}
            </button>
          ))}
        </div>
      </div>
      {expert && (
        <>
          <div className="ui-chips">
            <span className="ui-label">{t('bd.st.f.diff')}</span>
            <div className="ui-seg" role="group" aria-label={t('bd.st.f.diff')} title={t('bd.st.f.diff.tip')}>
              <button type="button" aria-pressed={!f.difficulty} onClick={() => setStFilters({ difficulty: null })}>
                {t('bd.st.f.anyF')}
              </button>
              {([1, 2, 3] as const).map((d) => (
                <button key={d} type="button" aria-pressed={f.difficulty === d} onClick={() => setStFilters({ difficulty: d })}>
                  {t(`bd.st.diff.${d}`)}
                </button>
              ))}
            </div>
            <span className="ui-label">{t('bd.st.sort')}</span>
            <div className="ui-seg" role="group" aria-label={t('bd.st.sort')}>
              {STARTER_SORTS.map((s) => (
                <button key={s} type="button" aria-pressed={sort === s} onClick={() => setStSort(s)}>
                  {t(`bd.st.sort.${s}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="ui-chips">
            <span className="ui-label">{t('bd.st.f.more')}</span>
            {chip('newbie', t('bd.st.f.newbie'))}
            {chip('acts', t('bd.st.f.acts'))}
            {chip('checked', t('bd.st.f.checked'))}
            {chip('ru', t('bd.st.f.ru'))}
            {(['hc', 'ssf'] as const).map((m) => (
              <button key={m} type="button" className="ui-chip" aria-pressed={f.mode === m} onClick={() => setStFilters({ mode: f.mode === m ? null : m })}>
                {t(`bd.st.mode.${m}`)}
              </button>
            ))}
            {(['mapping', 'bossing'] as const).map((c) => (
              <button key={c} type="button" className="ui-chip" aria-pressed={f.content === c} onClick={() => setStFilters({ content: f.content === c ? null : c })}>
                {t(`bd.st.content.${c}`)}
              </button>
            ))}
          </div>
        </>
      )}
      {n > 0 && (
        <div className="bd-st-count">
          <span>{t('bd.st.count', { n: shown, total })}</span>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={resetStFilters}>
            <BIco name="close" size="sm" />
            {t('bd.st.reset')}
          </button>
        </div>
      )}
    </div>
  )
}

/** Баннеры состояния списка (§6.6). */
function StatusBanners({ st, t }: { st: StartersState; t: T }) {
  const tree = useBuildStore((s) => s.tree)
  const treePatch = patchOf(tree?.meta.tree)
  const noData = !!treePatch && !!st.league && (st.status === 'ready' || st.status === 'empty') && comparePatch(treePatch, st.league) < 0
  return (
    <>
      {st.status === 'empty' && st.league && (
        <div className="ui-banner ui-banner--info bd-banner" role="status">
          <BIco name="history" />
          <span>
            <b>{t('bd.st.empty', { league: st.league })}</b> {t('bd.st.empty.d')}
            {st.previous && <> {t('bd.st.prev', { league: st.previous.league })}</>}
          </span>
          <span />
        </div>
      )}
      {st.status === 'none' && (
        <div className="ui-banner ui-banner--bad bd-banner" role="alert">
          <BIco name="warn" />
          <span>
            <b>{t('bd.st.none')}</b> {t('bd.st.none.d')}
          </span>
          <span />
        </div>
      )}
      {st.status === 'newer' && (
        <div className="ui-banner ui-banner--info bd-banner" role="status">
          <BIco name="refresh" />
          <span>
            <b>{t('bd.st.newer')}</b> {t('bd.st.newer.d')}
          </span>
          <span />
        </div>
      )}
      {noData && st.league && treePatch && (
        <div className="ui-hint bd-hint">
          <BIco name="info" />
          <span>
            <b>{t('bd.st.noData')}</b> {t('bd.st.noData.d', { data: treePatch, league: st.league })}
          </span>
        </div>
      )}
      {st.invalid > 0 && <p className="bd-st-small">{t('bd.st.invalid', { n: st.invalid })}</p>}
    </>
  )
}

/** «Добавлено в библиотеку: …» после «Играть» в режиме «Добавить» — с кнопкой «Открыть». */
function AddedBanner({ card, t }: { card: Card; t: T }) {
  const { title } = useStarterTitle(card)
  const saved = useBuildStore((s) => s.state.recent.find((r) => r.starter === card.id) ?? null)
  const { open, setSection, clearPlayed } = useBuildStore.getState()
  return (
    <div className="ui-banner ui-banner--info bd-banner" role="status">
      <BIco name="check" />
      <span>
        <b>{t('bd.st.added', { name: title })}</b>
      </span>
      <span className="bd-st-banner-acts">
        {saved && (
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => void open(saved.id).then(() => setSection('mine'))}>
            {t('bd.st.openSaved')}
          </button>
        )}
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('bd.st.close')} onClick={clearPlayed}>
          <BIco name="close" />
        </button>
      </span>
    </div>
  )
}

function Cards({ list, league, expert }: { list: Card[]; league: string | null; expert: boolean }) {
  const recent = useBuildStore((s) => s.state.recent)
  const active = useBuildStore((s) => s.state.active)
  return (
    <div className="bd-st-list">
      {list.map((c) => (
        <StarterCard
          key={c.id}
          card={c}
          league={league}
          expert={expert}
          saved={recent.find((r) => r.starter === c.id) ?? null}
          active={active?.starter?.id === c.id ? active : null}
        />
      ))}
    </div>
  )
}

export function StartersView({ expert }: { expert: boolean }) {
  const t = useT()
  const st = useBuildStore((s) => s.starters)
  const loading = useBuildStore((s) => s.startersLoading)
  const filters = useBuildStore((s) => s.stFilters)
  const sort = useBuildStore((s) => s.stSort)
  const play = useBuildStore((s) => s.play)
  const played = useBuildStore((s) => s.played)
  const { loadStarters, resetStFilters } = useBuildStore.getState()

  useEffect(() => {
    if (!useBuildStore.getState().starters) void loadStarters()
  }, [loadStarters])

  const list = useMemo(() => (st ? shownList(st) : []), [st])
  const league = st?.league ?? null
  const f = useMemo(() => (expert ? filters : simpleFilters(filters)), [expert, filters])
  const filtered = useMemo(() => filterStarters(list, f, league), [list, f, league])
  const picks = useMemo(() => (expert ? [] : picksOf(filtered, league)), [expert, filtered, league])
  const rest = useMemo(
    () => sortStarters(filtered, expert ? sort : 'recommended', league).filter((c) => !picks.includes(c)),
    [filtered, expert, sort, league, picks]
  )
  const playCard = play ? list.find((c) => c.id === play.id) : undefined
  const addedCard = played?.mode === 'add' ? list.find((c) => c.id === played.id) : undefined

  if (!st) {
    return (
      <div className="bd-empty" aria-busy="true">
        <div className="ui-hint bd-hint">
          <BIco name="refresh" />
          <span>{t('bd.st.loading')}</span>
        </div>
        <span className="ui-skeleton" style={{ width: 260, height: 22 }} />
        <span className="ui-skeleton" style={{ width: '80%' }} />
        <span className="ui-skeleton" style={{ width: '70%' }} />
      </div>
    )
  }

  return (
    <div className="bd-empty bd-st" aria-busy={loading || undefined}>
      <div className="bd-empty__hi">
        <h3>{st.league ? t('bd.st.title', { league: st.league }) : t('bd.st.titleAny')}</h3>
        {!expert && <p>{t('bd.st.lead')}</p>}
      </div>
      <StatusBanners st={st} t={t} />
      {addedCard && <AddedBanner card={addedCard} t={t} />}
      {list.length > 0 && <Filters list={list} expert={expert} f={filters} total={list.length} shown={filtered.length} />}
      {picks.length > 0 && (
        <section className="bd-st-sec">
          <div className="bd-st-sec__head">
            <span className="ui-label">
              <BIco name="star" />
              {t('bd.st.picks')}
            </span>
            <span className="bd-st-small">{t('bd.st.picks.d')}</span>
          </div>
          <Cards list={picks} league={league} expert={expert} />
        </section>
      )}
      {rest.length > 0 && (
        <section className="bd-st-sec">
          <div className="bd-st-sec__head">
            <span className="ui-label">
              <BIco name="passive" />
              {expert ? t('bd.st.list') : t('bd.st.all')}
            </span>
          </div>
          <Cards list={rest} league={league} expert={expert} />
        </section>
      )}
      {list.length > 0 && filtered.length === 0 && (
        <div className="ui-empty">
          <img className="bd-st-empty-img" src="poeth://brand/empty-route.svg" alt="" />
          <span className="ui-empty__title">{t('bd.st.nothing')}</span>
          <button type="button" className="ui-btn" onClick={resetStFilters}>
            {t('bd.st.reset')}
          </button>
        </div>
      )}
      {list.length > 0 && (
        <p className="bd-st-small bd-st-foot">
          <BIco name="info" size="sm" />
          <span>{t('bd.st.foot')}</span>
        </p>
      )}
      <div className="bd-private">
        <BIco name="lock" />
        <span>{t('bd.st.private')}</span>
      </div>
      {playCard && <PlayDialog card={playCard} league={league} />}
    </div>
  )
}
