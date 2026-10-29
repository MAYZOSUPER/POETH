import type { IconName } from '../overlay/Icon'
import { ensureSprite } from '../panels/wealth/ui'

// Иконка дизайн-системы в оболочке компаньона — шапка и рельс (S20). Спрайт вставляется в документ один раз
// (тот же, что у вкладок), иконка — <use href="#i-…">, цвет — currentColor.
export function ShellIcon({ name, size }: { name: IconName; size?: 'sm' | 'lg' }) {
  ensureSprite()
  return (
    <svg className={`ui-ico${size ? ` ui-ico--${size}` : ''}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}
