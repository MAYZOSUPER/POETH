import { useEffect, useRef, useState } from 'react'
import type { RegexBuildResult, RegexLang } from '@shared/types'
import { REGEX_LIMIT } from '@shared/regex'
import { useLang, useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useRegexStore } from '../../store/useRegexStore'

// Общие куски вкладки Regex: язык клиента игры, кнопка «Копировать», счётчик, блок результата.

/** Язык клиента игры для строки: настройка вкладки или язык интерфейса. */
export function useGameLang(): RegexLang {
  const uiLang = useLang()
  const pref = useRegexStore((s) => s.prefs.gameLang)
  return pref === 'auto' ? uiLang : pref
}

export function CopyButton({ text, className = 'btn small' }: { text: string; className?: string }) {
  const t = useT()
  const copy = useRegexStore((s) => s.copy)
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  return (
    <button
      className={`${className} rx-copy${done ? ' done' : ''}`}
      disabled={!text}
      onClick={() => {
        void copy(text).then(() => {
          setDone(true)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      {done ? t('regex.copied') : t('regex.copy')}
    </button>
  )
}

export function Counter({ length }: { length: number }) {
  const t = useT()
  const cls = length > REGEX_LIMIT ? ' over' : length > REGEX_LIMIT * 0.9 ? ' near' : ''
  return (
    <span className={`rx-counter${cls}`} title={t('regex.counter.title')}>
      {length} / {REGEX_LIMIT}
    </span>
  )
}

/** Сегментированный переключатель. */
export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  small
}: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
  small?: boolean
}) {
  return (
    <div className={`rx-seg${small ? ' small' : ''}`}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          className={o.value === value ? 'on' : ''}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Готовая строка: текст, счётчик 250, «Копировать», «В библиотеку» (с названием), «Сбросить»;
 * ниже — ошибка переполнения с подсказкой и предупреждение о побочных совпадениях.
 */
export function ResultBox({
  result,
  defaultName,
  onReset,
  overflowText,
  sideText
}: {
  result: RegexBuildResult
  defaultName: string
  onReset: () => void
  overflowText?: string
  sideText?: string
}) {
  const t = useT()
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const saveEntry = useRegexStore((s) => s.saveEntry)
  const [naming, setNaming] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSaved(false)
  }, [result.text])

  const save = async (): Promise<void> => {
    const name = (naming ?? '').trim() || defaultName
    await saveEntry({ name, text: result.text, game })
    setNaming(null)
    setSaved(true)
  }

  return (
    <div className="rx-result">
      <div className="rx-result-head">
        <span className="block-title">{t('regex.result.title')}</span>
        <Counter length={result.length} />
      </div>
      <div className={`rx-string${result.text ? '' : ' empty'}${result.ok ? '' : ' over'}`}>
        {result.text || t('regex.result.empty')}
      </div>
      {naming === null ? (
        <div className="rx-actions">
          <CopyButton text={result.ok ? result.text : ''} />
          <button className="btn small" disabled={!result.text || !result.ok} onClick={() => setNaming(defaultName)}>
            {t('regex.save')}
          </button>
          <button className="btn small" onClick={onReset}>
            {t('regex.reset')}
          </button>
          {saved && <span className="rx-ok">{t('regex.saved')}</span>}
        </div>
      ) : (
        <div className="rx-actions">
          <input
            className="pc-input rx-name"
            value={naming}
            autoFocus
            maxLength={80}
            placeholder={t('regex.saveName')}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') setNaming(null)
            }}
          />
          <button className="btn small" onClick={() => void save()}>
            {t('regex.saveDo')}
          </button>
          <button className="btn small" onClick={() => setNaming(null)}>
            {t('regex.cancel')}
          </button>
        </div>
      )}
      {!result.ok && overflowText && <div className="rx-error">{overflowText}</div>}
      {sideText && <div className="rx-warn">{sideText}</div>}
    </div>
  )
}

/** Первая строка текста мода, обрезанная для списков. */
export function shortText(display: string, max = 48): string {
  const line = display.split('\n')[0]
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}
