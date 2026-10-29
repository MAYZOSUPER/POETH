import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { GameLang, UiLang } from '@shared/types'
import { currencyNames, currencyShort, parseCurrencyTable, ruGender, type CurrencyTable, type RuCase } from '@shared/currency'
import { translate } from '../i18n'
import { useGameLang } from '../gameLang'

// Понятная валюта (S18) — одна на окно цены, «Обмен», «Богатство», «Сделки», live и «Что фармить».
//  - <CoinIcon tag> — настоящая иконка игры (poeth://icon → кэш main, только web.poecdn.com); нет сети или
//    иконки — прежний кружок .ui-coin;
//  - <Currency tag text full> — иконка + число + название: в простом режиме полное, с падежом
//    («149 Сфер хаоса», «1,2 Божественной сферы»), в экспертном — коротко («149 c», «1,2 div»);
//  - при наведении (и фокусе) — подсказка новичку: что это за валюта, сленг, имя в клиенте на другом языке.
// Названия — из items.ndjson (данные APT), не хардкодом, на языке клиента игры (S26, gameLang.ts), как в игре;
// пояснения и падежи — на языке интерфейса, он приходит пропсом lang. Строки — через translate (компаньон и оверлей).

const tables: Partial<Record<GameLang, CurrencyTable>> = {}
const pending: Partial<Record<GameLang, Promise<CurrencyTable | null>>> = {}

function loadTable(lang: GameLang): Promise<CurrencyTable | null> {
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
export function useCurrencyTable(lang: GameLang): CurrencyTable | null {
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

/**
 * Имена валют для текста на языке интерфейса lang: полное — на языке клиента игры («Сфера хаоса» / «Chaos Orb»),
 * after — после числа value (число или его запись на языке интерфейса): «149 Сфер хаоса», «340 Chaos Orb».
 */
export function useCurrencyNames(lang: UiLang) {
  const gameLang = useGameLang(lang)
  const table = useCurrencyTable(gameLang)
  return { table, gameLang, ...currencyNames(table, gameLang, lang) }
}

const COIN_MOD: Record<string, string> = { divine: 'div', chaos: 'chaos', exalted: 'ex', gold: 'gold' }
/** Иконки, которые не загрузились (нет сети): кружок, повтор не раньше чем через 10 минут (оверлей живёт всю сессию). */
const brokenAt = new Map<string, number>()
const RETRY_MS = 10 * 60_000
const isBroken = (url: string): boolean => Date.now() - (brokenAt.get(url) ?? -Infinity) < RETRY_MS

export function iconSrc(url: string): string {
  return `poeth://icon/?u=${encodeURIComponent(url)}`
}

/** Иконка валюты по tradeTag; без иконки/сети — градиентный кружок ui-coin (как до S18). */
export function CoinIcon({ tag, lang }: { tag: string; lang: UiLang }) {
  const icon = useCurrencyTable(useGameLang(lang))?.get(tag)?.icon
  const [, setFailed] = useState(0)
  if (!icon || isBroken(icon)) {
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
        brokenAt.set(icon, Date.now())
        setFailed((n) => n + 1)
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

/**
 * Имя валюты в клиенте на другом языке: RU-клиент → английское (гайды, сайты), EN-клиент при русском интерфейсе →
 * русское (понять, что это). Английскому интерфейсу с английским клиентом — ничего.
 */
function useOtherClientName(tag: string, gameLang: GameLang, lang: UiLang): { key: string; name: string } | null {
  const ruTable = useCurrencyTable('ru')
  const entry = useCurrencyTable(gameLang)?.get(tag)
  if (!entry) return null
  if (gameLang === 'ru') return entry.refName !== entry.name ? { key: 'cur.client', name: entry.refName } : null
  if (lang !== 'ru') return null
  const ru = ruTable?.get(tag)?.name
  return ru && ru !== entry.name ? { key: 'cur.client.ru', name: ru } : null
}

/** Текст подсказки о валюте: название, что это, сленг, имя в клиенте на другом языке и необязательная строка extra. */
export function CurrencyTipBody({ tag, lang, extra }: { tag: string; lang: UiLang; extra?: ReactNode }) {
  const names = useCurrencyNames(lang)
  const other = useOtherClientName(tag, names.gameLang, lang)
  const t = (key: string, params?: Record<string, string | number>): string => translate(lang, key, params)
  return (
    <>
      <span className="ui-cur-tip__head">
        <CoinIcon tag={tag} lang={lang} />
        <b>{cap(names.name(tag))}</b>
      </span>
      <span>{t(KNOWN.has(tag) ? `cur.tip.${tag}` : 'cur.tip.other')}</span>
      {extra}
      {tag !== 'gold' && <span className="ui-cur-tip__faint">{t('cur.slang', { words: slangOf(tag, lang) })}</span>}
      {other && <span className="ui-cur-tip__faint">{t(other.key, { name: other.name })}</span>}
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
 * число — в винительном; английское имя в русском тексте — мужского рода: «Divine Orb подорожал на 3 Chaos Orb»).
 * text — модуль изменения в записи панели; flat — «почти не изменился».
 */
export function useRateDeltaText(lang: UiLang): (delta: number, text: string, period: string) => string {
  const names = useCurrencyNames(lang)
  return (delta, text, period) => {
    if (Number(text.replace(/[^\d.,]/g, '').replace(',', '.')) === 0) return translate(lang, 'cur.delta.flat', { period })
    const div = names.name('divine')
    const g = lang !== 'ru' ? 'f' : names.gameLang === 'ru' ? ruGender(div) : 'm'
    return translate(lang, `cur.delta.${delta > 0 ? 'up' : 'down'}.${g}`, {
      name: div,
      amount: `${text} ${names.after('chaos', text, 'acc')}`,
      period
    })
  }
}
