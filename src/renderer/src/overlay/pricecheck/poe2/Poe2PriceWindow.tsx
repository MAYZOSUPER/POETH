import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import type { CapturedItem, GameInputResult, UiLang } from '@shared/types'
import { ItemCategory, ItemRarity, type ParsedItem } from '@shared/poe2/parser'
import type { FilterPreset, ItemFilters, ListingType, StatFilter } from '@shared/poe2/pricecheck'
import type { MarketPrice, Poe1Listing, Poe1Price } from '@shared/poe1/pricecheck/results'
import type { StatSource } from '@shared/poe1/parser/modifiers'
import type { Verdict, VerdictKind } from '@shared/poe1/pricecheck/verdict'
import { modText, modTextParts, type ModText } from '@shared/poe1/pricecheck/filters/mod-text'
import { createClickGuard, lotActions, whisperCommand } from '@shared/poe1/pricecheck/lotActions'
import { fallbackKey } from '@shared/poe1/pricecheck/fallback'
import { netErrorText } from '../../../panels/account/netError'
import { Icon, type IconName } from '../../Icon'
import { useOverlayStore } from '../../../store/useOverlayStore'
import { useOverlayT } from '../../useOverlayT'
import { tKey } from '../../../i18n/hotkey'
import { PopupPositionButton } from '../../PopupPosition'
import { Select } from '../../../components/Select'
import { CoinIcon, Currency, CurrencyTipBody, TipAnchor, useCurrencyNames } from '../../../components/Currency'
import type { RuCase } from '@shared/currency'
import { ageKey, currencyLabel, fmtNum, tierWordKey, waitClock } from '../format'
import { activePreset2Of, usePoe2PriceCheckStore as useStore, type Pc2Result } from './store'

// Окно цены PoE2 (S47) — то же окно поверх игры, что у PoE1 (../PriceWindow.tsx), те же классы ui-*/pc-* и строки
// pc1.*, где они одинаковы для обеих игр; своё — у PoE2: фильтры предмета (гнёзда рун, тир путевого камня, уровень
// области), цены без пересчёта валют (база PoE2 — exalted, курса пока нет), поиск на trade2. Сеть — через main
// (тот же шлюз с лимитами). Live search и сужение «Открыть лот» до продавца у PoE2 пока нет: открывается весь поиск.

type T = (key: string, params?: Record<string, string | number>) => string

const SHOW_LISTINGS = 5
const LISTING_TYPES: readonly ListingType[] = ['available', 'securable', 'online', 'any']

const activateOverlay = (): void => void window.overlayApi.overlay.activate()
const inputProps = {
  onMouseDown: activateOverlay,
  onClick: (e: MouseEvent) => e.stopPropagation()
}

/** Трейд-окно S5 на сайте трейда PoE2 (trade2). */
function openInTradeWindow(url: string): void {
  void window.overlayApi.tradeWindow.open({ game: 'poe2', url })
}

function searchTitle(captured: CapturedItem, item: ParsedItem | null): string {
  const lines = captured.text.split(/\r?\n/)
  const name = lines[2] && lines[2] !== '--------' ? lines[2] : (item?.info.name ?? '')
  const base = lines[3] && lines[3] !== '--------' ? lines[3] : ''
  return [name, base].filter(Boolean).join(' ').slice(0, 120)
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [active])
  return now
}

function Price({ price, lang, full = false, approx = false }: { price: Poe1Price; lang: UiLang; full?: boolean; approx?: boolean }) {
  const text = `${approx ? '~' : ''}${fmtNum(price.amount, lang)}`
  return <Currency tag={price.currency} text={text} full={full} lang={lang} className="pc-price" />
}

type PriceText = (p: Poe1Price, c?: RuCase) => string
function usePriceText(lang: UiLang): PriceText {
  const simple = useStore((s) => s.simple)
  const names = useCurrencyNames(lang)
  return (p, c = 'nom') => {
    const n = fmtNum(p.amount, lang)
    return `${n} ${simple ? names.after(p.currency, n, c) : currencyLabel(p.currency)}`
  }
}

function SearchAgainBar({ t }: { t: T }) {
  const dirty = useStore((s) => s.dirty)
  const phase = useStore((s) => s.phase)
  const search = useStore((s) => s.search)
  if (!dirty || phase === 'loading' || phase === 'parsing') return null
  return (
    <div className="pc-again">
      <span className="pc-again__note">{t('pc1.search.dirty')}</span>
      <button type="button" className="ui-btn ui-btn--primary" onClick={() => void search()}>
        <Icon name="search" />
        {t('pc1.search.again')}
        <span className="ui-kbd">
          <kbd>Enter</kbd>
        </span>
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- предмет

const GEM_CATEGORIES = new Set<ItemCategory | undefined>([
  ItemCategory.Gem,
  ItemCategory.SkillGem,
  ItemCategory.SupportGem,
  ItemCategory.MetaGem,
  ItemCategory.UncutGem
])

function rarityAttr(item: ParsedItem): string {
  if (GEM_CATEGORIES.has(item.category)) return 'gem'
  if (item.category === ItemCategory.Currency) return 'currency'
  return (item.rarity ?? ItemRarity.Normal).toLowerCase()
}

function rarityKey(item: ParsedItem): string {
  if (GEM_CATEGORIES.has(item.category)) return 'pc1.rarity.gem'
  if (item.category === ItemCategory.Currency) return 'pc1.rarity.currency'
  return `pc1.rarity.${(item.rarity ?? ItemRarity.Normal).toLowerCase()}`
}

function ItemHead({ item, captured, t }: { item: ParsedItem | null; captured: CapturedItem; t: T }) {
  const lines = captured.text.split(/\r?\n/)
  const name = lines[2] && lines[2] !== '--------' ? lines[2] : (item?.info.name ?? '')
  const base = lines[3] && lines[3] !== '--------' ? lines[3] : null
  const sockets = item?.augmentSockets ? item.augmentSockets.current : 0
  return (
    <div className="ov-item pc-item">
      <span className="ov-item__name" data-rarity={item ? rarityAttr(item) : undefined} title={name}>
        {name}
      </span>
      {base && <span className="ov-item__base">{base}</span>}
      <span className="ov-item__meta">
        {item && (
          <span>
            {t(rarityKey(item))}
            {item.itemLevel ? ` · ${t('pc1.meta.ilvl', { n: item.itemLevel })}` : ''}
            {item.gemLevel ? ` · ${t('pc1.meta.gemLevel', { n: item.gemLevel })}` : ''}
            {item.mapTier ? ` · ${t('pc2.meta.tier', { n: item.mapTier })}` : ''}
            {sockets ? ` · ${t('pc2.meta.sockets', { n: sockets })}` : ''}
            {item.isCorrupted ? ` · ${t('pc1.meta.corrupted')}` : ''}
          </span>
        )}
        <span className="ui-tag">{t('pc1.client', { lang: captured.lang.toUpperCase() })}</span>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- свойства

/**
 * Строка мода как в игре: шаблон EE2 с # и числа по местам (тот же разбор, что у PoE1, S23). Свойства предмета
 * (DPS, броня, Spirit, свойства путевого камня…) в данных — английские шаблоны; переводим по trade id: сначала
 * pc2.prop.* (то, чего нет у PoE1 или называется иначе), потом общие pc1.prop.*.
 */
function filterModText(f: StatFilter, rawText: string | undefined, t: T): ModText {
  const id = f.tradeId[0]
  let text = f.text
  if (f.tag === 'property' || id?.startsWith('item.')) {
    for (const key of [`pc2.prop.${id}`, `pc1.prop.${id}`]) {
      const s = t(key)
      if (s !== key) {
        text = s
        break
      }
    }
  }
  // источники стата PoE2 — те же поля (stat.translation.string, stat.roll), что читает modText у PoE1
  return modText(text, f.statRef, f.roll?.value, f.sources as unknown as StatSource[], rawText)
}

function ModRow({ f, rawText, expert, lang, t }: { f: StatFilter; rawText: string; expert: boolean; lang: UiLang; t: T }) {
  const touch = useStore((s) => s.touch)
  const pseudo = f.tag === 'pseudo'
  const tier = f.sources[0]?.modifier.info.tier
  const shown = filterModText(f, rawText, t)
  const parts = modTextParts(shown, (n) => fmtNum(n, lang))
  const label = parts.map((p) => p.text).join('')
  const avg = shown.avg !== undefined ? fmtNum(shown.avg, lang) : undefined
  const from = !expert && typeof f.roll?.min === 'number' && !f.disabled ? fmtNum(f.roll.min, lang) : undefined
  const toggle = (): void => {
    f.disabled = !f.disabled
    touch()
  }
  const setBound = (key: 'min' | 'max', raw: string): void => {
    if (!f.roll) return
    const v = Number(raw.replace(',', '.'))
    f.roll[key] = raw.trim() === '' || Number.isNaN(v) ? undefined : v
    touch()
  }
  const tierTag = pseudo ? (
    <span className="ui-tier">
      Σ{!expert && <em> {t('pc1.pseudoTag')}</em>}
    </span>
  ) : tier ? (
    <span className={`ui-tier ui-tier--t${Math.min(tier, 3)}`}>
      T{tier}
      {!expert && <em> {t(tierWordKey(tier))}</em>}
    </span>
  ) : f.fromSite ? (
    <span className="ui-tag ui-tag--warn" title={t('pc1.fromSite.help')}>
      {t('pc1.fromSite')}
    </span>
  ) : (
    <span />
  )
  const goodness = f.roll?.goodness
  return (
    <div className={`ui-mod${expert ? ' ui-mod--expert' : ''}${f.disabled ? ' ui-mod--off' : ''}${pseudo ? ' ui-mod--pseudo' : ''}`}>
      <button type="button" className="ui-check" role="checkbox" aria-checked={!f.disabled} aria-label={label} onClick={toggle}>
        <Icon name="check" />
      </button>
      <span className="ui-mod__text">
        {parts.map((p, i) => (p.num ? <b key={i}>{p.text}</b> : p.text))}
        {avg !== undefined ? (
          <span className="ui-mod__from">
            {from !== undefined ? t('pc1.s23.avgFrom', { n: avg, min: from }) : t('pc1.s23.avg', { n: avg })}
          </span>
        ) : (
          from !== undefined && <span className="ui-mod__from">{t('pc1.from', { n: from })}</span>
        )}
      </span>
      {tierTag}
      {expert && (
        <>
          {goodness !== undefined && !pseudo ? (
            <span className="ui-roll" style={{ ['--v' as string]: `${Math.round(goodness * 100)}%` }} title={t('pc1.roll.help')}>
              {Math.round(goodness * 100)}%<i />
            </span>
          ) : (
            <span />
          )}
          <input
            className="ui-input ui-input--num"
            aria-label="min"
            disabled={!f.roll}
            value={typeof f.roll?.min === 'number' ? fmtNum(f.roll.min, lang) : ''}
            onChange={(e) => setBound('min', e.target.value)}
            {...inputProps}
          />
          <input
            className="ui-input ui-input--num"
            aria-label="max"
            placeholder="max"
            disabled={!f.roll}
            value={typeof f.roll?.max === 'number' ? fmtNum(f.roll.max, lang) : ''}
            onChange={(e) => setBound('max', e.target.value)}
            {...inputProps}
          />
        </>
      )}
    </div>
  )
}

function UnknownRow({ text, expert, t }: { text: string; expert: boolean; t: T }) {
  return (
    <div className={`ui-mod ui-mod--off${expert ? ' ui-mod--expert' : ''}`} title={t('pc1.unknown.help')}>
      <span />
      <span className="ui-mod__text">
        {text} <span className="ui-mod__from">{t('pc1.unknown')}</span>
      </span>
      <span />
      {expert && (
        <>
          <span />
          <span />
          <span />
        </>
      )}
    </div>
  )
}

function StatsBlocks({ preset, item, expert, lang, t }: { preset: FilterPreset; item: ParsedItem; expert: boolean; lang: UiLang; t: T }) {
  useStore((s) => s.rev)
  const [showHidden, setShowHidden] = useState(false)
  const filters = preset.stats
  const visible = filters.filter((f) => !f.hidden || showHidden)
  const hiddenCount = filters.filter((f) => f.hidden).length
  const pseudo = visible.filter((f) => f.tag === 'pseudo')
  const mods = visible.filter((f) => f.tag !== 'pseudo')
  const fromSite = new Set(filters.filter((f) => f.fromSite).map((f) => fallbackKey(f.text)))
  const unknown = item.unknownModifiers.filter((u) => !fromSite.has(fallbackKey(u.text)))
  const head = expert ? (
    <div className="ui-mod-head">
      <span />
      <span>{t('pc1.col.mod')}</span>
      <span>{t('pc1.col.tier')}</span>
      <span>{t('pc1.col.roll')}</span>
      <span>min</span>
      <span>max</span>
    </div>
  ) : null
  return (
    <>
      {(mods.length > 0 || unknown.length > 0 || hiddenCount > 0) && (
        <div className="pc-blk">
          <div className="ui-label">
            {t('pc1.mods')}
            <span className="ui-label__grow" />
            <span className="ui-q" title={t('pc1.mods.help')}>
              ?
            </span>
          </div>
          {head}
          {mods.map((f, i) => (
            <ModRow key={`${f.statRef}-${i}`} f={f} rawText={item.rawText} expert={expert} lang={lang} t={t} />
          ))}
          {unknown.map((u, i) => (
            <UnknownRow key={`u-${i}`} text={u.text} expert={expert} t={t} />
          ))}
          {hiddenCount > 0 && (
            <div className="pc-more">
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setShowHidden((v) => !v)}>
                {showHidden ? t('pc1.hidden.hide') : t('pc1.hidden.show', { n: hiddenCount })}
              </button>
            </div>
          )}
        </div>
      )}
      {pseudo.length > 0 && (
        <div className="pc-blk">
          <div className="ui-label">
            {t('pc1.pseudo')}
            <span className="ui-label__grow" />
            <span className="ui-q" title={t('pc1.pseudo.help')}>
              ?
            </span>
          </div>
          {pseudo.map((f, i) => (
            <ModRow key={`${f.statRef}-${i}`} f={f} rawText={item.rawText} expert={expert} lang={lang} t={t} />
          ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------- фильтры предмета

function Chip({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button type="button" className="ui-chip" aria-pressed={on} onClick={onToggle}>
      {children}
    </button>
  )
}

function ItemFiltersRow({ filters, item, t }: { filters: ItemFilters; item: ParsedItem; t: T }) {
  const touch = useStore((s) => s.touch)
  const listingType = useStore((s) => s.listingType)
  const setListingType = useStore((s) => s.setListingType)
  useStore((s) => s.rev)
  const flip = (f: { disabled: boolean } | undefined) => () => {
    if (!f) return
    f.disabled = !f.disabled
    touch()
  }
  const corrupted = filters.corrupted
  const sockets = filters.augmentSockets ?? filters.socketNumber
  return (
    <>
      <div className="pc-blk pc-blk--tight">
        <div className="ui-label">{t('pc1.filters')}</div>
      </div>
      <div className="pc-chips">
        {filters.searchRelaxed && (
          <Chip on={!filters.searchRelaxed.disabled} onToggle={flip(filters.searchRelaxed)}>
            {t('pc1.f.category')}
          </Chip>
        )}
        {filters.itemLevel && (
          <Chip on={!filters.itemLevel.disabled} onToggle={flip(filters.itemLevel)}>
            {t('pc1.f.ilvl', { n: filters.itemLevel.value })}
          </Chip>
        )}
        {sockets && (
          <Chip on={!sockets.disabled} onToggle={flip(sockets)}>
            {t('pc2.f.sockets', { n: sockets.value })}
          </Chip>
        )}
        {filters.quality && (
          <Chip on={!filters.quality.disabled} onToggle={flip(filters.quality)}>
            {t('pc1.f.quality', { n: filters.quality.value })}
          </Chip>
        )}
        {filters.gemLevel && (
          <Chip on={!filters.gemLevel.disabled} onToggle={flip(filters.gemLevel)}>
            {t('pc1.f.gemLevel', { n: filters.gemLevel.value })}
          </Chip>
        )}
        {filters.mapTier && (
          <Chip on={!filters.mapTier.disabled} onToggle={flip(filters.mapTier)}>
            {t('pc2.f.tier', { n: filters.mapTier.value })}
          </Chip>
        )}
        {filters.areaLevel && (
          <Chip on={!filters.areaLevel.disabled} onToggle={flip(filters.areaLevel)}>
            {t('pc2.f.areaLevel', { n: filters.areaLevel.value })}
          </Chip>
        )}
        {filters.stackSize && (
          <Chip on={!filters.stackSize.disabled} onToggle={flip(filters.stackSize)}>
            {t('pc1.f.stack', { n: filters.stackSize.value })}
          </Chip>
        )}
        {filters.unidentified && (
          <Chip on={!filters.unidentified.disabled} onToggle={flip(filters.unidentified)}>
            {t('pc1.f.unid')}
          </Chip>
        )}
        {corrupted &&
          (item.isCorrupted ? (
            <Chip
              on={Boolean(corrupted.exact)}
              onToggle={() => {
                corrupted.exact = !corrupted.exact
                touch()
              }}
            >
              {t('pc1.f.corrupted')}
            </Chip>
          ) : (
            <Chip
              on={corrupted.value === false}
              onToggle={() => {
                corrupted.value = !corrupted.value
                touch()
              }}
            >
              {t('pc1.f.notCorrupted')}
            </Chip>
          ))}
        <span className="pc-status">
          <span className="ui-label">{t('pc1.seller')}</span>
          <Select<ListingType>
            value={listingType}
            label={t('pc1.seller')}
            options={LISTING_TYPES.map((s) => ({ value: s, label: t(`pc1.status.${s}`), hint: t(`pc1.status.${s}.hint`) }))}
            onChange={setListingType}
            onOpen={activateOverlay}
          />
        </span>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- вердикт

const VERDICT_ICON: Record<VerdictKind, IconName> = {
  none: 'search',
  valuable: 'star',
  few: 'help',
  junk: 'trash',
  cheap: 'coins',
  list: 'coins'
}

const VERDICT_TONE: Record<VerdictKind, string> = {
  none: 'info',
  valuable: 'accent',
  few: 'info',
  junk: 'muted',
  cheap: 'muted',
  list: 'good'
}

function verdictText(v: Verdict, ctx: { bulk: boolean; one: string }, priceText: PriceText, t: T): { title: string; sub?: string; help?: string } {
  const price = v.price ? priceText(v.price) : ''
  switch (v.kind) {
    case 'none':
      return { title: t('pc1.v.none'), sub: t(ctx.bulk ? 'pc1.v.none.later' : 'pc1.v.none.sub') }
    case 'few':
      return {
        title: t('pc1.v.few'),
        sub: ctx.bulk
          ? t('pc1.v.few.bulk', { n: v.count, price })
          : v.price
            ? t('pc1.v.few.sub', { n: v.count, price })
            : t('pc1.v.few.noPrice', { n: v.count })
      }
    case 'junk':
      return { title: t('pc1.v.junk'), sub: t('pc1.v.junk.sub', { price, one: ctx.one }), help: t('pc1.v.junk.help') }
    case 'cheap':
      return { title: t('pc1.v.cheap'), sub: t('pc1.v.cheap.sub', { price }) }
    case 'valuable':
      return {
        title: t('pc1.v.valuable'),
        sub:
          v.reason === 'spread' && v.range
            ? t('pc1.v.valuable.spread', { min: priceText(v.range.min, 'gen'), max: priceText(v.range.max, 'gen') })
            : v.reason === 'few'
              ? t('pc1.v.valuable.few', { price, n: v.count })
              : t('pc1.v.valuable.div', { price: v.price ? priceText(v.price, 'gen') : '' }),
        help: t('pc1.v.valuable.help')
      }
    case 'list':
      return {
        title: t(ctx.bulk ? 'pc1.v.list.each' : 'pc1.v.list', { price: v.price ? priceText(v.price, 'acc') : '' }),
        help: t(ctx.bulk ? 'pc1.v.list.bulk' : 'pc1.v.list.sub')
      }
  }
}

type ActionState = 'idle' | 'busy' | 'done' | 'fail'

function NoteButton({ note, simple, t }: { note: string; simple: boolean; t: T }) {
  const [state, setState] = useState<ActionState>('idle')
  useEffect(() => setState('idle'), [note])
  useEffect(() => {
    if (state !== 'done' && state !== 'fail') return
    const id = setTimeout(() => setState('idle'), 2500)
    return () => clearTimeout(id)
  }, [state])
  const copy = async (): Promise<void> => {
    setState('busy')
    const ok = await window.overlayApi.trade.copyText(note).catch(() => false)
    setState(ok ? 'done' : 'fail')
  }
  const label = state === 'done' ? t('pc1.v.note.done') : state === 'fail' ? t('pc1.v.note.fail') : t('pc1.v.note')
  return (
    <button
      type="button"
      className={`ui-btn ui-btn--sm${simple ? '' : ' ui-btn--icon'}`}
      title={t('pc1.v.note.help', { note })}
      aria-label={simple ? undefined : label}
      disabled={state === 'busy'}
      onClick={() => void copy()}
    >
      <Icon name={state === 'done' ? 'check' : 'copy'} />
      {simple && label}
    </button>
  )
}

function VerdictPlate({ v, bulk, simple, lang, t }: { v: Verdict; bulk: boolean; simple: boolean; lang: UiLang; t: T }) {
  const priceText = usePriceText(lang)
  const names = useCurrencyNames(lang)
  // «меньше 1 Сферы возвышения» / «1 ex» — база цен PoE2
  const one = simple ? `1 ${names.after('exalted', 1, 'gen')}` : '1 ex'
  const { title, sub, help } = verdictText(v, { bulk, one }, priceText, t)
  const tip = simple ? help : [sub, help].filter(Boolean).join(' ')
  return (
    <div className={`pc-verdict pc-verdict--${VERDICT_TONE[v.kind]}`} role="status" data-kind={v.kind}>
      <Icon name={VERDICT_ICON[v.kind]} />
      <span className="pc-verdict__text">
        <b className="pc-verdict__title">{title}</b>
        {simple && sub && <span className="pc-verdict__sub">{sub}</span>}
        {simple && v.note && (
          <span className="pc-verdict__note">
            <NoteButton note={v.note} simple t={t} />
          </span>
        )}
      </span>
      <span className="pc-verdict__acts">
        {tip && (
          <span className="ui-q" title={tip}>
            ?
          </span>
        )}
        {!simple && v.note && <NoteButton note={v.note} simple={false} t={t} />}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- результаты

function MarketSummary({ result, simple, lang, t }: { result: Extract<Pc2Result, { kind: 'trade' }>; simple: boolean; lang: UiLang; t: T }) {
  const priceText = usePriceText(lang)
  const m: MarketPrice | undefined = result.market
  const conf = result.honest.confidence
  return (
    <div className="ui-summary pc-summary">
      {m ? (
        <div className="pc-market">
          <span className="pc-market__label">
            {t(simple ? 'pc1.s24.market' : 'pc1.s24.market.short')}
            <span className="ui-q" title={t('pc2.market.help')}>
              ?
            </span>
          </span>
          <span className="pc-market__price">
            <Price price={m.mid} lang={lang} full={simple} approx />
          </span>
          <span className="pc-market__note">
            {m.min.amount === m.max.amount
              ? t('pc1.s24.market.same', { n: m.lots })
              : t('pc1.s24.market.range', { n: m.lots, min: fmtNum(m.min.amount, lang), max: priceText(m.max, 'gen') })}
          </span>
        </div>
      ) : (
        <span className="pc-group__none">{t('pc1.s24.market.none')}</span>
      )}
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

function WhyHint({ result, t }: { result: Extract<Pc2Result, { kind: 'trade' }>; t: T }) {
  const range = useStore((s) => s.searchStatRange)
  const outliers = result.honest.instant.outliers.length + result.honest.person.outliers.length
  return (
    <div className="ui-hint">
      <Icon name="help" />
      <span>
        <b>{t('pc1.why.title')}</b> {t('pc1.why.search', { range, n: result.total })} {t('pc2.why.currency')}
        {outliers > 0 && <> {t('pc1.why.outliers', { n: outliers })}</>}
      </span>
    </div>
  )
}

/** Одна защита на окно: двойной клик по «Написать» — одно сообщение. */
const writeGuard = createClickGuard()

type WriteNote = { ok: true; sent: boolean } | { ok: false; reason: Exclude<GameInputResult, 'ok'>; copied: boolean }

function ListingRow({ l, siteUrl, lang, t }: { l: Poe1Listing; siteUrl: string; lang: UiLang; t: T }) {
  const sendWhisper = useStore((s) => s.sendWhisper)
  const [note, setNote] = useState<WriteNote | null>(null)
  const acts = lotActions(l)
  const age = ageKey(l.indexed)
  const status =
    l.online === 'online' ? (
      <>
        <span className="ui-dot" />
        {t('pc1.online')}
      </>
    ) : l.online === 'afk' ? (
      <>
        <span className="ui-dot ui-dot--afk" />
        {t('pc1.afk')}
      </>
    ) : (
      <>
        <span className="ui-dot ui-dot--off" />
        {t('pc1.offline')}
      </>
    )

  useEffect(() => {
    if (!note) return
    const id = setTimeout(() => setNote(null), note.ok ? 2500 : 6000)
    return () => clearTimeout(id)
  }, [note])

  // «Написать»: готовый whisper из ответа fetch → чат игры (без отправки, если не включено в настройках)
  const write = async (): Promise<void> => {
    const cmd = whisperCommand(l, sendWhisper)
    if (!cmd || !writeGuard()) return
    const res = await window.overlayApi.overlay.typeInChat(cmd.text, { send: cmd.send }).catch((): GameInputResult => 'no-input')
    if (res === 'ok') return setNote({ ok: true, sent: cmd.send })
    const copied = await window.overlayApi.trade.copyText(cmd.text).catch(() => false)
    setNote({ ok: false, reason: res, copied })
  }
  const open = (): void => openInTradeWindow(siteUrl)

  return (
    <div className="ui-listing pc-lot">
      <span className="ui-listing__price">{l.price ? <Price price={l.price} lang={lang} /> : '—'}</span>
      <span className="ui-listing__meta">
        <span className="ui-listing__who">
          <span
            className={`ui-tag ui-tag--${acts.buyout ? 'merchant' : 'person'}`}
            title={t(acts.buyout ? 'pc2.tag.buyout.help' : 'pc1.tag.person.help')}
          >
            {t(acts.buyout ? 'pc1.tag.buyout' : 'pc1.tag.person')}
          </span>{' '}
          {l.characterName || l.accountName}
        </span>
        <span>
          {status}
          {age && <> · {t(age[0], age[1])}</>}
        </span>
        {l.fee != null && (
          <TipAnchor className="ui-listing__fee ui-cur" tip={<CurrencyTipBody tag="gold" lang={lang} />}>
            <CoinIcon tag="gold" lang={lang} />
            {t('pc1.fee', { n: l.fee.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US') })}
          </TipAnchor>
        )}
        {note && (
          <span className={`pc-lot-note${note.ok ? '' : ' is-bad'}`} role="status">
            {note.ok
              ? t(note.sent ? 'pc1.write.sent' : 'pc1.write.pasted')
              : `${t(`pc1.write.err.${note.reason}`)}${note.copied ? ` ${t('pc1.write.copied')}` : ''}`}
          </span>
        )}
      </span>
      <span className="pc-lot-acts">
        {acts.write && (
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--primary"
            title={t(sendWhisper ? 'pc1.write.help.send' : 'pc1.write.help')}
            onMouseUp={(e) => e.stopPropagation()}
            onClick={() => void write()}
          >
            <Icon name="chat" />
            {t('pc1.write')}
          </button>
        )}
        <button
          type="button"
          className={`ui-btn ui-btn--sm${acts.primary === 'open' ? ' ui-btn--primary' : ' ui-btn--icon'}`}
          title={t(acts.buyout ? 'pc2.lot.open.buyout.help' : 'pc2.lot.open.help')}
          aria-label={t('pc1.lot.open')}
          onClick={open}
        >
          <Icon name="external" />
          {acts.primary === 'open' && t('pc1.lot.open')}
        </button>
      </span>
    </div>
  )
}

function TradeResult({ result, simple, lang, t }: { result: Extract<Pc2Result, { kind: 'trade' }>; simple: boolean; lang: UiLang; t: T }) {
  const [all, setAll] = useState(false)
  const outliers = new Set([...result.honest.instant.outliers, ...result.honest.person.outliers])
  const rows = result.listings.filter((l) => !outliers.has(l.id))
  const shown = all ? rows : rows.slice(0, SHOW_LISTINGS)
  return (
    <>
      <VerdictPlate v={result.verdict} bulk={false} simple={simple} lang={lang} t={t} />
      <MarketSummary result={result} simple={simple} lang={lang} t={t} />
      {simple && <WhyHint result={result} t={t} />}
      <div className="pc-blk">
        <div className="ui-label">
          {t('pc1.listings')}
          <span className="ui-label__grow" />
          <span className="pc-listings__order">{t('pc1.s24.listings.order')}</span>
        </div>
        <div className="pc-listings ui-scroll">
          {shown.map((l) => (
            <ListingRow key={l.id} l={l} siteUrl={result.siteUrl} lang={lang} t={t} />
          ))}
        </div>
        {rows.length > SHOW_LISTINGS && (
          <div className="pc-more">
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setAll((v) => !v)}>
              {all ? t('pc1.less') : t('pc1.more', { n: rows.length - SHOW_LISTINGS })}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function BulkResult({ result, simple, lang, t }: { result: Extract<Pc2Result, { kind: 'bulk' }>; simple: boolean; lang: UiLang; t: T }) {
  const best = result.offers[0]
  const each = best ? best.exchangeAmount / best.itemAmount : 0
  const priceText = usePriceText(lang)
  const names = useCurrencyNames(lang)
  return (
    <>
      <VerdictPlate v={result.verdict} bulk simple={simple} lang={lang} t={t} />
      <div className="ui-summary">
        <span className="ui-summary__price">
          {best && (
            <TipAnchor className="ui-cur" focusable tip={<CurrencyTipBody tag={best.currency} lang={lang} />}>
              <CoinIcon tag={best.currency} lang={lang} />
              {each >= 0.1
                ? t('pc1.bulk.each', { price: `≈ ${priceText({ amount: each, currency: best.currency })}` })
                : t('pc1.bulk.forOne', {
                    n: fmtNum(best.itemAmount / best.exchangeAmount, lang),
                    cur: simple ? names.after(best.currency, 1, 'acc') : currencyLabel(best.currency)
                  })}
            </TipAnchor>
          )}
        </span>
        <span className="ui-summary__conf">
          {t('pc1.bulk.title')} · {t('pc1.conf.similar', { n: result.total })}
        </span>
      </div>
      <div className="pc-blk">
        <div className="pc-listings ui-scroll">
          {result.offers.slice(0, 10).map((o) => (
            <div className="ui-listing" key={o.id}>
              <span className="ui-listing__price">
                <Currency tag={o.currency} text={fmtNum(o.exchangeAmount, lang)} lang={lang} />
              </span>
              <span className="ui-listing__meta">
                <span className="ui-listing__who">{o.characterName || o.accountName}</span>
                <span>
                  {t('pc1.bulk.rate', { n: o.itemAmount })} · {t('pc1.bulk.stock', { n: o.stock })}
                </span>
              </span>
              <span />
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function Results({ t, lang }: { t: T; lang: UiLang }) {
  const phase = useStore((s) => s.phase)
  const result = useStore((s) => s.result)
  const netError = useStore((s) => s.netError)
  const parseError = useStore((s) => s.parseError)
  const retryAt = useStore((s) => s.retryAt)
  const simple = useStore((s) => s.simple)
  const search = useStore((s) => s.search)
  const loosen = useStore((s) => s.loosen)
  const preset = useStore((s) => activePreset2Of(s))
  const now = useNow(phase === 'limit')
  const pcKey = useOverlayStore((s) => s.priceCheckKey)

  if (phase === 'parsing' || phase === 'loading') {
    return (
      <>
        <div className="ui-summary">
          <span className="ui-summary__conf">{t(phase === 'parsing' ? 'pc1.parsing' : 'pc1.loading')}</span>
        </div>
        <div className="pc-sk">
          {[0, 1, 2].map((i) => (
            <div className="pc-sk__row" key={i}>
              <i className="ui-skeleton" />
              <i className="ui-skeleton" />
              <i className="ui-skeleton" />
            </div>
          ))}
        </div>
      </>
    )
  }
  if (phase === 'limit') {
    const time = waitClock(((retryAt ?? now) - now) / 1000)
    return (
      <>
        <div className="ui-banner" role="status">
          <Icon name="warn" />
          <span>
            <b>{t('pc1.limit.title')}</b> {t('pc1.limit.text', { time })}
          </span>
          <button type="button" className="ui-btn ui-btn--sm" aria-disabled="true">
            <Icon name="refresh" />
            {time}
          </button>
        </div>
        <div className="ui-hint">
          <Icon name="help" />
          <span>{tKey(t, 'pc1.limit.cache', pcKey)}</span>
        </div>
      </>
    )
  }
  if (phase === 'blocked') {
    return (
      <>
        <div className="ui-banner ui-banner--info" role="status">
          <Icon name="shield" />
          <span>
            <b>{t('auth.cf.title')}</b> {t('auth.cf.text.pricecheck')}
          </span>
          <span />
        </div>
        <div className="pc-more pc-more--pad">
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => void window.overlayApi.auth.login()}>
            <Icon name="external" />
            {t('auth.cf.open')}
          </button>
        </div>
      </>
    )
  }
  if (phase === 'error') {
    if (parseError) {
      const key =
        parseError.code === 'item.unknown' ? 'pc1.parse.unknown' : parseError.code === 'item.unknown_lang' ? 'pc1.parse.lang' : 'pc2.parse.error'
      return (
        <div className="ui-empty">
          <span className="ui-empty__title">{t('pc1.error.title')}</span>
          <span>{key === 'pc2.parse.error' ? tKey(t, key, pcKey) : t(key)}</span>
        </div>
      )
    }
    const [key, params] = netError ? netErrorText(netError) : ['net.err.network']
    return (
      <div className="ui-banner ui-banner--bad" role="status">
        <Icon name="warn" />
        <span>
          <b>{t('pc1.error.title')}</b> {t(key, params)}
        </span>
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => void search()}>
          <Icon name="refresh" />
          {t('pc1.error.retry')}
        </button>
      </div>
    )
  }
  if (phase === 'empty') {
    const bulk = result?.kind === 'bulk'
    const canLoosen =
      !bulk && !!preset?.stats.some((s) => !s.disabled && (typeof s.roll?.min === 'number' || typeof s.roll?.max === 'number'))
    return (
      <>
        <VerdictPlate v={{ kind: 'none', count: 0, confidence: 0 }} bulk={bulk} simple lang={lang} t={t} />
        {canLoosen && (
          <div className="pc-more pc-more--again">
            <button type="button" className="ui-btn ui-btn--primary" onClick={loosen}>
              {t('pc1.empty.loosen')}
            </button>
          </div>
        )}
      </>
    )
  }
  if (phase === 'result' && result) {
    return result.kind === 'trade' ? (
      <TradeResult result={result} simple={simple} lang={lang} t={t} />
    ) : (
      <BulkResult result={result} simple={simple} lang={lang} t={t} />
    )
  }
  return null
}

// ---------------------------------------------------------------- окно

const PRESET_KEYS: Record<string, string> = {
  'filters.preset_pseudo': 'pc1.preset.pseudo',
  'filters.preset_exact': 'pc1.preset.exact',
  'filters.preset_base_item': 'pc1.preset.base',
  'filters.preset_bulk': 'pc1.preset.bulk'
}

export function Poe2PriceWindow({ captured, onClose }: { captured: CapturedItem; onClose: () => void }) {
  const t = useOverlayT()
  const lang = useOverlayStore((s) => s.lang)
  const item = useStore((s) => s.item)
  const simple = useStore((s) => s.simple)
  const presets = useStore((s) => s.presets)
  const activeId = useStore((s) => s.activePreset)
  const league = useStore((s) => s.league)
  const leagues = useStore((s) => s.leagues)
  const result = useStore((s) => s.result)
  const phase = useStore((s) => s.phase)
  const { search, setPreset, setLeague } = useStore.getState()
  const preset = presets.find((p) => p.id === activeId) ?? presets[0]
  const expert = !simple

  // Enter — искать заново с изменёнными фильтрами
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' || e.repeat || e.isComposing || e.defaultPrevented) return
      if (e.target instanceof Element && e.target.closest('button, [role="listbox"]')) return
      const st = useStore.getState()
      if (!st.item || st.phase === 'loading' || st.phase === 'parsing') return
      e.preventDefault()
      void st.search()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <section className={`ui-panel pc${expert ? ' is-expert' : ''}`} data-game="poe2">
      <header className="ui-panel__head" data-drag-handle>
        <span className="ui-panel__title">{t('pc2.title')}</span>
        {leagues.length > 0 && (
          <Select
            className="pc-league"
            label={t('pc1.league')}
            value={league}
            options={leagues.map((l) => ({ value: l.id, label: l.text }))}
            onChange={setLeague}
            onOpen={activateOverlay}
          />
        )}
        <PopupPositionButton />
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          title={t('pc1.refresh')}
          aria-label={t('pc1.refresh')}
          disabled={!item || phase === 'loading'}
          onClick={() => void search()}
        >
          <Icon name="refresh" />
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          title={`${t('pc1.close')} (Esc)`}
          aria-label={t('pc1.close')}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className="pc-body ui-scroll">
        <ItemHead item={item} captured={captured} t={t} />
        {expert && presets.length > 1 && (
          <div className="pc-chips pc-chips--top">
            <span className="ui-label">{t('pc1.preset')}</span>
            <div className="ui-seg">
              {presets.map((p) => (
                <button key={p.id} type="button" aria-pressed={p.id === preset?.id} onClick={() => setPreset(p.id)}>
                  {t(PRESET_KEYS[p.id] ?? 'pc1.preset.pseudo')}
                </button>
              ))}
            </div>
          </div>
        )}
        {item && preset && (
          <>
            <StatsBlocks preset={preset} item={item} expert={expert} lang={lang} t={t} />
            <ItemFiltersRow filters={preset.filters} item={item} t={t} />
          </>
        )}
        <Results t={t} lang={lang} />
        <SearchAgainBar t={t} />
      </div>
      <PriceActions result={result} title={searchTitle(captured, item)} league={league} t={t} />
    </section>
  )
}

/** Кнопки окна цены PoE2: трейд-окно на trade2 и избранное (S5). Live search у PoE2 пока нет. */
function PriceActions({ result, title, league, t }: { result: Pc2Result | undefined; title: string; league: string; t: T }) {
  const [saved, setSaved] = useState<ActionState>('idle')
  const siteUrl = result?.siteUrl
  useEffect(() => setSaved('idle'), [siteUrl])
  // id поиска — последний сегмент адреса trade2 (/trade2/search/poe2/<лига>/<id>)
  const slug = siteUrl ? decodeURIComponent(siteUrl.split('/').pop() ?? '') : ''
  const type = result?.kind === 'bulk' ? 'exchange' : 'search'

  const save = async (): Promise<void> => {
    if (!slug || saved === 'busy' || saved === 'done') return
    setSaved('busy')
    const fav = await window.overlayApi.fav.add({ title, game: 'poe2', type, slug, league }).catch(() => null)
    setSaved(fav ? 'done' : 'fail')
  }

  return (
    <footer className="ui-panel__foot">
      <button
        type="button"
        className="ui-btn ui-btn--primary"
        title={t('pc2.open.help')}
        disabled={!siteUrl}
        onClick={() => siteUrl && openInTradeWindow(siteUrl)}
      >
        <Icon name="external" />
        {t('pc1.open')}
      </button>
      <button
        type="button"
        className="ui-btn"
        title={t('pc1.save.help')}
        disabled={!slug || saved === 'busy'}
        aria-pressed={saved === 'done'}
        onClick={() => void save()}
      >
        <Icon name={saved === 'done' ? 'check' : 'star'} />
        {saved === 'done' ? t('pc1.save.done') : saved === 'fail' ? t('pc1.save.fail') : t('pc1.save')}
      </button>
    </footer>
  )
}
