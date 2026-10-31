import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { UiLang } from '@shared/types'
import { ItemCategory } from '@shared/poe2/parser'
import type { Poe1Price } from '@shared/poe1/pricecheck/results'
import { angeConfidence } from '@shared/poe2/pricecheck/ange'
import { exaltedIn } from '@shared/poe2/pricecheck/currency'
import { angeSell, poe2SaleNote, sellAdvice2, type NoteCheck, type SellAdvice } from '@shared/poe2/pricecheck/selling'
import { CoinIcon, CurrencyTipBody, TipAnchor, useCurrencyNames } from '../../../components/Currency'
import { Icon, type IconName } from '../../Icon'
import { fmtNum } from '../format'
import { ratesOf, usePoe2PriceCheckStore as useStore, type Pc2Result } from './store'
import { Price, usePriceText, type PriceText } from './PriceText'

// S61: режим «Продаю» окна цены PoE 2 — то же, что S50 у PoE 1 (../SellBox.tsx), на той же выдаче (новых запросов
// нет): «поставьте ~P, не дешевле N» с кнопкой «Скопировать число», лестница мгновенных лотов, комиссия в золоте,
// заметка `~price` против рынка. База — exalted, дорогое — divine (курс у Ange); валюта — по цене у Ange.
// Числа и правила — @shared/poe2/pricecheck/selling (чистый TS, тесты); здесь только вывод RU/EN, простой/эксперт.
// Переключатель «Покупаю / Продаю» и выбор режима — общие с PoE 1 (ModeSwitch, sellMode), классы — sell.css S50.

type T = (key: string, params?: Record<string, string | number>) => string
type Tone = 'good' | 'info' | 'muted'
type CopyState = 'idle' | 'busy' | 'done' | 'fail'

/** «Скопировать 22»: в буфер только число — в игру ничего не уходит. */
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

/** Плашка рекомендации — как вердикт: заголовок, пояснение (эксперт — в «?»), кнопка числа. */
function SellPlate(p: { kind: string; tone: Tone; icon: IconName; title: string; sub?: string; help?: string; copy?: ReactNode; simple: boolean }) {
  const tip = p.simple ? p.help : [p.sub, p.help].filter(Boolean).join(' ')
  return (
    <div className={`pc-verdict pc-verdict--${p.tone} pc-sell`} role="status" data-kind={p.kind}>
      <Icon name={p.icon} />
      <span className="pc-verdict__text">
        <b className="pc-verdict__title">{p.title}</b>
        {p.simple && p.sub && <span className="pc-verdict__sub">{p.sub}</span>}
        {p.simple && p.copy && <span className="pc-verdict__note">{p.copy}</span>}
      </span>
      <span className="pc-verdict__acts">
        {tip && (
          <span className="ui-q" title={tip}>
            ?
          </span>
        )}
        {!p.simple && p.copy}
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
function Ladder({ a, result, simple, lang, t }: { a: SellAdvice; result: Extract<Pc2Result, { kind: 'trade' }>; simple: boolean; lang: UiLang; t: T }) {
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

/** Заголовок, пояснение и тон плашки по виду рекомендации (тексты S50 — общие для обеих игр). */
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
      return { title: listAt, sub: caution(t('pc1.s50.why.few', { n: a.ladder.count, floor: priceText(a.floor, 'acc') })), tone: 'info', icon: 'coins' }
    default:
      return {
        title: listAt,
        sub: caution(same || a.place === 1 ? t('pc1.s50.why.first') : t('pc1.s50.why.ok', { floor: priceText(a.floor, 'acc'), price, place: a.place ?? 1 })),
        tone: a.caution ? 'info' : 'good',
        icon: 'coins'
      }
  }
}

/** «Продаю» для поиска по лотам сайта trade2: рекомендация, лестница мгновенных, заметка, подсказки. */
export function SellTrade2({ result, simple, lang, t }: { result: Extract<Pc2Result, { kind: 'trade' }>; simple: boolean; lang: UiLang; t: T }) {
  const item = useStore((s) => s.item)
  const rate = useStore((s) => s.rate)
  const more = useStore((s) => s.more)
  const listingType = useStore((s) => s.listingType)
  const phase = useStore((s) => s.phase)
  const setListingType = useStore((s) => s.setListingType)
  const priceText = usePriceText(lang)
  const names = useCurrencyNames(lang)
  const note = useMemo(() => poe2SaleNote(item?.note), [item])
  const a = useMemo(
    () =>
      sellAdvice2({
        listings: result.listings,
        honest: result.honest,
        total: result.total,
        rates: ratesOf({ rate, more }),
        noVendor: item ? item.stackSize != null || item.category === ItemCategory.Currency : false,
        instantOnly: listingType === 'securable',
        caution: result.verdict.caution,
        note
      }),
    [result, rate, more, item, listingType, note]
  )
  const one = simple ? `1 ${names.after('exalted', 1, 'gen')}` : '1 ex'
  const plate = tradePlate(a, priceText, one, lang, t)
  const copyable = a.copy && a.price && !a.caution && (a.kind === 'ok' || a.kind === 'few' || a.kind === 'whisper')
  return (
    <>
      <SellPlate
        kind={a.kind}
        {...plate}
        help={t('pc1.s50.help')}
        simple={simple}
        copy={copyable && <CopyButton value={a.copy!} help={t('pc1.s50.copy.help', { n: a.copy!, cur: names.name(a.price!.currency) })} simple={simple} t={t} />}
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
            <button type="button" className="ui-btn ui-btn--sm" disabled={phase === 'loading'} onClick={() => setListingType('securable')}>
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
 * «Продаю» для валюты и всего, что меняют у Ange: цена обмена за час, «не дешевле» — нижняя сделка часа.
 * Стопка игрока и рынки — в блоке «Цена у Ange» ниже, здесь не повторяем.
 */
export function SellAnge({ result, simple, lang, t }: { result: Extract<Pc2Result, { kind: 'ange' }>; simple: boolean; lang: UiLang; t: T }) {
  const item = useStore((s) => s.item)
  const priceText = usePriceText(lang)
  const names = useCurrencyNames(lang)
  const a = result.ange
  const note = useMemo(() => poe2SaleNote(item?.note), [item])
  const s = useMemo(() => angeSell(a, angeConfidence(a), note), [a, note])
  const one = (c: 'nom' | 'gen'): string => `1 ${names.after(s.base, 1, c)}`
  const title = s.copy
    ? t('pc2.s61.sell.ange.title', { price: priceText(s.price, 'acc'), floor: fmtNum(s.floor.amount, lang) })
    : t('pc2.s61.sell.ange.titlePer', { one: one('nom'), n: s.perBase ?? 1 })
  const sub =
    s.kind === 'few' ? t('pc1.s50.fs.few') : s.copy ? t('pc2.s61.sell.ange.why', { floor: priceText(s.floor) }) : t('pc2.s61.sell.ange.whyPer', { one: one('gen') })
  return (
    <>
      <SellPlate
        kind={`exchange-${s.kind}`}
        tone={s.kind === 'few' ? 'info' : 'good'}
        icon="coins"
        title={title}
        sub={sub}
        help={t('pc2.s61.v.sell.help')}
        simple={simple}
        copy={s.copy && <CopyButton value={s.copy} help={t('pc2.s61.sell.copyExchange', { n: s.copy })} simple={simple} t={t} />}
      />
      {s.note && <NoteLine check={s.note} floor={priceText(s.floor, 'gen')} exchange t={t} />}
    </>
  )
}

/** «Продаю» для обмена без цены у Ange: честно — смотрите курс у Ange; лучшее предложение сайта — ориентир. */
export function SellBulk2({ result, simple, lang, t }: { result: Extract<Pc2Result, { kind: 'bulk' }>; simple: boolean; lang: UiLang; t: T }) {
  const priceText = usePriceText(lang)
  const best = result.offers[0]
  const each: Poe1Price | undefined =
    best && best.itemAmount > 0
      ? best.currency === 'exalted'
        ? exaltedIn(best.exchangeAmount / best.itemAmount, 'exalted', undefined)
        : { amount: best.exchangeAmount / best.itemAmount, currency: best.currency }
      : undefined
  return (
    <SellPlate
      kind="bulk"
      tone="info"
      icon="info"
      title={t('pc2.s61.sell.bulk.title')}
      sub={each ? t('pc2.s61.sell.bulk.sub', { price: priceText(each) }) : t('pc2.s61.sell.bulk.none')}
      help={t('pc2.s61.v.sell.help')}
      simple={simple}
    />
  )
}
