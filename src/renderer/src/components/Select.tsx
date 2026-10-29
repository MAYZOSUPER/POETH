import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

// Выпадающий список по дизайн-системе (`.ui-select`, docs/design-system.md) вместо нативного <select>:
// у нативного список рисует Windows — белый, системным шрифтом, без подсказок к пунктам (S21, живая
// проверка rc.7). Кнопка с текущим значением + список `role="listbox"` с подсказкой под каждым пунктом.
// Клавиатура: ↓/↑/Enter/Пробел открывают; ↓/↑/Home/End двигают, Enter/Пробел выбирают, Esc/Tab закрывают.
// Список — `position: fixed` внутри того же дерева (не портал): не обрезается прокруткой окна, а клик по
// пункту остаётся «внутри» окна (оверлей не отдаёт фокус игре, перетаскивание шапки не начинается).

export interface SelectOption<V extends string = string> {
  value: V
  label: string
  /** вторая строка пункта — короткое пояснение новичку */
  hint?: string
}

interface Props<V extends string> {
  value: V
  options: readonly SelectOption<V>[]
  onChange: (value: V) => void
  /** подпись для чтения с экрана (видимая подпись — снаружи) */
  label: string
  className?: string
  /** подсказка кнопки (title) */
  title?: string
  /** перед открытием (оверлей: активировать окно, чтобы клавиатура не ушла в игру) */
  onOpen?: () => void
}

const GAP = 4
const EDGE = 8

export function Select<V extends string>({ value, options, onChange, label, className, title, onOpen }: Props<V>) {
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' })
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value)
  )
  const current = options[selected]

  const show = (index = selected): void => {
    onOpen?.()
    setActive(index)
    setOpen(true)
  }
  const close = (refocus = true): void => {
    setOpen(false)
    if (refocus) btn.current?.focus()
  }
  const pick = (i: number): void => {
    const o = options[i]
    close()
    if (o && o.value !== value) onChange(o.value)
  }

  // место списка: под кнопкой, не влезает — над ней; по ширине не уже кнопки и в пределах окна
  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const b = btn.current?.getBoundingClientRect()
      const el = list.current
      if (!b || !el) return
      const w = Math.max(el.offsetWidth, b.width)
      const h = el.offsetHeight
      const below = b.bottom + GAP + h <= window.innerHeight - EDGE || b.top - GAP - h < EDGE
      setStyle({
        left: Math.max(EDGE, Math.min(b.left, window.innerWidth - w - EDGE)),
        top: below ? b.bottom + GAP : b.top - GAP - h,
        minWidth: b.width
      })
    }
    place()
    list.current?.focus()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      setStyle({ visibility: 'hidden' })
    }
  }, [open])

  // клик мимо — закрыть
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!list.current?.contains(t) && !btn.current?.contains(t)) close(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // активный пункт виден при прокрутке длинного списка
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const onButtonKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      show()
    }
  }

  const onListKey = (e: KeyboardEvent): void => {
    const last = options.length - 1
    const move = (i: number): void => setActive(Math.max(0, Math.min(last, i)))
    switch (e.key) {
      case 'ArrowDown':
        move(active + 1)
        break
      case 'ArrowUp':
        move(active - 1)
        break
      case 'Home':
        move(0)
        break
      case 'End':
        move(last)
        break
      case 'Enter':
      case ' ':
        pick(active)
        break
      case 'Escape':
        close()
        break
      case 'Tab':
        close(false)
        return
      default:
        return
    }
    // Enter не должен запускать «Искать заново» окна цены, Esc — закрывать само окно
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`ui-select${className ? ` ${className}` : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={`${label}: ${current?.label ?? ''}`}
        title={title ?? current?.hint}
        onClick={() => (open ? close() : show())}
        onKeyDown={onButtonKey}
      >
        <span className="ui-select__value">{current?.label}</span>
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          className="ui-select__list"
          style={style}
          data-no-drag
          onKeyDown={onListKey}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null) && e.relatedTarget !== btn.current) close(false)
          }}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === selected}
              className={`ui-select__opt${i === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              <span className="ui-select__label">{o.label}</span>
              {o.hint && <span className="ui-select__hint">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
