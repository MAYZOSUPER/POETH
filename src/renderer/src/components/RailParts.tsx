import { forwardRef, useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { useT } from '../i18n'
import { ShellIcon } from './ShellIcon'

// Части рельса навигации, общие у рельса компаньона (panels/NavRail.tsx, S20) и рельса вкладок сайтов трейд-окна
// (trade-sidebar/SiteRail.tsx, S58): кнопка «развернуть / свернуть» внизу и шторка на узком окне. Стили — .ui-rail
// в styles/components.css; правила «развёрнут ли» — @shared/rail.

/** Кнопка внизу рельса: показать названия или свернуть до значков. title=false — без подсказки (сквозной режим). */
export const RailToggle = forwardRef<HTMLButtonElement, { open: boolean; title?: boolean; onClick: () => void }>(
  function RailToggle({ open, title = true, onClick }, ref) {
    const t = useT()
    const text = t(open ? 'nav.collapse' : 'nav.expand')
    return (
      <button
        ref={ref}
        type="button"
        className="ui-rail__item ui-rail__toggle"
        aria-expanded={open}
        aria-label={text}
        title={title ? text : undefined}
        onClick={onClick}
      >
        <ShellIcon name="chev-r" />
        <span className="ui-rail__label">{t('nav.collapse.short')}</span>
      </button>
    )
  }
)

/**
 * Шторка: развёрнутый рельс поверх содержимого на затемнении (окно уже RAIL_INLINE_MIN). Фокус — на открытую
 * вкладку (пункт с tabindex="0"), Esc закрывает и возвращает фокус на кнопку рельса; клик мимо и уход фокуса
 * из шторки (Tab дальше) — закрывают, чтобы фокус не оказался под затемнением.
 */
export function RailDrawer({
  label,
  toggleRef,
  onClose,
  className,
  children
}: {
  label: string
  /** кнопка «развернуть» свёрнутого рельса — на неё возвращается фокус */
  toggleRef: RefObject<HTMLButtonElement>
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const t = useT()
  const ref = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      close.current()
      toggleRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toggleRef])

  return (
    <>
      <button type="button" className="ui-rail-scrim" aria-label={t('nav.close')} tabIndex={-1} onClick={() => close.current()} />
      <nav
        ref={ref}
        className={`ui-rail ui-rail--drawer${className ? ` ${className}` : ''}`}
        aria-label={label}
        onBlur={(e) => {
          const to = e.relatedTarget as Node | null
          if (to && !e.currentTarget.contains(to)) close.current()
        }}
      >
        {children}
        <RailToggle
          open
          title={false}
          onClick={() => {
            close.current()
            toggleRef.current?.focus()
          }}
        />
      </nav>
    </>
  )
}
