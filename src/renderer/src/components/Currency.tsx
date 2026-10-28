import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { UiLang } from '@shared/types'
import {
  amountName,
  currencyName,
  currencyShort,
  parseCurrencyTable,
  ruGender,
  type CurrencyTable,
  type RuCase
} from '@shared/currency'
import { translate } from '../i18n'

// Понятная валюта (S18) — одна на окно цены, «Обмен», «Богатство», «Сделки», live и «Что фармить».
//  - <CoinIcon tag> — настоящая иконка игры (poeth://icon → кэш main, только web.poecdn.com); нет сети или
//    иконки — прежний кружок .ui-coin;
//  - <Currency tag text full> — иконка + число + название: в простом режиме полное, с падежом
//    («149 Сфер хаоса», «1,2 Божественной сферы»), в экспертном — коротко («149 c», «1,2 div»);
//  - при наведении (и фокусе) — подсказка новичку: что это за валюта, сленг, имя в английском клиенте.
// Названия — из items.ndjson языка (данные APT, тот же язык, что у имён предметов во вкладках), не хардкодом.
// Страница-независимо: язык приходит пропсом, строки — через translate (компаньон и оверлей).

const tables: Partial<Record<UiLang, CurrencyTable>> = {}
const pending: Partial<Record<UiLang, Promise<CurrencyTable | null>>> = {}

function loadTable(lang: UiLang): Promise<CurrencyTable | null> {
  pending[lang] ??= fetch(`poeth://data/poe1/${lang}/items.ndjson`)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((text) => (tables[lang] = parseCurrencyTable(text.replace(/\r\n/g, '\n'))))
    .catch(() => {
      delete pending[lang] // следующая подсказка попробует ещё раз
      return null
    })
  return pending[lang]
}

/** Таблица валют языка (имя, английское имя, иконка по tradeTag); null — пока грузится или нет данных. */
export function useCurrencyTable(lang: UiLang): CurrencyTable | null {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (tables[lang]) return
    let alive = true
    void loadTable(lang).then(() => alive && setTick((n) => n + 1))
    return () => {
      alive = false
    }
  }, [lang])
  return tables[lang] ?? null
}

/** Имена валют на языке: полное («Сфера хаоса»), после числа («149 Сфер хаоса» → «Сфер хаоса»). */
export function useCurrencyNames(lang: UiLang) {
  const table = useCurrencyTable(lang)
  const name = (tag: string): string => currencyName(table, tag, lang) ?? currencyShort(tag)
  return {
    table,
    name,
    /** название после числа value (число или его запись на языке интерфейса) */
    after: (tag: string, value: number | string, c: RuCase = 'nom'): string => amountName(name(tag), value, lang, tag, c)
  }
}

const COIN_MOD: Record<string, string> = { divine: 'div', chaos: 'chaos', exalted: 'ex', gold: 'gold' }
const broken = new Set<string>()

export function iconSrc(url: string): string {
  return `poeth://icon/?u=${encodeURIComponent(url)}`
}

/** Иконка валюты по tradeTag; без иконки/сети — градиентный кружок ui-coin (как до S18). */
export function CoinIcon({ tag, lang }: { tag: string; lang: UiLang }) {
  const icon = useCurrencyTable(lang)?.get(tag)?.icon
  const [failed, setFailed] = useState<string | null>(null)
  if (!icon || failed === icon || broken.has(icon)) {
    const mod = COIN_MOD[tag]
    return <i className={mod ? `ui-coin ui-coin--${mod}` : 'ui-coin'} aria-hidden="true" />
  }
  return (
    <img
      className="ui-coin ui-coin--img"
      src={iconSrc(icon)}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => {
        broken.add(icon)
        setFailed(icon)
      }}
    />
  )
}

// ---------------------------------------------------------------- подсказка

/** Всплывающая подсказка поверх всего (portal + position: fixed): не обрезается прокруткой таблиц и окна цены. */
function FloatTip({ anchor, id, children }: { anchor: HTMLElement; id: string; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ left: 0, top: 0, visibility: 'hidden' })
  const [up, setUp] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const a = anchor.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.max(8, Math.min(a.left - 6, window.innerWidth - w - 8))
    const above = a.bottom + 8 + h > window.innerHeight - 8 && a.top - 8 - h >= 8
    setUp(above)
    setStyle({
      left,
      top: above ? a.top - 8 - h : a.bottom + 8,
      ['--tip-x' as string]: `${Math.max(10, Math.min(w - 18, a.left + Math.min(a.width / 2, 14) - left - 4))}px`
    })
  }, [anchor])
  return createPortal(
    <span ref={ref} id={id} role="tooltip" className={`ui-tip ui-cur-tip${up ? ' ui-cur-tip--up' : ''}`} style={style}>
      {children}
    </span>,
    document.body
  )
}

/**
 * Обёртка с подсказкой при наведении и фокусе. focusable — для главных цифр (курс, итог), чтобы подсказку можно
 * было открыть с клавиатуры; в строках таблиц — только мышью (не плодим остановки Tab).
 */
export function TipAnchor({
  tip,
  focusable = false,
  className,
  children
}: {
  tip: ReactNode
  focusable?: boolean
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span
      ref={ref}
      className={className}
      data-tip=""
      tabIndex={focusable ? 0 : undefined}
      aria-describedby={open ? id : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      {children}
      {open && ref.current && (
        <FloatTip anchor={ref.current} id={id}>
          {tip}
        </FloatTip>
      )}
    </span>
  )
}

const KNOWN = new Set(['chaos', 'divine', 'exalted', 'mirror', 'gold'])
const SLANG = new Set(['chaos', 'divine', 'exalted', 'mirror'])

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

function quote(s: string, lang: UiLang): string {
  return lang === 'ru' ? `«${s}»` : `"${s}"`
}

/** Сленг валюты: «дивайн», «div» … (для прочих — тег трейда). */
export function slangOf(tag: string, lang: UiLang): string {
  return SLANG.has(tag) ? translate(lang, `cur.slang.${tag}`) : quote(currencyShort(tag), lang)
}

/** Текст подсказки о валюте: название, что это, сленг, имя в английском клиенте и необязательная строка extra. */
export function CurrencyTipBody({ tag, lang, extra }: { tag: string; lang: UiLang; extra?: ReactNode }) {
  const table = useCurrencyTable(lang)
  const entry = table?.get(tag)
  const t = (key: string, params?: Record<string, string | number>): string => translate(lang, key, params)
  return (
    <>
      <span className="ui-cur-tip__head">
        <CoinIcon tag={tag} lang={lang} />
        <b>{cap(currencyName(table, tag, lang) ?? currencyShort(tag))}</b>
      </span>
      <span>{t(KNOWN.has(tag) ? `cur.tip.${tag}` : 'cur.tip.other')}</span>
      {extra}
      {tag !== 'gold' && <span className="ui-cur-tip__faint">{t('cur.slang', { words: slangOf(tag, lang) })}</span>}
      {lang === 'ru' && entry && entry.refName !== entry.name && (
        <span className="ui-cur-tip__faint">{t('cur.client', { name: entry.refName })}</span>
      )}
    </>
  )
}

// ---------------------------------------------------------------- валюта с числом

export interface CurrencyProps {
  /** tradeTag: 'divine', 'chaos', 'exalted', 'gold', … */
  tag: string
  lang: UiLang
  /** число так, как его показывает панель («149,2», «≈ 1 230»); падеж считается по этой записи */
  text?: string
  /** простой режим: полное название с падежом; иначе div / c (у золота — только иконка) */
  full?: boolean
  /** «на 1 Сферу хаоса» */
  case?: RuCase
  /** доп. строка в подсказке (например, перевод в другую валюту) */
  extra?: ReactNode
  /** без подсказки (внутри другой подсказки) */
  noTip?: boolean
  focusable?: boolean
  className?: string
}

/** Иконка + число + название валюты с подсказкой новичку. */
export function Currency({ tag, lang, text = '', full = false, case: c = 'nom', extra, noTip, focusable, className }: CurrencyProps) {
  const names = useCurrencyNames(lang)
  const unit = full ? names.after(tag, text || 1, c) : tag === 'gold' ? '' : currencyShort(tag)
  const cls = `ui-cur${className ? ` ${className}` : ''}`
  const body = (
    <>
      <span className="ui-cur__n">
        <CoinIcon tag={tag} lang={lang} />
        {text}
      </span>
      {unit && <span className="ui-cur__unit">{`${text ? ' ' : ''}${unit}`}</span>}
    </>
  )
  if (noTip) return <span className={cls}>{body}</span>
  return (
    <TipAnchor className={cls} focusable={focusable} tip={<CurrencyTipBody tag={tag} lang={lang} extra={extra} />}>
      {body}
    </TipAnchor>
  )
}

// ---------------------------------------------------------------- курс divine : chaos

/** Подсказка к курсу: «Сейчас 1 Божественная сфера = 149 Сфер хаоса», что такое курс, пример, сленг. */
export function RateTipBody({ rate, text, lang, extra }: { rate: number; text: string; lang: UiLang; extra?: ReactNode }) {
  const names = useCurrencyNames(lang)
  const t = (key: string, params?: Record<string, string | number>): string => translate(lang, key, params)
  const half = (rate / 2).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 0 })
  return (
    <>
      <span className="ui-cur-tip__head">
        <CoinIcon tag="divine" lang={lang} />
        <b>{t('cur.rate.now', { divine: names.after('divine', 1), n: text, chaos: names.after('chaos', text) })}</b>
      </span>
      <span>{t('cur.rate.what', { chaos: names.after('chaos', 5), divine: names.after('divine', 1, 'acc') })}</span>
      <span>{t('cur.rate.why', { div: lang === 'ru' ? '0,5' : '0.5', chaos: half })}</span>
      {extra}
      <span className="ui-cur-tip__faint">
        {t('cur.slang', { words: `${slangOf('divine', lang)}; ${slangOf('chaos', lang)}` })}
      </span>
    </>
  )
}

/**
 * Изменение курса словами: «Божественная сфера подорожала на 3 Сферы хаоса за сутки» (RU — род по названию,
 * число — в винительном). text — модуль изменения в записи панели; flat — «почти не изменился».
 */
export function useRateDeltaText(lang: UiLang): (delta: number, text: string, period: string) => string {
  const names = useCurrencyNames(lang)
  return (delta, text, period) => {
    if (Number(text.replace(/[^\d.,]/g, '').replace(',', '.')) === 0) return translate(lang, 'cur.delta.flat', { period })
    const div = names.name('divine')
    const g = lang === 'ru' ? ruGender(div) : 'f'
    return translate(lang, `cur.delta.${delta > 0 ? 'up' : 'down'}.${g}`, {
      name: div,
      amount: `${text} ${names.after('chaos', text, 'acc')}`,
      period
    })
  }
}
