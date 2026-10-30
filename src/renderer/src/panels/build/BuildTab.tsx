import { useEffect, useState } from 'react'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useBuildStore } from '../../store/useBuildStore'
import { useLevelingStore } from '../../store/useLevelingStore'
import { BuildView } from './BuildView'
import { EmptyView } from './EmptyView'
import { StartersView } from './StartersView'
import { BIco } from './ui'
import './build.css'

// Вкладка «Билд» (S39, B3; v0.2 — скрыта флагом buildOn): вставили код Path of Building — по этапам видно, какие
// камни взять и купить, как связать, какие ноды брать дальше и что проверить. Этап — по уровню персонажа из
// журнала игры (гид прокачки S22). Макет: https://claude.ai/artifact/Dczhnx84p6F9hps1jks4aZ (раздел 1).
// S59: переключатель «Мои билды · Стартеры» — стартеры лиги из пакета данных, «Играть по этому гайду».

/** «Мои билды · Стартеры» (S59). */
function Sections() {
  const t = useT()
  const section = useBuildStore((s) => s.section)
  const setSection = useBuildStore((s) => s.setSection)
  return (
    <div className="bd-sec bd-top">
      <div className="ui-seg" role="group" aria-label={t('bd.sec.label')}>
        {(['mine', 'starters'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={section === k} onClick={() => setSection(k)}>
            <BIco name={k === 'mine' ? 'passive' : 'star'} size="sm" />
            {t(`bd.sec.${k}`)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** После «Играть по этому гайду» (S59): «Автор обновил PoB после нашей проверки», «по актам вести не сможем». */
function StarterBanners() {
  const t = useT()
  const active = useBuildStore((s) => s.state.active)
  const played = useBuildStore((s) => s.played)
  const [hidden, setHidden] = useState<string | null>(null)
  const { clearPlayed, openStarterLink } = useBuildStore.getState()
  const starter = active?.starter
  if (!active || !starter) return null
  const fresh = played?.mode === 'replace' && played.id === starter.id ? played : null
  const changed = starter.changed && hidden !== active.id
  return (
    <>
      {changed && (
        <div className="ui-banner ui-banner--info bd-banner bd-top" role="status">
          <BIco name="refresh" />
          <span>
            <b>{t('bd.st.changed')}</b> {t('bd.st.changed.d')}
          </span>
          <span className="bd-st-banner-acts">
            <button
              type="button"
              className="ui-btn ui-btn--sm"
              onClick={() => void openStarterLink(starter.id, 'guide').then((ok) => ok || openStarterLink(starter.id, 'video'))}
            >
              <BIco name="external" size="sm" />
              {t('bd.st.link.guide')}
            </button>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('bd.st.close')} onClick={() => setHidden(active.id)}>
              <BIco name="close" />
            </button>
          </span>
        </div>
      )}
      {fresh?.leveling === 'none' && (
        <div className="ui-banner bd-banner bd-top" role="status">
          <BIco name="warn" />
          <span>
            <b>{t('bd.st.noLev')}</b> {t('bd.st.noLev.d')}
          </span>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('bd.st.close')} onClick={clearPlayed}>
            <BIco name="close" />
          </button>
        </div>
      )}
    </>
  )
}

function useInit(init: () => Promise<() => void>): void {
  useEffect(() => {
    let off: (() => void) | undefined
    let disposed = false
    void init().then((fn) => (disposed ? fn() : (off = fn)))
    return () => {
      disposed = true
      off?.()
    }
  }, [init])
}

export function BuildTab() {
  const t = useT()
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const expert = !useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const ready = useBuildStore((s) => s.ready)
  const active = useBuildStore((s) => s.state.active)
  const dataError = useBuildStore((s) => s.dataError)
  const error = useBuildStore((s) => (s.errorFrom === 'reload' ? s.error : null))
  const busy = useBuildStore((s) => s.busy)
  const section = useBuildStore((s) => s.section)
  useInit(useBuildStore((s) => s.init))
  useInit(useLevelingStore((s) => s.init))

  if (game !== 'poe1') {
    return (
      <div className="bd-host">
        <p className="bd-none">{t('bd.poe1only')}</p>
      </div>
    )
  }

  return (
    // .bd-host — опора диалога «Этапы…» (не прокручивается), .bd-scroll — прокрутка содержимого
    <div className="bd-host" role="region" aria-label={t('app.build')} aria-busy={!ready || undefined}>
      <div className="bd-scroll ui-scroll">
        {!ready ? (
          <div className="bd-empty">
            <span className="ui-skeleton" style={{ width: 220, height: 22 }} />
            <span className="ui-skeleton" style={{ width: '70%' }} />
          </div>
        ) : (
          <>
            <Sections />
            {dataError && (
              <div className="ui-banner ui-banner--bad bd-banner bd-top">
                <BIco name="warn" />
                <span>
                  <b>{t('bd.data.err')}</b> {t('bd.data.err.d')}
                </span>
                <span />
              </div>
            )}
            {section === 'mine' && active && busy === 'reload' && (
              <div className="ui-hint bd-hint bd-top">
                <BIco name="refresh" />
                <span>{t('bd.reloading')}</span>
              </div>
            )}
            {section === 'mine' && active && error && (
              <div className="ui-banner ui-banner--bad bd-banner bd-top" role="alert">
                <BIco name="refresh" />
                <span>
                  <b>{t('bd.reload.err')}</b> {t(error.error === 'fetch' ? `bd.err.fetch.${error.fetchError ?? 'network'}` : 'bd.err.notPob')}
                </span>
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('bd.dlg.close')} onClick={() => useBuildStore.getState().clearError()}>
                  <BIco name="close" />
                </button>
              </div>
            )}
            {section === 'starters' ? (
              <StartersView expert={expert} />
            ) : active ? (
              <>
                <StarterBanners />
                <BuildView key={active.id} build={active} expert={expert} />
              </>
            ) : (
              <EmptyView expert={expert} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
