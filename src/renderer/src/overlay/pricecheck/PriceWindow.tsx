import { useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import type { CapturedItem, GameInputResult, UiLang } from '@shared/types'
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
import { Icon, type IconName } from '../Icon'
import { useOverlayStore } from '../../store/useOverlayStore'
import { useOverlayT } from '../useOverlayT'
import { PopupPositionButton } from '../PopupPosition'
import { activePresetOf, usePriceCheckStore, type PcResult } from './store'
import { ageKey, currencyLabel, fmtNum, tierWordKey } from './format'
import { modText, modTextParts } from '@shared/poe1/pricecheck/filters/mod-text'
import { CoinIcon, Currency, CurrencyTipBody, RateTipBody, TipAnchor, useCurrencyNames } from '../../components/Currency'
import type { RuCase } from '@shared/currency'
import { convertPrice, rateFractions, roundChaos } from '@shared/poe1/pricecheck/currency'
import { createClickGuard, lotActions, whisperCommand } from '@shared/poe1/pricecheck/lotActions'
import type { Verdict, VerdictKind } from '@shared/poe1/pricecheck/verdict'
import { VISIBLE_WARNINGS, type PriceWarning } from '@shared/poe1/pricecheck/warnings'
import { compareLot, type LotComparison } from '@shared/poe1/pricecheck/compare'
import { Select } from '../../components/Select'
import { LotCard } from './LotCard'

// Окно цены PoE1 по утверждённому макету (docs/design-system.md, классы ui-*): шапка с лигой, предмет,
// свойства и псевдо-статы с галочками, фильтры предмета, вердикт и предупреждения (S15), сводка «честной
// цены», предложения, кнопки.
// Состояния: загрузка / результат / лимит с отсчётом / нет совпадений / проверка сайта (+ ошибка).

type T = (key: string, params?: Record<string, string | number>) => string

const SHOW_LISTINGS = 5

/** Поля ввода и списки в пассивном оверлее: активировать оверлей (иначе клавиатура уйдёт в игру). */
const activateOverlay = (): void => void window.overlayApi.overlay.activate()
const inputProps = {
  onMouseDown: activateOverlay,
  onClick: (e: MouseEvent) => e.stopPropagation()
}

function openExternal(url: string): void {
  window.overlayApi.window.openExternal(url)
}

/** Трейд-окно S5 вместо системного браузера: поиск по адресу или конкретный лот. */
function openInTradeWindow(target: TradeWindowTarget): void {
  void window.overlayApi.tradeWindow.open({ game: 'poe1', ...target })
}

const LOT_RARITY = new Set(['normal', 'magic', 'rare', 'unique'])

/**
 * «Открыть лот»: трейд-окно поверх игры на этом лоте — исходный поиск окна (его сайт уже принял, лот в
 * выдаче), суженный до продавца и ilvl лота (S21: в rc.7 запрос с именем редкого сайт отвергал). Не вышло
 * сузить — исходный поиск как есть (url). Лигу берём из окна: длинные id поиска адрес избранного не разбирает.
 */
function openListing(l: Poe1Listing, siteUrl: string, league: string, query: unknown): void {
  if (!l.baseType || !league) return openInTradeWindow({ url: siteUrl })
  const rarity = l.rarity && LOT_RARITY.has(l.rarity) ? (l.rarity as 'normal' | 'magic' | 'rare' | 'unique') : undefined
  openInTradeWindow({
    lot: { account: l.accountName, name: l.itemName, typeLine: l.baseType, ilvl: l.itemLevel, rarity },
    query: typeof query === 'object' && query !== null ? (query as Record<string, unknown>) : undefined,
    url: siteUrl,
    league
  })
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

/** «34 c ≈ 0.10 div» / «1.5 div ≈ 507 c» — подсказка к цене по курсу фида обмена. */
function conversionTitle(price: Poe1Price, rate: number | undefined, lang: UiLang, t: T): string | undefined {
  const other = convertPrice(price, rate)
  if (!other) return undefined
  return price.currency === 'chaos'
    ? t('pc1.conv.toDiv', { c: fmtNum(price.amount, lang), d: fmtDiv(other.amount, lang) })
    : t('pc1.conv.toChaos', { d: fmtNum(price.amount, lang), c: fmtNum(other.amount, lang) })
}

function fmtDiv(v: number, lang: UiLang): string {
  const s = v < 10 ? v.toFixed(2) : String(v)
  return lang === 'ru' ? s.replace('.', ',') : s
}

/** Цена с иконкой и подсказкой (там же — перевод в другую валюту по курсу); full — полное название (простой режим). */
function Price({ price, lang, full = false }: { price: Poe1Price; lang: UiLang; full?: boolean }) {
  const t = useOverlayT()
  const rate = usePriceCheckStore((s) => s.rate?.chaosPerDivine)
  const conv = conversionTitle(price, rate, lang, t)
  return (
    <Currency tag={price.currency} text={fmtNum(price.amount, lang)} full={full} lang={lang} className="pc-price" extra={conv && <b>{conv}</b>} />
  )
}

/** Цена текстом: простой режим — полное название с падежом («за ~14 Сфер хаоса»), эксперт — «14 c». */
type PriceText = (p: Poe1Price, c?: RuCase) => string
function usePriceText(lang: UiLang): PriceText {
  const simple = usePriceCheckStore((s) => s.simple)
  const names = useCurrencyNames(lang)
  return (p, c = 'nom') => {
    const n = fmtNum(p.amount, lang)
    return `${n} ${simple ? names.after(p.currency, n, c) : currencyLabel(p.currency)}`
  }
}

/** Плашка курса «1 div = N c»; при наведении — что такое курс, дроби 0.1…1 div, сленг. Без курса не показывается. */
function RateBadge({ lang, t }: { lang: UiLang; t: T }) {
  const rate = usePriceCheckStore((s) => s.rate)
  if (!rate) return null
  const rows = rateFractions(rate.chaosPerDivine)
  const n = fmtNum(roundChaos(rate.chaosPerDivine), lang)
  return (
    <TipAnchor
      className="pc-rate"
      focusable
      tip={
        <RateTipBody
          rate={rate.chaosPerDivine}
          text={n}
          lang={lang}
          extra={
            <>
              <span className="pc-rate__rows">
                {rows.map((r) => (
                  <span key={r.div}>
                    {fmtNum(r.div, lang)} div = {fmtNum(r.chaos, lang)} c
                  </span>
                ))}
              </span>
              <span className="pc-rate__src">{t('pc1.rate.src', { league: rate.league })}</span>
            </>
          }
        />
      }
    >
      <CoinIcon tag="divine" lang={lang} />
      {t('pc1.rate', { n })}
    </TipAnchor>
  )
}

/** Кнопка «Искать заново»: фильтры изменились — видна внизу окна всегда (липкая), плюс Enter. */
function SearchAgainBar({ t }: { t: T }) {
  const dirty = usePriceCheckStore((s) => s.dirty)
  const phase = usePriceCheckStore((s) => s.phase)
  const search = usePriceCheckStore((s) => s.search)
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

function ModRow({ f, rawText, expert, lang, t }: { f: StatFilter; rawText: string; expert: boolean; lang: UiLang; t: T }) {
  const touch = usePriceCheckStore((s) => s.touch)
  const pseudo = f.tag === 'pseudo'
  const tier = f.sources[0]?.modifier.info.tier
  // свойства предмета (броня, DPS, IIQ карты…) в данных — английские ключи; переводим по trade id
  const propKey = `pc1.prop.${f.tradeId[0]}`
  const propText = f.tag === 'property' || f.tradeId[0]?.startsWith('item.') ? t(propKey) : undefined
  // S23: как в игре — «Adds 3 to 34 …», «+40 to …»; среднее «от # до #» (его ищет фильтр) — приглушённо
  const shown = modText(propText && propText !== propKey ? propText : f.text, f.statRef, f.roll?.value, f.sources, rawText)
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
        <span className="pc-status">
          <span className="ui-label">{t('pc1.seller')}</span>
          {/* S21: свой список вместо нативного — тёмный, с подсказкой к каждому пункту (что за статус сайта) */}
          <Select<TradeStatus>
            value={status}
            label={t('pc1.seller')}
            options={TRADE_STATUSES.map((s) => ({ value: s, label: t(`pc1.status.${s}`), hint: t(`pc1.status.${s}.hint`) }))}
            onChange={setStatus}
            onOpen={activateOverlay}
          />
        </span>
      </div>
    </>
  )
}

// ---------------------------------------------------------------- результаты

function GroupLine({ kind, g, lang, t }: { kind: 'instant' | 'person'; g: PriceGroupSummary; lang: UiLang; t: T }) {
  const simple = usePriceCheckStore((s) => s.simple)
  const priceText = usePriceText(lang)
  return (
    <div className="pc-group" data-kind={kind}>
      <span className={`ui-tag ui-tag--${kind === 'instant' ? 'merchant' : 'person'}`}>{t(`pc1.summary.${kind}`)}</span>
      {g.min ? (
        <span className="pc-group__price">
          <Price price={g.min} lang={lang} full={simple} />
          {g.median && g.count > 1 && (
            <>
              {' '}
              <span className="pc-group__median">· {t('pc1.summary.median', { price: priceText(g.median) })}</span>
            </>
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
  const priceText = usePriceText(lang)
  const { instant, person } = result.honest
  const outliers = instant.outliers.length + person.outliers.length
  return (
    <div className="ui-hint">
      <Icon name="help" />
      <span>
        <b>{t('pc1.why.title')}</b> {t('pc1.why.search', { range, n: result.total })}
        {instant.min && <> {t('pc1.why.instant', { price: priceText(instant.min, 'gen') })}</>}
        {person.min && <> {t('pc1.why.person', { price: priceText(person.min, 'gen') })}</>}
        {outliers > 0 && <> {t('pc1.why.outliers', { n: outliers })}</>}
      </span>
    </div>
  )
}

/** Одна защита на окно: двойной клик по «Написать» (даже по разным лотам) — одно сообщение. */
const writeGuard = createClickGuard()

type WriteNote = { ok: true; sent: boolean } | { ok: false; reason: Exclude<GameInputResult, 'ok'>; copied: boolean }

/** S21: строка лота знает о своей карточке: наведение/фокус — показать, клик/Enter по «похоже» — закрепить. */
interface LotCardProps {
  cmp?: LotComparison
  cardId: string
  /** карточка этого лота сейчас на экране */
  shown: boolean
  pinned: boolean
  onShow: (el: HTMLElement) => void
  onHide: () => void
  onTogglePin: (el: HTMLElement) => void
}

/** Элементы строки со своим действием: клик по ним не закрепляет карточку. */
const OWN_CLICK = 'button, a, input, [data-tip]'

function ListingRow({
  l,
  siteUrl,
  query,
  card,
  lang,
  t
}: {
  l: Poe1Listing
  siteUrl: string
  query: unknown
  card: LotCardProps
  lang: UiLang
  t: T
}) {
  const sendWhisper = usePriceCheckStore((s) => s.sendWhisper)
  const league = usePriceCheckStore((s) => s.league)
  const simple = usePriceCheckStore((s) => s.simple)
  const rowRef = useRef<HTMLDivElement>(null)
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

  // «Написать»: готовый whisper из ответа fetch → чат игры (S1 typeInChat сам вернёт фокус игре);
  // ввод в игру недоступен — тот же текст в буфер обмена
  const write = async (): Promise<void> => {
    const cmd = whisperCommand(l, sendWhisper)
    if (!cmd || !writeGuard()) return
    const res = await window.overlayApi.overlay.typeInChat(cmd.text, { send: cmd.send }).catch((): GameInputResult => 'no-input')
    if (res === 'ok') return setNote({ ok: true, sent: cmd.send })
    const copied = await window.overlayApi.trade.copyText(cmd.text).catch(() => false)
    setNote({ ok: false, reason: res, copied })
  }
  const open = (): void => openListing(l, siteUrl, league, query)
  const { cmp } = card
  const toggle = (): void => {
    if (rowRef.current) card.onTogglePin(rowRef.current)
  }
  const simShort = cmp && cmp.total > 0 ? `${cmp.matched}/${cmp.total}` : ''

  return (
    <div
      ref={rowRef}
      className={`ui-listing pc-lot${card.shown ? ' is-shown' : ''}${card.pinned ? ' is-pinned' : ''}`}
      onMouseEnter={cmp ? (e) => card.onShow(e.currentTarget) : undefined}
      onMouseLeave={cmp ? card.onHide : undefined}
      onFocus={cmp ? (e) => card.onShow(e.currentTarget) : undefined}
      onBlur={cmp ? (e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && card.onHide() : undefined}
      onClick={cmp ? (e) => !(e.target as Element).closest(OWN_CLICK) && toggle() : undefined}
      onKeyDown={
        cmp
          ? (e) => {
              if (e.key === 'Escape' && card.pinned) {
                e.preventDefault()
                e.stopPropagation()
                toggle()
              }
            }
          : undefined
      }
    >
      <span className="ui-listing__price">{l.price ? <Price price={l.price} lang={lang} /> : '—'}</span>
      <span className="ui-listing__meta">
        <span className="ui-listing__who">
          <span
            className={`ui-tag ui-tag--${acts.buyout ? 'merchant' : 'person'}`}
            title={t(acts.buyout ? 'pc1.tag.buyout.help' : 'pc1.tag.person.help')}
          >
            {t(acts.buyout ? 'pc1.tag.buyout' : 'pc1.tag.person')}
          </span>{' '}
          {l.characterName || l.accountName}
        </span>
        <span>
          {status}
          {age && <> · {t(age[0], age[1])}</>}
          {cmp && (
            <>
              {' · '}
              {/* «похоже 4/6» — и сводка, и кнопка карточки для клавиатуры (Tab → видно, Enter → закрепить) */}
              <button
                type="button"
                className="pc-sim"
                data-full={(cmp.total > 0 && cmp.matched === cmp.total) || undefined}
                aria-expanded={card.pinned}
                aria-controls={card.shown ? card.cardId : undefined}
                aria-describedby={card.shown ? card.cardId : undefined}
                title={t('pc1.lot.sim.help')}
                onClick={toggle}
              >
                <Icon name="layers" />
                {simShort ? (simple ? t('pc1.lot.sim', { n: cmp.matched, m: cmp.total }) : simShort) : t('pc1.lot.item')}
              </button>
            </>
          )}
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
          // без активации оверлея на отпускании кнопки: фокус остаётся у игры, текст уходит в её чат
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
        {acts.primary === 'open' ? (
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--primary"
            title={t(acts.buyout ? 'pc1.lot.open.buyout.help' : 'pc1.lot.open.help')}
            onClick={open}
          >
            <Icon name="external" />
            {t('pc1.lot.open')}
          </button>
        ) : (
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--icon"
            title={t('pc1.lot.open.help')}
            aria-label={t('pc1.lot.open')}
            onClick={open}
          >
            <Icon name="external" />
          </button>
        )}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- вердикт и предупреждения (S15)

const VERDICT_ICON: Record<VerdictKind, IconName> = {
  none: 'search',
  valuable: 'star',
  few: 'help',
  junk: 'trash',
  cheap: 'coins',
  list: 'coins'
}

/** Цвет плашки: «выставить» — зелёный, «ценная» — золото, «хлам/дешёвка» — приглушённый, прочее — синий. */
const VERDICT_TONE: Record<VerdictKind, string> = {
  none: 'info',
  valuable: 'accent',
  few: 'info',
  junk: 'muted',
  cheap: 'muted',
  list: 'good'
}

function verdictText(
  v: Verdict,
  ctx: { bulk: boolean; timeless: boolean; noMods?: boolean; one: string },
  priceText: PriceText,
  t: T
): { title: string; sub?: string; help?: string } {
  const price = v.price ? priceText(v.price) : ''
  switch (v.kind) {
    case 'none':
      return {
        title: t('pc1.v.none'),
        // снимать галочки есть смысл, только если есть свойства; у timeless — подсказка про сид
        sub: t(ctx.timeless ? 'pc1.timeless.noExact' : ctx.bulk || ctx.noMods ? 'pc1.v.none.later' : 'pc1.v.none.sub')
      }
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
        sub: v.caution
          ? t('pc1.v.caution')
          : v.reason === 'spread' && v.range
            ? t('pc1.v.valuable.spread', { min: priceText(v.range.min, 'gen'), max: priceText(v.range.max, 'gen') })
            : v.reason === 'few'
              ? t('pc1.v.valuable.few', { price, n: v.count })
              : t('pc1.v.valuable.div', { price: v.price ? priceText(v.price, 'gen') : '' }),
        help: t('pc1.v.valuable.help')
      }
    case 'list':
      // откуда цена — уже в «Почему такая цена?», здесь только в подсказке: окно не растёт
      return {
        title: t(ctx.bulk ? 'pc1.v.list.each' : 'pc1.v.list', { price: v.price ? priceText(v.price, 'acc') : '' }),
        sub: v.caution ? t('pc1.v.caution') : undefined,
        help: t(ctx.bulk ? 'pc1.v.list.bulk' : 'pc1.v.list.sub')
      }
  }
}

/** «Скопировать заметку цены»: `~price X chaos` в буфер — игрок сам вставит её в заметку предмета в игре. */
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

/** Вердикт — одна плашка над ценами; в экспертном режиме пояснение уходит в подсказку «?». */
function VerdictPlate({
  v,
  bulk,
  timeless,
  noMods,
  simple,
  lang,
  t
}: {
  v: Verdict
  bulk: boolean
  timeless: boolean
  noMods?: boolean
  simple: boolean
  lang: UiLang
  t: T
}) {
  const priceText = usePriceText(lang)
  const names = useCurrencyNames(lang)
  // «меньше 1 Сферы хаоса» / «less than 1 Chaos Orb»; эксперт — «1 c»
  const one = simple ? `1 ${names.after('chaos', 1, 'gen')}` : '1 c'
  const { title, sub, help } = verdictText(v, { bulk, timeless, noMods, one }, priceText, t)
  const tip = simple ? help : [sub, help].filter(Boolean).join(' ')
  return (
    <div className={`pc-verdict pc-verdict--${v.caution ? 'info' : VERDICT_TONE[v.kind]}`} role="status" data-kind={v.kind}>
      <Icon name={VERDICT_ICON[v.kind]} />
      <span className="pc-verdict__text">
        <b className="pc-verdict__title">{title}</b>
        {simple && sub && <span className="pc-verdict__sub">{sub}</span>}
        {/* простой режим: кнопка с подписью под пояснением — длинная RU-подпись не сжимает текст */}
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

/** Предупреждения «цена может быть не про ваш предмет»: важные сверху, больше двух — под «Ещё N». */
function WarningList({ list, t }: { list: PriceWarning[]; t: T }) {
  const [open, setOpen] = useState(false)
  if (!list.length) return null
  const rest = list.length - VISIBLE_WARNINGS
  const shown = open || rest <= 0 ? list : list.slice(0, VISIBLE_WARNINGS)
  return (
    <div className="pc-warns" role="list">
      {shown.map((w) => (
        <div className="pc-warn" role="listitem" key={w.key}>
          <Icon name="warn" />
          <span>{t(w.key, w.params)}</span>
          {w.help ? (
            <span className="ui-q" title={t(w.help)}>
              ?
            </span>
          ) : (
            <span />
          )}
        </div>
      ))}
      {rest > 0 && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm pc-warns__more" onClick={() => setOpen((o) => !o)}>
          <Icon name={open ? 'chev-d' : 'chev-r'} />
          {open ? t('pc1.warn.less') : t('pc1.warn.more', { n: rest })}
        </button>
      )}
    </div>
  )
}

/** Карточка на экране: лот и строка, напротив которой она стоит. */
type CardAt = { id: string; el: HTMLElement }

function TradeResult({ result, simple, lang, t }: { result: Extract<PcResult, { kind: 'trade' }>; simple: boolean; lang: UiLang; t: T }) {
  const [all, setAll] = useState(false)
  const mine = usePriceCheckStore((s) => s.mine)
  const readLotValue = usePriceCheckStore((s) => s.readLotValue)
  // наведение/фокус показывает карточку лота, клик закрепляет; наведение на другой лот закреплённую подменяет
  const [hover, setHover] = useState<CardAt | null>(null)
  const [pinned, setPinned] = useState<CardAt | null>(null)
  const cardDomId = useId()
  const conf = result.honest.confidence
  const outliers = new Set([...result.honest.instant.outliers, ...result.honest.person.outliers])
  const rows = result.listings.filter((l) => !outliers.has(l.id))
  const shown = all ? rows : rows.slice(0, SHOW_LISTINGS)
  // S21: сравнение лота с предметом игрока — из того же ответа fetch, без запросов
  const compared = useMemo(
    () => new Map(result.listings.filter((l) => l.mods).map((l) => [l.id, compareLot(mine, l.mods!, readLotValue)])),
    [result.listings, mine, readLotValue]
  )
  // новый поиск — карточки снимаем
  useEffect(() => {
    setHover(null)
    setPinned(null)
  }, [result.listings])
  const card = hover ?? pinned
  const cardLot = card ? result.listings.find((l) => l.id === card.id) : undefined
  const cardCmp = card ? compared.get(card.id) : undefined
  const cardProps = (l: Poe1Listing): LotCardProps => ({
    cmp: compared.get(l.id),
    cardId: cardDomId,
    shown: card?.id === l.id,
    pinned: pinned?.id === l.id,
    onShow: (el) => setHover({ id: l.id, el }),
    onHide: () => setHover((h) => (h?.id === l.id ? null : h)),
    onTogglePin: (el) => setPinned((p) => (p?.id === l.id ? null : { id: l.id, el }))
  })
  return (
    <>
      <VerdictPlate v={result.verdict} bulk={false} timeless={false} simple={simple} lang={lang} t={t} />
      <WarningList key={result.siteUrl} list={result.warnings} t={t} />
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
      {simple && <WhyHint result={result} lang={lang} t={t} />}
      {simple && shown.some((l) => lotActions(l).buyout) && (
        <div className="ui-hint pc-defaults">
          <Icon name="info" />
          <span>{t('pc1.buyout.hint')}</span>
        </div>
      )}
      <div className="pc-blk">
        <div className="ui-label">
          {t('pc1.listings')}
          <span className="ui-label__grow" />
          {!simple && t('pc1.listings.cols')}
        </div>
        <div className="pc-listings ui-scroll">
          {shown.map((l) => (
            <ListingRow key={l.id} l={l} siteUrl={result.siteUrl} query={result.query} card={cardProps(l)} lang={lang} t={t} />
          ))}
        </div>
        {card && cardLot && cardCmp && (
          <LotCard
            id={cardDomId}
            l={cardLot}
            cmp={cardCmp}
            anchor={card.el}
            pinned={pinned?.id === card.id}
            simple={simple}
            lang={lang}
            t={t}
          />
        )}
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

function BulkResult({ result, simple, lang, t }: { result: Extract<PcResult, { kind: 'bulk' }>; simple: boolean; lang: UiLang; t: T }) {
  const best = result.offers[0]
  const each = best ? best.exchangeAmount / best.itemAmount : 0
  const priceText = usePriceText(lang)
  const names = useCurrencyNames(lang)
  return (
    <>
      <VerdictPlate v={result.verdict} bulk timeless={false} simple={simple} lang={lang} t={t} />
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
        <span className="ui-summary__conf">{t('pc1.bulk.title')} · {t('pc1.conf.similar', { n: result.total })}</span>
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
  const phase = usePriceCheckStore((s) => s.phase)
  const result = usePriceCheckStore((s) => s.result)
  const netError = usePriceCheckStore((s) => s.netError)
  const parseError = usePriceCheckStore((s) => s.parseError)
  const retryAt = usePriceCheckStore((s) => s.retryAt)
  const simple = usePriceCheckStore((s) => s.simple)
  const search = usePriceCheckStore((s) => s.search)
  const loosen = usePriceCheckStore((s) => s.loosen)
  const preset = usePriceCheckStore((s) => activePresetOf(s))
  const now = useNow(phase === 'limit')

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
    // вердикт «таких никто не продаёт» вместо «нет совпадений»: у timeless — своя подсказка про сид;
    // «Ослабить» — только если есть включённые свойства со значениями (у опта и карточек их нет)
    const timeless = preset?.timeless?.mode === 'exact'
    const bulk = result?.kind === 'bulk'
    const noMods = result?.kind === 'trade' && result.searched.mods.all === 0
    const canLoosen =
      !bulk &&
      !!preset?.stats.some((s) => !s.group && !s.disabled && (typeof s.roll?.min === 'number' || typeof s.roll?.max === 'number'))
    return (
      <>
        <VerdictPlate
          v={{ kind: 'none', count: 0, confidence: 0 }}
          bulk={bulk}
          timeless={timeless}
          noMods={noMods}
          simple
          lang={lang}
          t={t}
        />
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
    return (
      <>
        {result.kind === 'trade' ? (
          <TradeResult result={result} simple={simple} lang={lang} t={t} />
        ) : (
          <BulkResult result={result} simple={simple} lang={lang} t={t} />
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

  // Enter — искать заново с изменёнными фильтрами (клавиши доходят до окна, когда оверлей активен)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter' || e.repeat || e.isComposing || e.defaultPrevented) return
      // Enter на кнопке (в т.ч. «похоже» у лота) и в списке — их собственное действие, не поиск
      if (e.target instanceof Element && e.target.closest('button, [role="listbox"]')) return
      const st = usePriceCheckStore.getState()
      if (!st.item || st.phase === 'loading' || st.phase === 'parsing') return
      e.preventDefault()
      void st.search()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <section className={`ui-panel pc${expert ? ' is-expert' : ''}`}>
      {/* шапка — ручка перетаскивания окна (S1, OverlayWidget); кнопки и select в ней не тащат */}
      <header className="ui-panel__head" data-drag-handle>
        <span className="ui-panel__title">{t('pc1.title')}</span>
        <RateBadge lang={lang} t={t} />
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
                  {t(PRESET_KEYS[p.id] ?? p.id)}
                </button>
              ))}
            </div>
          </div>
        )}
        {simple && preset?.defaultsHint && (
          <div className="ui-hint pc-defaults">
            <Icon name="info" />
            <span>{t(`pc1.defaults.${preset.defaultsHint}`)}</span>
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
