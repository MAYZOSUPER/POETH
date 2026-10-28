import { useEffect, useRef, useState } from 'react'
import { useT } from '../../i18n'
import { ensureSprite } from '../wealth/ui'
import { pips } from './view'

// Иконки, «●●○» и кнопка «скопировать число» вкладки «Обмен» (компоненты ui-* дизайн-системы).

export type FIcoName =
  | 'swap'
  | 'chart'
  | 'book'
  | 'copy'
  | 'check'
  | 'help'
  | 'info'
  | 'warn'
  | 'history'
  | 'refresh'
  | 'chev-d'
  | 'arrow-up'
  | 'arrow-down'

export function FIco({ name, size }: { name: FIcoName; size?: 'sm' | 'lg' }) {
  ensureSprite()
  return (
    <svg className={`ui-ico${size ? ` ui-ico--${size}` : ''}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}

/** Уверенность: деления и (если `word`) слово «высокая / средняя / низкая». */
export function Confidence({ value, word }: { value: number; word: boolean }) {
  const t = useT()
  const n = pips(value)
  const w = t(`flip.conf.${n}`)
  return (
    <span className="fx-conf" title={t('flip.conf.title', { word: w, pct: Math.round(value * 100) })}>
      <span className="ui-pips" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <i key={i} className={i < n ? 'on' : undefined} />
        ))}
      </span>
      <span className={word ? 'fx-conf__w' : 'fx-sr'}>{w}</span>
    </span>
  )
}

/** Кнопка «скопировать число» — чтобы вставить его в окне обмена в игре. */
export function CopyNumber({ value, shown }: { value: number; shown: string }) {
  const t = useT()
  const [done, setDone] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    []
  )
  return (
    <button
      type="button"
      className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
      title={t(done ? 'flip.copied' : 'flip.copy.title', { n: shown })}
      aria-label={t('flip.copy.aria', { n: shown })}
      onClick={() => {
        void navigator.clipboard.writeText(String(value)).then(() => {
          setDone(true)
          if (timer.current) window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      <FIco name={done ? 'check' : 'copy'} />
    </button>
  )
}
