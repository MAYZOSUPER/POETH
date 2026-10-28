import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useT } from '../i18n'
import { Ico, type IcoName } from '../panels/regex/Ico'

// Меню «⋯» (.ui-menu): фиксированное позиционирование от кнопки — список избранного
// прокручивается и обрезал бы абсолютное меню. Шаги внутри меню: подменю «Перенести в папку»
// и подтверждение удаления (макет: «Удаление с подтверждением внутри меню»).

export interface MenuItem {
  icon: IcoName
  label: string
  onClick?: () => void
  danger?: boolean
  /** вместо действия — открыть шаг меню (подменю или подтверждение) */
  step?: MenuStep
  checked?: boolean
  disabled?: boolean
}

export interface MenuStep {
  title?: string
  items: MenuItem[]
}

export function MenuButton({ items, label }: { items: MenuItem[]; label?: string }) {
  const t = useT()
  const btn = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm ts-dots"
        aria-label={label ?? t('fav.menu')}
        title={label ?? t('fav.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <Ico name="dots" />
      </button>
      {open && btn.current && <Menu anchor={btn.current} root={{ items }} onClose={() => setOpen(false)} />}
    </>
  )
}

function Menu({ anchor, root, onClose }: { anchor: HTMLElement; root: MenuStep; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<MenuStep>(root)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect()
    const m = ref.current?.getBoundingClientRect()
    const w = m?.width ?? 220
    const h = m?.height ?? 200
    const left = Math.max(4, Math.min(a.right - w, window.innerWidth - w - 4))
    const below = a.bottom + 4
    const top = below + h > window.innerHeight - 4 ? Math.max(4, a.top - h - 4) : below
    setPos({ top, left })
  }, [anchor, step])

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
    }
  }, [anchor, onClose])

  return (
    <div
      ref={ref}
      className="ui-menu ts-menu"
      role="menu"
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
    >
      {step.title && <div className="ts-menu__title">{step.title}</div>}
      {step.items.map((it, i) => (
        <MenuRow
          key={i}
          item={it}
          onPick={() => {
            if (it.step) setStep(it.step)
            else {
              it.onClick?.()
              onClose()
            }
          }}
        />
      ))}
    </div>
  )
}

function MenuRow({ item, onPick }: { item: MenuItem; onPick: () => void }) {
  const hint: ReactNode = item.step ? <Ico name="chev-r" size="sm" /> : item.checked ? <Ico name="check" size="sm" /> : <span />
  return (
    <>
      {item.danger && <div className="ui-menu__sep" />}
      <button
        type="button"
        role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={item.checked}
        className={`ui-menu__item${item.danger ? ' ui-menu__item--danger' : ''}`}
        disabled={item.disabled}
        onClick={onPick}
      >
        <Ico name={item.icon} />
        <span>{item.label}</span>
        {hint}
      </button>
    </>
  )
}
