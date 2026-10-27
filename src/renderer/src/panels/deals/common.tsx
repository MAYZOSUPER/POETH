import { Fragment, useEffect, type ReactNode } from 'react'
import { useAppStore } from '../../store/useAppStore'

// Общие куски вкладки «Сделки» по макету «Золото компаса»: иконки из спрайта, переключатель,
// сегменты, карточка-блок, текст с <b>. Форматирование — ./format.ts, звук — ./sound.ts.

// ---------------------------------------------------------------- иконки

let spriteLoad: Promise<void> | null = null

/** Спрайт resources/brand/icons-sprite.svg (poeth://brand/) — один раз в документ (как во вкладке Regex). */
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
  | 'search'
  | 'export'
  | 'trash'
  | 'history'
  | 'volume'
  | 'shield'
  | 'close'
  | 'check'
  | 'info'
  | 'pause'
  | 'folder'
  | 'edit'
  | 'layers'

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

// ---------------------------------------------------------------- контролы

/** Простой режим (по умолчанию): подсказки новичку, кнопки с подписями. */
export function useSimple(): boolean {
  return useAppStore((s) => s.settings?.ui.simpleMode ?? true)
}

export function Switch({
  on,
  onChange,
  children,
  disabled
}: {
  on: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="ui-switch"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className="ui-switch__track" />
      {children}
    </button>
  )
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div className="ui-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Карточка с подписью раздела («box» макета). */
export function Box({ title, icon, aside, children }: { title: string; icon?: IcoName; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="dl-box">
      <div className="dl-box__h">
        {icon && <Ico name={icon} />}
        <span className="ui-label">{title}</span>
        <span className="ui-label__grow" />
        {aside}
      </div>
      <div className="dl-box__b">{children}</div>
    </section>
  )
}

/** Текст перевода с <b>…</b> → элементы React (без innerHTML). */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/<b>(.*?)<\/b>/g)
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}
    </>
  )
}

export function Hint({ text }: { text: string }) {
  return (
    <div className="ui-hint dl-hint">
      <Ico name="info" />
      <span>
        <Rich text={text} />
      </span>
    </div>
  )
}

export { blacklistWarning, coinClass, formatDate, formatTime, reasonText, statusTag } from './format'
