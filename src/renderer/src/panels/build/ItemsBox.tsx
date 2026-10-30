import { useEffect, useId, useMemo, useState } from 'react'
import type { PobStagePlan } from '@shared/pob/stages'
import type { Poe1Data } from '@shared/poe1/data'
import { localizeTradeRequest, type TradeRequest } from '@shared/poe1/pricecheck'
import { gemName, nodeByHash, nodeName } from '@shared/build/data'
import { buyFirst, itemLabels, type BuyGroup, type ItemLabel, type ItemPrice, type MarkReason } from '@shared/build/keyItems'
import { itemSearch, parsePobForTrade, similarRareSearch, type ItemSearch, type SearchLine, type SearchMode } from '@shared/build/itemTrade'
import { baseNameIn, modLineIn, statRefIn, uniqueNameIn } from '@shared/build/itemLang'
import { propKind, type PropKind } from '@shared/build/pobItem'
import { slotNeeds, type SlotNeed, type SlotNeeds } from '@shared/build/slotNeeds'
import { stageItems, stageMainGroup, type StageItem } from '@shared/build/stageItems'
import { resolvePobGem } from '@shared/build/view'
import type { GemColor, GemsData, TreeData } from '@shared/build/types'
import type { GameLang } from '@shared/types/settings'
import type { StoredBuild } from '@shared/types/build'
import { useLang, useT } from '../../i18n'
import { useGameLang } from '../../gameLang'
import { useBuildStore } from '../../store/useBuildStore'
import type { IconName } from '../../overlay/Icon'
import { BIco, slotLabel, Sock } from './ui'
import { useItemsData, type ItemsData } from './useItemsData'

// «Предметы этапа» (S40; макет v0.2, раздел 1б): что стоит у автора на этапе — уник, жёлтая, синяя или белая вещь,
// флаконы и самоцветы; метки «ключевой / важный / цель·люкс / для прокачки» с причиной; «Купить первым»;
// «Трейд» у каждой вещи (поиск в нашем трейд-окне); у уника — что нужно от слота, пока его нет, и «похожая жёлтая».
// Имена, базы и моды — на языке клиента игры (данные APT), пояснения — на языке интерфейса.

type T = ReturnType<typeof useT>

const PROP_ICON: Record<PropKind, IconName> = { life: 'heart', res: 'shield', speed: 'step', build: 'star' }
const PROP_ORDER: Record<PropKind, number> = { life: 0, res: 1, speed: 2, build: 3 }
const MODS_SIMPLE = 5
const MODS_EXPERT = 8
const JEWELS_SHOWN = 3

const LINK_SLOTS = new Set<StageItem['kind']>(['weapon', 'offhand', 'helmet', 'body', 'gloves', 'boots'])
const SOCKET_COLOR: Record<string, GemColor> = { R: 'r', G: 'g', B: 'b', W: 'w' }

/** «G-G-R B» → связанные группы цветов (одиночные гнёзда не показываем — важны связи). */
function socketsOf(sockets: string | null): GemColor[][] {
  if (!sockets) return []
  return sockets
    .split(/\s+/)
    .map((g) => g.split('-').map((c) => SOCKET_COLOR[c.toUpperCase()] ?? 'w'))
    .filter((g) => g.length >= 2)
}

function itemIcon(it: StageItem): IconName {
  if (it.info.rarity === 'unique') return 'star'
  if (it.kind === 'flask') return 'flask'
  if (it.kind === 'jewel' || it.kind === 'abyss') return 'gem'
  return 'shield'
}

function slotText(it: StageItem, t: T): string {
  if (it.kind === 'jewel') return it.slots.length > 1 ? t('bd.it.slot.jewelN', { n: it.slots.length }) : t('bd.it.slot.jewel')
  if (it.kind === 'abyss') return t('bd.it.slot.abyss')
  if (it.kind === 'flask') return t('bd.it.slot.flask')
  if (it.kind === 'ring' && it.slots.length > 1) return t('bd.it.slot.rings', { n: it.slots.length })
  return it.slots.map((s) => slotLabel(s, t)).join(' + ')
}

function priceText(p: ItemPrice, t: T): string {
  if (p.div >= 1) return t('bd.it.price.div', { n: p.div >= 10 ? Math.round(p.div) : Math.round(p.div * 10) / 10 })
  return t('bd.it.price.chaos', { n: p.chaos < 1 ? '< 1' : Math.round(p.chaos) })
}

/** Причина метки одной строкой (на языке интерфейса; имена — на языке клиента). */
function reasonText(r: MarkReason, t: T, lang: 'ru' | 'en', gameLang: GameLang, gems: GemsData | null, tree: TreeData | null): string {
  switch (r.id) {
    case 'source': {
      const gem = r.gem ? resolvePobGem(gems, r.gem) : null
      return t('bd.it.why.source', { gem: gem ? gemName(gem, gameLang) : (r.gem?.nameSpec ?? '') })
    }
    case 'trigger':
      return t('bd.it.why.trigger')
    case 'no-path': {
      const names = r.nodes
        .map((h) => (tree ? nodeByHash(tree, h) : null))
        .filter((n) => n && n.kind !== 'normal')
        .slice(0, 3)
        .map((n) => nodeName(n!, gameLang))
      return t('bd.it.why.noPath', { nodes: names.join(', ') || String(r.nodes.length) })
    }
    case 'forbidden': {
      if (!r.notable) return t('bd.it.why.forbiddenAny')
      const node = tree ? [...tree.nodes.values()].find((n) => n.en === r.notable) : null
      return t('bd.it.why.forbidden', { notable: node ? nodeName(node, gameLang) : r.notable })
    }
    case 'list':
      return lang === 'ru' ? r.ru : r.en
    case 'manual':
      return t('bd.it.why.manual')
    case 'stages':
      return t('bd.it.why.stages')
    case 'notes':
      return t('bd.it.why.notes')
    case 'mod':
      return t(`bd.it.why.mod.${r.what}`)
    case 'fulldps':
      return t('bd.it.why.fulldps')
    case 'last-set':
      return t('bd.it.why.lastSet')
    case 'notes-luxury':
      return t('bd.it.why.notesLuxury')
    case 'price':
      return t('bd.it.why.price')
    case 'leveling-sets':
      return r.until ? t('bd.it.why.levelingUntil', { n: r.until }) : t('bd.it.why.levelingSets')
  }
}

function needText(n: SlotNeed, t: T): string {
  switch (n.id) {
    case 'res':
      if (n.sum) return t('bd.it.need.resSum', { n: n.value })
      return t('bd.it.need.res', {
        list: (['fire', 'cold', 'lightning', 'chaos'] as const)
          .filter((e) => n.res?.[e])
          .map((e) => t(`bd.it.el.${e}`, { n: n.res?.[e] ?? 0 }))
          .join(', ')
      })
    case 'attr':
      return (['str', 'dex', 'int'] as const)
        .filter((a) => n.attr?.[a])
        .map((a) => t('bd.it.need.attr', { attr: t(`bd.it.attr.${a}`), n: n.attr?.[a] ?? 0, have: n.gap?.[a]?.have ?? 0, req: n.gap?.[a]?.req ?? 0 }))
        .join('; ')
    case 'life':
      return t('bd.it.need.life', { n: n.value })
    case 'es':
      return t('bd.it.need.es', { n: n.value })
    case 'speed':
      return t('bd.it.need.speed', { n: n.value })
    case 'spell':
      return t('bd.it.need.spell', { n: n.value })
    case 'dmg':
      return n.dmg === 'attack' ? t('bd.it.need.dmg.attack') : t('bd.it.need.dmg.spell')
    case 'links':
      return t('bd.it.need.links', { n: n.value })
  }
}

function lineText(l: SearchLine, t: T, game: Poe1Data | null): { icon: IconName; text: string } {
  switch (l.kind) {
    case 'name':
      return { icon: 'search', text: t('bd.it.tt.name', { name: uniqueNameIn(l.name, game) }) }
    case 'type':
      return { icon: 'search', text: t('bd.it.tt.type', { base: baseNameIn(l.base, game) }) }
    case 'category': {
      const key = `bd.it.cat.${l.category}`
      const cat = t(key)
      return { icon: 'search', text: t('bd.it.tt.cat', { cat: cat === key ? l.category : cat }) }
    }
    case 'stat':
      return { icon: l.prop ? PROP_ICON[l.prop] : 'dash', text: statRefIn(l.ref, l.min, game) }
    case 'links':
      return { icon: 'link', text: t('bd.it.tt.links', { n: l.min }) }
    case 'level':
      return { icon: 'dash', text: t('bd.it.tt.level', { n: l.max }) }
  }
}

/** Поиск — в наше трейд-окно (main строит адрес текущей лиги); для ru.pathofexile.com — русские имена. */
function openSearch(s: ItemSearch, site: Poe1Data | null): void {
  const body = site ? localizeTradeRequest(s.body as unknown as TradeRequest, site) : s.body
  void window.overlayApi.tradeWindow.open({ game: 'poe1', query: body as unknown as Record<string, unknown> })
}

type TipMode = SearchMode | 'sim'

function TradeButton({
  search,
  mode,
  label,
  primary,
  ghost,
  data,
  expert
}: {
  search: ItemSearch | null
  mode: TipMode
  label: string
  primary?: boolean
  ghost?: boolean
  data: ItemsData
  expert: boolean
}) {
  const t = useT()
  const id = useId()
  const [tip, setTip] = useState(false)
  const [sent, setSent] = useState(false)
  useEffect(() => {
    if (!sent) return
    const h = setTimeout(() => setSent(false), 2000)
    return () => clearTimeout(h)
  }, [sent])
  const title = mode === 'sim' ? t('bd.it.tt.sim') : mode === 'cheap' ? t('bd.it.tt.cheap') : t('bd.it.tt.full')
  const note = mode === 'sim' ? t('bd.it.tt.simNote') : mode === 'cheap' ? t('bd.it.tt.cheapNote') : t('bd.it.tt.fullNote')
  return (
    <span className="bd-tbtn" onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
      <button
        type="button"
        className={`ui-btn ui-btn--sm${primary ? ' ui-btn--primary' : ''}${ghost ? ' ui-btn--ghost' : ''}`}
        disabled={!search}
        title={search ? undefined : t('bd.it.trade.none')}
        aria-describedby={tip && search ? id : undefined}
        onFocus={() => setTip(true)}
        onBlur={() => setTip(false)}
        onClick={() => {
          if (!search) return
          openSearch(search, data.site)
          setSent(true)
        }}
      >
        {!ghost && <BIco name={sent ? 'check' : 'trade'} />}
        {label}
      </button>
      {tip && search && (
        <span id={id} role="tooltip" className={`ui-tip bd-ttip${expert ? ' is-ex' : ''}`}>
          <b>{sent ? t('bd.it.trade.sent') : title}</b>
          <ul>
            {search.lines.map((l, i) => {
              const x = lineText(l, t, data.game)
              return (
                <li key={i}>
                  <BIco name={x.icon} />
                  <span>{x.text}</span>
                </li>
              )
            })}
          </ul>
          {!expert && <span>{note}</span>}
        </span>
      )}
    </span>
  )
}

interface RowCtx {
  build: StoredBuild
  plan: PobStagePlan
  shown: number
  level: number
  leveling: boolean
  expert: boolean
  data: ItemsData
  labels: Map<string, ItemLabel>
  mainSlot: string | null
  mainLinks: number
  /** статы автора годятся для этого этапа (набор предметов этапа = активный в PoB) */
  stats: StoredBuild['build']['stats'] | null
  onMark: (it: StageItem, label: ItemLabel) => void
}

function ItemRow({ it, ctx }: { it: StageItem; ctx: RowCtx }) {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const gems = useBuildStore((s) => s.gems)
  const tree = useBuildStore((s) => s.tree)
  const [allMods, setAllMods] = useState(false)
  const { data, expert } = ctx
  const label = ctx.labels.get(it.key)
  const mark = label?.mark ?? null
  const key = mark === 'key'
  const unique = it.info.rarity === 'unique'
  const inMain = !!ctx.mainSlot && it.slots.includes(ctx.mainSlot)
  const links = inMain ? ctx.mainLinks : null
  const price = unique ? ctx.data.prices?.get(it.info.name) : undefined

  const parsed = useMemo(() => (data.en && !unique ? parsePobForTrade(it.info, data.en) : null), [data.en, it.info, unique])
  const name = unique ? uniqueNameIn(it.info.name, data.game) : baseNameIn(parsed?.info.refName ?? it.info.base, data.game)
  const full = useMemo(() => (data.en ? itemSearch(it.info, data.en, { level: ctx.level, links }) : null), [data.en, it.info, ctx.level, links])
  const cheap = useMemo(
    () => (data.en && !unique && !expert && full?.lines.some((l) => l.kind === 'stat') ? itemSearch(it.info, data.en, { mode: 'cheap', level: ctx.level, links }) : null),
    [data.en, it.info, ctx.level, links, unique, expert, full]
  )
  const needs: SlotNeeds | null = useMemo(
    () => (unique && !key && it.kind !== 'jewel' && it.kind !== 'abyss' && it.kind !== 'flask' ? slotNeeds({ info: it.info, kind: it.kind, level: ctx.level, stats: ctx.stats, mainLinks: links }) : null),
    [unique, key, it, ctx.level, ctx.stats, links]
  )
  const sim = useMemo(() => (needs && data.en && needs.needs.length ? similarRareSearch(it.info, it.kind, needs, data.en, { level: ctx.level }) : null), [needs, data.en, it, ctx.level])
  const hasNeeds = !!needs && needs.needs.length > 0
  const locked = it.info.levelReq !== null && it.info.levelReq > ctx.level

  const lines = [...it.info.implicits, ...it.info.explicits]
  const socketGroups = LINK_SLOTS.has(it.kind) && it.info.links >= 2 ? socketsOf(it.info.sockets) : []
  const mods = lines
    .map((m) => ({ prop: propKind(m.text), text: modLineIn(m.text, data.en, data.game) }))
    .sort((a, b) => (a.prop ? PROP_ORDER[a.prop] : 9) - (b.prop ? PROP_ORDER[b.prop] : 9))
  const cap = expert ? MODS_EXPERT : MODS_SIMPLE
  const shownMods = allMods ? mods : mods.slice(0, cap)
  const later = unique && !key && ctx.leveling && mark !== 'luxury'
  const why = label?.reason ? reasonText(label.reason, t, lang, gameLang, gems, tree) : ''

  const markBtn = (
    <button
      type="button"
      className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm bd-keym"
      aria-pressed={key}
      aria-label={t('bd.it.mark.label')}
      title={key ? t('bd.it.mark.unset') : t('bd.it.mark.set')}
      onClick={() => label && ctx.onMark(it, label)}
    >
      <BIco name="seal" />
    </button>
  )

  return (
    <div className={`bd-it${key ? ' is-key' : later ? ' is-later' : ''}`}>
      <BIco name={key ? 'seal' : itemIcon(it)} />
      <span className="bd-it__t">
        <span className="bd-it__slot">
          {slotText(it, t)}
          {unique && ` · ${baseNameIn(it.info.base, data.game)}`}
        </span>
        <b className={`ui-item ui-item--${it.info.rarity === 'normal' ? 'normal' : it.info.rarity}`} title={unique ? undefined : it.info.name}>
          {name}
        </b>
        <span className={`ui-tag bd-rar bd-rar--${it.info.rarity}`} title={expert ? undefined : t(`bd.it.rar.${it.info.rarity}.simple`)}>
          {t(`bd.it.rar.${it.info.rarity}`)}
        </span>
        {key && (
          <span className="ui-tag ui-tag--key">
            <BIco name="seal" />
            {t('bd.it.mark.key')}
          </span>
        )}
        {mark === 'important' && <span className="ui-tag ui-tag--merchant">{t('bd.it.mark.important')}</span>}
        {mark === 'luxury' && <span className="ui-tag ui-tag--person">{t('bd.it.mark.luxury')}</span>}
        {mark === 'leveling' && <span className="ui-tag">{t('bd.it.mark.leveling')}</span>}
        {later && mark !== 'leveling' && <span className="ui-tag ui-tag--person">{t('bd.it.mark.later')}</span>}
      </span>
      <span className="bd-it__acts">
        {locked && <span className="ui-tag ui-tag--warn">{t('bd.it.fromLevel', { n: it.info.levelReq ?? 0 })}</span>}
        {price && <span className="bd-price">{priceText(price, t)}</span>}
        <span className="bd-it__btns">
          <TradeButton search={full} mode="full" label={t('bd.it.trade')} primary={key} data={data} expert={expert} />
          {cheap && <TradeButton search={cheap} mode="cheap" label={t('bd.it.cheap')} ghost data={data} expert={expert} />}
          {markBtn}
        </span>
      </span>
      {(shownMods.length > 0 || socketGroups.length > 0) && (
        <span className="ui-props">
          {socketGroups.map((g, i) => (
            <Sock key={`s${i}`} colors={g} />
          ))}
          {shownMods.map((m, i) => (
            <span key={i} className={`ui-props__p${m.prop ? ` is-key is-${m.prop}` : ''}`}>
              {m.prop && <BIco name={PROP_ICON[m.prop]} />}
              {m.text}
            </span>
          ))}
          {mods.length > cap && (
            <button type="button" className="bd-link-btn bd-more" aria-expanded={allMods} onClick={() => setAllMods(!allMods)}>
              {allMods ? '−' : t('bd.it.moreMods', { n: mods.length - cap })}
            </button>
          )}
        </span>
      )}

      {key && (
        <>
          <div className="bd-key">
            <BIco name="seal" />
            <span>
              <b>{t('bd.it.key.title')}</b>
              {unique && !expert && ` ${t('bd.it.key.noSub')}`}
              <span className="bd-key__src">
                {why}
                {label?.manual === true && (
                  <>
                    {' · '}
                    <button type="button" className="bd-link-btn" onClick={() => label && ctx.onMark(it, label)}>
                      {t('bd.it.key.undo')}
                    </button>
                  </>
                )}
              </span>
            </span>
          </div>
          {unique && price && (price.tier === 'T0' || price.tier === 'T1') && (
            <div className="bd-save">
              <BIco name="coins" />
              <span>
                {t('bd.it.save')} <b>{priceText(price, t).replace('≈', '~')}</b>
                {!expert && <span> {t('bd.it.save.d')}</span>}
              </span>
            </div>
          )}
        </>
      )}
      {!key && mark && why && (
        <div className={`bd-why bd-why--${mark}`}>
          {mark === 'important'
            ? t('bd.it.why.important', { why: price?.tier === 'T0' ? `${why} · ${t('bd.it.why.expensive')}` : why })
            : mark === 'luxury'
              ? t('bd.it.why.luxury', { why })
              : t('bd.it.why.leveling', { why })}
        </div>
      )}
      {label?.manual === false && label.auto === 'key' && (
        <div className="bd-key__off">
          {t('bd.it.key.off')}{' '}
          <button type="button" className="bd-link-btn" onClick={() => ctx.onMark(it, label)}>
            {t('bd.it.key.restore')}
          </button>
        </div>
      )}
      {later && !expert && !hasNeeds && it.kind !== 'jewel' && it.kind !== 'abyss' && it.kind !== 'flask' && (
        <span className="bd-it__alt">{t('bd.it.later.hint')}</span>
      )}
      {needs && hasNeeds && (
        <div className="bd-need">
          <span className="bd-need__h">
            <BIco name="info" />
            {later && !expert ? t('bd.it.need.hLater') : t('bd.it.need.h')}
          </span>
          <span className="ui-props">
            {needs.needs.map((n, i) => (
              <span key={i} className={`ui-props__p is-key is-${n.prop}`}>
                <BIco name={PROP_ICON[n.prop]} />
                {needText(n, t)}
              </span>
            ))}
          </span>
          {needs.lose.length > 0 && (
            <span className="bd-need__lose">{t('bd.it.need.lose', { what: needs.lose.map((l) => modLineIn(l, data.en, data.game)).join('; ') })}</span>
          )}
          {!needs.exact && !expert && <span className="bd-tip">{t('bd.it.need.approx')}</span>}
          <span className="bd-need__acts">
            <TradeButton search={sim} mode="sim" label={t('bd.it.trade.sim')} data={data} expert={expert} />
            {!expert && <span className="bd-tip">{t('bd.it.need.simTip')}</span>}
          </span>
        </div>
      )}
    </div>
  )
}

export function ItemsBox({ build, plan, shown, level, expert }: { build: StoredBuild; plan: PobStagePlan; shown: number; level: number; expert: boolean }) {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const tree = useBuildStore((s) => s.tree)
  const data = useItemsData(gameLang)
  const [jewelsOpen, setJewelsOpen] = useState(false)
  const b = build.build
  const stage = plan.stages[shown]
  const items = useMemo(() => stageItems(b, plan, shown), [b, plan, shown])
  const labels = useMemo(() => itemLabels(b, plan, shown, items, { tree, prices: data.prices, marks: build.edits.marks }), [b, plan, shown, items, tree, data.prices, build.edits.marks])
  const main = useMemo(() => stageMainGroup(b, plan, shown), [b, plan, shown])
  const buy = useMemo(() => buyFirst(items, labels, level, data.prices), [items, labels, level, data.prices])
  const stats = stage && stage.items === b.activeItemSet ? b.stats : null

  const onMark = (it: StageItem, label: ItemLabel): void => {
    const marks = { ...(build.edits.marks ?? {}) }
    const now = label.mark === 'key'
    // снять: у автоматического ключевого — false; у отмеченного вручную — убрать правку; отметить — true
    if (now) {
      if (label.auto === 'key') marks[it.id] = false
      else delete marks[it.id]
    } else if (label.auto === 'key') delete marks[it.id]
    else marks[it.id] = true
    void useBuildStore.getState().setEdits({ ...build.edits, marks })
  }

  const ctx: RowCtx = {
    build,
    plan,
    shown,
    level,
    leveling: !!stage?.leveling && stage.guess.kind !== 'maps',
    expert,
    data,
    labels,
    mainSlot: main?.slot ?? null,
    mainLinks: main ? Math.min(6, main.gems.filter((g) => g.enabled).length) : 0,
    stats,
    onMark
  }

  const keys = items.filter((it) => labels.get(it.key)?.mark === 'key').length
  const uniques = items.filter((it) => it.info.rarity === 'unique' && labels.get(it.key)?.mark !== 'key').length
  const inBuy = new Set(buy.map((r) => r.key))
  const rest = items.filter((it) => !inBuy.has(it.key))
  const jewels = rest.filter((it) => it.kind === 'jewel' || it.kind === 'abyss')
  const hidden = !jewelsOpen && jewels.length > JEWELS_SHOWN ? new Set(jewels.slice(JEWELS_SHOWN).map((x) => x.key)) : new Set<string>()
  const byKey = new Map(items.map((it) => [it.key, it]))
  const group = (g: BuyGroup): StageItem[] => buy.filter((r) => r.group === g).map((r) => byKey.get(r.key) as StageItem)
  const first = [...group('key'), ...group('important')]
  const save = group('save')
  const laterRows = group('later')

  return (
    <section className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <BIco name="shield" />
          {t('bd.it.title')}
        </span>
        <span className="bd-count">{keys ? t('bd.it.count.key', { n: keys }) : t('bd.it.count')}</span>
      </div>
      {!stage || stage.items === null || items.length === 0 ? (
        <p className="bd-none">{t('bd.it.none')}</p>
      ) : (
        <>
          {!expert && (
            <div className="ui-hint bd-ihint">
              <BIco name="help" />
              <span>
                {keys > 0 && `${t('bd.it.hint.key')} `}
                {uniques > 0
                  ? `${keys ? t('bd.it.hint.uniquesKey') : ctx.leveling ? t('bd.it.hint.uniques') : t('bd.it.hint.uniquesEnd')} `
                  : keys
                    ? ''
                    : `${t('bd.it.hint.noUniques')} `}
                {t('bd.it.hint.marked')}{' '}
                {(['life', 'res', 'speed'] as const).map((p) => (
                  <span key={p} className={`ui-props__p is-key is-${p}`}>
                    <BIco name={PROP_ICON[p]} />
                    {t(`bd.it.prop.${p}`)}
                  </span>
                ))}
              </span>
            </div>
          )}
          <div className="bd-rows">
            {first.length > 0 && (
              <div className="bd-grp">
                <BIco name="seal" />
                {t('bd.it.buyFirst')}
              </div>
            )}
            {first.map((it) => (
              <ItemRow key={it.key} it={it} ctx={ctx} />
            ))}
            {save.length > 0 && (
              <div className="bd-grp">
                <BIco name="coins" />
                {t('bd.it.saveFor')}
              </div>
            )}
            {save.map((it) => (
              <ItemRow key={it.key} it={it} ctx={ctx} />
            ))}
            {laterRows.length > 0 && (
              <div className="bd-grp bd-grp--later">
                <BIco name="history" />
                {t('bd.it.laterGroup')}
              </div>
            )}
            {laterRows.map((it) => (
              <ItemRow key={it.key} it={it} ctx={ctx} />
            ))}
            {buy.length > 0 && rest.length > 0 && <div className="bd-grp bd-grp--rest">{t('bd.it.rest')}</div>}
            {rest
              .filter((it) => !hidden.has(it.key))
              .map((it) => (
                <ItemRow key={it.key} it={it} ctx={ctx} />
              ))}
            {jewels.length > JEWELS_SHOWN && (
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm bd-jewels" aria-expanded={jewelsOpen} onClick={() => setJewelsOpen(!jewelsOpen)}>
                <BIco name={jewelsOpen ? 'chev-d' : 'chev-r'} />
                {jewelsOpen ? t('bd.it.lessJewels') : t('bd.it.moreJewels', { n: jewels.length - JEWELS_SHOWN })}
              </button>
            )}
          </div>
        </>
      )}
      <div className="ui-box__foot bd-foot">
        <BIco name="history" size="sm" />
        <span>
          {data.pricesAt ? `${t('bd.it.foot.prices', { time: new Date(data.pricesAt).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) })} · ` : ''}
          {t('bd.it.foot.mark')}
        </span>
      </div>
    </section>
  )
}
