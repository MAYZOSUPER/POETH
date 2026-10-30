import { useEffect, useState } from 'react'
import { isSiteId, siteDef, type SitesState } from '@shared/sites'
import { useLang, useT } from '../i18n'
import { Ico } from '../panels/regex/Ico'
import { useFavStore } from './useFavStore'

// Адресная строка вкладки сайта (S43): назад/вперёд/обновить, на главную сайта, хост текущей страницы (только
// чтение), «В браузере», «Очистить данные сайтов» (второе нажатие подтверждает), «Поверх игры» или ×. Меню не
// выпадает: сайт — нативная вью ниже строки, она закрыла бы его.

/** Название вкладки: сайт реестра, закладка или «Сайты». */
export function tabName(sites: SitesState, manageName: string): string {
  if (isSiteId(sites.active)) return siteDef(sites.active).name
  const bm = sites.bookmarks.find((b) => `bm:${b.id}` === sites.active)
  return bm?.title ?? manageName
}

function ClearButton() {
  const t = useT()
  const setSiteNotice = useFavStore((s) => s.setSiteNotice)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(id)
  }, [armed])
  return (
    <button
      type="button"
      className={`ui-btn ui-btn--sm ${armed ? 'ui-btn--danger' : 'ui-btn--ghost ui-btn--icon'}`}
      aria-label={t('sites.clear')}
      title={t('sites.clear.title')}
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        void window.overlayApi.sites.clearData().then(() => setSiteNotice('sites.clear.done'))
      }}
    >
      <Ico name="trash" size="sm" />
      {armed && t('sites.clear.confirm')}
    </button>
  )
}

export function SiteBar() {
  const t = useT()
  const lang = useLang()
  const sites = useFavStore((s) => s.sites)
  const site = useFavStore((s) => s.site)
  const notice = useFavStore((s) => s.siteNotice)
  const tw = window.overlayApi.tradeWindow
  if (!sites) return null
  const page = sites.page
  const loading = !!page?.loading
  const web = sites.active !== 'manage'
  const name = tabName(sites, t('sites.manage'))
  const enOnly = isSiteId(sites.active) && siteDef(sites.active).enOnly && lang === 'ru'
  return (
    <header className="ts-bar ts-bar--site">
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm ts-flip"
        aria-label={t('tw.back')}
        title={t('tw.back')}
        disabled={!page?.canGoBack}
        onClick={() => void tw.nav('back')}
      >
        <Ico name="chev-r" />
      </button>
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
        aria-label={t('tw.forward')}
        title={t('tw.forward')}
        disabled={!page?.canGoForward}
        onClick={() => void tw.nav('forward')}
      >
        <Ico name="chev-r" />
      </button>
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
        aria-label={loading ? t('tw.stop') : t('tw.reload')}
        title={loading ? t('tw.stop') : t('tw.reload')}
        disabled={!page}
        onClick={() => void tw.nav(loading ? 'stop' : 'reload')}
      >
        <Ico name={loading ? 'close' : 'refresh'} size="sm" />
      </button>
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
        aria-label={t('sites.home')}
        title={t('sites.home')}
        disabled={!page}
        onClick={() => void tw.nav('home')}
      >
        <Ico name="home" size="sm" />
      </button>
      <span className={`ts-url${notice ? ` is-${notice.kind}` : ''}`} title={notice ? undefined : page?.url}>
        {notice ? (
          <>
            <Ico name={notice.kind === 'ok' ? 'check' : 'warn'} size="sm" />
            <span role="status">{t(notice.key, notice.params)}</span>
          </>
        ) : (
          <>
            <Ico name={web ? 'lock' : 'gear'} size="sm" />
            <span>{web ? page?.host || name : name}</span>
            {enOnly && (
              <span className="ui-tag ts-url__tag" title={t('sites.en.title')}>
                EN
              </span>
            )}
          </>
        )}
      </span>
      <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" disabled={!page?.url} onClick={() => void tw.openInBrowser()}>
        <Ico name="external" />
        {t('tw.inBrowser')}
      </button>
      <ClearButton />
      {site?.overGame ? (
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm ts-close"
          aria-label={t('tw.close')}
          title={t('tw.close')}
          onClick={() => void tw.hide()}
        >
          <Ico name="close" size="sm" />
        </button>
      ) : (
        <button
          type="button"
          className="ui-switch"
          role="switch"
          aria-checked={!!site?.pinned}
          title={t('tw.pin.title')}
          onClick={() => void tw.setPinned(!site?.pinned)}
        >
          <span className="ui-switch__track" />
          <Ico name="pin" size="sm" />
          {t('tw.pin')}
        </button>
      )}
      {loading && <span className="ts-bar__progress" aria-hidden="true" />}
    </header>
  )
}
