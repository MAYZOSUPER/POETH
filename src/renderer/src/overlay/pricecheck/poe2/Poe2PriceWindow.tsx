import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import type { CapturedItem, GameInputResult, LiveAddError, UiLang } from '@shared/types'
import { ItemCategory, ItemRarity, type ParsedItem } from '@shared/poe2/parser'
import { WealthButtons } from './WealthButtons'
import { FilterTag, type FilterPreset, type ItemFilters, type ListingType, type StatFilter } from '@shared/poe2/pricecheck'
import { ModifierType } from '@shared/poe2/parser/modifiers'
import type { Poe1ExchangeOffer, Poe1Listing } from '@shared/poe1/pricecheck/results'
import type { StatSource } from '@shared/poe1/parser/modifiers'
import type { VerdictKind } from '@shared/poe1/pricecheck/verdict'
import type { MarketPrice2, Verdict2 } from '@shared/poe2/pricecheck/verdict'
import { VISIBLE_WARNINGS, type PriceWarning } from '@shared/poe2/pricecheck/warnings'
import { angeConfidence } from '@shared/poe2/pricecheck/ange'
import { roundExalted } from '@shared/poe2/pricecheck/currency'
import { angeView, bulkView, rateFractions2, type AngeRowView } from '@shared/poe2/pricecheck/priceBlock'
import { hourRange } from '@shared/poe1/pricecheck/faustus'
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
import { CoinIcon, CurrencyTipBody, TipAnchor, useCurrencyNames } from '../../../components/Currency'
import { ageKey, currencyLabel, fmtNum, tierWordKey, waitClock } from '../format'
import { activePreset2Of, isWaystone, ratesOf, usePoe2PriceCheckStore as useStore, type Pc2Result } from './store'
import { Price, usePriceText, type PriceText } from './PriceText'
import { SellAnge, SellBulk2, SellTrade2 } from './SellBox2'
import { ModeSwitch } from '../SellBox'
import { usePcMode } from '../sellMode'
import './poe2.css'

// Окно цены PoE2 (S47) — то же окно поверх игры, что у PoE1 (../PriceWindow.tsx), те же классы ui-*/pc-* и строки
// pc1.*, где они одинаковы для обеих игр; своё — у PoE2: фильтры предмета (гнёзда рун, тир путевого камня, уровень
// области), база цен — exalted, поиск на trade2. Сеть — через main (тот же шлюз с лимитами). Live search и сужение
// «Открыть лот» до продавца у PoE2 пока нет: открывается весь поиск.
// S61: курс exalted ↔ divine ↔ chaos по фиду обмена GGG (плашка «1 div ≈ N ex» в шапке, пересчёт в подсказке у цены),
// валюта — «≈ N ex за штуку · у Ange» (блок AngeResult, объявления сайта — по кнопке).

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

/** S61: плашка курса «1 div ≈ N ex» в шапке; при наведении — дроби 0.1…1 div, курс chaos и откуда данные. */
function RateBadge2({ lang, t }: { lang: UiLang; t: T }) {
  const rate = useStore((s) => s.rate)
  const names = useCurrencyNames(lang)
  if (!rate) return null
  const n = fmtNum(roundExalted(rate.exaltedPerDivine), lang)
  const chaos = rate.exaltedPerChaos ? fmtNum(roundExalted(rate.exaltedPerChaos), lang) : null
  return (
    <TipAnchor
      className="pc-rate"
      focusable
      tip={
        <>
          <span className="ui-cur-tip__head">
            <CoinIcon tag="divine" lang={lang} />
            <b>{t('pc2.s61.rate.head', { div: names.after('divine', 1), n, ex: names.after('exalted', n) })}</b>
          </span>
          {chaos && <span>{t('pc2.s61.rate.chaos', { chaos: names.after('chaos', 1), n: chaos, ex: names.after('exalted', chaos) })}</span>}
          <span>{t('pc2.s61.rate.why')}</span>
          <span className="pc-rate__rows">
            {rateFractions2(rate.exaltedPerDivine).map((r) => (
              <span key={r.div}>
                {fmtNum(r.div, lang)} div ≈ {fmtNum(r.exalted, lang)} ex
              </span>
            ))}
          </span>
          <span className="pc-rate__src">{t('pc2.s61.rate.src', { league: rate.league })}</span>
        </>
      }
    >
      <CoinIcon tag="divine" lang={lang} />
      {t('pc2.s61.rate', { n })}
    </TipAnchor>
  )
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
  const lang = useOverlayStore((s) => s.lang)
  const tier = item && isWaystone(item) ? item.mapTier : undefined
  const nameEl = (
    <span className="ov-item__name" data-rarity={item ? rarityAttr(item) : undefined} title={name}>
      {name}
    </span>
  )
  return (
    <div className="ov-item pc-item">
      {tier ? (
        <span className="pc2-name">
          {nameEl}
          <span className="ui-tier ui-tier--lg" title={t('pc2.s61.way.tierTitle')}>
            {t('pc2.s61.way.tier', { n: tier })}
          </span>
        </span>
      ) : (
        nameEl
      )}
      {base && <span className="ov-item__base">{base}</span>}
      <span className="ov-item__meta">
        {item && (
          <span>
            {t(rarityKey(item))}
            {item.itemLevel ? ` · ${t('pc1.meta.ilvl', { n: item.itemLevel })}` : ''}
            {item.gemLevel ? ` · ${t('pc1.meta.gemLevel', { n: item.gemLevel })}` : ''}
            {item.mapTier && !tier ? ` · ${t('pc2.meta.tier', { n: item.mapTier })}` : ''}
            {sockets ? ` · ${t('pc2.meta.sockets', { n: sockets })}` : ''}
            {item.isCorrupted ? ` · ${t('pc1.meta.corrupted')}` : ''}
          </span>
        )}
        <span className="ui-tag">{t('pc1.client', { lang: captured.lang.toUpperCase() })}</span>
        {/* S61: курс у Ange — здесь, а не в шапке: у PoE 2 заголовок длиннее, шапка узкая */}
        <RateBadge2 lang={lang} t={t} />
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- S61: гнёзда и руны

/**
 * «Гнёзда и руны» (.ui-runes, спецификация дизайнера, раздел 3): каждое гнездо — пилюля в порядке
 * `augmentSockets.augments`: руна (refName с «Rune») — .is-rune, ядро души, идол и прочее — .is-core, пустое — .is-empty.
 * Имя — на языке клиента из данных (EditorItem.name). Только гнёзда, которые есть у предмета (augmentSockets.current).
 */
function RunesBlock({ item, simple, t }: { item: ParsedItem; simple: boolean; t: T }) {
  // только настоящие гнёзда: EE2 добавляет и возможные по категории (у лука без гнёзд — два «пустых»)
  const current = item.augmentSockets?.current ?? 0
  const slots = current > 0 ? (item.augmentSockets?.augments ?? []).slice(0, current) : []
  if (!slots.length) return null
  return (
    <>
      <div className="pc-blk pc-blk--tight">
        <div className="ui-label">
          {t('pc2.s61.runes')}
          <span className="ui-label__grow" />
          {simple && (
            <span className="ui-q" title={t('pc2.s61.runes.help')}>
              ?
            </span>
          )}
        </div>
      </div>
      <div className="ui-runes pc2-runes">
        <div className="ui-runes__row">
          {slots.map((a, i) =>
            a ? (
              <span key={i} className={`ui-runes__slot ${/rune/i.test(a.refName) ? 'is-rune' : 'is-core'}`} title={a.name}>
                <i />
                {a.name}
              </span>
            ) : (
              <span key={i} className="ui-runes__slot is-empty">
                <i />
                {t('pc2.s61.runes.empty')}
              </span>
            )
          )}
        </div>
      </div>
    </>
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
  // S61: свойство даёт руна (не свойство базы: броня с руной — это броня предмета)
  const fromRune = f.tag === FilterTag.Augment || (f.tag !== FilterTag.Property && f.sources[0]?.modifier.info.type === ModifierType.Augment)
  const tierTag = pseudo ? (
    <span className="ui-tier">
      Σ{!expert && <em> {t('pc1.pseudoTag')}</em>}
    </span>
  ) : fromRune ? (
    <span className="ui-mod__from ui-mod__from--rune">{t('pc2.s61.rune')}</span>
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

/** Строка мода без галочки (трудность карты): текст как в игре, числа по местам. */
function plainModText(f: StatFilter, rawText: string, lang: UiLang, t: T): string {
  return modTextParts(filterModText(f, rawText, t), (n) => fmtNum(n, lang))
    .map((p) => p.text)
    .join('')
}

/**
 * S61: путевой камень (спецификация дизайнера, раздел 4): «Главное для карты» — свойства карты с галочками (по ним
 * ищут), ниже — «Трудность карты · N» бледным списком без галочек (первые 3 + «ещё N»).
 */
function WaystoneBlocks({ preset, item, expert, lang, t }: { preset: FilterPreset; item: ParsedItem; expert: boolean; lang: UiLang; t: T }) {
  useStore((s) => s.rev)
  const [all, setAll] = useState(false)
  // по одному на trade id: у EE2 «Monster Rarity» / «Monster Effectiveness» идут с trade id редких / волшебных монстров
  const ids = new Set<string>()
  const main = preset.stats.filter((f) => {
    if (f.tag !== FilterTag.Property || f.hidden || ids.has(f.tradeId[0])) return false
    ids.add(f.tradeId[0])
    return true
  })
  const hard = preset.stats.filter((f) => f.tag !== FilterTag.Property && f.tag !== FilterTag.Pseudo)
  const unknown = item.unknownModifiers.map((u) => u.text)
  const lines = [...hard.map((f) => plainModText(f, item.rawText, lang, t)), ...unknown]
  const shown = all ? lines : lines.slice(0, 3)
  return (
    <>
      {main.length > 0 && (
        <div className="pc-blk">
          <div className="ui-label">
            {t('pc2.s61.way.main')}
            <span className="ui-label__grow" />
            {!expert && (
              <span className="ui-q" title={t('pc2.s61.way.mainHelp')}>
                ?
              </span>
            )}
          </div>
          {main.map((f, i) => (
            <ModRow key={`${f.statRef}-${i}`} f={f} rawText={item.rawText} expert={expert} lang={lang} t={t} />
          ))}
        </div>
      )}
      {lines.length > 0 && (
        <div className="pc-blk pc-blk--tight">
          <div className="ui-label">{t('pc2.s61.way.hard', { n: lines.length })}</div>
          <div className="pc2-aff">
            {shown.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
            {lines.length > 3 && (
              <button type="button" className="pc2-aff__more" onClick={() => setAll((v) => !v)}>
                {all ? t('pc1.less') : t('pc2.s61.way.more', { n: lines.length - 3 })}
              </button>
            )}
          </div>
        </div>
      )}
    </>
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

function verdictText(
  v: Verdict2,
  ctx: { bulk: boolean; one: string; exchange?: boolean },
  priceText: PriceText,
  t: T
): { title: string; sub?: string; help?: string } {
  const price = v.price ? priceText(v.price) : ''
  // S61: цена у Ange — «продайте у Ange», объём — штук за час
  if (ctx.exchange && v.kind === 'list') {
    return { title: t('pc2.s61.v.sell', { price: v.price ? priceText(v.price, 'acc') : '' }), help: t('pc2.s61.v.sell.help') }
  }
  switch (v.kind) {
    case 'none':
      return { title: t('pc1.v.none'), sub: t(ctx.bulk ? 'pc1.v.none.later' : 'pc1.v.none.sub') }
    case 'few':
      return {
        title: t('pc1.v.few'),
        sub: ctx.exchange
          ? t('pc1.s24.v.few', { n: v.count, price })
          : ctx.bulk
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
      return {
        title: t(ctx.bulk ? 'pc1.v.list.each' : 'pc1.v.list', { price: v.price ? priceText(v.price, 'acc') : '' }),
        sub: v.caution ? t('pc1.v.caution') : undefined,
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

function VerdictPlate({
  v,
  bulk,
  exchange,
  simple,
  lang,
  t
}: {
  v: Verdict2
  bulk: boolean
  /** S61: цена у Ange */
  exchange?: boolean
  simple: boolean
  lang: UiLang
  t: T
}) {
  const priceText = usePriceText(lang)
  const names = useCurrencyNames(lang)
  // «меньше 1 Сферы возвышения» / «1 ex» — база цен PoE2
  const one = simple ? `1 ${names.after('exalted', 1, 'gen')}` : '1 ex'
  const { title, sub, help } = verdictText(v, { bulk, one, exchange }, priceText, t)
  const tip = simple ? help : [sub, help].filter(Boolean).join(' ')
  return (
    <div className={`pc-verdict pc-verdict--${v.caution ? 'info' : VERDICT_TONE[v.kind]}`} role="status" data-kind={v.kind}>
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

// ---------------------------------------------------------------- S61: предупреждения (как S15 у PoE 1)

/** «Цена может быть не про ваш предмет»: важные сверху, больше двух — под «Ещё N». */
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

// ---------------------------------------------------------------- результаты

function MarketSummary({ result, simple, lang, t }: { result: Extract<Pc2Result, { kind: 'trade' }>; simple: boolean; lang: UiLang; t: T }) {
  const priceText = usePriceText(lang)
  const m: MarketPrice2 | undefined = result.market
  const conf = result.honest.confidence
  return (
    <div className="ui-summary pc-summary">
      {m ? (
        <div className="pc-market">
          <span className="pc-market__label">
            {t(simple ? 'pc1.s24.market' : 'pc1.s24.market.short')}
            <span className="ui-q" title={t(m.exalted != null ? 'pc2.s61.market.help' : 'pc2.market.help')}>
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
  const v = result.verdict
  // S61: про пересчёт валют — честная строка под результатом (CurrencyNote); здесь — правило «вторая из ≥ 4 лотов выкупа»
  return (
    <div className="ui-hint">
      <Icon name="help" />
      <span>
        <b>{t('pc1.why.title')}</b> {t('pc1.why.search', { range, n: result.total })}
        {v.fair === 'second' && v.fairLots ? <> {t('pc2.s61.why.fair', { n: v.fairLots })}</> : null}
        {outliers > 0 && <> {t('pc1.why.outliers', { n: outliers })}</>}
      </span>
    </div>
  )
}

/**
 * Честная строка под результатом (спецификация дизайнера, раздел 5): курс у Ange есть — «цены в разных валютах
 * пересчитаны: 1 div ≈ N ex»; нет — «не пересчитываются, сравниваются в одной валюте» (как S47).
 */
function CurrencyNote({ lang, t }: { lang: UiLang; t: T }) {
  const rate = useStore((s) => s.rate)
  return (
    <div className="pc2-note">
      <Icon name="info" />
      <span>{rate ? t('pc2.s61.why.currency', { n: fmtNum(roundExalted(rate.exaltedPerDivine), lang) }) : t('pc2.why.currency')}</span>
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
  const selling = usePcMode((s) => s.mode) === 'sell'
  return (
    <>
      {/* S61: «Продаю» — тот же поиск, другой вывод: цена для мерчант-вкладки вместо вердикта и цены на рынке (как S50) */}
      {selling ? (
        <SellTrade2 result={result} simple={simple} lang={lang} t={t} />
      ) : (
        <VerdictPlate v={result.verdict} bulk={false} simple={simple} lang={lang} t={t} />
      )}
      <WarningList key={result.siteUrl} list={result.warnings} t={t} />
      {!selling && <MarketSummary result={result} simple={simple} lang={lang} t={t} />}
      {simple && !selling && <WhyHint result={result} t={t} />}
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
      <CurrencyNote lang={lang} t={t} />
    </>
  )
}

function BulkResult({ result, simple, lang, t }: { result: Extract<Pc2Result, { kind: 'bulk' }>; simple: boolean; lang: UiLang; t: T }) {
  const selling = usePcMode((s) => s.mode) === 'sell'
  const stack = useStore((s) => s.item?.stackSize?.value ?? 1)
  useStore((s) => s.rate)
  const view = bulkView(result.offers, ratesOf(useStore.getState()), stack)
  const priceText = usePriceText(lang)
  return (
    <>
      {selling ? (
        <SellBulk2 result={result} simple={simple} lang={lang} t={t} />
      ) : (
        <VerdictPlate v={result.verdict} bulk simple={simple} lang={lang} t={t} />
      )}
      <div className="ui-summary pc-summary">
        <div className="pc-market">
          <span className="pc-market__label">{t('pc2.s61.bulk.title')}</span>
          {view && (
            <span className="pc-market__price">
              ≈ <Price price={view.each} lang={lang} full={simple} /> <span className="pc-market__each">{t('pc2.s61.bulk.each')}</span>
            </span>
          )}
          {view && (
            <span className="pc-market__note">
              {view.stack && <>{t('pc2.s61.bulk.all', { n: stack, price: priceText(view.stack) })} · </>}
              {t('pc2.s61.bulk.by', { n: view.by })}
            </span>
          )}
        </div>
        <span className="ui-summary__conf">
          {t('pc1.bulk.title')} · {t('pc1.conf.similar', { n: result.total })}
        </span>
      </div>
      <div className="pc-blk">
        <div className="ui-label">
          {t('pc2.s61.bulk.offers')}
          <span className="ui-label__grow" />
          {simple && <span className="pc-listings__order">{t('pc2.s61.bulk.own')}</span>}
        </div>
        <OffersList offers={result.offers} lang={lang} t={t} />
      </div>
      <CurrencyNote lang={lang} t={t} />
    </>
  )
}

/** Предложения обмена trade2: валюта предложения как есть (пересчёт по курсу — в подсказке у цены). */
function OffersList({ offers, lang, t }: { offers: readonly Poe1ExchangeOffer[]; lang: UiLang; t: T }) {
  return (
    <div className="pc-listings ui-scroll">
      {offers.slice(0, 10).map((o) => (
        <div className="ui-listing" key={o.id}>
          <span className="ui-listing__price">
            <Price price={{ amount: o.exchangeAmount, currency: o.currency }} lang={lang} />
          </span>
          <span className="ui-listing__meta">
            <span className="ui-listing__who">{o.characterName || o.accountName}</span>
            <span>
              {t('pc1.bulk.rate', { n: o.itemAmount })} · {t('pc2.s61.bulk.stock', { n: o.stock })}
            </span>
          </span>
          <span />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- S61: цена у Ange

/** Рынок «за exalted / chaos / divine»: цена 1 шт. (или «1 div за N шт.»), диапазон сделок часа и объём. */
function AngeRow({ row, simple, lang, t }: { row: AngeRowView; simple: boolean; lang: UiLang; t: T }) {
  const names = useCurrencyNames(lang)
  const num = (n: number): string => n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')
  return (
    <div className="pc-fs-row">
      <span className="pc-fs-row__base">{t('pc1.s24.fs.for', { cur: simple ? names.after(row.base, 2, 'acc') : currencyLabel(row.base) })}</span>
      <span className="pc-fs-row__price">
        {row.each ? (
          <Price price={row.each} lang={lang} approx />
        ) : (
          t('pc2.s61.ange.perBase', { cur: currencyLabel(row.base), n: num(row.perBase ?? 0) })
        )}
      </span>
      <span className="pc-fs-row__note">
        {row.lo != null && row.hi != null && (
          <>{t('pc1.s24.fs.deals', { lo: fmtNum(row.lo, lang), hi: `${fmtNum(row.hi, lang)} ${currencyLabel(row.base)}` })} · </>
        )}
        {t('pc1.s24.fs.volume', { n: num(row.volume) })}
      </span>
    </div>
  )
}

/** Сфера возвышения — сама база цен PoE 2: показываем курс у Ange, а не «цену exalted в exalted». */
function ExaltedPlate({ rate, lang, t }: { rate: number; lang: UiLang; t: T }) {
  const names = useCurrencyNames(lang)
  const n = fmtNum(roundExalted(rate), lang)
  return (
    <div className="pc-verdict pc-verdict--info" role="status">
      <Icon name="coins" />
      <span className="pc-verdict__text">
        <b className="pc-verdict__title">{t('pc2.s61.v.ex')}</b>
        <span className="pc-verdict__sub">{t('pc2.s61.v.ex.sub', { div: `1 ${names.after('divine', 1)}`, ex: `${n} ${names.after('exalted', n)}` })}</span>
      </span>
      <span />
    </div>
  )
}

/**
 * S61: валюта и всё, что меняют у Ange: «≈ N ex за штуку · у Ange» по фиду обмена GGG за последний час (без запроса
 * к сайту), у стопки — сумма; рынки «за exalted / chaos / divine» — строками. Объявления сайта — свёрнуты, по кнопке.
 */
function AngeResult({ result, simple, lang, t }: { result: Extract<Pc2Result, { kind: 'ange' }>; simple: boolean; lang: UiLang; t: T }) {
  const a = result.ange
  const view = angeView(a, result.stack)
  const conf = angeConfidence(a)
  const num = (n: number): string => n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')
  const selling = usePcMode((s) => s.mode) === 'sell'
  return (
    <>
      {view.kind === 'exalted' ? (
        <ExaltedPlate rate={a.exaltedPerDivine} lang={lang} t={t} />
      ) : selling ? (
        <SellAnge result={result} simple={simple} lang={lang} t={t} />
      ) : (
        <VerdictPlate v={result.verdict} bulk exchange simple={simple} lang={lang} t={t} />
      )}
      {view.kind !== 'exalted' && (
        <div className="ui-summary pc-summary">
          <div className="pc-market">
            <span className="pc-market__label">
              {t(view.kind === 'rate' ? 'pc2.s61.ange.titleRate' : 'pc2.s61.ange.title')}
              <span className="ui-q" title={t('pc2.s61.ange.help')}>
                ?
              </span>
            </span>
            <span className="pc-market__price">
              ≈ <Price price={view.each} lang={lang} full={simple} /> <span className="pc-market__each">{t('pc2.s61.ange.each')}</span>
            </span>
            {view.perExalted && <span className="pc-market__note">{t('pc2.s61.ange.perEx', { n: num(view.perExalted) })}</span>}
            {view.stack && (
              <span className="pc-market__stack">
                {t('pc1.s24.fs.stack', { n: result.stack })} <Price price={view.stack} lang={lang} full={simple} approx />
              </span>
            )}
            <span className="pc-market__note">
              {t(view.kind === 'rate' ? 'pc2.s61.ange.srcRate' : 'pc2.s61.ange.src', { hours: hourRange(a.hour) })}
            </span>
          </div>
          <div className="pc-fs">
            {view.rows.map((row) => (
              <AngeRow key={row.base} row={row} simple={simple} lang={lang} t={t} />
            ))}
          </div>
          <span className="ui-summary__conf">
            <span className="ui-pips">
              {[1, 2, 3, 4].map((i) => (
                <i key={i} className={i <= conf ? 'on' : undefined} />
              ))}
            </span>
            {t(`pc1.conf.${conf}`)} · {t('pc1.s24.fs.traded', { n: num(view.volume) })}
          </span>
        </div>
      )}
      {a.age > 0 && (
        <div className="ui-hint pc-defaults">
          <Icon name="info" />
          <span>{t('pc1.s24.fs.old', { n: a.age })}</span>
        </div>
      )}
      <SiteOffers result={result} lang={lang} t={t} />
    </>
  )
}

/** «Объявления на сайте (часто устаревшие)»: свёрнуты; первый раз раскрыли — один запрос обмена trade2. */
function SiteOffers({ result, lang, t }: { result: Extract<Pc2Result, { kind: 'ange' }>; lang: UiLang; t: T }) {
  const load = useStore((s) => s.loadSiteOffers)
  const site = result.site
  const [open, setOpen] = useState(site.phase !== 'idle')
  const now = useNow(open && site.phase === 'limit')
  // новый предмет — объявления не загружены: свёрнуто (сами не грузим — только по кнопке)
  useEffect(() => {
    if (site.phase === 'idle') setOpen(false)
  }, [site.phase])
  const toggle = (): void => {
    setOpen((o) => !o)
    if (!open && site.phase === 'idle') void load()
  }
  return (
    <div className="pc-blk pc-site">
      <div className="pc-site__head">
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" aria-expanded={open} onClick={toggle}>
          <Icon name={open ? 'chev-d' : 'chev-r'} />
          {t('pc1.s24.site')}
        </button>
        <span className="ui-q" title={t('pc2.s61.site.help')}>
          ?
        </span>
      </div>
      {open && site.phase === 'loading' && <span className="pc-site__note">{t('pc1.s24.site.loading')}</span>}
      {open && site.phase === 'ok' && (
        <>
          <span className="pc-site__note">
            {site.offers.length ? t('pc1.s24.site.count', { n: site.total }) : t('pc1.s24.site.empty')}
            {site.cached && <span className="ui-tag">{t('pc1.cached')}</span>}
          </span>
          {site.offers.length > 0 && <OffersList offers={site.offers} lang={lang} t={t} />}
        </>
      )}
      {open && site.phase === 'limit' && (
        <span className="pc-site__note">
          {t('pc1.s24.site.limit', { time: waitClock((site.retryAt - now) / 1000) })}{' '}
          {now >= site.retryAt && (
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => void load()}>
              <Icon name="refresh" />
              {t('pc1.s24.site.retry')}
            </button>
          )}
        </span>
      )}
      {open && site.phase === 'error' && (
        <span className="pc-site__note">
          {t('pc1.s24.site.error')} {site.error && t(...netErrorText(site.error))}{' '}
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => void load()}>
            <Icon name="refresh" />
            {t('pc1.s24.site.retry')}
          </button>
        </span>
      )}
    </div>
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
    ) : result.kind === 'ange' ? (
      <AngeResult result={result} simple={simple} lang={lang} t={t} />
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
        <span className="ui-badge" title={t('pc2.s61.badge.title')}>
          PoE 2
        </span>
        <span className="pc2-grow" />
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
        {/* S61: «Покупаю / Продаю» — выбор общий с PoE 1 (S50) */}
        <ModeSwitch t={t} />
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
            <RunesBlock item={item} simple={simple} t={t} />
            {isWaystone(item) ? (
              <WaystoneBlocks preset={preset} item={item} expert={expert} lang={lang} t={t} />
            ) : (
              <StatsBlocks preset={preset} item={item} expert={expert} lang={lang} t={t} />
            )}
            <ItemFiltersRow filters={preset.filters} item={item} t={t} />
          </>
        )}
        <Results t={t} lang={lang} />
        <SearchAgainBar t={t} />
      </div>
      <PriceActions result={result} title={searchTitle(captured, item)} league={league} t={t} item={item} captured={captured} />
    </section>
  )
}

/** Кнопки окна цены PoE2: трейд-окно на trade2 и избранное (S5). Live search у PoE2 пока нет. */
/** Ошибки live.add → подпись кнопки (тексты PoE 1, S6). */
const LIVE_ERROR_KEYS: Record<LiveAddError, string> = {
  duplicate: 'pc1.live.duplicate',
  exchange: 'pc1.live.exchange',
  poe2: 'pc1.live.fail',
  'bad-url': 'pc1.live.fail'
}

function PriceActions({
  result,
  title,
  league,
  t,
  item,
  captured
}: {
  result: Pc2Result | undefined
  title: string
  league: string
  t: T
  /** S70: предмет и текст копии — для «В богатство» / «К забегу» */
  item: ParsedItem | null
  captured: CapturedItem
}) {
  const [saved, setSaved] = useState<ActionState>('idle')
  const [live, setLive] = useState<ActionState>('idle')
  const [liveError, setLiveError] = useState<LiveAddError | null>(null)
  /** S61: после «Следить» — добавлен выключенным (предел PoE 2) или ждёт входа на сайт */
  const [liveNote, setLiveNote] = useState<{ key: string; params?: Record<string, number>; login?: boolean } | null>(null)
  const siteUrl = result?.siteUrl
  // новый поиск — новые кнопки
  useEffect(() => {
    setSaved('idle')
    setLive('idle')
    setLiveError(null)
    setLiveNote(null)
  }, [siteUrl])
  // обмен и цена у Ange live search не умеют (у сайта нет live для обмена)
  const bulk = result?.kind === 'bulk' || result?.kind === 'ange'
  // id поиска — последний сегмент адреса trade2 (/trade2/search/poe2/<лига>/<id>); у цены Ange id есть только после
  // загрузки объявлений сайта (до того — страница обмена с ?q=)
  const noId = result?.kind === 'ange' && result.site.phase !== 'ok'
  const slug = siteUrl && !noId ? decodeURIComponent(siteUrl.split('/').pop() ?? '') : ''
  const type = result?.kind === 'bulk' || result?.kind === 'ange' ? 'exchange' : 'search'

  const save = async (): Promise<void> => {
    if (!slug || saved === 'busy' || saved === 'done') return
    setSaved('busy')
    const fav = await window.overlayApi.fav.add({ title, game: 'poe2', type, slug, league }).catch(() => null)
    setSaved(fav ? 'done' : 'fail')
  }
  // S61 + S63: «Live по этому запросу» — тот же вызов, что у окна PoE 1 (лига — из ссылки trade2); находки придут тостами
  const watch = async (): Promise<void> => {
    if (!siteUrl || bulk || live === 'busy' || live === 'done') return
    setLive('busy')
    const r = await window.overlayApi.live.add(siteUrl, title).catch(() => null)
    if (!r?.ok) {
      setLiveError(r ? r.error : null)
      setLive('fail')
      return
    }
    setLive('done')
    if (!r.search.enabled) {
      const max = await window.overlayApi.live
        .state()
        .then((s) => s.max)
        .catch(() => 0)
      setLiveNote({ key: 'live.add.off', params: { max } })
    } else if (r.search.state === 'auth') setLiveNote({ key: 'pc2.s61.live.auth', login: true })
  }
  const liveText =
    live === 'done' ? t('pc1.live.done') : live === 'fail' ? t(liveError ? LIVE_ERROR_KEYS[liveError] : 'pc1.live.fail') : t('pc1.live')

  return (
    <>
      {liveNote && (
        <div className="pc2-note pc2-live-note" role="status">
          <Icon name="info" />
          <span>{t(liveNote.key, liveNote.params)}</span>
          {liveNote.login && (
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => void window.overlayApi.auth.login()}>
              <Icon name="external" />
              {t('pc2.tab.login')}
            </button>
          )}
        </div>
      )}
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
      <WealthButtons item={item} captured={captured} result={result} t={t} />
    </footer>
    </>
  )
}
