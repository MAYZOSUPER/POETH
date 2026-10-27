import { useT } from '../../i18n'
import { Ico } from './icons'

// Состояние «сайт просит пройти проверку» (Cloudflare) — по макету прайс-чека:
// .ui-banner--info со щитом + главная кнопка. Для S4/S6: показывать на ошибку шлюза
// {code:'blocked'}; `context` подбирает вторую фразу. Пока нет трейд-окна (S5), кнопка
// открывает окно сайта GGG — проверка Cloudflare проходится там же.

export type SiteCheckContext = 'pricecheck' | 'live' | 'account'

export function SiteCheckBanner({
  context = 'pricecheck',
  onOpen,
  action = true
}: {
  context?: SiteCheckContext
  /** по умолчанию — окно сайта GGG (auth.login) */
  onOpen?: () => void
  /** false — без кнопки (рядом уже есть «Войти», ведущая туда же) */
  action?: boolean
}) {
  const t = useT()
  const open = onOpen ?? (() => void window.overlayApi.auth.login())
  return (
    <div className="account-check">
      <div className="ui-banner ui-banner--info" role="status">
        <Ico name="shield" />
        <span>
          <b>{t('auth.cf.title')}</b> {t(`auth.cf.text.${context}`)}
        </span>
        <span />
      </div>
      {action && (
        <div className="account-check__act">
          <button type="button" className="ui-btn ui-btn--primary" onClick={open}>
            <Ico name="external" />
            {t('auth.cf.open')}
          </button>
        </div>
      )}
    </div>
  )
}
