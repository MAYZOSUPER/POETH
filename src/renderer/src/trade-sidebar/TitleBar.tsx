import { useT } from '../i18n'
import { tKey } from '../i18n/hotkey'
import { useAppStore } from '../store/useAppStore'
import { BrandImg } from '../components/BrandImg'
import { CompassMark } from '../components/CompassMark'
import { Ico } from '../panels/regex/Ico'
import { useFavStore } from './useFavStore'

// Шапка обычного трейд-окна (S58) вместо рамки Windows: значок и название, «свернуть», «развернуть / восстановить»,
// «закрыть» (окно прячется, как по × поверх игры и хоткею — сайт и вход остаются). Перетаскивание, Aero Snap и двойной
// клик по шапке — системные (-webkit-app-region: drag в trade-sidebar.css), кнопки — no-drag. Поверх игры шапки нет:
// там шапка — адресная строка (UrlBar, SiteBar).

export function TitleBar() {
  const t = useT()
  const maximized = useFavStore((s) => !!s.site?.maximized)
  const accel = useAppStore((s) => s.settings?.hotkeys.toggleTradeWindow?.accel)
  const tw = window.overlayApi.tradeWindow
  const maxText = t(maximized ? 'tw.win.restore' : 'tw.win.max')
  const closeText = tKey(t, 'tw.win.close', accel)
  return (
    <header className="ts-title">
      <span className="ts-title__brand">
        <BrandImg file="app_icon.png" className="ts-title__mark" fallback={<CompassMark size={18} />} />
        <span className="ts-title__app">POETH</span>
        <span className="ts-title__name">{t('tw.win.title')}</span>
      </span>
      <span className="ts-title__acts">
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          aria-label={t('tw.win.min')}
          title={t('tw.win.min')}
          onClick={() => void tw.minimize()}
        >
          <Ico name="min" />
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          aria-label={maxText}
          title={maxText}
          onClick={() => void tw.toggleMaximize()}
        >
          <Ico name={maximized ? 'restore' : 'max'} />
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm ts-close"
          aria-label={closeText}
          title={closeText}
          onClick={() => void tw.hide()}
        >
          <Ico name="close" />
        </button>
      </span>
    </header>
  )
}
