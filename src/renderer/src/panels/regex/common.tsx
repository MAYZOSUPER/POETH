import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { RegexBuildResult, RegexLang } from '@shared/types'
import { REGEX_LIMIT } from '@shared/regex'
import { useLang, useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useRegexStore } from '../../store/useRegexStore'
import { useGameLang as useClientLang } from '../../gameLang'
import { Ico } from './Ico'

// Общие куски вкладки Regex по макету «Золото компаса»: язык клиента игры, режим простой/экспертный,
// сегменты, переключатель, блок-карточка, счётчик 250 и блок готовой строки.

/** Язык клиента игры для строки — общая настройка (S26): выбор, узнанный по игре или язык интерфейса. */
export function useGameLang(): RegexLang {
  return useClientLang(useLang())
}

/** Простой режим (по умолчанию): подсказки новичку, меньше настроек. */
export function useSimple(): boolean {
  return useAppStore((s) => s.settings?.ui.simpleMode ?? true)
}

/** Взаимоисключающий выбор: .ui-seg с aria-pressed. */
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
    <div className="ui-seg rx-seg" role="group" aria-label={label}>
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

/** Переключатель .ui-switch. */
export function Switch({
  on,
  onChange,
  children,
  title
}: {
  on: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  title?: string
}) {
  return (
    <button type="button" className="ui-switch" role="switch" aria-checked={on} title={title} onClick={() => onChange(!on)}>
      <span className="ui-switch__track" />
      {children}
    </button>
  )
}

/** Карточка с подписью раздела (как «box» в макете). */
export function Box({ title, tip, children }: { title: string; tip?: string; children: ReactNode }) {
  return (
    <section className="rx-box">
      <div className="rx-box__h">
        <span className="ui-label">{title}</span>
        <span className="ui-label__grow" />
        {tip && (
          <span className="ui-q" title={tip}>
            ?
          </span>
        )}
      </div>
      <div className="rx-box__b">{children}</div>
    </section>
  )
}

/** Подсказка новичку (только в простом режиме). */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <div className="ui-hint rx-hint">
      <Ico name="help" />
      <span>{children}</span>
    </div>
  )
}

export function CopyButton({ text, small, primary }: { text: string; small?: boolean; primary?: boolean }) {
  const t = useT()
  const copy = useRegexStore((s) => s.copy)
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])
  const cls = `ui-btn${small ? ' ui-btn--sm' : ''}${primary ? ' ui-btn--primary' : ''}`
  return (
    <button
      type="button"
      className={cls}
      disabled={!text}
      onClick={() => {
        void copy(text).then(() => {
          setDone(true)
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      <Ico name={done ? 'check' : 'copy'} />
      {done ? t('regex.copied') : t('regex.copy')}
    </button>
  )
}

/** Счётчик длины: зелёный до 200, жёлтый до 250, красный — длиннее лимита. */
export function Meter({ length }: { length: number }) {
  const t = useT()
  const level = length > REGEX_LIMIT ? 'over' : length > 200 ? 'warn' : 'ok'
  const style = { '--v': `${Math.min(100, (length / REGEX_LIMIT) * 100)}%` } as CSSProperties
  return (
    <div className="ui-meter" data-level={level} style={style}>
      <div className="ui-meter__row">
        <span>{t('regex.meter')}</span>
        <span>
          <b>{length}</b> / {REGEX_LIMIT}
        </span>
      </div>
      <div className="ui-meter__bar" />
    </div>
  )
}

/**
 * Готовая строка: текст (моноширинный), счётчик 250, «Копировать», «В библиотеку» (с названием),
 * «Сбросить»; ошибка переполнения с подсказкой, что убрать; предупреждение о побочных совпадениях.
 */
export function ResultBox({
  result,
  defaultName,
  onReset,
  overflowText,
  sideText,
  hint
}: {
  result: RegexBuildResult
  defaultName: string
  onReset: () => void
  overflowText?: string
  sideText?: string
  hint?: string
}) {
  const t = useT()
  const simple = useSimple()
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
    <Box title={t('regex.result.title')}>
      <div className={`rx-string${result.text ? '' : ' is-empty'}`}>{result.text || t('regex.result.empty')}</div>
      <Meter length={result.length} />
      {!result.ok && <div className="ui-field__error">{overflowText ?? t('regex.overflow.short')}</div>}
      {naming === null ? (
        <div className="rx-btns">
          <CopyButton text={result.ok ? result.text : ''} primary />
          <button
            type="button"
            className="ui-btn"
            disabled={!result.text || !result.ok}
            onClick={() => setNaming(defaultName)}
          >
            <Ico name="book" />
            {t('regex.save')}
          </button>
          <button type="button" className="ui-btn ui-btn--ghost" disabled={!result.text} onClick={onReset}>
            {t('regex.reset')}
          </button>
          {saved && (
            <span className="rx-ok">
              <Ico name="check" size="sm" />
              {t('regex.saved')}
            </span>
          )}
        </div>
      ) : (
        <div className="rx-btns">
          <input
            className="ui-input rx-grow"
            value={naming}
            autoFocus
            maxLength={80}
            aria-label={t('regex.saveName')}
            placeholder={t('regex.saveName')}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') setNaming(null)
            }}
          />
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => void save()}>
            {t('regex.saveDo')}
          </button>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setNaming(null)}>
            {t('regex.cancel')}
          </button>
        </div>
      )}
      {sideText && (
        <div className="ui-banner rx-banner">
          <Ico name="warn" />
          <span>{sideText}</span>
          <span />
        </div>
      )}
      {simple && hint && <Hint>{hint}</Hint>}
    </Box>
  )
}

/** Первая строка текста мода, обрезанная для списков. */
export function shortText(display: string, max = 48): string {
  const line = display.split('\n')[0]
  return line.length > max ? line.slice(0, max - 1) + '…' : line
}

/** Поле «не меньше N» (порог, качество, уровень): подпись слева, число справа. */
export function NumberRow({
  id,
  label,
  value,
  max,
  onChange
}: {
  id: string
  label: string
  value: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <div className="rx-num">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="ui-input ui-input--num"
        type="number"
        min={0}
        max={max}
        value={value || ''}
        placeholder="—"
        onChange={(e) => {
          const n = Math.round(Number(e.target.value))
          onChange(Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0)
        }}
      />
    </div>
  )
}
