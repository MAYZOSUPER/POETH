/// <reference types="vite/client" />
import sprite from '../../../../resources/brand/icons-sprite.svg?raw'

// Иконки дизайн-системы (resources/brand/icons-sprite.svg, 72 линейные иконки, currentColor).
// Спрайт вставляется в страницу один раз (<IconSprite/> в OverlayApp), иконка — <use href="#i-…">.
// Внешний <use href="poeth://…"> не годится: SVG <use> работает только в пределах документа.

export type IconName =
  | 'check' | 'cross' | 'dash' | 'close' | 'min' | 'max' | 'search' | 'star' | 'bolt' | 'external'
  | 'chat' | 'invite' | 'trade' | 'kick' | 'heart' | 'sold' | 'ask' | 'home' | 'grid' | 'help'
  | 'warn' | 'copy' | 'refresh' | 'support' | 'gear' | 'folder' | 'archive' | 'chev-r' | 'chev-d'
  | 'dots' | 'plus' | 'import' | 'export' | 'pin' | 'lock' | 'shield' | 'logout' | 'keyboard'
  | 'layers' | 'volume' | 'info' | 'game' | 'pause' | 'trash' | 'edit' | 'map' | 'book' | 'coins'
  | 'compass' | 'seal' | 'history' | 'arrow-up' | 'arrow-down' | 'chart' | 'table' | 'play' | 'stop'
  | 'death' | 'drag' | 'swap' | 'passive' | 'gem' | 'trial' | 'flask' | 'step'
  | 'essence' | 'strongbox' | 'expedition' | 'harvest' | 'delirium' | 'abyss' | 'link'

/** Спрайт иконок: один раз на страницу, невидимый. */
export function IconSprite() {
  return <div hidden aria-hidden="true" dangerouslySetInnerHTML={{ __html: sprite }} />
}

export function Icon({ name, size }: { name: IconName; size?: 'sm' | 'lg' }) {
  return (
    <svg className={`ui-ico${size ? ` ui-ico--${size}` : ''}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}
