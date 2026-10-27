import { useOverlayStore } from '../../store/useOverlayStore'
import { OverlayWidget } from '../OverlayWidget'
import { Icon } from '../Icon'
import { useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'

// Короткие уведомления поверх игры (слой toasts, справа сверху): например, команда чата не
// отправлена — «нет последнего собеседника». Не кликабельные (мышь проходит в игру),
// исчезают сами (useOverlayStore, NOTICE_MS).

function NoticeWidget() {
  const notices = useOverlayStore((s) => s.notices)
  const t = useOverlayT()
  return (
    <>
      {notices.map(({ id, notice }) => (
        <OverlayWidget key={id} interactive={false}>
          <div className={`ui-panel ov-notice ov-notice--${notice.kind}`} role="status">
            <Icon name={notice.kind === 'warn' ? 'warn' : 'info'} />
            <span>{t(notice.key, notice.params)}</span>
          </div>
        </OverlayWidget>
      ))}
    </>
  )
}

// выше тостов live (order), но в той же стопке
const widget: OverlayWidgetDef = { id: 'notice', layer: 'toasts', order: -10, Component: NoticeWidget }
export default widget
