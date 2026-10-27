/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import sprite from '../../../../../resources/brand/icons-sprite.svg?raw'

// Иконки и переключатель для вкладки Live (компоненты ui-* дизайн-системы). Спрайт
// resources/brand/icons-sprite.svg вставляется в документ один раз (если его ещё не
// вставила другая вкладка); иконка — <use href="#i-…">.

export type LiveIcoName =
  | 'bolt'
  | 'volume'
  | 'external'
  | 'trash'
  | 'chat'
  | 'copy'
  | 'history'
  | 'help'
  | 'lock'
  | 'warn'
  | 'plus'

function ensureSprite(): void {
  if (typeof document === 'undefined' || document.getElementById('i-check')) return
  const holder = document.createElement('div')
  holder.setAttribute('aria-hidden', 'true')
  holder.style.display = 'none'
  holder.innerHTML = sprite
  document.body.prepend(holder)
}

export function LiveIco({ name, size }: { name: LiveIcoName; size?: 'sm' | 'lg' }) {
  ensureSprite()
  return (
    <svg className={`ui-ico${size ? ` ui-ico--${size}` : ''}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}

export function LiveSwitch({
  on,
  live,
  label,
  title,
  disabled,
  onChange
}: {
  on: boolean
  live?: boolean
  label?: ReactNode
  title?: string
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      className={`ui-switch${live ? ' ui-switch--live' : ''}`}
      role="switch"
      aria-checked={on}
      title={title}
      aria-label={typeof label === 'string' ? undefined : title}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className="ui-switch__track" />
      {label}
    </button>
  )
}
