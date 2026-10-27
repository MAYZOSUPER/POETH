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

export type IcoName =
  | 'check'
  | 'cross'
  | 'dash'
  | 'copy'
  | 'book'
  | 'map'
  | 'coins'
  | 'help'
  | 'keyboard'
  | 'edit'
  | 'trash'
  | 'search'
  | 'import'
  | 'export'
  | 'plus'
  | 'warn'
  | 'info'

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
