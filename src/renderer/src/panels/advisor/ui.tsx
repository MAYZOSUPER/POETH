import type { AdvisorConfidence, AdvisorConfidenceReason, AdvisorLevel } from '@shared/types'
import { useT } from '../../i18n'
import { ensureSprite } from '../wealth/ui'

// Иконки, уровни (сложность, нужды билда) и уверенность вкладки «Что фармить» (компоненты ui-* дизайн-системы).

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
