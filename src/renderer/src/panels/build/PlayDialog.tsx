import { useEffect, useId, useRef } from 'react'
import { comparePatch, patchOf } from '@shared/starters/schema'
import { starterBadges } from '@shared/starters/view'
import type { StarterCard as Card } from '@shared/types/build'
import { useLang, useT } from '../../i18n'
import { useGameLang } from '../../gameLang'
import { formatAccel } from '../../overlay/useOverlayT'
import { useAppStore } from '../../store/useAppStore'
import { useBuildStore, type StarterPlayFail } from '../../store/useBuildStore'
import { ascOrClass, buildTitle, mainSkillName } from './names'
import { StarterLink, useStarterTitle } from './StarterCard'
import { BIco } from './ui'

// «Играть по этому гайду» (S59, starters-research.md §6.4): что будет (PoB скачается одним запросом с сайта автора,
// билд станет активным, дерево — по хоткею, прогресс только локально); если уже открыт другой билд — «Заменить»
// (прежний остаётся в «Недавних») или «Добавить в библиотеку». Пока качается — кнопки заняты; ошибки — что
// случилось и что сделать: паста удалена — «Автор убрал PoB. Откройте гайд автора».

type T = ReturnType<typeof useT>

/** Ошибка «Играть» → заголовок и подсказка. */
function errorText(e: StarterPlayFail, t: T): { title: string; text: string } {
  switch (e.error) {
    case 'removed':
      return { title: t('bd.st.err.removed'), text: t('bd.st.err.removed.d') }
    case 'unknown':
      return { title: t('bd.st.err.unknown'), text: t('bd.st.err.unknown.d') }
    case 'fetch':
      return { title: t(`bd.err.fetch.${e.fetchError ?? 'network'}`), text: t('bd.st.err.fetch.d') }
    case 'poe2':
      return { title: t('bd.err.poe2'), text: t('bd.st.err.pob.d') }
    case 'too-large':
      return { title: t('bd.err.big'), text: t('bd.st.err.pob.d') }
    default:
      return { title: t('bd.st.err.pob'), text: t('bd.st.err.pob.d') }
  }
}

export function PlayDialog({ card, league }: { card: Card; league: string | null }) {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const play = useBuildStore((s) => s.play)
  const active = useBuildStore((s) => s.state.active)
  const recent = useBuildStore((s) => s.state.recent)
  const tree = useBuildStore((s) => s.tree)
  const gems = useBuildStore((s) => s.gems)
  const accel = useAppStore((s) => (s.settings?.hotkeys as Record<string, { accel?: string } | undefined> | undefined)?.buildTree?.accel ?? 'Alt+P')
  const { cancelPlay, playStarter } = useBuildStore.getState()
  const { title } = useStarterTitle(card)
  const loading = play?.phase === 'loading'
  const error = play?.phase === 'error' ? play.error : undefined

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('.ui-dialog__foot .ui-btn--primary, .ui-dialog__foot button')?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cancelPlay()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      back?.focus?.()
    }
    // фокус ставим один раз при открытии
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // другой открытый билд: «Заменить» или «Добавить в библиотеку» (его имя — как в «Недавних»)
  const other = active && active.starter?.id !== card.id ? (recent.find((r) => r.id === active.id) ?? null) : null
  const otherTitle = other
    ? buildTitle(mainSkillName(gems, other.mainGemId, other.mainSkill, gameLang), ascOrClass(tree, gameLang, other.classId, other.ascendClassId, other))
    : ''

  const stale = starterBadges(card, league).stale
  const treePatch = patchOf(tree?.meta.tree)
  // стартер текущей лиги, а данные дерева и камней ещё прошлой (до обновления в день лиги)
  const noData = !!treePatch && !!league && card.patch === league && comparePatch(treePatch, league) < 0
  const err = error ? errorText(error, t) : null
  const guide = card.links.guide ? 'guide' : card.links.video ? 'video' : null

  return (
    <div className="ui-dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && cancelPlay()}>
      <div ref={box} className="ui-dialog bd-dialog bd-st-dlg" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-busy={loading || undefined}>
        <div className="ui-dialog__head">
          <h3 className="ui-dialog__title" id={`${id}-t`}>
            {t('bd.st.dlg.title')}: {title}
          </h3>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('bd.st.close')} disabled={loading} onClick={cancelPlay}>
            <BIco name="close" />
          </button>
        </div>
        <div className="ui-dialog__body">
          {err && (
            <div className="ui-banner ui-banner--bad bd-banner" role="alert">
              <BIco name={error?.error === 'removed' ? 'trash' : 'warn'} />
              <span>
                <b>{err.title}</b> {err.text}
              </span>
              {guide ? <StarterLink id={card.id} kind={guide} host={card.links[guide] as string} /> : <span />}
            </div>
          )}
          {loading ? (
            <div className="ui-hint bd-hint" role="status">
              <BIco name="refresh" />
              <span>{t('bd.st.dlg.loading')}</span>
            </div>
          ) : (
            <div className="bd-st-what">
              <div className="ui-label">{t('bd.st.dlg.what')}</div>
              <ul>
                <li>
                  <BIco name="import" size="sm" />
                  <span>{t('bd.st.dlg.fetch', { host: card.links.pob ?? 'pobb.in' })}</span>
                </li>
                <li>
                  <BIco name="passive" size="sm" />
                  <span>{t('bd.st.dlg.active', { key: formatAccel(accel).replace(/ /g, ' ') })}</span>
                </li>
                <li>
                  <BIco name="lock" size="sm" />
                  <span>{t('bd.st.dlg.local')}</span>
                </li>
              </ul>
            </div>
          )}
          {card.tags.leveling === 'none' && (
            <div className="ui-banner bd-banner">
              <BIco name="warn" />
              <span>
                <b>{t('bd.st.noLev')}</b> {t('bd.st.noLev.d')}
              </span>
              <span />
            </div>
          )}
          {stale && (
            <div className="ui-banner bd-banner">
              <BIco name="history" />
              <span>{t('bd.st.dlg.stale', { patch: card.patch })}</span>
              <span />
            </div>
          )}
          {noData && league && treePatch && (
            <div className="ui-banner ui-banner--info bd-banner">
              <BIco name="info" />
              <span>
                <b>{t('bd.st.noData')}</b> {t('bd.st.noData.d', { data: treePatch, league })}
              </span>
              <span />
            </div>
          )}
          {other && !loading && (
            <div className="ui-hint bd-hint">
              <BIco name="swap" />
              <span>
                <b>{t('bd.st.dlg.has', { name: otherTitle })}</b> {t('bd.st.dlg.has.d')}
              </span>
            </div>
          )}
        </div>
        <div className="ui-dialog__foot">
          <button type="button" className="ui-btn ui-btn--ghost" disabled={loading} onClick={cancelPlay}>
            {t('bd.st.dlg.cancel')}
          </button>
          <span className="grow" />
          {other ? (
            <>
              <button type="button" className="ui-btn" disabled={loading} onClick={() => void playStarter('add')}>
                <BIco name="plus" />
                {t('bd.st.dlg.add')}
              </button>
              <button type="button" className="ui-btn ui-btn--primary" disabled={loading} aria-busy={loading || undefined} onClick={() => void playStarter('replace')}>
                <BIco name={loading ? 'refresh' : error ? 'refresh' : 'swap'} />
                {error ? t('bd.st.retry') : t('bd.st.dlg.replace')}
              </button>
            </>
          ) : (
            <button type="button" className="ui-btn ui-btn--primary" disabled={loading} aria-busy={loading || undefined} onClick={() => void playStarter('replace')}>
              <BIco name={loading || error ? 'refresh' : 'play'} />
              {error ? t('bd.st.retry') : t('bd.st.dlg.play')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
