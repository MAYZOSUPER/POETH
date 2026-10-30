import { useEffect, useMemo, useState } from 'react'
import type { PobItemEn } from '@shared/build/pobItemEn'
import type { EquipGearSlot, EquipKind, EquipState } from '@shared/types/equip'
import type { PobCompareError, PobCompareResponse, PobDelta, PobOptionResult } from '@shared/types/pobCompare'
import { Icon, type IconName } from '../Icon'
import { wornFor } from './pobWorn'

// «Точный расчёт (PoB)» в блоке «Против надетого» (S44, бета; по умолчанию выключен): галочка в самом блоке, при
// включении — расчёт движком Path of Building (локальный процесс без сети) рядом с упрощённым вердиктом S41:
// урон ±%, запас прочности (EHP) ±%, кап сопротивлений и его потеря, нехватка атрибутов, «нельзя надеть».
// Пока движок стартует — «считаю…»; ошибка — коротко «точный расчёт недоступен», упрощённый вердикт остаётся.
// Непереведённые строки RU-предмета и строки, которых не знает PoB, — честно «не учтено».

type T = (key: string, params?: Record<string, string | number>) => string

/** Виды вещей, которые сравнивает движок (флаконы и самоцветы — нет). */
const GEAR: ReadonlySet<EquipKind> = new Set(['weapon1h', 'weapon2h', 'bow', 'shield', 'quiver', 'helmet', 'body', 'gloves', 'boots', 'amulet', 'ring', 'belt'])
export const pobKind = (k: EquipKind): boolean => GEAR.has(k)

type View = { s: 'idle' } | { s: 'busy' } | { s: 'done'; r: PobCompareResponse }

const ERR_KEY: Record<PobCompareError, string> = {
  off: 'eq.pob.err.internal',
  'no-build': 'eq.pob.err.noBuild',
  'no-engine': 'eq.pob.err.noEngine',
  unavailable: 'eq.pob.err.unavailable',
  timeout: 'eq.pob.err.timeout',
  crashed: 'eq.pob.err.crashed',
  'bad-input': 'eq.pob.err.item',
  build: 'eq.pob.err.build',
  item: 'eq.pob.err.item',
  kind: 'eq.pob.err.kind',
  internal: 'eq.pob.err.internal'
}

function fmt(t: T) {
  const locale = t('eq.pob.locale')
  const compact = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 })
  const whole = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const pct = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: 'exceptZero' })
  return {
    big: (n: number): string => (Math.abs(n) >= 10000 ? compact.format(n) : whole.format(n)),
    int: (n: number): string => whole.format(n),
    // минус — типографский, как во всём блоке
    pct: (d: PobDelta): string => (d.pct === null ? '—' : `${pct.format(d.pct).replace('-', '−')}%`),
    signed: (n: number): string => (n > 0 ? `+${whole.format(n)}` : n < 0 ? `−${whole.format(-n)}` : '0'),
    ms: (n: number): string => (n < 1000 ? t('eq.pob.unit.ms', { n: whole.format(n) }) : t('eq.pob.unit.s', { n: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n / 1000) })),
    diff: (d: PobDelta): string => {
      const v = Math.round(d.after - d.before)
      return v > 0 ? `+${whole.format(v)}` : v < 0 ? `−${whole.format(-v)}` : '0'
    }
  }
}

interface Row {
  key: string
  icon: IconName
  dir: 'up' | 'down' | 'same'
  label: string
  values: string
  delta: string
  note?: string
  bad?: boolean
}

function dirOf(d: PobDelta | undefined): Row['dir'] {
  if (!d || d.pct === null || Math.abs(d.pct) < 0.5) return 'same'
  return d.pct > 0 ? 'up' : 'down'
}

function rowsOf(o: PobOptionResult, f: ReturnType<typeof fmt>, t: T): Row[] {
  const rows: Row[] = []
  const icon = (dir: Row['dir']): IconName => (dir === 'up' ? 'arrow-up' : dir === 'down' ? 'arrow-down' : 'check')
  for (const s of o.short) {
    rows.push({
      key: `short-${s.a}`,
      icon: 'warn',
      dir: 'down',
      bad: true,
      label: t('eq.pob.short', { attr: t(`eq.at.${s.a}`) }),
      values: t('eq.pob.short.v', { have: f.int(s.have), need: f.int(s.need) }),
      delta: `−${f.int(s.need - s.have)}`
    })
  }
  if (o.dps) {
    const dir = dirOf(o.dps)
    rows.push({ key: 'dps', icon: icon(dir), dir, label: t(`eq.pob.dps.${o.dpsKind ?? 'combined'}`), values: `${f.big(o.dps.before)} → ${f.big(o.dps.after)}`, delta: f.pct(o.dps) })
  }
  if (o.ehp) {
    const dir = dirOf(o.ehp)
    rows.push({ key: 'ehp', icon: icon(dir), dir, label: t('eq.pob.ehp'), values: `${f.big(o.ehp.before)} → ${f.big(o.ehp.after)}`, delta: f.pct(o.ehp) })
  }
  for (const [k, d] of [['life', o.life], ['es', o.es]] as const) {
    if (!d) continue
    const dir = d.after > d.before ? 'up' : 'down'
    rows.push({ key: k, icon: icon(dir), dir, label: t(`eq.pob.${k}`), values: `${f.int(d.before)} → ${f.int(d.after)}`, delta: f.diff(d) })
  }
  if (o.res.length) {
    const lost = o.res.filter((r) => r.lost)
    const reach = o.res.filter((r) => r.reach)
    const el = (r: (typeof o.res)[number]): string => t(`eq.el.${r.el}`)
    // на капе до и после меняется только запас над капом — его и показываем
    const held = o.res.filter((r) => r.before === r.after)
    const moved = o.res.filter((r) => r.before !== r.after)
    const change = (r: (typeof o.res)[number]): number => (r.before !== r.after ? r.after - r.before : r.overAfter - r.overBefore)
    const worst = [...(moved.length ? moved : o.res)].sort((a, b) => change(a) - change(b))[0]
    const dir: Row['dir'] = lost.length ? 'down' : reach.length ? 'up' : moved.length ? (change(worst) < 0 ? 'down' : 'up') : 'same'
    const notes: string[] = []
    if (lost.length) notes.push(t('eq.pob.res.lost', { el: lost.map(el).join(', ') }))
    if (reach.length) notes.push(t('eq.pob.res.reach', { el: reach.map(el).join(', ') }))
    if (held.length) notes.push(t('eq.pob.res.over', { what: held.map((r) => `${el(r)} ${f.signed(r.overBefore)} → ${f.signed(r.overAfter)}`).join(', ') }))
    rows.push({
      key: 'res',
      icon: icon(dir),
      dir,
      bad: lost.length > 0,
      label: t('eq.pob.res'),
      values: o.res.map((r) => (r.before === r.after ? `${el(r)} ${f.int(r.after)}` : `${el(r)} ${f.int(r.before)} → ${f.int(r.after)}${r.below ? ` / ${f.int(r.cap)}` : ''}`)).join(' · '),
      delta: `${el(worst)} ${f.signed(change(worst))}`,
      note: notes.join(' ') || undefined
    })
  }
  return rows
}

export function PobBox({
  item,
  options,
  idx,
  state,
  expert,
  t
}: {
  item: PobItemEn | null | undefined
  options: EquipGearSlot[][]
  idx: number
  state: EquipState
  expert: boolean
  t: T
}) {
  const on = !!state.pob
  const [view, setView] = useState<View>({ s: 'idle' })
  const [busyToggle, setBusyToggle] = useState(false)
  const f = useMemo(() => fmt(t), [t])
  const worn = useMemo(() => wornFor(state.character, state.items), [state.character, state.items])
  const reqKey = item ? JSON.stringify([item.text, options, worn]) : ''

  useEffect(() => {
    if (!on || !item || !options.length) {
      setView({ s: 'idle' })
      return
    }
    let alive = true
    setView({ s: 'busy' })
    void window.overlayApi.equip
      .pobCompare({ item: item.text, options, worn })
      .catch((): PobCompareResponse => ({ ok: false, error: 'internal' }))
      .then((r) => alive && setView({ s: 'done', r }))
    return () => {
      alive = false
    }
    // запрос — по смыслу (текст, слоты, надетое), а не по ссылкам объектов
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, reqKey])

  const toggle = async (): Promise<void> => {
    if (busyToggle) return
    setBusyToggle(true)
    await window.overlayApi.equip.setPob(!on).catch(() => null)
    setBusyToggle(false)
  }

  const head = (
    <div className="eq-pob__h">
      <button type="button" className="ui-check" role="checkbox" aria-checked={on} aria-label={t('eq.pob.title')} disabled={busyToggle} onClick={() => void toggle()}>
        <Icon name="check" />
      </button>
      <button type="button" className="eq-pob__label" onClick={() => void toggle()} disabled={busyToggle}>
        {t('eq.pob.title')}
      </button>
      <span className="ui-tag ui-tag--warn">{t('eq.pob.beta')}</span>
      <span className="ui-label__grow" />
      <span className="ui-q" title={t('eq.pob.help')} aria-label={t('eq.pob.help')}>
        ?
      </span>
    </div>
  )

  if (!on) {
    return (
      <div className="eq-pob">
        {head}
        {!expert && <span className="eq-later">{t('eq.pob.off')}</span>}
      </div>
    )
  }

  let body: JSX.Element
  if (!item) {
    body = <span className="eq-later">{item === null ? t('eq.pob.err.item') : t('eq.pob.busy')}</span>
  } else if (view.s !== 'done') {
    body = (
      <span className="eq-pob__busy" role="status">
        <Icon name="refresh" />
        {t('eq.pob.busy')}
      </span>
    )
  } else if (!view.r.ok) {
    body = (
      <span className="eq-note">
        <Icon name="info" />
        <span>
          {t('eq.pob.na')}
          {(expert || view.r.error === 'no-build') && <> {t(ERR_KEY[view.r.error])}</>}
        </span>
      </span>
    )
  } else {
    const r = view.r
    const o = r.options[Math.min(idx, r.options.length - 1)]
    const skipped = [...item.untranslated, ...r.unsupported]
    const against =
      o.against === 'worn' ? t('eq.pob.vs.worn') : o.against === 'build' ? (r.stage ? t('eq.pob.vs.build', { stage: r.stage }) : t('eq.pob.vs.buildActive')) : t('eq.pob.vs.empty')
    const cant = r.reqLevel > 0 && r.level > 0 && r.reqLevel > r.level
    body = !o.ok ? (
      <span className="eq-note">
        <Icon name="info" />
        <span>{t('eq.pob.err.slot')}</span>
      </span>
    ) : (
      <>
        <span className="eq-fresh">{against}</span>
        {cant && (
          <span className="eq-pob__cant">
            <Icon name="warn" />
            {t('eq.pob.cant', { need: r.reqLevel, have: r.level })}
          </span>
        )}
        <ul className="ui-cmp">
          {rowsOf(o, f, t).map((x) => (
            <li key={x.key} className={`is-${x.bad ? 'down' : x.dir}`}>
              <Icon name={x.icon} />
              <span className="ui-cmp__l">
                {x.label}
                {expert ? ' ' : <br />}
                <span>{x.values}</span>
              </span>
              <span className="ui-cmp__d">{x.delta}</span>
              {x.note && <span className="ui-cmp__n">{x.note}</span>}
            </li>
          ))}
        </ul>
        {!o.dps && !o.ehp && <span className="eq-later">{t('eq.pob.none')}</span>}
        {skipped.length > 0 && (
          <span className="eq-note">
            <Icon name="warn" />
            <span>
              {t('eq.pob.skipped', { n: skipped.length })}
              {expert && <span className="eq-pob__lines"> {skipped.join(' · ')}</span>}
            </span>
          </span>
        )}
        {expert && (
          <span className="eq-later">
            {t('eq.pob.meta', { v: r.pob, calc: f.ms(r.ms.calc) })}
            {r.ms.start !== null && ` · ${t('eq.pob.meta.start', { s: f.ms(r.ms.start) })}`}
          </span>
        )}
        {!expert && o.against !== 'worn' && <span className="eq-later">{t('eq.pob.vs.hint')}</span>}
      </>
    )
  }

  return (
    <div className="eq-pob" aria-busy={view.s === 'busy'}>
      {head}
      {body}
    </div>
  )
}
