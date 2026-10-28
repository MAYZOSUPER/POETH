import { useEffect, useState } from 'react'
import type { StartupState, UiLang, UpdateState } from '@shared/types'
import { translate } from '../i18n'
import './updates.css'

// Служебные окна S10a (страница index.html?view=…): экран загрузки и «Вышло обновление».
// Оформление — компоненты ui-* дизайн-системы (ui-panel, ui-meter, ui-btn, ui-hint).

function useLang(): UiLang {
  const [lang, setLang] = useState<UiLang>('ru')
  useEffect(() => {
    void window.overlayApi.settings.get().then((s) => setLang(s.uiLang))
  }, [])
  return lang
}

const STEP_PERCENT: Record<StartupState['step'], number> = { settings: 15, data: 45, leagues: 80, ready: 100 }

export function SplashView() {
  const lang = useLang()
  const t = (k: string, p?: Record<string, string | number>): string => translate(lang, k, p)
  const [st, setSt] = useState<StartupState | null>(null)
  useEffect(() => {
    void window.overlayApi.startup.state().then(setSt)
    return window.overlayApi.onStartupState(setSt)
  }, [])
  const step = st?.step ?? 'settings'
  return (
    <div className="svc svc--splash ui-panel ui-panel--solid">
      <img className="svc-splash__mark" src="poeth://brand/mark.svg" alt="" />
      <div className="svc-splash__name">POE Trade Helper</div>
      <div className="ui-meter svc-splash__meter" style={{ ['--v' as string]: `${STEP_PERCENT[step]}%` }}>
        <div className="ui-meter__row">
          <span>{t(`upd.splash.${step}`)}</span>
          <b>{st?.version ? `v${st.version}` : ''}</b>
        </div>
        <div className="ui-meter__bar" />
      </div>
    </div>
  )
}

export function UpdateView() {
  const lang = useLang()
  const t = (k: string, p?: Record<string, string | number>): string => translate(lang, k, p)
  const [st, setSt] = useState<UpdateState | null>(null)
  useEffect(() => {
    void window.overlayApi.updates.state().then(setSt)
    return window.overlayApi.onUpdateState(setSt)
  }, [])
  if (!st) return null
  const busy = st.phase === 'downloading' || st.phase === 'downloaded'
  return (
    <section className="svc svc--update ui-panel ui-panel--solid">
      <header className="ui-panel__head svc-drag">
        <span className="ui-panel__title">
          {t('upd.title')} v{st.version}
        </span>
      </header>
      <div className="ui-panel__body svc-update__body">
        <div className="svc-update__ver">{t('upd.version', { version: st.version ?? '', current: st.current })}</div>
        <div className="ui-label">{t('upd.notes')}</div>
        <div className="svc-update__notes ui-scroll">{st.notes || t('upd.notes.empty')}</div>
        {(st.phase === 'downloading' || st.phase === 'downloaded') && (
          <div className="ui-meter" style={{ ['--v' as string]: `${st.percent ?? 0}%` }}>
            <div className="ui-meter__row">
              <span>
                {st.phase === 'downloaded' ? t('upd.downloaded') : t('upd.downloading', { percent: st.percent ?? 0 })}
              </span>
            </div>
            <div className="ui-meter__bar" />
          </div>
        )}
        {st.phase === 'error' && (
          <div className="ui-banner ui-banner--bad svc-update__err">
            <span aria-hidden="true">!</span>
            <span>{t('upd.error', { error: st.error ?? '' })}</span>
            <span />
          </div>
        )}
        <div className="svc-update__hint">{t(st.portable ? 'upd.hint.portable' : 'upd.hint')}</div>
      </div>
      <footer className="ui-panel__foot svc-update__foot">
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          disabled={busy}
          onClick={() => window.overlayApi.updates.install()}
        >
          {st.portable ? t('upd.download') : st.phase === 'error' ? t('upd.retry') : t('upd.now')}
        </button>
        <button type="button" className="ui-btn ui-btn--ghost" disabled={busy} onClick={() => window.overlayApi.updates.later()}>
          {t('upd.later')}
        </button>
      </footer>
    </section>
  )
}
