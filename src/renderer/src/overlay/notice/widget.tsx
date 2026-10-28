import { useOverlayStore } from '../../store/useOverlayStore'
import { OverlayWidget } from '../OverlayWidget'
import { Icon } from '../Icon'
import { useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'

// Короткие уведомления поверх игры (слой toasts, справа сверху): например, команда чата не
// отправлена — «нет последнего собеседника». Не кликабельные (мышь проходит в игру),
// исчезают сами (useOverlayStore, NOTICE_MS). С кнопкой (notice.action) — кликабельные и висят
// дольше: «хоткей занят другой программой» → «Сменить клавишу» (настройки компаньона).

function NoticeWidget() {
  const notices = useOverlayStore((s) => s.notices)
  const t = useOverlayT()
  return (
    <>
      {notices.map(({ id, notice }) => (
        <OverlayWidget key={id} interactive={!!notice.action}>
          <div className={`ui-panel ov-notice ov-notice--${notice.kind}`} role="status">
            <Icon name={notice.kind === 'warn' ? 'warn' : 'info'} />
            <span>{notice.text ?? t(notice.key, notice.params)}</span>
            {notice.action === 'hotkeySettings' && (
              <button
                type="button"
                className="ui-btn ui-btn--sm ov-notice__action"
                onClick={() => window.overlayApi.overlay.openHotkeySettings()}
              >
                <Icon name="keyboard" />
                {t('overlay.notice.changeKey')}
              </button>
            )}
          </div>
        </OverlayWidget>
      ))}
    </>
  )
}

// выше тостов live (order), но в той же стопке
const widget: OverlayWidgetDef = { id: 'notice', layer: 'toasts', order: -10, Component: NoticeWidget }
export default widget
