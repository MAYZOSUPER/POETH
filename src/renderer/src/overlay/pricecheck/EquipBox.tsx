import { useEffect, useMemo, useState } from 'react'
import type { ParsedItem } from '@shared/poe1/parser'
import { getDefaultPoe1DataStore, type Poe1Data, type Poe1Lang } from '@shared/poe1/data'
import { currentStage, resolveStages } from '@shared/pob/stages'
import {
  ELEMENTS,
  bestOption,
  compareEquip,
  equipItem,
  equipTargets,
  jewelIndex,
  sameItem,
  saveSlots,
  shownRows,
  totalsFromMine,
  totalsFromStats,
  type CmpRow,
  type CmpSignal,
  type EquipCompare,
  type EquipTotals,
  type TargetNote
} from '@shared/build/equipCompare'
import { guideItem, guideVerdict, type GuideVerdict } from '@shared/build/equipCompareGuide'
import type { StoredBuild } from '@shared/types/build'
import type { EquipElement, EquipEntry, EquipItem, EquipSlot, EquipState } from '@shared/types/equip'
import { tKey } from '../../i18n/hotkey'
import { useOverlayStore } from '../../store/useOverlayStore'
import { buildGuideOn } from '../leveling/buildGuide'
import { Icon, type IconName } from '../Icon'
import './equip.css'

// «Против надетого» (S41, B4; макет build-mockup «3 · Ctrl+D»): блок окна цены под названием предмета. Только PoE 1
// и только при включённой вкладке «Билд» (buildOn; dev — POETH_BUILD=1), иначе не рисуется вовсе. Считается сразу и
// без сети (equipCompare.ts), пока окно ищет цену. Надетое — то, что игрок запомнил кнопкой (userData/equipped.json,
// в main уходят только числа вещи). Итоги для «до капа»: «мои сопротивления» или расчёт автора билда в PoB.

type T = (key: string, params?: Record<string, string | number>) => string

const VERDICT: Record<EquipCompare['verdict'], { icon: IconName; tone: string; key: string }> = {
  better: { icon: 'arrow-up', tone: 'good', key: 'eq.v.better' },
  worse: { icon: 'arrow-down', tone: 'bad', key: 'eq.v.worse' },
  mixed: { icon: 'swap', tone: 'mixed', key: 'eq.v.mixed' },
  same: { icon: 'check', tone: 'same', key: 'eq.v.same' }
}

const DAY = 24 * 60 * 60 * 1000
const NO_ENTRIES: EquipEntry[] = []
/** Поле ввода в пассивном оверлее: активировать оверлей (иначе клавиатура уйдёт в игру), как в PriceWindow. */
const activateOverlay = (): void => void window.overlayApi.overlay.activate()
/** Разница со знаком: «+5», «−13» (минус — типографский, как в макете). */
const signed = (n: number, unit = ''): string => (n > 0 ? `+${n}${unit}` : n < 0 ? `−${Math.abs(n)}${unit}` : `0${unit}`)
const plain = (n: number): string => (n < 0 ? `−${Math.abs(n)}` : String(n))
const cap1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const int = (n: number): number => Math.round(n)

export function slotName(slot: EquipSlot, t: T): string {
  const j = jewelIndex(slot)
  return j !== null ? t('eq.slot.jewel', { n: j }) : t(`eq.slot.${slot.replace(/\s+/g, '')}`)
}

function freshText(at: number, now: number, t: T): string {
  const min = Math.floor((now - at) / 60000)
  if (min < 1) return t('eq.fresh.now')
  if (min < 60) return t('eq.fresh.min', { n: min })
  if (min < 60 * 24) return t('eq.fresh.h', { n: Math.floor(min / 60) })
  return t('eq.fresh.d', { n: Math.floor(min / (60 * 24)) })
}

// ---------------------------------------------------------------------------- данные

function useEquipState(on: boolean): EquipState | null {
  const [state, setState] = useState<EquipState | null>(null)
  useEffect(() => {
    const api = window.overlayApi?.equip
    if (!on || !api) return
    let alive = true
    void api
      .state()
      .then((s) => alive && setState(s))
      .catch(() => undefined)
    const off = window.overlayApi.onEquipState((s) => setState(s))
    return () => {
      alive = false
      off()
    }
  }, [on])
  return state
}

/** Активный билд вкладки (только модель: нужны <PlayerStat> и этапы). */
function useActiveBuildModel(on: boolean): StoredBuild | null {
  const [build, setBuild] = useState<StoredBuild | null>(null)
  useEffect(() => {
    const api = window.overlayApi?.build
    if (!on || !api) return
    let alive = true
    void api
      .state()
      .then((s) => alive && setBuild(s.active))
      .catch(() => undefined)
    const off = window.overlayApi.onBuildState((s) => setBuild(s.active))
    return () => {
      alive = false
      off()
    }
  }, [on])
  return build
}

/** Данные APT языка предмета — имена запомненных вещей так же, как в клиенте игры. */
function useItemData(lang: Poe1Lang): Poe1Data | null {
  const [data, setData] = useState<Poe1Data | null>(null)
  useEffect(() => {
    let alive = true
    void getDefaultPoe1DataStore()
      .ensureLanguage(lang)
      .then((d) => alive && setData(d))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [lang])
  return data
}

function itemName(e: EquipItem, data: Poe1Data | null): string {
  if (e.name) return data?.itemByRef('UNIQUE', e.name)?.[0]?.name ?? e.name
  return data?.itemByRef('ITEM', e.base)?.[0]?.name ?? e.base
}

/**
 * Итоги: «мои сопротивления» игрока; иначе расчёт автора билда — только если этап по уровню персонажа использует
 * набор вещей, для которого автор считал статы, и уровень автора не намного выше (иначе это цифры эндгейма).
 */
function useTotals(state: EquipState, build: StoredBuild | null): EquipTotals | null {
  return useMemo(() => {
    const mine = totalsFromMine(state.mine)
    if (mine) return mine
    if (!build || !Object.keys(build.build.stats).length) return null
    const b = build.build
    if (state.level !== null && b.level - state.level > 10) return null
    const { plan, index } = stageNow(build, state.level)
    const stage = index !== null ? plan.stages[index] : undefined
    if (stage && stage.items !== null && stage.items !== b.activeItemSet) return null
    return totalsFromStats(b.stats, b.level)
  }, [state.mine, state.level, build])
}

/** Этап билда по уровню персонажа из журнала (или выбранный игроком во вкладке). */
function stageNow(build: StoredBuild, level: number | null): { plan: ReturnType<typeof resolveStages>; index: number | null } {
  const plan = resolveStages(build.build, build.edits)
  return { plan, index: currentStage(plan, { level, act: null, campaignDone: false }, build.edits).index }
}

/** Второй вердикт «по гайду»: предмет этапа в этом слоте (S40) против новой и надетой вещи. */
function useGuide(
  build: StoredBuild | null,
  level: number | null,
  item: EquipItem,
  worn: readonly EquipEntry[]
): { v: GuideVerdict; stage: string } | null {
  return useMemo(() => {
    if (!build) return null
    const { plan, index } = stageNow(build, level)
    if (index === null) return null
    const g = guideItem(build.build, plan, index, item)
    const v = g ? guideVerdict(g.info, item, worn) : null
    return v ? { v, stage: plan.stages[index]?.title ?? '' } : null
  }, [build, level, item, worn])
}

// ---------------------------------------------------------------------------- тексты строк

function elName(el: EquipElement, t: T): string {
  return t(`eq.el.${el}`)
}

function phrase(s: CmpSignal, utility: boolean, t: T): string {
  const g = s.sign > 0 ? 'g' : 'l'
  if (s.row === 'res' && s.el) return t(`eq.${g}.res${s.cap ? '.cap' : ''}`, { el: elName(s.el, t) })
  if (s.row === 'flask') return t(`eq.${g}.flask${utility ? '.utility' : ''}`)
  return t(`eq.${g}.${s.row}`)
}

function whyText(cmp: EquipCompare, utility: boolean, t: T): string {
  const req = cmp.rows.find((r) => r.id === 'req' && r.hard)
  if (req?.req) {
    const gems = req.req.filter((c) => c.gems)
    const cant = req.req.filter((c) => c.ok === false && !c.gems)
    if (cant.length) return t('eq.why.cant', { what: cant.map((c) => `${t(`eq.at.${c.key}`)} ${c.need}`).join(', ') })
    return t('eq.why.gems', { what: gems.map((c) => `${t(`eq.at.${c.key}`)} ${c.gems!.after} / ${c.gems!.need}`).join(', ') })
  }
  if (cmp.verdict === 'same') return t('eq.why.same')
  const gain = cmp.gain ? phrase(cmp.gain, utility, t) : ''
  const loss = cmp.loss ? phrase(cmp.loss, utility, t) : ''
  if (cmp.verdict === 'mixed' && gain && loss) return t('eq.why.but', { gain: cap1(gain), loss })
  const main = cmp.verdict === 'better' ? gain || loss : loss || gain
  return main ? `${cap1(main)}.` : ''
}

interface RowView {
  key: string
  dir: CmpRow['dir']
  label: string
  values: string
  delta: string
  note?: string
  /** подпись строки — в обоих режимах (note у эксперта — только у потерь) */
  hint?: string
  bad?: boolean
}

export function rowView(r: CmpRow, item: EquipItem, totals: boolean, t: T): RowView {
  const base = { key: r.id, dir: r.dir }
  switch (r.id) {
    case 'req': {
      const cells = r.req ?? []
      const what = (c: (typeof cells)[number]): string => `${t(`eq.at.${c.key}`)} ${c.need}`
      const known = cells.filter((c) => c.have !== null)
      const unknown = cells.filter((c) => c.have === null)
      const parts = [
        ...known.map((c) => t('eq.req.have', { what: what(c), have: c.have! })),
        ...(unknown.length ? [t('eq.req.check', { what: unknown.map(what).join(', ') })] : [])
      ]
      const gems = cells.find((c) => c.gems)
      return {
        ...base,
        label: t('eq.row.req'),
        values: parts.join(' · ') || t('eq.req.none'),
        delta: r.hard ? '✗' : unknown.length ? '?' : '✓',
        note: gems?.gems ? t('eq.n.gems', { attr: t(`eq.at.${gems.key}`), after: gems.gems.after, need: gems.gems.need }) : undefined,
        bad: r.hard
      }
    }
    case 'res': {
      const cells = (r.res ?? []).filter((c) => c.delta !== 0 || c.overcap || !totals)
      const shown = cells.length ? cells : (r.res ?? [])
      const values = shown
        .map((c) => (totals ? `${elName(c.el, t)} ${plain(c.before)} → ${plain(c.after)}` : `${elName(c.el, t)} ${signed(c.before)} → ${signed(c.after)}`))
        .join(' · ')
      const main = [...shown].sort((a, b) => a.delta - b.delta)[0]
      const pick = main && main.delta < 0 ? main : [...shown].sort((a, b) => b.delta - a.delta)[0]
      const below = shown.filter((c) => c.belowCap).map((c) => elName(c.el, t))
      const reach = shown.filter((c) => c.reachCap).map((c) => elName(c.el, t))
      const over = shown.filter((c) => c.overcap).map((c) => elName(c.el, t))
      const notes: string[] = []
      if (below.length) notes.push(cap1(t(below.length > 1 ? 'eq.n.belowCap.many' : 'eq.n.belowCap', { el: below.join(', ') })))
      if (reach.length) notes.push(cap1(t('eq.n.reachCap', { el: reach.join(', ') })))
      if (over.length) notes.push(cap1(t('eq.n.overcap', { el: over.join(', ') })))
      return {
        ...base,
        label: t(totals ? 'eq.row.res.cap' : 'eq.row.res'),
        values,
        delta: pick && pick.delta ? `${elName(pick.el, t)} ${signed(pick.delta)}` : '0',
        note: notes.join(' ') || undefined,
        bad: below.length > 0
      }
    }
    case 'life': {
      const parts: string[] = []
      if (r.before || r.after) parts.push(`${signed(r.before)} → ${signed(r.after)}`)
      if (r.before2 !== undefined && r.after2 !== undefined)
        parts.push(t('eq.n.pct', { a: signed(r.before2), b: signed(r.after2) }))
      const delta = r.delta ? signed(r.delta) : r.before2 !== undefined && r.after2 !== undefined ? signed(r.after2 - r.before2, '%') : '0'
      return { ...base, label: t('eq.row.life'), values: parts.join(' · '), delta }
    }
    case 'dps': {
      const s = r.split
      return {
        ...base,
        label: t('eq.row.dps'),
        values: `${int(r.before)} → ${int(r.after)}`,
        delta: signed(int(r.delta)),
        note: r.caster
          ? t('eq.n.caster')
          : s && (s.edps[0] || s.edps[1])
            ? t('eq.split', { p: int(s.pdps[0]), p2: int(s.pdps[1]), e: int(s.edps[0]), e2: int(s.edps[1]) })
            : undefined,
        // фильтр окна цены считает DPS при качестве 20 % (calc-q20): у вещи с качеством ниже — там число больше
        hint: t('eq.n.dps.asIs')
      }
    }
    case 'attr': {
      const cells = r.attr ?? []
      const main = [...cells].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0]
      return {
        ...base,
        label: t('eq.row.attr'),
        values: cells.map((c) => `${t(`eq.at.${c.a}`)} ${signed(c.before)} → ${signed(c.after)}`).join(' · '),
        delta: main ? `${t(`eq.at.${main.a}`)} ${signed(main.delta)}` : '0'
      }
    }
    case 'flask': {
      const type = item.flask?.type ?? 'life'
      const sec = (n: number): string => t('eq.unit.s', { n })
      const values =
        type === 'utility'
          ? `${sec(r.before)} → ${sec(r.after)}`
          : type === 'hybrid'
            ? `${r.before} / ${r.before2 ?? 0} → ${r.after} / ${r.after2 ?? 0}`
            : `${r.before} → ${r.after}`
      return { ...base, label: t(`eq.row.flask.${type}`), values, delta: type === 'utility' ? signed(r.delta) : signed(int(r.delta)) }
    }
    case 'speed':
    case 'block':
      return { ...base, label: t(`eq.row.${r.id}`), values: `${r.before} → ${r.after}%`, delta: signed(r.delta, '%') }
    case 'mana':
      return { ...base, label: t('eq.row.mana'), values: `${signed(r.before)} → ${signed(r.after)}`, delta: signed(r.delta) }
    default:
      return { ...base, label: t(`eq.row.${r.id}`), values: `${r.before} → ${r.after}`, delta: signed(int(r.delta)) }
  }
}

function Verdict({ v, t }: { v: EquipCompare['verdict']; t: T }) {
  const x = VERDICT[v]
  return (
    <span className={`ui-verdict ui-verdict--${x.tone}`} role="status">
      <Icon name={x.icon} />
      {t(x.key)}
    </span>
  )
}

function CmpList({ rows, item, totals, expert, t }: { rows: CmpRow[]; item: EquipItem; totals: boolean; expert: boolean; t: T }) {
  return (
    <ul className="ui-cmp">
      {rows.map((r) => {
        const v = rowView(r, item, totals, t)
        const icon: IconName = v.dir === 'up' ? 'arrow-up' : v.dir === 'down' ? 'arrow-down' : 'check'
        // эксперт: пояснения — только у потерь
        const note = v.note && (!expert || v.dir === 'down' || v.bad) ? v.note : undefined
        return (
          <li key={v.key} className={`is-${v.bad ? 'down' : v.dir}`}>
            <Icon name={icon} />
            <span className="ui-cmp__l">
              {v.label}
              {expert ? ' ' : <br />}
              <span>{v.values}</span>
            </span>
            <span className="ui-cmp__d">{v.delta}</span>
            {note && <span className="ui-cmp__n">{note}</span>}
            {v.hint && <span className="ui-cmp__n">{v.hint}</span>}
          </li>
        )
      })}
    </ul>
  )
}

// ---------------------------------------------------------------------------- действия

/** «Запомнить как надетое»: один слот — сразу, несколько (кольца, руки, флаконы, самоцветы) — короткий выбор. */
function SaveControl({
  item,
  state,
  label,
  primary,
  t
}: {
  item: EquipItem
  state: EquipState
  label: string
  primary?: boolean
  t: T
}) {
  const [choosing, setChoosing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fail, setFail] = useState(false)
  const pcKey = useOverlayStore((s) => s.priceCheckKey)
  const slots = saveSlots(item, state.items)
  if (!slots.length) return null
  const save = async (slot: EquipSlot): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFail(false)
    const r = await window.overlayApi.equip.save(slot, item).catch(() => null)
    setBusy(false)
    if (!r) setFail(true)
    else setChoosing(false)
  }
  const used = new Set(state.items.map((e) => e.slot))
  const jewelLabel = (s: EquipSlot): string => (used.has(s) ? slotName(s, t) : t('eq.slot.jewel.new'))
  return (
    <>
      {choosing ? (
        <span className="eq-slot">
          <span className="ui-label">{t('eq.save.where')}</span>
          <span className="ui-seg" role="group" aria-label={t('eq.slot')}>
            {slots.map((s) => (
              <button key={s} type="button" disabled={busy} onClick={() => void save(s)}>
                {jewelIndex(s) !== null ? jewelLabel(s) : slotName(s, t)}
              </button>
            ))}
          </span>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon" aria-label={t('eq.mine.cancel')} onClick={() => setChoosing(false)}>
            <Icon name="close" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          className={`ui-btn ui-btn--sm${primary ? '' : ' ui-btn--ghost'}`}
          title={tKey(t, 'eq.save.help', pcKey)}
          disabled={busy}
          onClick={() => (slots.length === 1 ? void save(slots[0]) : setChoosing(true))}
        >
          <Icon name="pin" />
          {label}
        </button>
      )}
      {fail && <span className="eq-fail">{t('eq.fail')}</span>}
    </>
  )
}

function ForgetButton({ slots, t }: { slots: EquipSlot[]; t: T }) {
  const names = slots.map((s) => slotName(s, t)).join(' + ')
  return (
    <button
      type="button"
      className="ui-btn ui-btn--sm ui-btn--ghost"
      title={t('eq.forget.help', { slot: names })}
      aria-label={t('eq.forget.help', { slot: names })}
      onClick={() =>
        void (async () => {
          // по одному: пара «оружие + щит» — два слота
          for (const s of slots) await window.overlayApi.equip.forget(s).catch(() => undefined)
        })()
      }
    >
      <Icon name="trash" />
      {t('eq.forget')}
    </button>
  )
}

/** «Мои сопротивления сейчас» — 4 числа, как в окне персонажа. */
function MineEditor({ state, onDone, t }: { state: EquipState; onDone: () => void; t: T }) {
  const [vals, setVals] = useState<Record<EquipElement, string>>(() => {
    const r = state.mine?.res ?? {}
    return Object.fromEntries(ELEMENTS.map((e) => [e, r[e] === undefined ? '' : String(r[e])])) as Record<EquipElement, string>
  })
  const parsed = Object.fromEntries(
    ELEMENTS.filter((e) => vals[e].trim() !== '').map((e) => [e, Number(vals[e].replace('−', '-'))])
  ) as Partial<Record<EquipElement, number>>
  const valid = Object.values(parsed).every((n) => Number.isFinite(n) && n >= -200 && n <= 200)
  const save = async (res: Partial<Record<EquipElement, number>> | null): Promise<void> => {
    await window.overlayApi.equip.setMine(res).catch(() => null)
    onDone()
  }
  return (
    <div className="eq-mine">
      <span className="ui-label">{t('eq.mine.title')}</span>
      <div className="eq-mine__row">
        {ELEMENTS.map((e) => (
          <label key={e}>
            {cap1(elName(e, t))}
            <input
              className="ui-input ui-input--num"
              inputMode="numeric"
              value={vals[e]}
              aria-invalid={vals[e].trim() !== '' && !Number.isFinite(parsed[e]) ? true : undefined}
              onChange={(ev) => setVals({ ...vals, [e]: ev.target.value.slice(0, 5) })}
              onMouseDown={activateOverlay}
            />
          </label>
        ))}
      </div>
      <span className="eq-note">{t('eq.mine.help')}</span>
      <span className="eq-acts">
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={!valid || !Object.keys(parsed).length} onClick={() => void save(parsed)}>
          {t('eq.mine.save')}
        </button>
        {state.mine && (
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => void save(null)}>
            {t('eq.mine.clear')}
          </button>
        )}
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onDone}>
          {t('eq.mine.cancel')}
        </button>
      </span>
    </div>
  )
}

const GUIDE: Record<GuideVerdict['verdict'], { icon: IconName; tone: string; key: string }> = {
  closer: { icon: 'arrow-up', tone: 'good', key: 'eq.guide.closer' },
  further: { icon: 'arrow-down', tone: 'bad', key: 'eq.guide.further' },
  same: { icon: 'check', tone: 'same', key: 'eq.guide.same' }
}

function GuideRow({ g, data, expert, t }: { g: { v: GuideVerdict; stage: string }; data: Poe1Data | null; expert: boolean; t: T }) {
  const x = GUIDE[g.v.verdict]
  const name = g.v.unique ? (data?.itemByRef('UNIQUE', g.v.unique)?.[0]?.name ?? g.v.unique) : null
  const wants = g.v.wants.map((w) => t(`eq.guide.w.${w.id}`, { n: w.value })).join(' · ')
  const detail = g.v.match
    ? t('eq.guide.match')
    : name
      ? t('eq.guide.unique', { stage: g.stage, name })
      : t('eq.guide.wants', { stage: g.stage, what: wants })
  return (
    <div className="eq-guide">
      <Icon name="passive" />
      <span className="eq-guide__t">
        <span className="eq-guide__h">
          <b>{t('eq.guide')}</b>
          <span className={`ui-verdict ui-verdict--sm ui-verdict--${x.tone}`}>
            <Icon name={x.icon} />
            {t(x.key)}
          </span>
        </span>
        {!expert && <span>{detail}</span>}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------- блок

const NOTE_KEYS: Record<Exclude<TargetNote, 'twoHand'>, string> = {
  shieldWith2h: 'eq.note.shieldWith2h',
  quiverNoBow: 'eq.note.quiverNoBow'
}

function Head({ fresh, old, expert, state, t }: { fresh?: string; old?: boolean; expert: boolean; state: EquipState; t: T }) {
  return (
    <div className="eq-head">
      <span className="ui-label">
        <Icon name="swap" size="sm" />
        {t('eq.title')}
      </span>
      {fresh && <span className={`eq-fresh${old ? ' is-old' : ''}`}>{fresh}</span>}
      {expert && <span className="eq-fresh">{state.character ? t('eq.char', { name: state.character }) : t('eq.char.none')}</span>}
      <span className="ui-label__grow" />
      {!expert && (
        <span className="ui-q" title={t('eq.help')} aria-label={t('eq.help')}>
          ?
        </span>
      )}
    </div>
  )
}

export function EquipBox({ item, expert, t }: { item: ParsedItem | null; expert: boolean; t: T }) {
  const on = buildGuideOn()
  const state = useEquipState(on)
  const eq = useMemo(() => (item ? equipItem(item) : null), [item])
  if (!on || !state?.on || !item || !eq) return null
  return <EquipInner item={item} eq={eq} state={state} expert={expert} t={t} />
}

function EquipInner({ item, eq, state, expert, t }: { item: ParsedItem; eq: EquipItem; state: EquipState; expert: boolean; t: T }) {
  const build = useActiveBuildModel(true)
  const data = useItemData(item.lang)
  const totals = useTotals(state, build)
  const [pick, setPick] = useState<number | null>(null)
  const [mineOpen, setMineOpen] = useState(false)
  const pcKey = useOverlayStore((s) => s.priceCheckKey)
  const now = Date.now()

  const targets = useMemo(() => equipTargets(eq, state.items), [eq, state.items])
  const results = useMemo(() => targets.options.map((o) => compareEquip(eq, o.entries, totals, state.level)), [eq, targets, totals, state.level])
  const best = bestOption(results)
  const shownIdx = pick !== null && pick < results.length ? pick : Math.max(0, best)
  const guide = useGuide(build, state.level, eq, targets.options[shownIdx]?.entries ?? NO_ENTRIES)
  // выбор слота — до смены набора (запомнили, забыли)
  useEffect(() => setPick(null), [state.items])

  if (item.isUnidentified || eq.kind === 'complex') {
    return (
      <div className="eq">
        <Head expert={expert} state={state} t={t} />
        <span className="eq-empty">
          <span>
            <b>{t(item.isUnidentified ? 'eq.unid' : 'eq.complex')}</b>
            {!item.isUnidentified && !expert && <> {t('eq.complex.d')}</>}
          </span>
        </span>
      </div>
    )
  }

  // это и есть надетая вещь — показываем, куда запомнена
  const same = state.items.find((e) => sameItem(e, eq))
  if (same) {
    const old = now - same.at > DAY
    return (
      <div className="eq">
        <Head fresh={freshText(same.at, now, t)} old={old} expert={expert} state={state} t={t} />
        <span className="eq-note">
          <Icon name="check" />
          <span>{t('eq.this', { slot: slotName(same.slot, t) })}</span>
        </span>
        <span className="eq-acts">
          <span className="eq-acts__grow" />
          <ForgetButton slots={[same.slot]} t={t} />
        </span>
      </div>
    )
  }

  const note = targets.note && targets.note !== 'twoHand' ? NOTE_KEYS[targets.note] : null
  if (!targets.options.length) {
    return (
      <div className="eq">
        <Head expert={expert} state={state} t={t} />
        <div className="eq-empty">
          {note ? (
            <span>{t(note)}</span>
          ) : (
            <span>
              <b>{t('eq.empty')}</b> {eq.kind === 'flask' && state.items.some((e) => e.kind === 'flask') ? t('eq.empty.flask') : tKey(t, 'eq.empty.how', pcKey)}
            </span>
          )}
          <span className="eq-acts">
            <SaveControl item={eq} state={state} label={t('eq.empty.save')} primary t={t} />
          </span>
        </div>
      </div>
    )
  }

  const idx = shownIdx
  const cmp = results[idx]
  const target = targets.options[idx]
  const entries: EquipEntry[] = target.entries
  const oldest = Math.min(...entries.map((e) => e.at))
  const stale = now - oldest > DAY
  const utility = eq.flask?.type === 'utility'
  const rows = shownRows(cmp.rows, expert)
  const hasRes = cmp.rows.some((r) => r.id === 'res')
  const why = whyText(cmp, utility, t)

  return (
    <div className="eq">
      <Head fresh={freshText(oldest, now, t)} old={stale} expert={expert} state={state} t={t} />
      <div className="eq-verdict">
        <Verdict v={cmp.verdict} t={t} />
        <span className="eq-why">
          {why}
          {targets.note === 'twoHand' && !expert && <span> {t('eq.why.twoHand')}</span>}
        </span>
      </div>
      {targets.options.length > 1 && (
        <div className="eq-slot">
          <span className="ui-label">{t('eq.replaces')}</span>
          <span className="ui-seg" role="group" aria-label={t('eq.slot')}>
            {targets.options.map((o, i) => (
              <button
                key={o.slots.join('+')}
                type="button"
                aria-pressed={i === idx}
                title={t(VERDICT[results[i].verdict].key)}
                onClick={() => setPick(i)}
              >
                <i className={`eq-dot eq-dot--${results[i].verdict}`} />
                {o.slots.map((s) => slotName(s, t)).join(' + ')}
              </button>
            ))}
          </span>
          {!expert && best >= 0 && results.some((r) => r.verdict !== results[best].verdict) && (
            <span className="eq-fresh">{t('eq.best', { slot: slotName(targets.options[best].slots[0], t) })}</span>
          )}
        </div>
      )}
      {rows.length > 0 && <CmpList rows={rows} item={eq} totals={!!cmp.totals} expert={expert} t={t} />}
      {guide && <GuideRow g={guide} data={data} expert={expert} t={t} />}
      {eq.kind !== 'flask' && (hasRes || !expert) && (
        <span className="eq-note">
          <Icon name="info" />
          <span>
            {cmp.totals === 'mine'
              ? t('eq.tot.mine')
              : cmp.totals === 'build'
                ? t('eq.tot.build', { n: totals?.buildLevel ?? '?' })
                : t('eq.tot.none')}{' '}
            {!mineOpen && (
              <button type="button" className="eq-link" onClick={() => setMineOpen(true)}>
                {t(state.mine ? 'eq.mine.title' : 'eq.mine.set')}
              </button>
            )}
          </span>
        </span>
      )}
      {mineOpen && <MineEditor state={state} onDone={() => setMineOpen(false)} t={t} />}
      {eq.kind === 'flask' && !expert && <span className="eq-later">{t('eq.flask.mods')}</span>}
      {eq.kind !== 'flask' && (
        <span className="eq-later">
          <Icon name="info" />
          <span>{cmp.dmgUnknown ? t('eq.dmg') : t('eq.later')}</span>
        </span>
      )}
      {stale && !expert && <span className="eq-note eq-fresh is-old">{tKey(t, 'eq.fresh.old', pcKey)}</span>}
      <div className="eq-acts">
        <span className="eq-worn">
          {t('eq.worn')} <b>{entries.map((e) => itemName(e, data)).join(' + ')}</b>
        </span>
        <span className="eq-acts__grow" />
        <ForgetButton slots={entries.map((e) => e.slot)} t={t} />
        <SaveControl item={eq} state={state} label={t('eq.save')} t={t} />
      </div>
    </div>
  )
}
