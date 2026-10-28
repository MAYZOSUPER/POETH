import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { AdvisorConfidence, AdvisorConfidenceReason, AdvisorLevel } from '@shared/types'
import { useT } from '../../i18n'
import { ensureSprite } from '../wealth/ui'

// Иконки, уровни (сложность, нужды билда), уверенность и диалог вкладки «Что фармить» (компоненты ui-* дизайн-системы).

export type AIcoName =
  | 'map'
  | 'coins'
  | 'play'
  | 'check'
  | 'help'
  | 'info'
  | 'warn'
  | 'history'
  | 'refresh'
  | 'chev-d'
  | 'chev-r'
  | 'book'
  | 'step'
  | 'compass'
  | 'copy'
  // S17: редактор, «Поделиться», «Импорт»
  | 'plus'
  | 'import'
  | 'export'
  | 'edit'
  | 'trash'
  | 'close'
  | 'cross'
  | 'external'
  | 'shield'
  | 'chart'
  | 'drag'
  | 'search'
  | 'arrow-up'
  | 'arrow-down'
  | 'link'
  // механики (спрайт дизайнера, design/strategies)
  | 'essence'
  | 'strongbox'
  | 'expedition'
  | 'harvest'
  | 'delirium'
  | 'abyss'

export function AIco({ name, size }: { name: AIcoName; size?: 'sm' | 'lg' }) {
  ensureSprite()
  return (
    <svg className={`ui-ico${size ? ` ui-ico--${size}` : ''}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}

/** Уровень 1–3 точками цвета акцента и словом (цвет — не единственный сигнал). */
export function Level({ n, word, title }: { n: AdvisorLevel; word: string; title?: string }) {
  return (
    <span className="ad-lv" title={title}>
      <span className="ad-lv__dots" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= n ? 'on' : undefined} />
        ))}
      </span>
      <span>{word}</span>
    </span>
  )
}

/** Уверенность: деления ●●○ и слово; причины — в подсказке. */
export function Confidence({ value, reasons }: { value: AdvisorConfidence; reasons: readonly AdvisorConfidenceReason[] }) {
  const t = useT()
  const word = t(`advisor.conf.${value}`)
  const why = reasons.map((r) => t(`advisor.reason.${r}`)).join('; ')
  return (
    <span className="ad-conf" title={why ? `${t('advisor.conf.title', { word })}: ${why}` : t('advisor.conf.title', { word })}>
      <span className="ui-pips" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= value ? 'on' : undefined} />
        ))}
      </span>
      <span>{t('advisor.conf.title', { word })}</span>
    </span>
  )
}

/**
 * Диалог поверх вкладки (.ui-dialog): Esc и «×» закрывают, фокус — внутрь при открытии и обратно при закрытии.
 * Подложка (.ui-dialog-scrim) — от ближайшего position: relative (оболочка вкладки .ad-host).
 */
export function Dialog({
  title,
  onClose,
  children,
  foot,
  wide
}: {
  title: string
  onClose: () => void
  children: ReactNode
  foot: ReactNode
  wide?: boolean
}) {
  const t = useT()
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    const first = box.current?.querySelector<HTMLElement>('textarea, input, button:not([disabled])')
    first?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      back?.focus?.()
    }
    // фокус ставим один раз при открытии
  }, [])
  return (
    <div className="ui-dialog-scrim">
      <div ref={box} className={`ui-dialog${wide ? ' ad-dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="ui-dialog__head">
          <h3 className="ui-dialog__title" id={id}>
            {title}
          </h3>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon" aria-label={t('advisor.close')} title={t('advisor.close')} onClick={onClose}>
            <AIco name="close" />
          </button>
        </div>
        <div className="ui-dialog__body">{children}</div>
        <div className="ui-dialog__foot">{foot}</div>
      </div>
    </div>
  )
}

/** Кнопка копирования: «Скопировано» с галочкой на 2 с. */
export function CopyButton({ text, label, primary, icon = 'copy' }: { text: string; label: string; primary?: boolean; icon?: AIcoName }) {
  const t = useT()
  const [done, setDone] = useCopied()
  return (
    <button
      type="button"
      className={`ui-btn${primary ? ' ui-btn--primary' : ''}${done ? ' ad-copied' : ''}`}
      disabled={!text}
      onClick={() => void navigator.clipboard.writeText(text).then(() => setDone(true))}
    >
      <AIco name={done ? 'check' : icon} />
      {done ? t('advisor.copied') : label}
    </button>
  )
}

/** Флаг «скопировано», сам гаснет через 2 с. */
function useCopied(): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(false)
  useEffect(() => {
    if (!v) return
    const id = setTimeout(() => setV(false), 2000)
    return () => clearTimeout(id)
  }, [v])
  return [v, setV]
}
