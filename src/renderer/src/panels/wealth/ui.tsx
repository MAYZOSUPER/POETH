/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import sprite from '../../../../../resources/brand/icons-sprite.svg?raw'

// Иконки, переключатель и монеты для вкладки «Богатство» (компоненты ui-* дизайн-системы).
// Спрайт вставляется в документ один раз (если его ещё не вставила другая вкладка). Иконок из макета
// «Богатство» v2, которых в спрайте пока нет (стрелки, график, таблица, play/stop), — инлайн по путям
// из макета; когда дизайнер добавит их в спрайт, EXTRA можно убрать.

export type WIcoName =
  | 'coins'
  | 'refresh'
  | 'history'
  | 'help'
  | 'lock'
  | 'warn'
  | 'layers'
  | 'pause'
  | 'check'
  | 'gear'
  | 'info'
  | 'grid'
  | 'map'
  | 'external'
  | 'shield'
  | 'plus'
  | 'chev-r'
  | 'arrow-up'
  | 'arrow-down'
  | 'chart'
  | 'table'
  | 'play'
  | 'stop'

const EXTRA: Partial<Record<WIcoName, ReactNode>> = {
  'arrow-up': <path d="M12 19V5.5M6.5 11L12 5.5 17.5 11" />,
  'arrow-down': <path d="M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5" />,
  chart: (
    <>
      <path d="M4 19.5h16" />
      <path d="M5.5 15.5l4.2-5 3.6 3 5.2-7" />
    </>
  ),
  table: (
    <>
      <rect x="4" y="5.5" width="16" height="13" rx="1.5" />
      <path d="M4 10h16M4 14.3h16M9.5 5.5v13" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" />
}

function ensureSprite(): void {
  if (typeof document === 'undefined' || document.getElementById('i-check')) return
  const holder = document.createElement('div')
  holder.setAttribute('aria-hidden', 'true')
  holder.style.display = 'none'
  holder.innerHTML = sprite
  document.body.prepend(holder)
}

export function WIco({ name, size }: { name: WIcoName; size?: 'sm' | 'lg' }) {
  ensureSprite()
  const cls = `ui-ico${size ? ` ui-ico--${size}` : ''}`
  const inline = typeof document !== 'undefined' && !document.getElementById(`i-${name}`) ? EXTRA[name] : undefined
  return (
    <svg className={cls} aria-hidden="true" viewBox={inline ? '0 0 24 24' : undefined}>
      {inline ?? <use href={`#i-${name}`} />}
    </svg>
  )
}

export function WSwitch({
  on,
  label,
  title,
  disabled,
  onChange
}: {
  on: boolean
  label?: ReactNode
  title?: string
  disabled?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      className="ui-switch"
      role="switch"
      aria-checked={on}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className="ui-switch__track" />
      {label}
    </button>
  )
}

export function Coin({ unit }: { unit: 'chaos' | 'divine' }) {
  return <i className={`ui-coin ui-coin--${unit === 'divine' ? 'div' : 'chaos'}`} />
}
