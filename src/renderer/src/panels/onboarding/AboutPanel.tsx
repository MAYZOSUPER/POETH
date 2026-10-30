import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/types'
import { CREDITS, MIT_LICENSE_TEXT, type Supporter } from '@shared/credits'
import { BOOSTY_URL } from '@shared/links'
import { useLang, useT } from '../../i18n'
import { BrandImg } from '../../components/BrandImg'
import { Ico } from '../regex/Ico'
import { useShellStore } from '../../store/useShellStore'
import './onboarding.css'

// «О программе» (S9) по утверждённому макету: логотип и версия, Boosty, «Благодарности»
// (resources/supporters.json, без сети), лицензии открытого кода и атрибуции (NOTICE.md),
// мастер первого запуска заново, приватность и дисклеймер GGG.

const GAME_NAME = { poe1: 'Path of Exile 1', poe2: 'Path of Exile 2' } as const

/** Страница сайта «Сообщить об ошибке» (S56): что приложить, скриншоты, приватность. */
const BUG_HELP_URL = 'https://mayzosuper.github.io/POETH/bug/'

function bugHelpUrl(lang: string): string {
  return lang === 'en' ? `${BUG_HELP_URL}?lang=en` : BUG_HELP_URL
}

export function AboutPanel() {
  const t = useT()
  const lang = useLang()
  const setPage = useShellStore((s) => s.setPage)
  const openWizard = useShellStore((s) => s.openWizard)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [supporters, setSupporters] = useState<Supporter[] | null>(null)
  const [licenses, setLicenses] = useState(false)

  useEffect(() => {
    void window.overlayApi.app.info().then(setInfo)
    void window.overlayApi.app
      .supporters()
      .then(setSupporters)
      .catch(() => setSupporters([]))
  }, [])

  return (
    <section className="onb-about ui-scroll" aria-labelledby="onb-about-h">
      <div className="onb-about__top">
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setPage('settings')}>
          <span className="onb-flip">
            <Ico name="chev-r" size="sm" />
          </span>
          {t('about.back')}
        </button>
        <h2 id="onb-about-h" className="onb-about__title">
          {t('about.title')}
        </h2>
      </div>

      <div className="onb-about__body">
        <BrandImg file="logo.png" alt="POETH" className="onb-logo" fallback={<span className="onb-about__title">POETH</span>} />
        {info && (
          <span className="onb-muted">{t('about.version', { version: info.version, game: GAME_NAME[info.game] })}</span>
        )}
        <div className="ui-divider onb-divider" />
        <p className="onb-muted onb-p">{t('about.free')}</p>
        <div className="onb-row">
          <button
            type="button"
            className="ui-btn"
            title={t('about.support.title')}
            onClick={() => window.overlayApi.window.openExternal(BOOSTY_URL)}
          >
            <Ico name="support" />
            {t('about.support')}
          </button>
          <span className="onb-path">boosty.to/twistedthreadstudios</span>
        </div>

        <Credits supporters={supporters} />

        <div className="onb-row">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" aria-expanded={licenses} onClick={() => setLicenses((v) => !v)}>
            <Ico name="book" />
            {licenses ? t('about.licenses.hide') : t('about.licenses')}
          </button>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={openWizard}>
            <Ico name="compass" />
            {t('about.wizard')}
          </button>
        </div>
        {licenses && <Licenses />}

        {/* S56: форма GitHub «Ошибка / Bug» — адрес с версией, игрой и языками собирает main */}
        <div className="onb-row">
          <button type="button" className="ui-btn ui-btn--sm" title={t('about.bug.title')} onClick={() => void window.overlayApi.app.reportBug()}>
            <Ico name="warn" />
            {t('about.bug')}
          </button>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => window.overlayApi.window.openExternal(bugHelpUrl(lang))}>
            <Ico name="help" />
            {t('about.bug.help')}
          </button>
        </div>
        <span className="onb-faint">{t('about.bug.note')}</span>

        <span className="onb-faint">{t('about.privacy')}</span>
        <p className="onb-faint onb-p">{t('set.disclaimer')}</p>
      </div>
    </section>
  )
}

function Credits({ supporters }: { supporters: Supporter[] | null }) {
  const t = useT()
  const list = supporters ?? []
  return (
    <section className="ui-credits onb-credits" aria-label={t('about.thanks')}>
      <div className="ui-credits__head">
        <Ico name="support" />
        <span className="ui-credits__title">{t('about.thanks')}</span>
        {list.length > 0 && <span className="ui-count">{list.length}</span>}
      </div>
      <p className="ui-credits__lead">{t('about.thanks.lead')}</p>
      {list.length ? (
        <ul className="ui-credits__list ui-scroll">
          {list.map((p) => (
            <li
              key={p.name}
              className="ui-credits__name"
              title={p.since ? `${p.name} · ${t('about.thanks.since', { since: p.since })}` : p.name}
            >
              <span>{p.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        supporters && <p className="ui-credits__empty">{t('about.thanks.empty')}</p>
      )}
      <span className="ui-credits__note">{t('about.thanks.note')}</span>
    </section>
  )
}

function Licenses() {
  const t = useT()
  return (
    <div className="onb-licenses">
      <span className="ui-label">{t('about.license.own')}</span>
      <p className="onb-muted onb-p">{t('about.credits.lead')}</p>
      <ul className="onb-credit-list">
        {CREDITS.map((c) => (
          <li key={c.id}>
            <b>{c.name}</b>
            <span className="ui-tag">{c.license}</span>
            <span className="onb-muted">{t(`about.credit.${c.id}`)}</span>
            <span className="onb-path">{c.url}</span>
          </li>
        ))}
      </ul>
      <details className="onb-mit">
        <summary>{t('about.license.text')}</summary>
        <pre>{MIT_LICENSE_TEXT}</pre>
      </details>
    </div>
  )
}
