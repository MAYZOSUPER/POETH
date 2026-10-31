import { useEffect, useMemo, useRef, useState } from 'react'
import type { RumourLevel, RumourRecord } from '@shared/rumours/schema'
import { RUMOURS_POOL_MAX, rumourText, searchRumours, type RumourLang } from '@shared/rumours/match'
import { pickRumour, type RumourPick, type RumourWhy } from '@shared/rumours/pick'
import { COMMUNITY_URL, priceNumber, rumourRow, type RewardView, type RumourRowView } from '@shared/rumours/view'
import type { ShownPrice } from '@shared/rumours/prices'
import { useLang, useT } from '../../i18n'
import { tKey } from '../../i18n/hotkey'
import { useAppStore } from '../../store/useAppStore'
import { useGameLang } from '../../gameLang'
import { ShellIcon } from '../../components/ShellIcon'
import { Seg, Switch, useSimple } from '../regex/common'
import { useRumoursStore } from './store'
import './rumours.css'

// Вкладка «Слухи журнала» (S65, PoE 2; раздел «Фарм»): игрок отмечает видимые слухи журнала (поиск по началу строки
// на языке клиента) — POETH выделяет лучший с одной строкой «почему». В каждой строке: слух как в клиенте, куда
// ведёт, категория, главная награда и её цена, риск, наш тир; свои пометки игрока (тир, «не беру», заметка) —
// локально. Черновой экран на ui-* до макета дизайнера («Слухи журнала», фаза 2).
// Простой режим: подсказки новичку и пояснения сразу; экспертный — компактнее, без подсказок.

type T = ReturnType<typeof useT>

/** Клавиша «Слухи журнала» (действие rumours в HotkeyMap добавляет лид — S65-frozen.diff). */
function rumoursAccel(hotkeys: unknown): string | undefined {
  return (hotkeys as Record<string, { accel?: string } | undefined> | undefined)?.rumours?.accel
}

export function RumoursTab() {
  const t = useT()
  const uiLang = useLang() as RumourLang
  const gameLang = useGameLang(uiLang) as RumourLang
  const simple = useSimple()
  const patchSettings = useAppStore((s) => s.patchSettings)
  const status = useRumoursStore((s) => s.status)
  const data = useRumoursStore((s) => s.data)

  useEffect(() => {
    void useRumoursStore.getState().init()
  }, [])

  const head = (
    <div className="rm-head">
      <span className="rm-title">{t('app.rumours')}</span>
      <span className="rm-grow" />
      <Switch on={!simple} title={t('guide.expert.title')} onChange={(expert) => void patchSettings({ ui: { simpleMode: !expert } })}>
        {t('guide.expert')}
      </Switch>
    </div>
  )

  if (status !== 'ready' || !data) {
    return (
      <div className="rm">
        {head}
        <div className="rm-body" aria-busy="true">
          <span className="ui-skeleton" style={{ width: 240 }} />
          <span className="ui-skeleton" style={{ width: 180 }} />
        </div>
      </div>
    )
  }
  if (data.status !== 'ready') {
    return (
      <div className="rm">
        {head}
        <div className="rm-body">
          <div className="ui-empty">
            <div className="ui-empty__title">{t('app.rumours')}</div>
            <span>{t(data.status === 'newer' ? 'rumours.state.newer' : 'rumours.state.none')}</span>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="rm">
      {head}
      <Body list={data.rumours} patch={data.patch} failed={data.failed} t={t} uiLang={uiLang} gameLang={gameLang} simple={simple} />
    </div>
  )
}

function Body(p: { list: RumourRecord[]; patch: string | null; failed: number; t: T; uiLang: RumourLang; gameLang: RumourLang; simple: boolean }) {
  const { list, t, uiLang, gameLang, simple } = p
  const user = useRumoursStore((s) => s.user)
  const prices = useRumoursStore((s) => s.prices)
  const accel = useAppStore((s) => rumoursAccel(s.settings?.hotkeys))
  const pick = useMemo(() => pickRumour(list, user.picked, user.marks, prices), [list, user, prices])
  const byId = useMemo(() => new Map(list.map((r) => [r.id, r])), [list])
  const rows = pick.ranked.map((x) => rumourRow(byId.get(x.id)!, gameLang, uiLang, user.marks[x.id], prices))
  const text = (id: string): string => rumourText(byId.get(id)!, gameLang)

  return (
    <div className={`rm-body ui-scroll${simple ? '' : ' rm-body--expert'}`}>
      <div className="rm-col">
        {simple && (
          <div className="ui-hint">
            <ShellIcon name="info" size="sm" />
            <span>{t('rumours.intro')}</span>
          </div>
        )}
        <SearchBox list={list} picked={user.picked} t={t} gameLang={gameLang} />
        <div className="rm-bar">
          <span className="rm-muted">
            {t('rumours.picked', { n: user.picked.length })}
            {user.pickedBy === 'item' && <> · {t('rumours.byItem')}</>}
          </span>
          <span className="rm-grow" />
          {user.picked.length > 0 && (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => void useRumoursStore.getState().setPicked([])}>
              {t('rumours.clear')}
            </button>
          )}
        </div>

        {user.picked.length === 0 ? (
          <div className="ui-empty rm-empty">
            <div className="ui-empty__title">{t('rumours.empty.title')}</div>
            <span>{t('rumours.empty.text')}</span>
            <span className="rm-muted">{tKey(t, 'rumours.hotkey', accel)}</span>
          </div>
        ) : (
          <>
            <BestLine pick={pick} rows={rows} text={text} t={t} uiLang={uiLang} />
            <ul className="rm-rows">
              {rows.map((r) => (
                <RowItem key={r.id} r={r} best={r.id === pick.best} t={t} uiLang={uiLang} simple={simple} />
              ))}
            </ul>
            {user.picked.length < RUMOURS_POOL_MAX && (
              <div className="ui-hint rm-reroll">
                <ShellIcon name="refresh" size="sm" />
                <span>{t('rumours.reroll')}</span>
              </div>
            )}
          </>
        )}

        <AllList list={list} picked={user.picked} t={t} gameLang={gameLang} uiLang={uiLang} open={!simple} />
        <Footer patch={p.patch} failed={p.failed} t={t} />
      </div>
    </div>
  )
}

function SearchBox({ list, picked, t, gameLang }: { list: RumourRecord[]; picked: string[]; t: T; gameLang: RumourLang }) {
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const hits = useMemo(() => (q.trim() ? searchRumours(list, q, gameLang).slice(0, 8) : []), [list, q, gameLang])
  const full = picked.length >= RUMOURS_POOL_MAX
  const example = useMemo(() => {
    const s = rumourText(list.find((r) => r.id === 'fallen-stars') ?? list[0], gameLang)
    return `${s.slice(0, 3)}…`
  }, [list, gameLang])
  const add = (id: string): void => {
    void useRumoursStore.getState().add(id)
    setQ('')
    setCursor(0)
    input.current?.focus()
  }
  return (
    <div className="rm-search">
      <label className="rm-search__box">
        <ShellIcon name="search" size="sm" />
        <input
          ref={input}
          className="ui-input"
          type="search"
          value={q}
          disabled={full}
          placeholder={full ? t('rumours.search.full') : t('rumours.search', { example })}
          aria-label={t('rumours.search.label')}
          onChange={(e) => {
            setQ(e.target.value)
            setCursor(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setCursor((c) => Math.min(hits.length - 1, c + 1))
            else if (e.key === 'ArrowUp') setCursor((c) => Math.max(0, c - 1))
            else if (e.key === 'Enter' && hits[cursor] && !picked.includes(hits[cursor].id)) add(hits[cursor].id)
            else if (e.key === 'Escape' && q) setQ('')
            else return
            e.preventDefault()
          }}
        />
      </label>
      {q.trim() && (
        <ul className="ui-menu rm-search__menu" role="listbox">
          {hits.length === 0 && <li className="rm-muted rm-search__none">{t('rumours.search.none')}</li>}
          {hits.map((r, i) => {
            const on = picked.includes(r.id)
            return (
              <li key={r.id} role="option" aria-selected={i === cursor}>
                <button type="button" className={`rm-search__hit${i === cursor ? ' is-cur' : ''}`} disabled={on} onMouseEnter={() => setCursor(i)} onClick={() => add(r.id)}>
                  <span className="rm-game">{rumourText(r, gameLang)}</span>
                  <span className="rm-muted">→ {(gameLang === 'ru' ? r.island.ru : r.island.en) ?? r.island.en}</span>
                  <span className="rm-grow" />
                  {on ? <span className="ui-tag ui-tag--good">{t('rumours.added')}</span> : <Category c={r.category} t={t} />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Category({ c, t }: { c: RumourRecord['category']; t: T }) {
  return <span className={`ui-tag rm-cat rm-cat--${c}`}>{t(`rumours.cat.${c}`)}</span>
}

function Pips({ n, accent }: { n: RumourLevel | null; accent?: boolean }) {
  return (
    <span className={`ui-pips${accent ? ' ui-pips--accent' : ''}`} aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <i key={i} className={n !== null && i <= n ? 'on' : ''} />
      ))}
    </span>
  )
}

function priceText(p: ShownPrice, t: T, lang: RumourLang): string {
  return t('rumours.price', { price: `${priceNumber(p, lang)} ${t(`rumours.unit.${p.unit}`)}` })
}

function rewardName(rw: RewardView, t: T): string {
  return rw.name ?? t(`rumours.kind.${rw.kind}`)
}

function whyText(why: RumourWhy, text: (id: string) => string, t: T): string {
  return 'than' in why ? t(`rumours.why.${why.kind}`, { than: text(why.than) }) : t(`rumours.why.${why.kind}`)
}

function BestLine({ pick, rows, text, t, uiLang }: { pick: RumourPick; rows: RumourRowView[]; text: (id: string) => string; t: T; uiLang: RumourLang }) {
  if (!pick.best || !pick.why) {
    const allSkip = pick.ranked.length > 0 && pick.ranked.every((x) => x.skipped)
    return <div className="ui-banner ui-banner--info rm-best">{t(allSkip ? 'rumours.noBest.skip' : 'rumours.noBest.unrated')}</div>
  }
  const row = rows.find((r) => r.id === pick.best)!
  return (
    <div className="rm-best" role="status">
      <div className="rm-best__head">
        <ShellIcon name="star" size="sm" />
        <b>{t('rumours.best', { text: row.text })}</b>
        {row.price && row.priceItem && (
          <span className="rm-best__price">
            {row.priceItem} {priceText(row.price, t, uiLang)}
          </span>
        )}
      </div>
      <div className="rm-best__why">{whyText(pick.why, text, t)}</div>
    </div>
  )
}

function RowItem({ r, best, t, uiLang, simple }: { r: RumourRowView; best: boolean; t: T; uiLang: RumourLang; simple: boolean }) {
  const [edit, setEdit] = useState(false)
  const store = useRumoursStore.getState()
  const tier = r.ownTier ?? r.tier
  return (
    <li className={`rm-row${best ? ' rm-row--best' : ''}${r.skip ? ' rm-row--skip' : ''}`}>
      <div className="rm-row__top">
        <span className="rm-game rm-row__text">{r.text}</span>
        <Category c={r.category} t={t} />
        <span className="rm-grow" />
        <span className="rm-tier" title={t('rumours.tier')}>
          <Pips n={tier} />
          <span className="rm-muted">
            {tier === null ? t('rumours.tier.none') : r.ownTier !== null ? t('rumours.tier.own', { tier: t(`rumours.tier.${r.ownTier}`) }) : t(`rumours.tier.${tier}`)}
          </span>
        </span>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon" title={t('rumours.remove')} aria-label={t('rumours.remove')} onClick={() => void store.remove(r.id)}>
          <ShellIcon name="close" size="sm" />
        </button>
      </div>
      <dl className="rm-row__facts">
        <div>
          <dt>{t('rumours.to')}</dt>
          <dd className="rm-game">{r.island}</dd>
        </div>
        <div>
          <dt>{t('rumours.reward')}</dt>
          <dd>
            {r.main ? rewardName(r.main, t) : '—'}
            {r.main && r.main.name !== null && (
              <span className="rm-price">{r.main.price ? priceText(r.main.price, t, uiLang) : t('rumours.price.later')}</span>
            )}
            {r.more.length > 0 && <span className="rm-muted"> · {r.more.map((x) => rewardName(x, t)).join(' · ')}</span>}
            {!r.checked && (
              <span className="ui-q rm-q" title={t('rumours.unchecked')}>
                ?
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('rumours.risk')}</dt>
          <dd>
            <Pips n={r.difficulty} accent />
            {r.difficulty !== null && <span>{t(`rumours.diff.${r.difficulty}`)}</span>}
            {r.risks.map((k) => (
              <span key={k} className="ui-tag ui-tag--warn">
                {t(`rumours.risk.${k}`)}
              </span>
            ))}
          </dd>
        </div>
      </dl>
      {r.bosses.length > 0 && !simple && <div className="rm-muted rm-row__bosses">{t('rumours.bosses', { list: r.bosses.join(', ') })}</div>}
      {r.note && (simple || best) && <p className="rm-row__note">{r.note}</p>}
      {r.ownNote && <p className="rm-row__own">«{r.ownNote}»</p>}
      <div className="rm-row__mark">
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" aria-expanded={edit} onClick={() => setEdit(!edit)}>
          <ShellIcon name="edit" size="sm" />
          {t('rumours.mark')}
        </button>
        {r.skip && <span className="ui-tag ui-tag--bad">{t('rumours.mark.skip')}</span>}
      </div>
      {edit && <MarkEditor r={r} t={t} />}
    </li>
  )
}

function MarkEditor({ r, t }: { r: RumourRowView; t: T }) {
  const [note, setNote] = useState(r.ownNote ?? '')
  const save = (patch: { tier?: RumourLevel | null; skip?: boolean; note?: string | null }): void => {
    const mark = { tier: r.ownTier, skip: r.skip, note: r.ownNote, ...patch }
    void useRumoursStore.getState().setMark(r.id, mark)
  }
  return (
    <div className="rm-mark">
      <Seg<number>
        label={t('rumours.mark')}
        value={r.ownTier ?? 0}
        onChange={(v) => save({ tier: v === 0 ? null : (v as RumourLevel) })}
        options={[
          { value: 0, label: t('rumours.mark.poeth') },
          { value: 1, label: '●○○', title: t('rumours.tier.1') },
          { value: 2, label: '●●○', title: t('rumours.tier.2') },
          { value: 3, label: '●●●', title: t('rumours.tier.3') }
        ]}
      />
      <Switch on={r.skip} onChange={(skip) => save({ skip })}>
        {t('rumours.mark.skip')}
      </Switch>
      <label className="rm-mark__note">
        <span className="ui-label">{t('rumours.mark.note')}</span>
        <input
          className="ui-input"
          maxLength={140}
          value={note}
          placeholder={t('rumours.mark.note.ph')}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note.trim() !== (r.ownNote ?? '') && save({ note: note.trim() || null })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
      </label>
      <span className="rm-muted">{t('rumours.mark.saved')}</span>
    </div>
  )
}

function AllList({ list, picked, t, gameLang, uiLang, open }: { list: RumourRecord[]; picked: string[]; t: T; gameLang: RumourLang; uiLang: RumourLang; open: boolean }) {
  const sorted = useMemo(() => searchRumours(list, '', gameLang), [list, gameLang])
  const full = picked.length >= RUMOURS_POOL_MAX
  return (
    <details className="rm-all" open={open}>
      <summary>{t('rumours.all', { n: list.length })}</summary>
      <span className="rm-muted">{t('rumours.all.hint')}</span>
      <ul>
        {sorted.map((r) => {
          const on = picked.includes(r.id)
          const v = rumourRow(r, gameLang, uiLang, undefined, null)
          return (
            <li key={r.id}>
              <button type="button" className="rm-all__item" disabled={on || full} onClick={() => void useRumoursStore.getState().add(r.id)}>
                <Pips n={r.tier} />
                <span className="rm-game">{v.text}</span>
                <span className="rm-muted">→ {v.island}</span>
                <span className="rm-grow" />
                {on ? <span className="ui-tag ui-tag--good">{t('rumours.added')}</span> : <Category c={r.category} t={t} />}
              </button>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function Footer({ patch, failed, t }: { patch: string | null; failed: number; t: T }) {
  const prices = useRumoursStore((s) => s.prices)
  const src = (prices?.sources ?? []).filter((s) => s !== 'stub')
  return (
    <div className="rm-foot rm-muted">
      <span>{t('rumours.source', { patch: patch ?? '—' })}</span>
      <span>{src.length ? t('rumours.prices.from', { list: src.map((s) => t(`rumours.src.${s}`)).join(', ') }) : t('rumours.prices.none')}</span>
      {failed > 0 && <span>{t('rumours.hidden', { n: failed })}</span>}
      <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost rm-foot__link" title={t('rumours.community.title')} onClick={() => window.overlayApi.window.openExternal(COMMUNITY_URL)}>
        <ShellIcon name="external" size="sm" />
        {t('rumours.community')}
      </button>
    </div>
  )
}
