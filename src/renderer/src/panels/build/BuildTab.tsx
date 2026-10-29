import { useEffect } from 'react'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useBuildStore } from '../../store/useBuildStore'
import { useLevelingStore } from '../../store/useLevelingStore'
import { BuildView } from './BuildView'
import { EmptyView } from './EmptyView'
import { BIco } from './ui'
import './build.css'

// Вкладка «Билд» (S39, B3; v0.2 — скрыта флагом buildOn): вставили код Path of Building — по этапам видно, какие
// камни взять и купить, как связать, какие ноды брать дальше и что проверить. Этап — по уровню персонажа из
// журнала игры (гид прокачки S22). Макет: https://claude.ai/artifact/Dczhnx84p6F9hps1jks4aZ (раздел 1).

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
            {dataError && (
              <div className="ui-banner ui-banner--bad bd-banner bd-top">
                <BIco name="warn" />
                <span>
                  <b>{t('bd.data.err')}</b> {t('bd.data.err.d')}
                </span>
                <span />
              </div>
            )}
            {active && busy === 'reload' && (
              <div className="ui-hint bd-hint bd-top">
                <BIco name="refresh" />
                <span>{t('bd.reloading')}</span>
              </div>
            )}
            {active && error && (
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
            {active ? <BuildView key={active.id} build={active} expert={expert} /> : <EmptyView expert={expert} />}
          </>
        )}
      </div>
    </div>
  )
}
