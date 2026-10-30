import { useEffect } from 'react'

// Иконки дизайн-системы: спрайт resources/brand/icons-sprite.svg (раздаётся poeth://brand/) один раз
// вставляется в документ, иконка — <svg class="ui-ico"><use href="#i-<имя>"/></svg>.
// Общего компонента иконок в оболочке пока нет — когда появится, этот можно заменить.

let spriteLoad: Promise<void> | null = null

function ensureSprite(): Promise<void> {
  if (!spriteLoad) {
    spriteLoad = fetch('poeth://brand/icons-sprite.svg')
      .then((r) => (r.ok ? r.text() : ''))
      .then((svg) => {
        if (!svg || document.getElementById('i-check')) return
        const holder = document.createElement('div')
        holder.setAttribute('aria-hidden', 'true')
        holder.style.display = 'none'
        holder.innerHTML = svg
        document.body.prepend(holder)
      })
      .catch(() => undefined)
  }
  return spriteLoad
}

/** Все иконки спрайта (docs/design-system.md, раздел «Иконки»). */
export type IcoName =
  | 'check'
  | 'cross'
  | 'dash'
  | 'close'
  | 'min'
  | 'max'
  | 'restore'
  | 'search'
  | 'star'
  | 'bolt'
  | 'external'
  | 'chat'
  | 'invite'
  | 'trade'
  | 'kick'
  | 'heart'
  | 'sold'
  | 'ask'
  | 'home'
  | 'grid'
  | 'help'
  | 'warn'
  | 'copy'
  | 'refresh'
  | 'support'
  | 'gear'
  | 'folder'
  | 'archive'
  | 'chev-r'
  | 'chev-d'
  | 'dots'
  | 'plus'
  | 'import'
  | 'export'
  | 'pin'
  | 'lock'
  | 'shield'
  | 'logout'
  | 'keyboard'
  | 'layers'
  | 'volume'
  | 'info'
  | 'game'
  | 'pause'
  | 'trash'
  | 'edit'
  | 'map'
  | 'book'
  | 'coins'
  | 'compass'
  | 'history'

export function Ico({ name, size }: { name: IcoName; size?: 'sm' | 'lg' }) {
  useEffect(() => {
    void ensureSprite()
  }, [])
  return (
    <svg className={`ui-ico${size ? ` ui-ico--${size}` : ''}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}
