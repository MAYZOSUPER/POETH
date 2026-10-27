import type { ReactNode } from 'react'

// Иконки панели аккаунта — контуры из resources/brand/icons/*.svg (24×24, линия 1.8,
// currentColor; стиль — класс .ui-ico из components.css). Спрайт через <use> с poeth://
// не работает (другой origin), поэтому нужные пути — здесь. Когда появится общий
// компонент иконок, заменить на него.

const PATHS = {
  shield: (
    <>
      <path d="M12 3.5l7 3v5.2c0 4.3-3 7.6-7 8.8-4-1.2-7-4.5-7-8.8V6.5z" />
      <path d="M8.8 12l2.2 2.2 4.2-4.4" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="1.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  logout: <path d="M10 4H5.5v16H10M9.5 12h11M17 8.5l3.5 3.5-3.5 3.5" />,
  external: (
    <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
  ),
  warn: (
    <>
      <path d="M12 4.5l8.5 15h-17z" />
      <path d="M12 10v4.2M12 17v.1" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.7 9.6a2.4 2.4 0 1 1 3.3 2.2c-.6.3-1 .8-1 1.5v.4M12 16.6v.1" />
    </>
  ),
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
} satisfies Record<string, ReactNode>

export type IcoName = keyof typeof PATHS

export function Ico({ name, className }: { name: IcoName; className?: string }) {
  return (
    <svg className={'ui-ico' + (className ? ` ${className}` : '')} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}
