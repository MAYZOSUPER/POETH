import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import type { CapturedItem, UiLang } from '@shared/types'
import { ItemCategory, ItemRarity, type ParsedItem } from '@shared/poe1/parser'
import {
  TRADE_STATUSES,
  type FilterGroup,
  type FilterPreset,
  type ItemFilters,
  type StatFilter,
  type TradeStatus
} from '@shared/poe1/pricecheck'
import type { Poe1Listing, Poe1Price, PriceGroupSummary } from '@shared/poe1/pricecheck/results'
import type { TradeWindowTarget } from '@shared/types/fav'
import type { LiveAddError } from '@shared/types/live'
import { parseTradeUrl } from '@shared/favorites/tradeUrl'
import { fallbackKey } from '@shared/poe1/pricecheck/fallback'
import { netErrorText } from '../../panels/account/netError'
import { Icon } from '../Icon'
import { useOverlayStore } from '../../store/useOverlayStore'
import { useOverlayT } from '../useOverlayT'
import { PopupPositionButton } from '../PopupPosition'
import { activePresetOf, usePriceCheckStore, type PcResult } from './store'
import { ageKey, coinClass, currencyLabel, fmtNum, statParts, tierWordKey } from './format'

// Окно цены PoE1 по утверждённому макету (docs/design-system.md, классы ui-*): шапка с лигой, предмет,
// свойства и псевдо-статы с галочками, фильтры предмета, сводка «честной цены», предложения, кнопки.
// Состояния: загрузка / результат / лимит с отсчётом / нет совпадений / проверка сайта (+ ошибка).

type T = (key: string, params?: Record<string, string | number>) => string

const SHOW_LISTINGS = 5

/** Поля ввода в пассивном оверлее: активировать оверлей (иначе клавиатура уйдёт в игру). */
const inputProps = {
  onMouseDown: () => window.overlayApi.overlay.activate(),
  onClick: (e: MouseEvent) => e.stopPropagation()
}

function openExternal(url: string): void {
  window.overlayApi.window.openExternal(url)
}

/** Трейд-окно S5 вместо системного браузера: поиск по адресу или конкретный лот. */
function openInTradeWindow(target: TradeWindowTarget): void {
  void window.overlayApi.tradeWindow.open({ game: 'poe1', ...target })
}

/** «Купить» у лота торговца: сайт сам покажет этот лот (продавец + имя + база + ilvl). */
function openListing(l: Poe1Listing, siteUrl: string): void {
  const league = parseTradeUrl(siteUrl)?.league
  if (!l.baseType || !league) return openInTradeWindow({ url: siteUrl })
  openInTradeWindow({ lot: { account: l.accountName, name: l.itemName, typeLine: l.baseType, ilvl: l.itemLevel }, league })
}

/** Название поиска для избранного и live: имя предмета [+ база], как в шапке окна. */
function searchTitle(captured: CapturedItem, item: ParsedItem | null): string {
  const lines = captured.text.split(/\r?\n/)
  const name = lines[2] && lines[2] !== '--------' ? lines[2] : (item?.info.name ?? '')
  const base = lines[3] && lines[3] !== '--------' ? lines[3] : ''
  return [name, base].filter(Boolean).join(' ').slice(0, 120)
}

type ActionState = 'idle' | 'busy' | 'done' | 'fail'

function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [active])
  return now
}

function Price({ price, lang }: { price: Poe1Price; lang: UiLang }) {
  return (
    <>
      <i className={coinClass(price.currency)} />
      {fmtNum(price.amount, lang)} {currencyLabel(price.currency)}
    </>
  )
}

function priceText(p: Poe1Price, lang: UiLang): string {
  return `${fmtNum(p.amount, lang)} ${currencyLabel(p.currency)}`
}

// ---------------------------------------------------------------- предмет

function rarityAttr(item: ParsedItem): string {
  if (item.category === ItemCategory.Gem) return 'gem'
  if (item.category === ItemCategory.Currency || item.category === ItemCategory.DivinationCard) return 'currency'
  return (item.rarity ?? ItemRarity.Normal).toLowerCase()
}

function rarityKey(item: ParsedItem): string {
  if (item.category === ItemCategory.Gem) return 'pc1.rarity.gem'
  if (item.category === ItemCategory.Currency) return 'pc1.rarity.currency'
  if (item.category === ItemCategory.DivinationCard) return 'pc1.rarity.card'
  return `pc1.rarity.${(item.rarity ?? ItemRarity.Normal).toLowerCase()}`
}

function ItemHead({ item, captured, t }: { item: ParsedItem | null; captured: CapturedItem; t: T }) {
  const lines = captured.text.split(/\r?\n/)
  const name = lines[2] && lines[2] !== '--------' ? lines[2] : (item?.info.name ?? '')
  const base = lines[3] && lines[3] !== '--------' ? lines[3] : null
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
            {item.mapTier ? ` · ${t('pc1.meta.mapTier', { n: item.mapTier })}` : ''}
            {item.sockets?.linked ? ` · ${t('pc1.meta.links', { n: item.sockets.linked })}` : ''}
            {item.isCorrupted ? ` · ${t('pc1.meta.corrupted')}` : ''}
          </span>
        )}
        <span className="ui-tag">{t('pc1.client', { lang: captured.lang.toUpperCase() })}</span>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- строки свойств

function ModRow({ f, expert, lang, t }: { f: StatFilter; expert: boolean; lang: UiLang; t: T }) {
  const touch = usePriceCheckStore((s) => s.touch)
  const pseudo = f.tag === 'pseudo'
  const tier = f.sources[0]?.modifier.info.tier
  // свойства предмета (броня, DPS, IIQ карты…) в данных — английские ключи; переводим по trade id
  const propKey = `pc1.prop.${f.tradeId[0]}`
  const propText = f.tag === 'property' || f.tradeId[0]?.startsWith('item.') ? t(propKey) : undefined
  const parts = statParts(f, lang, propText && propText !== propKey ? propText : f.text)
  const label = `${parts.before}${parts.value ?? ''}${parts.after}`
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
    <div
      className={`ui-mod${expert ? ' ui-mod--expert' : ''}${f.disabled ? ' ui-mod--off' : ''}${pseudo ? ' ui-mod--pseudo' : ''}`}
    >
      <button
        type="button"
        className="ui-check"
        role="checkbox"
        aria-checked={!f.disabled}
        aria-label={label}
        onClick={toggle}
      >
        <Icon name="check" />
      </button>
      <span className="ui-mod__text">
        {parts.before}
        {parts.value !== undefined && <b>{parts.value}</b>}
        {parts.after}
        {!expert && typeof f.roll?.min === 'number' && !f.disabled && (
          <span className="ui-mod__from">{t('pc1.from', { n: fmtNum(f.roll.min, lang) })}</span>
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

function TimelessBlock({ preset, t }: { preset: FilterPreset; t: T }) {
  const setMode = usePriceCheckStore((s) => s.setTimelessMode)
  const info = preset.timeless!
  return (
    <div className="pc-blk">
      <div className="ui-label">
        {t('pc1.timeless.title', { seed: info.seed })}
        <span className="ui-label__grow" />
        {info.legacy && <span className="ui-tag ui-tag--warn">{t('pc1.timeless.legacy')}</span>}
      </div>
      <div className="pc-chips">
        {info.conqueror && (
          <>
            <button type="button" className="ui-chip" aria-pressed={info.mode === 'any'} onClick={() => setMode('any')}>
              {t('pc1.timeless.any')}
            </button>
            <button
              type="button"
              className="ui-chip"
              aria-pressed={info.mode === 'exact'}
              onClick={() => setMode('exact')}
            >
              {t('pc1.timeless.exact')}: {info.conqueror}
            </button>
          </>
        )}
        {info.vilsolUrl && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => openExternal(info.vilsolUrl!)}>
            <Icon name="external" />
            {t('pc1.timeless.vilsol')}
          </button>
        )}
      </div>
      {info.pobHint && (
        <div className="ui-hint">
          <Icon name="help" />
          <span>{t('pc1.timeless.abyssPob')}</span>
        </div>
      )}
    </div>
  )
}

function StatsBlocks({ preset, item, expert, lang, t }: { preset: FilterPreset; item: ParsedItem; expert: boolean; lang: UiLang; t: T }) {
  usePriceCheckStore((s) => s.rev)
  const [showHidden, setShowHidden] = useState(false)
  const filters = preset.stats.filter((s): s is StatFilter => !s.group)
  const visible = filters.filter((f) => !f.hidden || showHidden)
  const hiddenCount = filters.filter((f) => f.hidden).length
  const pseudo = visible.filter((f) => f.tag === 'pseudo')
  const mods = visible.filter((f) => f.tag !== 'pseudo' && !f.not)
  const fromSite = new Set(filters.filter((f) => f.fromSite).map((f) => fallbackKey(f.text)))
  const unknown = item.unknownModifiers.filter((u) => !fromSite.has(fallbackKey(u.text)))
  const timeless = preset.stats.some((s): s is FilterGroup => s.group === 'one' && s.kind === 'timeless')
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
      {timeless && preset.timeless && <TimelessBlock preset={preset} t={t} />}
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
            <ModRow key={`${f.statRef}-${i}`} f={f} expert={expert} lang={lang} t={t} />
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
            <ModRow key={`${f.statRef}-${i}`} f={f} expert={expert} lang={lang} t={t} />
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
  const touch = usePriceCheckStore((s) => s.touch)
  const status = usePriceCheckStore((s) => s.status)
  const setStatus = usePriceCheckStore((s) => s.setStatus)
  usePriceCheckStore((s) => s.rev)
  const flip = (f: { disabled: boolean } | undefined) => () => {
    if (!f) return
    f.disabled = !f.disabled
    touch()
  }
  const corrupted = filters.corrupted
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
        {filters.linkedSockets && (
          <Chip on={!filters.linkedSockets.disabled} onToggle={flip(filters.linkedSockets)}>
            {t('pc1.f.links', { n: filters.linkedSockets.value })}
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
            {t('pc1.f.mapTier', { n: filters.mapTier.value })}
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
        {filters.influences?.map((inf) => (
          <Chip key={inf.value} on={!inf.disabled} onToggle={flip(inf)}>
            {t(`pc1.f.influence.${inf.value}`)}
          </Chip>
        ))}
        <label className="pc-status" title={t(`pc1.status.${status}.hint`)}>
          <span className="ui-label">{t('pc1.seller')}</span>
          <select
            className="ui-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as TradeStatus)}
            {...inputProps}
          >
            {TRADE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`pc1.status.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- результаты

function GroupLine({ kind, g, lang, t }: { kind: 'instant' | 'person'; g: PriceGroupSummary; lang: UiLang; t: T }) {
  return (
    <div className="pc-group" data-kind={kind}>
      <span className={`ui-tag ui-tag--${kind === 'instant' ? 'merchant' : 'person'}`}>{t(`pc1.summary.${kind}`)}</span>
      {g.min ? (
        <span className="pc-group__price">
          <Price price={g.min} lang={lang} />
          {g.median && g.count > 1 && (
            <span className="pc-group__median"> · {t('pc1.summary.median', { price: priceText(g.median, lang) })}</span>
          )}
        </span>
      ) : (
        <span className="pc-group__none">{t('pc1.summary.none')}</span>
      )}
      <span className="pc-group__note">{t(`pc1.summary.${kind}.note`)}</span>
    </div>
  )
}

function WhyHint({ result, lang, t }: { result: Extract<PcResult, { kind: 'trade' }>; lang: UiLang; t: T }) {
  const range = usePriceCheckStore((s) => s.searchStatRange)
  const { instant, person } = result.honest
  const outliers = instant.outliers.length + person.outliers.length
  return (
    <div className="ui-hint">
      <Icon name="help" />
      <span>
        <b>{t('pc1.why.title')}</b> {t('pc1.why.search', { range, n: result.total })}
        {instant.min && <> {t('pc1.why.instant', { price: priceText(instant.min, lang) })}</>}
        {person.min && <> {t('pc1.why.person', { price: priceText(person.min, lang) })}</>}
        {outliers > 0 && <> {t('pc1.why.outliers', { n: outliers })}</>}
      </span>
    </div>
  )
}

function ListingRow({ l, siteUrl, lang, t }: { l: Poe1Listing; siteUrl: string; lang: UiLang; t: T }) {
  const [copied, setCopied] = useState(false)
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
  const copy = async (): Promise<void> => {
    if (!l.whisper) return
    if (await window.overlayApi.trade.copyText(l.whisper)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }
  return (
    <div className="ui-listing">
      <span className="ui-listing__price">{l.price ? <Price price={l.price} lang={lang} /> : '—'}</span>
      <span className="ui-listing__meta">
        <span className="ui-listing__who">
          <span className={`ui-tag ui-tag--${l.kind === 'instant' ? 'merchant' : 'person'}`}>
            {t(l.kind === 'instant' ? 'pc1.tag.merchant' : 'pc1.tag.person')}
          </span>{' '}
          {l.characterName || l.accountName}
        </span>
        <span>
          {status}
          {age && <> · {t(age[0], age[1])}</>}
        </span>
        {l.fee != null && (
          <span className="ui-listing__fee">
            <i className="ui-coin ui-coin--gold" />
            {t('pc1.fee', { n: l.fee.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US') })}
          </span>
        )}
      </span>
      {l.kind === 'instant' ? (
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" title={t('pc1.buy.help')} onClick={() => openListing(l, siteUrl)}>
          <Icon name="external" />
          {t('pc1.buy')}
        </button>
      ) : (
        <button type="button" className="ui-btn ui-btn--sm" title={t('pc1.whisper.help')} disabled={!l.whisper} onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} />
          {copied ? t('pc1.whisper.copied') : t('pc1.whisper.copy')}
        </button>
      )}
    </div>
  )
}

function TradeResult({ result, simple, lang, t }: { result: Extract<PcResult, { kind: 'trade' }>; simple: boolean; lang: UiLang; t: T }) {
  const [all, setAll] = useState(false)
  const conf = result.honest.confidence
  const outliers = new Set([...result.honest.instant.outliers, ...result.honest.person.outliers])
  const rows = result.listings.filter((l) => !outliers.has(l.id))
  const shown = all ? rows : rows.slice(0, SHOW_LISTINGS)
  return (
    <>
      <div className="ui-summary pc-summary">
        <GroupLine kind="instant" g={result.honest.instant} lang={lang} t={t} />
        <GroupLine kind="person" g={result.honest.person} lang={lang} t={t} />
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
      {result.inexact && (
        <div className="ui-hint">
          <Icon name="info" />
          <span>{t('pc1.inexact')}</span>
        </div>
      )}
      {simple && <WhyHint result={result} lang={lang} t={t} />}
      <div className="pc-blk">
        <div className="ui-label">
          {t('pc1.listings')}
          <span className="ui-label__grow" />
          {!simple && t('pc1.listings.cols')}
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

function BulkResult({ result, lang, t }: { result: Extract<PcResult, { kind: 'bulk' }>; lang: UiLang; t: T }) {
  const best = result.offers[0]
  const each = best ? best.exchangeAmount / best.itemAmount : 0
  return (
    <>
      <div className="ui-summary">
        <span className="ui-summary__price">
          {best && (
            <>
              <i className={coinClass(best.currency)} />
              {each >= 0.1
                ? t('pc1.bulk.each', { price: `≈ ${fmtNum(each, lang)} ${currencyLabel(best.currency)}` })
                : t('pc1.bulk.forOne', {
                    n: fmtNum(best.itemAmount / best.exchangeAmount, lang),
                    cur: currencyLabel(best.currency)
                  })}
            </>
          )}
        </span>
        <span className="ui-summary__conf">{t('pc1.bulk.title')} · {t('pc1.conf.similar', { n: result.total })}</span>
      </div>
      <div className="pc-blk">
        <div className="pc-listings ui-scroll">
          {result.offers.slice(0, 10).map((o) => (
            <div className="ui-listing" key={o.id}>
              <span className="ui-listing__price">
                <i className={coinClass(o.currency)} />
                {fmtNum(o.exchangeAmount, lang)} {currencyLabel(o.currency)}
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
  const phase = usePriceCheckStore((s) => s.phase)
  const result = usePriceCheckStore((s) => s.result)
  const netError = usePriceCheckStore((s) => s.netError)
  const parseError = usePriceCheckStore((s) => s.parseError)
  const retryAt = usePriceCheckStore((s) => s.retryAt)
  const simple = usePriceCheckStore((s) => s.simple)
  const dirty = usePriceCheckStore((s) => s.dirty)
  const search = usePriceCheckStore((s) => s.search)
  const loosen = usePriceCheckStore((s) => s.loosen)
  const preset = usePriceCheckStore((s) => activePresetOf(s))
  const now = useNow(phase === 'limit')

  const again = dirty && phase !== 'loading' && phase !== 'parsing' && (
    <div className="pc-more pc-more--again">
      <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => void search()}>
        <Icon name="search" />
        {t('pc1.search.again')}
      </button>
    </div>
  )

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
    const sec = Math.max(0, Math.ceil(((retryAt ?? now) - now) / 1000))
    const time = `0:${String(sec).padStart(2, '0')}`
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
          <span>{t('pc1.limit.cache')}</span>
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
        parseError.code === 'item.unknown'
          ? 'pc1.parse.unknown'
          : parseError.code === 'item.unknown_lang'
            ? 'pc1.parse.lang'
            : 'pc1.parse.error'
      return (
        <div className="ui-empty">
          <span className="ui-empty__title">{t('pc1.error.title')}</span>
          <span>{t(key)}</span>
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
    const timeless = preset?.timeless?.mode === 'exact'
    return (
      <>
        {again}
        <div className="ui-empty">
          <span className="ui-empty__title">{t('pc1.empty.title')}</span>
          <span>{t(timeless ? 'pc1.timeless.noExact' : 'pc1.empty.text')}</span>
          <div className="pc-btns">
            <button type="button" className="ui-btn ui-btn--primary" onClick={loosen}>
              {t('pc1.empty.loosen')}
            </button>
          </div>
        </div>
      </>
    )
  }
  if (phase === 'result' && result) {
    return (
      <>
        {again}
        {result.kind === 'trade' ? (
          <TradeResult result={result} simple={simple} lang={lang} t={t} />
        ) : (
          <BulkResult result={result} lang={lang} t={t} />
        )}
      </>
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

export function PriceWindow({ captured, onClose }: { captured: CapturedItem; onClose: () => void }) {
  const t = useOverlayT()
  const lang = useOverlayStore((s) => s.lang)
  const item = usePriceCheckStore((s) => s.item)
  const simple = usePriceCheckStore((s) => s.simple)
  const presets = usePriceCheckStore((s) => s.presets)
  const activeId = usePriceCheckStore((s) => s.activePreset)
  const league = usePriceCheckStore((s) => s.league)
  const leagues = usePriceCheckStore((s) => s.leagues)
  const result = usePriceCheckStore((s) => s.result)
  const phase = usePriceCheckStore((s) => s.phase)
  const { search, setPreset, setLeague } = usePriceCheckStore.getState()
  const preset = presets.find((p) => p.id === activeId) ?? presets[0]
  const expert = !simple

  return (
    <section className={`ui-panel pc${expert ? ' is-expert' : ''}`}>
      {/* шапка — ручка перетаскивания окна (S1, OverlayWidget); кнопки и select в ней не тащат */}
      <header className="ui-panel__head" data-drag-handle>
        <span className="ui-panel__title">{t('pc1.title')}</span>
        {leagues.length > 0 && (
          <select
            className="ui-select pc-league"
            aria-label={t('pc1.league')}
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            {...inputProps}
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>
                {l.text}
              </option>
            ))}
          </select>
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
                  {t(PRESET_KEYS[p.id] ?? p.id)}
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
      </div>
      <PriceActions result={result} title={searchTitle(captured, item)} t={t} />
    </section>
  )
}

const LIVE_ERROR_KEYS: Record<LiveAddError, string> = {
  duplicate: 'pc1.live.duplicate',
  exchange: 'pc1.live.exchange',
  poe2: 'pc1.live.fail',
  'bad-url': 'pc1.live.fail'
}

/** Кнопки окна цены: трейд-окно (S5), избранное (S5), live search по этому запросу (S6). */
function PriceActions({ result, title, t }: { result: PcResult | undefined; title: string; t: T }) {
  const [saved, setSaved] = useState<ActionState>('idle')
  const [live, setLive] = useState<ActionState>('idle')
  const [liveError, setLiveError] = useState<LiveAddError | null>(null)
  const siteUrl = result?.siteUrl
  // новый поиск — новые кнопки
  useEffect(() => {
    setSaved('idle')
    setLive('idle')
    setLiveError(null)
  }, [siteUrl])
  const search = siteUrl ? parseTradeUrl(siteUrl) : null
  const bulk = result?.kind === 'bulk'

  const save = async (): Promise<void> => {
    if (!search?.slug || saved === 'busy' || saved === 'done') return
    setSaved('busy')
    const fav = await window.overlayApi.fav
      .add({ title, game: 'poe1', type: search.type, slug: search.slug, league: search.league })
      .catch(() => null)
    setSaved(fav ? 'done' : 'fail')
  }
  const watch = async (): Promise<void> => {
    if (!siteUrl || bulk || live === 'busy' || live === 'done') return
    setLive('busy')
    const r = await window.overlayApi.live.add(siteUrl, title).catch(() => null)
    if (r?.ok) return setLive('done')
    setLiveError(r ? r.error : null)
    setLive('fail')
  }
  const liveText =
    live === 'done' ? t('pc1.live.done') : live === 'fail' ? t(liveError ? LIVE_ERROR_KEYS[liveError] : 'pc1.live.fail') : t('pc1.live')

  return (
    <footer className="ui-panel__foot">
      <button
        type="button"
        className="ui-btn ui-btn--primary"
        title={t('pc1.open.help')}
        disabled={!siteUrl}
        onClick={() => siteUrl && openInTradeWindow({ url: siteUrl })}
      >
        <Icon name="external" />
        {t('pc1.open')}
      </button>
      <button
        type="button"
        className="ui-btn"
        title={t('pc1.save.help')}
        disabled={!search?.slug || saved === 'busy'}
        aria-pressed={saved === 'done'}
        onClick={() => void save()}
      >
        <Icon name={saved === 'done' ? 'check' : 'star'} />
        {saved === 'done' ? t('pc1.save.done') : saved === 'fail' ? t('pc1.save.fail') : t('pc1.save')}
      </button>
      <button
        type="button"
        className="ui-btn ui-btn--live"
        title={bulk ? t('pc1.live.exchange') : t('pc1.live.help')}
        disabled={!siteUrl || bulk || live === 'busy'}
        aria-pressed={live === 'done'}
        onClick={() => void watch()}
      >
        <Icon name={live === 'done' ? 'check' : 'bolt'} />
        {liveText}
      </button>
    </footer>
  )
}
