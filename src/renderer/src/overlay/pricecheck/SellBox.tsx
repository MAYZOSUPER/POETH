import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { UiLang } from '@shared/types'
import { chaosIn, chaosRates } from '@shared/poe1/pricecheck/currency'
import { faustusConfidence } from '@shared/poe1/pricecheck/faustus'
import type { Poe1Price } from '@shared/poe1/pricecheck/results'
import { exchangeSell, saleNoteOf, sellAdvice, type NoteCheck, type SellAdvice } from '@shared/poe1/pricecheck/selling'
import { noVendor } from '@shared/poe1/pricecheck/verdict'
import { CoinIcon, CurrencyTipBody, TipAnchor, useCurrencyNames } from '../../components/Currency'
import { Icon, type IconName } from '../Icon'
import { usePriceCheckStore, type PcResult } from './store'
import { Price, usePriceText, type PriceText } from './PriceText'
import { fmtNum } from './format'
import { usePcMode } from './sellMode'
import './sell.css'

// S50: режим «Продаю» окна цены — какую цену поставить своей вещи в мерчант-вкладку. Тот же результат поиска, что и
// у «Покупаю» (новых запросов нет): рекомендация «поставьте ~P, не дешевле N» с кнопкой «Скопировать число»,
// лестница мгновенных лотов, комиссия в золоте, заметка `~price` против рынка. Валюта — по обмену у Фаустуса.
// Числа и правила — @shared/poe1/pricecheck/selling (чистый TS, тесты); здесь только вывод RU/EN, простой/эксперт.

type T = (key: string, params?: Record<string, string | number>) => string
type Tone = 'good' | 'info' | 'muted'

/** Переключатель «Покупаю / Продаю» под шапкой предмета; выбор запоминается (sellMode). */
export function ModeSwitch({ t }: { t: T }) {
  const mode = usePcMode((s) => s.mode)
  const setMode = usePcMode((s) => s.setMode)
  return (
    <div className="pc-mode">
      <div className="ui-seg" role="group" aria-label={t('pc1.s50.mode')}>
        <button type="button" aria-pressed={mode === 'buy'} onClick={() => setMode('buy')}>
          {t('pc1.s50.mode.buy')}
        </button>
        <button type="button" aria-pressed={mode === 'sell'} onClick={() => setMode('sell')}>
          {t('pc1.s50.mode.sell')}
        </button>
      </div>
      <span className="ui-q" title={t('pc1.s50.mode.help')}>
        ?
      </span>
    </div>
  )
}

type CopyState = 'idle' | 'busy' | 'done' | 'fail'

/** «Скопировать 22»: в буфер только число — в игру ничего не уходит (игрок сам вставит его в поле цены). */
function CopyButton({ value, help, simple, t }: { value: string; help: string; simple: boolean; t: T }) {
  const [state, setState] = useState<CopyState>('idle')
  useEffect(() => setState('idle'), [value])
  useEffect(() => {
    if (state !== 'done' && state !== 'fail') return
    const id = setTimeout(() => setState('idle'), 2500)
    return () => clearTimeout(id)
  }, [state])
  const copy = async (): Promise<void> => {
    setState('busy')
    const ok = await window.overlayApi.trade.copyText(value).catch(() => false)
    setState(ok ? 'done' : 'fail')
  }
  const label = state === 'done' ? t('pc1.s50.copy.done') : state === 'fail' ? t('pc1.s50.copy.fail') : t('pc1.s50.copy', { n: value })
  return (
    <button
      type="button"
      className={`ui-btn ui-btn--sm${simple ? ' ui-btn--primary' : ''}`}
      title={help}
      aria-label={simple ? undefined : label}
      disabled={state === 'busy'}
      onClick={() => void copy()}
    >
      <Icon name={state === 'done' ? 'check' : 'copy'} />
      {simple ? label : state === 'idle' || state === 'busy' ? value : label}
    </button>
  )
}

/** Плашка рекомендации — как вердикт S15: заголовок, пояснение (эксперт — в «?»), кнопка числа. */
function SellPlate({
  kind,
  tone,
  icon,
  title,
  sub,
  help,
  copy,
  simple
}: {
  kind: string
  tone: Tone
  icon: IconName
  title: string
  sub?: string
  help?: string
  copy?: ReactNode
  simple: boolean
}) {
  const tip = simple ? help : [sub, help].filter(Boolean).join(' ')
  return (
    <div className={`pc-verdict pc-verdict--${tone} pc-sell`} role="status" data-kind={kind}>
      <Icon name={icon} />
      <span className="pc-verdict__text">
        <b className="pc-verdict__title">{title}</b>
        {simple && sub && <span className="pc-verdict__sub">{sub}</span>}
        {simple && copy && <span className="pc-verdict__note">{copy}</span>}
      </span>
      <span className="pc-verdict__acts">
        {tip && (
          <span className="ui-q" title={tip}>
            ?
          </span>
        )}
        {!simple && copy}
      </span>
    </div>
  )
}

/** Заметка `~price` против рынка: дешевле — жёлтое предупреждение, иначе — строка-подсказка. */
function NoteLine({ check, floor, exchange, t }: { check: NoteCheck; floor: string; exchange?: boolean; t: T }) {
  const note = check.note.text
  if (check.status === 'under') {
    return (
      <div className="pc-warns" role="list">
        <div className="pc-warn" role="listitem">
          <Icon name="warn" />
          <span>{t('pc1.s50.note.under', { percent: check.percent ?? 0, note, floor })}</span>
          <span className="ui-q" title={t('pc1.s50.note.help')}>
            ?
          </span>
        </div>
      </div>
    )
  }
  const text =
    check.status === 'over'
      ? t('pc1.s50.note.over', { note })
      : check.status === 'unknown'
        ? t('pc1.s50.note.unknown', { note })
        : exchange || check.place == null
          ? t('pc1.s50.note.fairExchange', { note })
          : t('pc1.s50.note.fair', { note, place: check.place })
  return (
    <div className="ui-hint pc-sell-note" data-status={check.status}>
      <Icon name={check.status === 'over' ? 'warn' : 'info'} />
      <span>{text}</span>
    </div>
  )
}

function LadderCell({ label, price, lang }: { label: string; price: Poe1Price; lang: UiLang }) {
  return (
    <span className="pc-ladder__cell">
      <span className="pc-ladder__label">{label}</span>
      <span className="pc-ladder__price">
        <Price price={price} lang={lang} />
      </span>
    </span>
  )
}

/** Лестница мгновенных лотов: самый дешёвый, 5-й, медиана; комиссия в золоте; точность поиска. */
function Ladder({ a, result, simple, lang, t }: { a: SellAdvice; result: Extract<PcResult, { kind: 'trade' }>; simple: boolean; lang: UiLang; t: T }) {
  const { ladder } = a
  const conf = result.honest.confidence
  const fee = a.fee?.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')
  return (
    <div className="ui-summary pc-summary">
      <div className="pc-market">
        <span className="pc-market__label">
          {t('pc1.s50.ladder')}
          <span className="ui-q" title={t('pc1.s50.ladder.help')}>
            ?
          </span>
        </span>
        {ladder.count > 0 && ladder.cheapest ? (
          <span className="pc-ladder">
            <LadderCell label={t('pc1.s50.ladder.cheapest')} price={ladder.cheapest} lang={lang} />
            {ladder.fifth && <LadderCell label={t('pc1.s50.ladder.fifth')} price={ladder.fifth} lang={lang} />}
            {ladder.median && ladder.count >= 3 && <LadderCell label={t('pc1.s50.ladder.median')} price={ladder.median} lang={lang} />}
          </span>
        ) : (
          <span className="pc-group__none">{t('pc1.s50.ladder.none')}</span>
        )}
        {ladder.count > 0 && <span className="pc-market__note">{t('pc1.s50.ladder.count', { n: ladder.count })}</span>}
        {fee && (
          <TipAnchor className="pc-market__note pc-sell-fee ui-cur" tip={<CurrencyTipBody tag="gold" lang={lang} />}>
            <CoinIcon tag="gold" lang={lang} />
            {t(simple ? 'pc1.s50.fee' : 'pc1.s50.fee.short', { n: fee })}
          </TipAnchor>
        )}
      </div>
      <span className="ui-summary__conf">
        <span className="ui-pips">
          {[1, 2, 3, 4].map((i) => (
            <i key={i} className={i <= conf ? 'on' : undefined} />
          ))}
        </span>
        {t(`pc1.conf.${conf}`)} · {t('pc1.conf.similar', { n: result.total })}
        {result.cached && <span className="ui-tag">{t('pc1.cached')}</span>}
      </span>
    </div>
  )
}

/** Заголовок, пояснение и тон плашки по виду рекомендации. */
function tradePlate(a: SellAdvice, priceText: PriceText, one: string, lang: UiLang, t: T): { title: string; sub?: string; tone: Tone; icon: IconName } {
  if (a.kind === 'none' || !a.price || !a.floor) {
    return { title: t('pc1.v.few'), sub: t('pc1.v.few.noPrice', { n: a.lots }), tone: 'info', icon: 'help' }
  }
  const price = priceText(a.price, 'acc')
  const floor = fmtNum(a.floor.amount, lang)
  const same = a.price.amount === a.floor.amount
  const listAt = same ? t('pc1.s50.title.same', { price }) : t('pc1.s50.title', { price, floor })
  const caution = (s: string): string => (a.caution ? t('pc1.v.caution') : s)
  switch (a.kind) {
    case 'junk':
      return { title: t('pc1.v.junk'), sub: t('pc1.v.junk.sub', { price: priceText(a.price), one }), tone: 'muted', icon: 'trash' }
    case 'cheap':
      return { title: t('pc1.v.cheap'), sub: t('pc1.v.cheap.sub', { price: priceText(a.price) }), tone: 'muted', icon: 'coins' }
    case 'whisper':
      return {
        title: same ? t('pc1.s50.title.whisperSame', { price }) : t('pc1.s50.title.whisper', { price, floor }),
        sub: caution(t('pc1.s50.why.whisper')),
        tone: 'info',
        icon: 'help'
      }
    case 'few':
      return {
        title: listAt,
        sub: caution(t('pc1.s50.why.few', { n: a.ladder.count, floor: priceText(a.floor, 'acc') })),
        tone: 'info',
        icon: 'coins'
      }
    default:
      return {
        title: listAt,
        sub: caution(
          same || a.place === 1
            ? t('pc1.s50.why.first')
            : t('pc1.s50.why.ok', { floor: priceText(a.floor, 'acc'), price, place: a.place ?? 1 })
        ),
        tone: a.caution ? 'info' : 'good',
        icon: 'coins'
      }
  }
}

/** «Продаю» для поиска по лотам сайта: рекомендация, лестница мгновенных, заметка, подсказки. */
export function SellTrade({ result, simple, lang, t }: { result: Extract<PcResult, { kind: 'trade' }>; simple: boolean; lang: UiLang; t: T }) {
  const item = usePriceCheckStore((s) => s.item)
  const rate = usePriceCheckStore((s) => s.rate?.chaosPerDivine)
  const rates = usePriceCheckStore((s) => s.rates)
  const status = usePriceCheckStore((s) => s.status)
  const phase = usePriceCheckStore((s) => s.phase)
  const setStatus = usePriceCheckStore((s) => s.setStatus)
  const priceText = usePriceText(lang)
  const names = useCurrencyNames(lang)
  const note = useMemo(() => (item ? saleNoteOf(item.rawText) : undefined), [item])
  const a = useMemo(
    () =>
      sellAdvice({
        listings: result.listings,
        honest: result.honest,
        total: result.total,
        chaosPerDivine: rate,
        rates: chaosRates(rate, rates),
        noVendor: item ? noVendor(item) : false,
        instantOnly: status === 'securable',
        caution: result.verdict.caution,
        note
      }),
    [result, rate, rates, item, status, note]
  )
  const one = simple ? `1 ${names.after('chaos', 1, 'gen')}` : '1 c'
  const plate = tradePlate(a, priceText, one, lang, t)
  const copyable = a.copy && a.price && !a.caution && (a.kind === 'ok' || a.kind === 'few' || a.kind === 'whisper')
  return (
    <>
      <SellPlate
        kind={a.kind}
        {...plate}
        help={t('pc1.s50.help')}
        simple={simple}
        copy={
          copyable && (
            <CopyButton value={a.copy!} help={t('pc1.s50.copy.help', { n: a.copy!, cur: names.name(a.price!.currency) })} simple={simple} t={t} />
          )
        }
      />
      {a.note && a.floor && <NoteLine check={a.note} floor={priceText(a.floor, 'gen')} t={t} />}
      <Ladder a={a} result={result} simple={simple} lang={lang} t={t} />
      {a.spread && (a.kind === 'ok' || a.kind === 'few') && (
        <div className="ui-hint">
          <Icon name="info" />
          <span>{t('pc1.s50.why.spread')}</span>
        </div>
      )}
      {a.moreInstant && (
        <div className="pc-higher" role="note">
          <Icon name="search" />
          <span className="pc-higher__text">{t('pc1.s50.more')}</span>
          <span className="pc-higher__acts">
            <button type="button" className="ui-btn ui-btn--sm" disabled={phase === 'loading'} onClick={() => setStatus('securable')}>
              <Icon name="search" />
              {t('pc1.status.securable')}
            </button>
          </span>
        </div>
      )}
    </>
  )
}

/**
 * «Продаю» для валюты и всего, что меняют у Фаустуса: цена обмена за час, «не дешевле» — нижняя сделка часа.
 * Стопка игрока и рынки «за chaos / за divine» — в блоке «Цена у Фаустуса» ниже (S24), здесь не повторяем.
 */
export function SellExchange({ result, simple, lang, t }: { result: Extract<PcResult, { kind: 'faustus' }>; simple: boolean; lang: UiLang; t: T }) {
  const item = usePriceCheckStore((s) => s.item)
  const priceText = usePriceText(lang)
  const names = useCurrencyNames(lang)
  const f = result.faustus
  const note = useMemo(() => (item ? saleNoteOf(item.rawText) : undefined), [item])
  const s = useMemo(() => exchangeSell(f, faustusConfidence(f), note), [f, note])
  const one = (c: 'nom' | 'gen'): string => `1 ${names.after(s.base, 1, c)}`
  const title = s.copy
    ? t('pc1.s50.fs.title', { price: priceText(s.price, 'acc'), floor: fmtNum(s.floor.amount, lang) })
    : t('pc1.s50.fs.titlePer', { one: one('nom'), n: s.perBase ?? 1 })
  const sub =
    s.kind === 'few' ? t('pc1.s50.fs.few') : s.copy ? t('pc1.s50.fs.why', { floor: priceText(s.floor) }) : t('pc1.s50.fs.whyPer', { one: one('gen') })
  return (
    <>
      <SellPlate
        kind={`exchange-${s.kind}`}
        tone={s.kind === 'few' ? 'info' : 'good'}
        icon="coins"
        title={title}
        sub={sub}
        help={t('pc1.s24.v.sell.help')}
        simple={simple}
        copy={s.copy && <CopyButton value={s.copy} help={t('pc1.s50.copy.helpExchange', { n: s.copy })} simple={simple} t={t} />}
      />
      {s.note && <NoteLine check={s.note} floor={priceText(s.floor, 'gen')} exchange t={t} />}
    </>
  )
}

/** «Продаю» для обмена без цены Фаустуса: честно — смотрите «Рыночный курс»; лучшее предложение сайта — ориентир. */
export function SellBulk({ result, simple, lang, t }: { result: Extract<PcResult, { kind: 'bulk' }>; simple: boolean; lang: UiLang; t: T }) {
  const priceText = usePriceText(lang)
  const best = result.offers[0]
  const each: Poe1Price | undefined =
    best && best.itemAmount > 0
      ? best.currency === 'chaos'
        ? chaosIn(best.exchangeAmount / best.itemAmount, 'chaos', undefined)
        : { amount: best.exchangeAmount / best.itemAmount, currency: best.currency }
      : undefined
  return (
    <SellPlate
      kind="bulk"
      tone="info"
      icon="info"
      title={t('pc1.s50.bulk.title')}
      sub={each ? t('pc1.s50.bulk.sub', { price: priceText(each) }) : t('pc1.s50.bulk.none')}
      help={t('pc1.s24.v.sell.help')}
      simple={simple}
    />
  )
}
