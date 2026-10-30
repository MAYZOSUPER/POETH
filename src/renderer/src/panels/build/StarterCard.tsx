import { useState } from 'react'
import { starterBadges } from '@shared/starters/view'
import type { BuildRecent, StarterCard as Card, StarterLinkKind, StoredBuild } from '@shared/types/build'
import { useLang, useT } from '../../i18n'
import { useGameLang } from '../../gameLang'
import { useBuildStore } from '../../store/useBuildStore'
import { mainSkillName, starterClass } from './names'
import { BIco, stageLabels } from './ui'
import { useStage } from './useStage'

// Карточка стартера (S59, starters-research.md §6.3): навык и восхождение на языке клиента игры, автор, язык видео,
// знаки «Проверено POETH в 3.30», «Обновлён к 3.30», «Устарел», «Для новичка», бюджет, сложность, «ведёт по актам».
// Кнопки: «Играть по этому гайду» (главная), «Подробнее», «Гайд автора» (системный браузер через main по id —
// адресов в окне нет, только сайт для подписи «откроется …»). Наша строка описания — простой текст.

type T = ReturnType<typeof useT>

/** Текст на языке интерфейса, иначе на другом. */
export function noteText(note: Card['note'], lang: string): string | null {
  if (!note) return null
  return (lang === 'ru' ? (note.ru ?? note.en) : (note.en ?? note.ru)) ?? null
}

/** Имя стартера для заголовка и диалога: «Навык · Восхождение» на языке клиента игры. */
export function useStarterTitle(card: Card): { title: string; cls: string; asc: string | null } {
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const tree = useBuildStore((s) => s.tree)
  const gems = useBuildStore((s) => s.gems)
  const skill = mainSkillName(gems, card.skill.gem, card.skill.en, gameLang)
  const { cls, asc } = starterClass(tree, gameLang, card.class, card.ascendancy)
  return { title: `${skill} · ${asc ?? cls}`, cls, asc }
}

/** Сложность: ●○○ и слово (цвет — не единственный сигнал). */
function Difficulty({ n, t }: { n: 1 | 2 | 3; t: T }) {
  return (
    <span className="bd-st-diff" title={t('bd.st.f.diff')}>
      <span className="ui-pips ui-pips--accent" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= n ? 'on' : undefined} />
        ))}
      </span>
      {t('bd.st.tag.diff', { v: t(`bd.st.diff.${n}`) })}
    </span>
  )
}

/** Знаки карточки: выбор куратора, проверка, версия игры, новичку, бюджет, «ведёт по актам». */
function Tags({ card, league, t }: { card: Card; league: string | null; t: T }) {
  const b = starterBadges(card, league)
  const lev = card.tags.leveling
  return (
    <div className="bd-st-tags">
      {card.pick && (
        <span className="ui-tag ui-tag--key" title={t('bd.st.tag.pick.tip')}>
          <BIco name="star" size="sm" />
          {t('bd.st.tag.pick')}
        </span>
      )}
      {b.checked && league && (
        <span className="ui-tag ui-tag--good" title={t('bd.st.tag.checked.tip')}>
          {t('bd.st.tag.checked', { league })}
        </span>
      )}
      {b.fresh && league && (
        <span className="ui-tag ui-tag--merchant" title={t('bd.st.tag.fresh.tip', { league })}>
          {t('bd.st.tag.fresh', { league })}
        </span>
      )}
      {b.stale && (
        <span className="ui-tag ui-tag--warn" title={t('bd.st.tag.stale.tip', { patch: card.patch })}>
          {t('bd.st.tag.stale', { patch: card.patch })}
        </span>
      )}
      {card.tags.newbie && <span className="ui-tag ui-tag--person">{t('bd.st.tag.newbie')}</span>}
      <span className="bd-st-fact">
        <BIco name="coins" size="sm" />
        {t('bd.st.tag.budget', { v: t(`bd.st.budget.${card.tags.budget}`) })}
      </span>
      <Difficulty n={card.tags.difficulty} t={t} />
      <span className={`bd-st-fact${lev === 'none' ? ' is-warn' : lev === 'acts' ? ' is-good' : ''}`}>
        <BIco name={lev === 'none' ? 'warn' : lev === 'acts' ? 'check' : 'dash'} size="sm" />
        {t(`bd.st.lev.${lev}`)}
      </span>
    </div>
  )
}

/** Этап открытого стартера по журналу игры (как у любого билда, S22/S36) — только локально. */
function ActiveStage({ build }: { build: StoredBuild }) {
  const t = useT()
  const s = useStage(build)
  if (s.current === null) return null
  const label = stageLabels(s.plan.stages, t)[s.current]
  return (
    <p className="bd-st-now">
      <BIco name="step" size="sm" />
      {t('bd.st.now', { stage: label })}
    </p>
  )
}

/** Кнопка ссылки автора: открывает main по id записи; подпись — сайт. */
export function StarterLink({ id, kind, host, ghost }: { id: string; kind: StarterLinkKind; host: string; ghost?: boolean }) {
  const t = useT()
  const [failed, setFailed] = useState(false)
  const open = (): void => {
    void useBuildStore
      .getState()
      .openStarterLink(id, kind)
      .then((ok) => setFailed(!ok))
  }
  const tip = failed ? t('bd.st.link.fail') : t('bd.st.link.opens', { host })
  return (
    <button type="button" className={`ui-btn ui-btn--sm${ghost ? ' ui-btn--ghost' : ''}`} title={tip} onClick={open}>
      <BIco name={failed ? 'warn' : 'external'} size="sm" />
      {t(`bd.st.link.${kind}`)}
      {!ghost && <span className="bd-st-host">{host}</span>}
    </button>
  )
}

function Details({ card, league, t }: { card: Card; league: string | null; t: T }) {
  const links = (['guide', 'video', 'channel', 'pob'] as const).filter((k) => card.links[k])
  return (
    <div className="bd-st-details">
      <div className="bd-st-dl">
        <b>{t('bd.st.d.what')}</b>
        <span>{t('bd.st.d.what.text')}</span>
      </div>
      <div className="bd-st-dl">
        <b>{t(`bd.st.lev.${card.tags.leveling}`)}</b>
        <span>{t(`bd.st.d.lev.${card.tags.leveling}`)}</span>
      </div>
      {(card.tags.modes.length > 0 || card.tags.content.length > 0) && (
        <div className="bd-st-dl">
          <b>
            {[card.tags.modes.length ? t('bd.st.d.modes') : '', card.tags.content.length ? t('bd.st.d.content') : '']
              .filter(Boolean)
              .join(' · ')}
          </b>
          <span>{[...card.tags.modes.map((m) => t(`bd.st.mode.${m}`)), ...card.tags.content.map((c) => t(`bd.st.content.${c}`))].join(', ')}</span>
        </div>
      )}
      <div className="bd-st-dl">
        <b>{t('bd.st.d.links')}</b>
        <span className="bd-st-links">
          {links.map((k) => (
            <StarterLink key={k} id={card.id} kind={k} host={card.links[k] as string} />
          ))}
        </span>
      </div>
      <p className="bd-st-small">
        <BIco name="history" size="sm" />
        <span>
          {t('bd.st.d.pobDate', { date: card.pobCheckedAt })}
          {' · '}
          {card.checked && league && card.checked.league === league
            ? t('bd.st.d.checked', { date: card.checked.date })
            : t('bd.st.d.notChecked', { league: league ?? card.patch })}
        </span>
      </p>
      <p className="bd-st-small">
        <BIco name="info" size="sm" />
        <span>{t('bd.st.d.rights')}</span>
      </p>
    </div>
  )
}

export function StarterCard({
  card,
  league,
  expert,
  saved,
  active
}: {
  card: Card
  /** текущая лига списка — для знаков */
  league: string | null
  expert: boolean
  /** билд этого стартера в библиотеке */
  saved: BuildRecent | null
  /** открытый билд — этот стартер */
  active: StoredBuild | null
}) {
  const t = useT()
  const lang = useLang()
  const open = useBuildStore((s) => s.stOpen === card.id)
  const busy = useBuildStore((s) => s.busy !== null || s.play?.phase === 'loading')
  const { toggleStarter, askPlay, open: openBuild, setSection } = useBuildStore.getState()
  const { title, cls, asc } = useStarterTitle(card)
  const note = noteText(card.note, lang)
  const authorLink: StarterLinkKind | null = card.links.guide ? 'guide' : card.links.video ? 'video' : null
  const detailsId = `bd-st-d-${card.id}`
  return (
    <article className={`bd-st-card${card.pick ? ' is-pick' : ''}${active ? ' is-active' : ''}`} id={`bd-st-${card.id}`} aria-label={title}>
      <div className="bd-st-card__main">
        <span className="ui-mech" aria-hidden="true">
          <BIco name="passive" />
        </span>
        <div className="bd-st-card__t">
          <h4 className="bd-st-card__title">{title}</h4>
          <div className="bd-st-card__meta">
            <span>{asc ? `${cls} → ${asc}` : cls}</span>
            <span>{t('bd.st.by', { name: card.author })}</span>
            <span>{t(`bd.st.lang.${card.lang}`)}</span>
            {active ? (
              <span className="bd-st-mine is-active">
                <BIco name="play" size="sm" />
                {t('bd.st.tag.active')}
              </span>
            ) : (
              saved && (
                <span className="bd-st-mine">
                  <BIco name="check" size="sm" />
                  {t('bd.st.tag.saved')}
                </span>
              )
            )}
          </div>
          <Tags card={card} league={league} t={t} />
          {note && <p className="bd-st-card__note">{note}</p>}
          {active && <ActiveStage build={active} />}
        </div>
      </div>
      <div className="bd-st-card__acts">
        <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={() => askPlay(card.id)}>
          <BIco name="play" />
          {t('bd.st.play')}
        </button>
        {saved && !active && (
          <button
            type="button"
            className="ui-btn"
            disabled={busy}
            onClick={() => void openBuild(saved.id).then(() => setSection('mine'))}
          >
            <BIco name="import" />
            {t('bd.st.openSaved')}
          </button>
        )}
        <button type="button" className="ui-btn ui-btn--ghost" aria-expanded={open} aria-controls={detailsId} onClick={() => toggleStarter(card.id)}>
          <BIco name={open ? 'chev-d' : 'chev-r'} />
          {open ? t('bd.st.less') : t('bd.st.more')}
        </button>
        {authorLink && <StarterLink id={card.id} kind={authorLink} host={card.links[authorLink] as string} ghost={!expert} />}
      </div>
      {open && (
        <div id={detailsId}>
          <Details card={card} league={league} t={t} />
        </div>
      )}
    </article>
  )
}
