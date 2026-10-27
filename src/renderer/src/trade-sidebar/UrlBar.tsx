import { useT } from '../i18n'
import { Ico } from '../panels/regex/Ico'
import { useFavStore } from './useFavStore'

// Адресная строка над сайтом (правее колонки избранного): назад/вперёд/обновить, к поиску,
// адрес страницы (только чтение), «В браузере», «Поверх игры». Сам сайт — siteView поверх нашей страницы.

export function UrlBar() {
  const t = useT()
  const site = useFavStore((s) => s.site)
  const tw = window.overlayApi.tradeWindow
  const loading = !!site?.loading
  let shown = site?.url ?? ''
  try {
    const u = new URL(shown)
    shown = decodeURIComponent(u.host + u.pathname + u.search)
  } catch {
    // пустой адрес — пока ничего не загружено
  }
  return (
    <header className="ts-bar">
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm ts-flip"
        aria-label={t('tw.back')}
        title={t('tw.back')}
        disabled={!site?.canGoBack}
        onClick={() => void tw.nav('back')}
      >
        <Ico name="chev-r" />
      </button>
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
        aria-label={t('tw.forward')}
        title={t('tw.forward')}
        disabled={!site?.canGoForward}
        onClick={() => void tw.nav('forward')}
      >
        <Ico name="chev-r" />
      </button>
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
        aria-label={loading ? t('tw.stop') : t('tw.reload')}
        title={loading ? t('tw.stop') : t('tw.reload')}
        onClick={() => void tw.nav(loading ? 'stop' : 'reload')}
      >
        <Ico name={loading ? 'close' : 'refresh'} size="sm" />
      </button>
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
        aria-label={t('tw.home')}
        title={t('tw.home')}
        onClick={() => void tw.nav('home')}
      >
        <Ico name="home" size="sm" />
      </button>
      <span className="ts-url" title={site?.url}>
        <Ico name="lock" size="sm" />
        <span>{shown || t('tw.loading')}</span>
      </span>
      <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" disabled={!site?.url} onClick={() => void tw.openInBrowser()}>
        <Ico name="external" />
        {t('tw.inBrowser')}
      </button>
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
      {loading && <span className="ts-bar__progress" aria-hidden="true" />}
    </header>
  )
}
