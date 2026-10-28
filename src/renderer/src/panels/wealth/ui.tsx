/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import type { UiLang } from '@shared/types'
import { CoinIcon } from '../../components/Currency'
import sprite from '../../../../../resources/brand/icons-sprite.svg?raw'

// Иконки, переключатель и монеты для вкладки «Богатство» (компоненты ui-* дизайн-системы).
// Спрайт вставляется в документ один раз (если его ещё не вставила другая вкладка).

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


export function ensureSprite(): void {
  if (typeof document === 'undefined' || document.getElementById('i-check')) return
  const holder = document.createElement('div')
  holder.setAttribute('aria-hidden', 'true')
  holder.style.display = 'none'
  holder.innerHTML = sprite
  document.body.prepend(holder)
}

export function WIco({ name, size }: { name: WIcoName; size?: 'sm' | 'lg' }) {
  ensureSprite()
  return (
    <svg className={`ui-ico${size ? ` ui-ico--${size}` : ''}`} aria-hidden="true">
      <use href={`#i-${name}`} />
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

/** Иконка chaos/divine (S18: настоящая иконка игры, без сети — кружок ui-coin). */
export function Coin({ unit, lang }: { unit: 'chaos' | 'divine'; lang: UiLang }) {
  return <CoinIcon tag={unit} lang={lang} />
}
