import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import type { FarmFind, FarmLogStatus, FarmProfitMark, FarmProfitMode, FarmRun, FarmSession, FarmState, FarmStats } from '@shared/types/farm'
import { useLang, useT } from '../../i18n'
import { tKey } from '../../i18n/hotkey'
import { useAppStore } from '../../store/useAppStore'
import { useFarmStore } from '../../store/useFarmStore'
import { Ico, Rich, useSimple } from '../deals/common'
import { clock, currentRunMs, money, rate, runFindsEx, runName, sessionMs, tierRange, when } from './format'
import { AllRuns, Deaths, SpriteIco, WidgetSwitch, tierText } from './parts'
import { useExPerDiv } from './rate'

// «Сессия фарма PoE 2» (S69) по макету дизайнера «Богатство и сессия фарма PoE 2» (утверждён 01.11):
// - без сессии — плашка «почему так», «Начать сессию» → диалог «Чем отметить начало?» (снять вкладки / ввести
//   валюту / только карты и время), прошлые сессии с прибылью в div;
// - идёт — строка «начало: снимок 3 вкладок, 18:02», плитка «Прибыль сессии» (появится в конце, находки пока),
//   карт в час с ярусами, забеги с меткой тира и «+ находка» (+1 div / +5 ex / +10 ex / своё…);
// - «Завершить» → диалог «Как посчитать прибыль?»; итог «+4,8 div» с разбивкой «вкладки · находки».
// Снимок и ввод валюты делает «Богатство» (S70): оно видит выбор в событиях сессии и отдаёт отметку начала и
// прибыль (farmSession.setSessionStart / setSessionProfit). Итог = прибыль + находки.

type Lang = 'ru' | 'en'
type T = ReturnType<typeof useT>

const HOUR = 3_600_000
/** Мелочь меньше — в ex и в итогах «находки пока». */
const QUICK_EX = [5, 10]

/** Клавиши из настроек: окно цены (Ctrl+D) и цены поверх окон (снимок вкладки, Alt+F). */
function useKeys(): { pc: string | undefined; snap: string | undefined } {
  const pc = useAppStore((s) => s.settings?.hotkeys.priceCheck.accel)
  const snap = useAppStore((s) => s.settings?.hotkeys.screenPrices?.accel)
  return { pc, snap }
}

// ---------------------------------------------------------------- диалог

function FarmDialog({ title, onClose, children, foot }: { title: string; onClose: () => void; children: ReactNode; foot: ReactNode }) {
  const t = useT()
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('[aria-checked="true"], button:not([disabled])')?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      back?.focus?.()
    }
    // фокус — один раз при открытии
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="ui-dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className="ui-dialog fm-dialog" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="ui-dialog__head">
          <h3 className="ui-dialog__title" id={id}>
            {title}
          </h3>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('farm.p2.close')} title={t('farm.p2.close')} onClick={onClose}>
            <Ico name="close" />
          </button>
        </div>
        <div className="ui-dialog__body">{children}</div>
        <div className="ui-dialog__foot">{foot}</div>
      </div>
    </div>
  )
}

interface Opt {
  id: FarmProfitMode
  icon: 'grid' | 'edit' | 'map'
  title: string
  text: string
  recommended?: boolean
  disabled?: boolean
}

/** Варианты карточками-радио (`.fm-opt`, в макете `.w2-opt`); стрелки ↑↓ двигают выбор. */
function Options({ opts, value, onChange }: { opts: Opt[]; value: FarmProfitMode; onChange: (v: FarmProfitMode) => void }) {
  const t = useT()
  const enabled = opts.filter((o) => !o.disabled)
  const onKey = (e: ReactKeyboardEvent): void => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const i = enabled.findIndex((o) => o.id === value)
    const next = enabled[(i + (e.key === 'ArrowDown' ? 1 : enabled.length - 1)) % enabled.length]
    onChange(next.id)
    ;(e.currentTarget.querySelector(`[data-opt="${next.id}"]`) as HTMLElement | null)?.focus()
  }
  return (
    <div className="fm-opts" role="radiogroup" onKeyDown={onKey}>
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          data-opt={o.id}
          className="fm-opt"
          aria-checked={value === o.id}
          disabled={o.disabled}
          tabIndex={value === o.id ? 0 : -1}
          onClick={() => onChange(o.id)}
        >
          <span className="fm-opt__dot" />
          <Ico name={o.icon} />
          <b>
            {o.title}
            {o.recommended && <span className="ui-tag ui-tag--good">{t('farm.p2.recommended')}</span>}
          </b>
          <span className="fm-opt__d">{o.text}</span>
        </button>
      ))}
    </div>
  )
}

function StartDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const keys = useKeys()
  const busy = useFarmStore((s) => s.busy)
  const start = useFarmStore((s) => s.start)
  const [mode, setMode] = useState<FarmProfitMode>('snapshot')
  const opts: Opt[] = [
    { id: 'snapshot', icon: 'grid', title: t('farm.p2.opt.snap'), text: tKey(t, 'farm.p2.opt.snap.d', keys.snap), recommended: true },
    { id: 'manual', icon: 'edit', title: t('farm.p2.opt.manual'), text: t('farm.p2.opt.manual.d') },
    { id: 'none', icon: 'map', title: t('farm.p2.opt.none'), text: t('farm.p2.opt.none.d') }
  ]
  const go = (): void => {
    void start({ profitMode: mode }).then(onClose)
  }
  return (
    <FarmDialog
      title={t('farm.p2.start.title')}
      onClose={onClose}
      foot={
        <>
          <span className="fm-grow" />
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
            {t('farm.p2.cancel')}
          </button>
          <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={go}>
            <Ico name="play" />
            {t('farm.p2.start.go')}
          </button>
        </>
      }
    >
      <Options opts={opts} value={mode} onChange={setMode} />
    </FarmDialog>
  )
}

function EndDialog({ session, onClose, onEnded }: { session: FarmSession; onClose: () => void; onEnded: (id: string) => void }) {
  const t = useT()
  const lang = useLang()
  const keys = useKeys()
  const busy = useFarmStore((s) => s.busy)
  const stop = useFarmStore((s) => s.stop)
  const start = session.profitStart
  // без отметки начала разницу не посчитать — только «Без прибыли»
  const [mode, setMode] = useState<FarmProfitMode>(start ? start.source : 'none')
  const intro = start
    ? t(start.source === 'snapshot' ? 'farm.p2.end.intro.snapshot' : 'farm.p2.end.intro.manual', { time: when(start.at, lang) })
    : t('farm.p2.end.intro.none')
  const opts: Opt[] = [
    {
      id: 'snapshot',
      icon: 'grid',
      title: t('farm.p2.opt.snapSame'),
      text: tKey(t, 'farm.p2.opt.snapSame.d', keys.snap),
      recommended: start?.source === 'snapshot',
      disabled: !start
    },
    { id: 'manual', icon: 'edit', title: t('farm.p2.opt.manual'), text: t('farm.p2.opt.manualEnd.d'), disabled: !start },
    { id: 'none', icon: 'map', title: t('farm.p2.opt.noneEnd'), text: t('farm.p2.opt.noneEnd.d') }
  ]
  const go = (): void => {
    const id = session.id
    void stop({ profitMode: mode }).then(() => onEnded(id))
  }
  return (
    <FarmDialog
      title={t('farm.p2.end.title')}
      onClose={onClose}
      foot={
        <>
          <span className="fm-grow" />
          <button type="button" className="ui-btn ui-btn--ghost" onClick={onClose}>
            {t('farm.p2.cancel')}
          </button>
          <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={go}>
            <Ico name="stop" />
            {t('farm.session.stop')}
          </button>
        </>
      }
    >
      <p className="fm-p">{intro}</p>
      <Options opts={opts} value={mode} onChange={setMode} />
    </FarmDialog>
  )
}

// ---------------------------------------------------------------- начало и конец: строка «начало … › конец …»

function markWhat(m: FarmProfitMark, t: T): string {
  if (m.source === 'manual') return t('farm.p2.flow.manual')
  if (!m.tabs) return t('farm.p2.flow.snapshot')
  return m.tabs === 1 ? t('farm.p2.flow.snapshotTab1') : t('farm.p2.flow.snapshotTabs', { n: m.tabs })
}

/** Начало: отметка от S70, иначе что ждём; без прибыли — «не считаем». */
function startPart(s: FarmSession, t: T, lang: Lang, snapKey: string | undefined): string {
  if (s.profitStart) return t('farm.p2.flow.start', { what: markWhat(s.profitStart, t), time: when(s.profitStart.at, lang) })
  if (s.profitMode === 'snapshot') return tKey(t, 'farm.p2.flow.wait.snapshot', snapKey)
  if (s.profitMode === 'manual') return t('farm.p2.flow.wait.manual')
  return t('farm.p2.flow.none')
}

function Flow({ children }: { children: ReactNode }) {
  return (
    <div className="fm-flow">
      <Ico name="grid" size="sm" />
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- плитки

/** Итог сессии: прибыль от «Богатства» + находки; в час — по времени без пауз. */
function ProfitTile({ s, stats, live, exPerDiv }: { s: FarmSession; stats: FarmStats; live: boolean; exPerDiv: number | null }) {
  const t = useT()
  const lang = useLang()
  const keys = useKeys()
  const findsEx = stats.findsEx ?? null
  const total = stats.totalEx ?? null
  const rateDiv = s.profit?.exPerDiv ?? exPerDiv
  const label = <span className="ui-label">{t('farm.p2.stat.profit')}</span>
  const empty = (value: string, sub: string) => (
    <div className="ui-stat ui-stat--hero ui-stat--empty" title={t('farm.p2.stat.profit.q')}>
      {label}
      <b className="ui-stat__value">{value}</b>
      <span className="ui-stat__sub">{sub}</span>
    </div>
  )
  const findsText = findsEx !== null ? money(findsEx, rateDiv, lang, { signed: true }) : null
  // прибыль от S70 пришла (или сессия без прибыли, но с находками) — итог числом
  if (s.profit || (!live && s.profitEnd === 'none' && total !== null) || (!live && !s.profitEnd && !s.profitMode && total !== null)) {
    const v = total ?? 0
    const perHour = stats.durationMs >= 60_000 ? v / (stats.durationMs / HOUR) : null
    return (
      <div className="ui-stat ui-stat--hero" title={t('farm.p2.stat.profit.q')}>
        {label}
        <b className={`ui-stat__value ${v < 0 ? 'fm-bad' : 'fm-good'}`}>{money(v, rateDiv, lang, { signed: true })}</b>
        <span className="ui-stat__sub">
          {s.profit ? `${money(v, null, lang, { signed: true })} · ` : `${t('farm.p2.stat.findsOnly')} · `}
          {perHour !== null ? t('farm.p2.perHour', { v: money(perHour, rateDiv, lang) }) : ''}
        </span>
      </div>
    )
  }
  if (live) {
    if (s.profitMode === 'none') return empty(t('farm.p2.stat.profit.none'), findsText ? t('farm.p2.stat.findsSoFar', { v: findsText }) : t('farm.p2.stat.noneSub'))
    return empty(t('farm.p2.stat.profit.end'), findsText ? t('farm.p2.stat.atEndFinds', { v: findsText }) : t('farm.p2.stat.atEnd'))
  }
  // завершена: ждём снимок или ввод конца от «Богатства»
  if (s.profitEnd === 'snapshot') return empty(t('farm.run.counting'), tKey(t, 'farm.p2.stat.waitSnap', keys.snap))
  if (s.profitEnd === 'manual') return empty(t('farm.run.counting'), t('farm.p2.stat.waitManual'))
  return empty(t('farm.p2.past.none'), t('farm.p2.stat.noneSub'))
}

function Kpis({ s, stats, runs, live, durationMs, exPerDiv }: { s: FarmSession; stats: FarmStats; runs: FarmRun[]; live: boolean; durationMs: number; exPerDiv: number | null }) {
  const t = useT()
  const lang = useLang()
  const rated = durationMs >= 60_000
  const tiers = tierRange(runs)
  return (
    <div className="ui-stats ui-stats--lead">
      <ProfitTile s={s} stats={{ ...stats, durationMs }} live={live} exPerDiv={exPerDiv} />
      <div className="ui-stat">
        <span className="ui-label">{t('farm.stat.perHour')}</span>
        <b className="ui-stat__value">{rated ? rate(stats.maps / (durationMs / HOUR), lang) : '—'}</b>
        <span className="ui-stat__sub">
          {t('farm.stat.perHour.sub', { n: stats.maps })}
          {tiers && ` · ${tiers}`}
        </span>
      </div>
      <div className="ui-stat">
        <span className="ui-label">{t('farm.stat.avg')}</span>
        <b className="ui-stat__value">{stats.avgMapMs !== null ? clock(stats.avgMapMs) : '—'}</b>
        <span className="ui-stat__sub">{stats.fastestMapMs !== null ? t('farm.stat.avg.sub', { time: clock(stats.fastestMapMs) }) : ' '}</span>
      </div>
      <div className="ui-stat" title={t('farm.stat.deaths.q')}>
        <span className="ui-label">{t('farm.stat.deaths')}</span>
        <b className="ui-stat__value">{stats.deaths}</b>
        <span className="ui-stat__sub">
          {stats.deaths > 0 ? t('farm.stat.deaths.sub', { n: stats.mapsWithDeaths, of: stats.maps }) : t('farm.stat.deaths.none')}
        </span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- находки

const ITEM_CLASS: Record<string, string> = {
  unique: 'ui-item--unique',
  rare: 'ui-item--rare',
  magic: 'ui-item--magic',
  currency: 'ui-item--currency',
  gem: 'ui-item--gem'
}

/** Ячейка «Находки»: до двух — имя (кроме быстрых) и сумма, больше — общая сумма и счётчик. */
function FindsSummary({ finds, exPerDiv }: { finds: FarmFind[]; exPerDiv: number | null }) {
  const t = useT()
  const lang = useLang()
  const amount = (f: FarmFind): string => (f.valueEx === null ? t('farm.p2.finds.noValue') : money(f.valueEx, exPerDiv, lang, { signed: true, smallInEx: true }))
  if (finds.length > 2) {
    const sum = runFindsEx({ finds })
    const list = finds.map((f) => `${f.name ?? f.ref}${f.qty > 1 ? ` ×${f.qty}` : ''}: ${amount(f)}`).join('\n')
    return (
      <span className="fm-find" title={list}>
        <b>{sum === null ? t('farm.p2.finds.noValue') : money(sum, exPerDiv, lang, { signed: true, smallInEx: true })}</b>
        <span className="fm-faint">{t('farm.p2.finds.count', { n: finds.length })}</span>
      </span>
    )
  }
  return (
    <span className="fm-find">
      {finds.map((f) => (
        <span key={f.id} className="fm-find__one">
          {f.source !== 'quick' && <span className={`ui-item ${ITEM_CLASS[f.rarity ?? ''] ?? ''}`}>{f.name ?? f.ref}</span>}
          <b className={f.valueEx === null ? 'fm-faint' : undefined}>{amount(f)}</b>
        </span>
      ))}
    </span>
  )
}

/** «+ находка» у текущей карты: быстрые +1 div / +5 ex / +10 ex, «своё…», подсказка про окно цены, список с удалением. */
function FindAdd({ run, exPerDiv, expert }: { run: FarmRun; exPerDiv: number | null; expert: boolean }) {
  const t = useT()
  const lang = useLang()
  const keys = useKeys()
  const addFind = useFarmStore((s) => s.addFind)
  const removeFind = useFarmStore((s) => s.removeFind)
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const [what, setWhat] = useState('')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState<'ex' | 'div'>('ex')
  const [error, setError] = useState<string | null>(null)
  const box = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const done = (r: Awaited<ReturnType<typeof addFind>>): boolean => {
    if (r.ok) {
      setError(null)
      return true
    }
    setError(t(`farm.p2.find.err.${r.reason}`))
    return false
  }
  const quickDiv = (): void => {
    if (!exPerDiv) return
    void addFind({ ref: 'Divine Orb', qty: 1, valueEx: exPerDiv, source: 'quick', runId: run.id }).then(done)
  }
  const quickEx = (n: number): void => {
    void addFind({ ref: 'Exalted Orb', qty: n, valueEx: n, source: 'quick', runId: run.id }).then(done)
  }
  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const v = value.trim() ? Number(value.replace(',', '.').trim()) : null
    const ex = v === null ? null : unit === 'div' ? (exPerDiv ? v * exPerDiv : NaN) : v
    if (
      done(await addFind({ ref: what, qty: 1, valueEx: ex === null || Number.isFinite(ex) ? ex : -1, source: 'manual', runId: run.id }))
    ) {
      setWhat('')
      setValue('')
      setCustom(false)
    }
  }
  const finds = run.finds ?? []

  return (
    <span className="fm-pop" ref={box}>
      <button
        type="button"
        className={`ui-btn ui-btn--ghost ui-btn--sm${expert ? ' ui-btn--icon' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('farm.p2.find.add.title')}
        aria-label={t('farm.p2.find.add.title')}
        onClick={() => setOpen(!open)}
      >
        <SpriteIco name="plus" />
        {!expert && t('farm.p2.find.add')}
      </button>
      {open && (
        <div className="ui-menu fm-pop__menu" role="menu">
          <div className="fm-pop__quick">
            <button type="button" className="ui-chip" disabled={!exPerDiv} title={exPerDiv ? undefined : t('farm.p2.find.noRate')} onClick={quickDiv}>
              +1 div
            </button>
            {QUICK_EX.map((n) => (
              <button key={n} type="button" className="ui-chip" onClick={() => quickEx(n)}>
                +{n} ex
              </button>
            ))}
            <button type="button" className="ui-chip" aria-pressed={custom} onClick={() => setCustom(!custom)}>
              {t('farm.p2.find.other')}
            </button>
          </div>
          {custom && (
            <form className="fm-pop__form" onSubmit={(e) => void submit(e)}>
              <input
                className="ui-input"
                value={what}
                maxLength={200}
                required
                aria-label={t('farm.p2.find.what')}
                placeholder={t('farm.p2.find.what.ph')}
                onChange={(e) => setWhat(e.target.value)}
              />
              <span className="fm-pop__row">
                <input
                  className="ui-input ui-input--num"
                  inputMode="decimal"
                  value={value}
                  aria-label={t('farm.p2.find.value')}
                  placeholder={t('farm.p2.find.value')}
                  onChange={(e) => setValue(e.target.value)}
                />
                <span className="ui-seg">
                  {(['ex', 'div'] as const).map((u) => (
                    <button key={u} type="button" aria-pressed={unit === u} disabled={u === 'div' && !exPerDiv} onClick={() => setUnit(u)}>
                      {u}
                    </button>
                  ))}
                </span>
                <button type="submit" className="ui-btn ui-btn--primary ui-btn--sm">
                  {t('farm.p2.find.save')}
                </button>
              </span>
            </form>
          )}
          {error && <div className="ui-field__error fm-pop__note">{error}</div>}
          <div className="fm-pop__note">{tKey(t, 'farm.p2.find.note', keys.pc)}</div>
          {finds.length > 0 && (
            <>
              <div className="ui-menu__sep" />
              <div className="fm-pop__list">
                {[...finds].reverse().map((f) => (
                  <span key={f.id} className="fm-pop__item">
                    <span className="fm-pop__name">
                      {f.source === 'quick' ? t('farm.p2.find.quick') : (f.name ?? f.ref)}
                      {f.qty > 1 && <span className="fm-faint"> ×{f.qty}</span>}
                    </span>
                    <b>{f.valueEx === null ? '—' : money(f.valueEx, exPerDiv, lang, { signed: true, smallInEx: true })}</b>
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                      title={t('farm.p2.find.remove')}
                      aria-label={t('farm.p2.find.remove')}
                      onClick={() => void removeFind(run.id, f.id)}
                    >
                      <Ico name="trash" size="sm" />
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </span>
  )
}

// ---------------------------------------------------------------- забеги

function RunsTable({ state, runs, current, now, exPerDiv }: { state: FarmState; runs: FarmRun[]; current: FarmRun | null; now: number; exPerDiv: number | null }) {
  const t = useT()
  const simple = useSimple()
  const name = (r: FarmRun) => (
    <td>
      {runName(r, 'poe2')}
      {r.kind === 'map' && r.tier !== null ? <span className="fm-tier">T{r.tier}</span> : <span className="ui-table__aside">{tierText(r, t)}</span>}
    </td>
  )
  if (!current && runs.length === 0) return <p className="fm-p">{t('farm.runs.sessionEmpty')}</p>
  return (
    <div className="ui-box fm-tablewrap fm-tablewrap--pop">
      <table className="ui-table">
        <thead>
          <tr>
            <th className="fm-n">#</th>
            <th>{t('farm.col.map')}</th>
            <th className="is-num">{t('farm.col.time')}</th>
            <th className="is-num">{t('farm.p2.col.finds')}</th>
            <th className="is-num">{t('farm.col.deaths')}</th>
          </tr>
        </thead>
        <tbody>
          {current && (
            <tr className="is-now">
              <td className="fm-n">{runs.length + 1}</td>
              {name(current)}
              <td className="is-num fm-now-time">{clock(currentRunMs(state, now))}</td>
              <td className="is-num">
                <span className="fm-find-cell">
                  {(current.finds?.length ?? 0) > 0 && <FindsSummary finds={current.finds ?? []} exPerDiv={exPerDiv} />}
                  <FindAdd run={current} exPerDiv={exPerDiv} expert={!simple} />
                </span>
              </td>
              <td className="is-num">
                <Deaths n={current.deaths} />
              </td>
            </tr>
          )}
          {runs.map((r, i) => (
            <tr key={r.id}>
              <td className="fm-n">{runs.length - i}</td>
              {name(r)}
              <td className="is-num">{clock(r.activeMs)}</td>
              <td className="is-num">{r.finds?.length ? <FindsSummary finds={r.finds} exPerDiv={exPerDiv} /> : <span className="fm-faint">—</span>}</td>
              <td className="is-num">
                <Deaths n={r.deaths} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- виды

function Why() {
  const t = useT()
  const simple = useSimple()
  if (!simple) return null
  return (
    <div className="ui-banner ui-banner--info">
      <Ico name="info" />
      <span>
        <b>{t('farm.p2.why.b')}</b> {t('farm.p2.why')}
      </span>
      <span />
    </div>
  )
}

function IdleView({ state, exPerDiv, onStart }: { state: FarmState; exPerDiv: number | null; onStart: () => void }) {
  const t = useT()
  const lang = useLang()
  const busy = useFarmStore((s) => s.busy)
  return (
    <>
      <div className="fm-sess-top">
        <span className="fm-grow" />
        <WidgetSwitch state={state} />
      </div>
      <Why />
      <div className="ui-empty fm-empty">
        <Ico name="map" size="lg" />
        <span className="ui-empty__title">{t('farm.title')}</span>
        <span className="fm-empty__text">{t('farm.p2.idle.text')}</span>
        <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={onStart}>
          <Ico name="play" />
          {t('farm.session.start')}
        </button>
        {state.current && (
          <span className="fm-empty__hint">{t('farm.idle.inMap', { map: runName(state.current, 'poe2'), time: clock(state.current.activeMs) })}</span>
        )}
      </div>
      <div className="ui-label">
        <Ico name="history" size="sm" />
        {t('farm.sessions.title')}
      </div>
      {state.sessions.length === 0 ? (
        <p className="fm-p">{t('farm.sessions.empty')}</p>
      ) : (
        <div className="ui-box fm-tablewrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th>{t('farm.past.when')}</th>
                <th>{t('farm.past.length')}</th>
                <th>{t('farm.past.maps')}</th>
                <th className="is-num">{t('farm.p2.past.profit')}</th>
              </tr>
            </thead>
            <tbody>
              {state.sessions.map((s) => {
                const total = s.stats.totalEx ?? null
                const tiers = tierRange(state.runs.filter((r) => r.sessionId === s.id))
                const findsOnly = !s.profit && total !== null
                return (
                  <tr key={s.id}>
                    <td className="fm-nowrap">{when(s.startedAt, lang)}</td>
                    <td className="fm-nowrap">{clock(s.stats.durationMs, true)}</td>
                    <td className="fm-nowrap">
                      {s.stats.maps}
                      {tiers && ` · ${tiers}`}
                    </td>
                    {total === null ? (
                      <td className="is-num is-faint" title={t('farm.p2.past.none.title')}>
                        {t('farm.p2.past.none')}
                      </td>
                    ) : (
                      <td className={`is-num ${total < 0 ? 'is-bad' : 'is-good'}`} title={findsOnly ? t('farm.p2.past.findsOnly.title') : undefined}>
                        {money(total, s.profit?.exPerDiv ?? exPerDiv, lang, { signed: true })}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function RunningView({ state, now, exPerDiv, onEnd }: { state: FarmState; now: number; exPerDiv: number | null; onEnd: () => void }) {
  const t = useT()
  const lang = useLang()
  const simple = useSimple()
  const keys = useKeys()
  const busy = useFarmStore((s) => s.busy)
  const pause = useFarmStore((s) => s.pause)
  const resume = useFarmStore((s) => s.resume)
  const s = state.session as FarmSession
  const paused = s.pausedAt !== null
  const runs = state.runs.filter((r) => r.sessionId === s.id)
  const current = state.current && state.current.sessionId === s.id ? state.current : null
  return (
    <>
      <div className="fm-sess-top">
        <span className="fm-run">
          <span className={`ui-dot${paused ? ' ui-dot--afk' : ''}`} />
          {t(paused ? 'farm.session.paused' : 'farm.session.running')} · <b>{clock(sessionMs(state, now), true)}</b>
        </span>
        <span className="fm-grow" />
        <WidgetSwitch state={state} />
        {paused ? (
          <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={busy} onClick={() => void resume()}>
            <Ico name="play" />
            {t('farm.session.resume')}
          </button>
        ) : (
          <button
            type="button"
            className={`ui-btn ui-btn--sm${simple ? '' : ' ui-btn--icon'}`}
            title={t('farm.session.pause')}
            aria-label={t('farm.session.pause')}
            disabled={busy}
            onClick={() => void pause()}
          >
            <Ico name="pause" />
            {simple && t('farm.session.pause')}
          </button>
        )}
        <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={onEnd}>
          <Ico name="stop" />
          {t('farm.session.stop')}
        </button>
      </div>
      <Flow>{startPart(s, t, lang, keys.snap)}</Flow>
      {state.stats && (
        <Kpis s={s} stats={state.stats} runs={current ? [current, ...runs] : runs} live durationMs={sessionMs(state, now)} exPerDiv={exPerDiv} />
      )}
      {simple && (
        <div className="ui-hint fm-hint">
          <Ico name="help" />
          <span>
            <Rich text={tKey(t, 'farm.p2.hint.running', keys.pc)} />
          </span>
        </div>
      )}
      <div className="ui-label">
        <Ico name="history" size="sm" />
        {t('farm.runs.session')}
      </div>
      <RunsTable state={state} runs={runs} current={current} now={now} exPerDiv={exPerDiv} />
    </>
  )
}

function DoneView({ state, s, exPerDiv, onNew }: { state: FarmState; s: FarmState['sessions'][number]; exPerDiv: number | null; onNew: () => void }) {
  const t = useT()
  const lang = useLang()
  const keys = useKeys()
  const busy = useFarmStore((st) => st.busy)
  const runs = state.runs.filter((r) => r.sessionId === s.id)
  const rateDiv = s.profit?.exPerDiv ?? exPerDiv
  // «начало … › конец … · вкладки +X · находки +Y»
  const parts: ReactNode[] = [<span key="s">{startPart(s, t, lang, keys.snap)}</span>]
  if (s.profit) parts.push(<Ico key="c" name="chev-r" size="sm" />, <span key="e">{t('farm.p2.flow.end', { what: markWhat(s.profit, t), time: when(s.profit.at, lang) })}</span>)
  else if (s.profitEnd === 'snapshot') parts.push(<Ico key="c" name="chev-r" size="sm" />, <span key="e">{tKey(t, 'farm.p2.flow.waitEnd.snapshot', keys.snap)}</span>)
  else if (s.profitEnd === 'manual') parts.push(<Ico key="c" name="chev-r" size="sm" />, <span key="e">{t('farm.p2.flow.waitEnd.manual')}</span>)
  if (s.profit)
    parts.push(
      <span key="t">
        · {t(s.profit.source === 'snapshot' ? 'farm.p2.flow.tabs' : 'farm.p2.flow.currency')} <b className={s.profit.ex < 0 ? 'fm-bad' : 'fm-good'}>{money(s.profit.ex, rateDiv, lang, { signed: true })}</b>
      </span>
    )
  if (s.stats.findsEx != null)
    parts.push(
      <span key="f">
        · {t('farm.p2.flow.finds')} <b className="fm-good">{money(s.stats.findsEx, rateDiv, lang, { signed: true })}</b>
      </span>
    )
  return (
    <>
      <div className="fm-sess-top">
        <span className="fm-run">
          <Ico name="check" />
          {t('farm.p2.done')} · <b>{clock(s.stats.durationMs, true)}</b>
        </span>
        <span className="fm-grow" />
        <WidgetSwitch state={state} />
        <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" disabled={busy} onClick={onNew}>
          <Ico name="play" />
          {t('farm.p2.new')}
        </button>
      </div>
      <Flow>{parts}</Flow>
      <Kpis s={s} stats={s.stats} runs={runs} live={false} durationMs={s.stats.durationMs} exPerDiv={exPerDiv} />
      <div className="ui-label">
        <Ico name="history" size="sm" />
        {t('farm.runs.session')}
      </div>
      <RunsTable state={state} runs={runs} current={null} now={0} exPerDiv={exPerDiv} />
    </>
  )
}

// ---------------------------------------------------------------- панель

/** Раздел «Сессия фарма» в режиме PoE 2: FarmPanel передаёт сюда состояние трекера запущенной игры. */
export function FarmPanelPoe2({ state, log, now }: { state: FarmState; log: FarmLogStatus | null; now: number }) {
  const t = useT()
  const exPerDiv = useExPerDiv(true)
  const [dialog, setDialog] = useState<'start' | 'end' | null>(null)
  const [doneId, setDoneId] = useState<string | null>(null)
  const done = !state.session && doneId ? state.sessions.find((x) => x.id === doneId) : undefined
  const findsCell = (r: FarmRun): ReactNode => (
    <td className="is-num">{r.finds?.length ? <FindsSummary finds={r.finds} exPerDiv={exPerDiv} /> : <span className="fm-faint">—</span>}</td>
  )
  return (
    <div className="fm fm--poe2">
      {log && log.supported && !log.connected && (
        <div className="ui-banner ui-banner--bad">
          <Ico name="warn" />
          <span>{t('farm.log.off')}</span>
        </div>
      )}
      {state.session ? (
        <RunningView state={state} now={now} exPerDiv={exPerDiv} onEnd={() => setDialog('end')} />
      ) : done ? (
        <DoneView state={state} s={done} exPerDiv={exPerDiv} onNew={() => setDialog('start')} />
      ) : (
        <IdleView state={state} exPerDiv={exPerDiv} onStart={() => setDialog('start')} />
      )}
      <AllRuns runs={state.runs} game="poe2" profitCell={findsCell} profitLabel={t('farm.p2.col.finds')} />
      {dialog === 'start' && !state.session && (
        <StartDialog
          onClose={() => {
            setDialog(null)
            setDoneId(null)
          }}
        />
      )}
      {dialog === 'end' && state.session && (
        <EndDialog
          session={state.session}
          onClose={() => setDialog(null)}
          onEnded={(id) => {
            setDoneId(id)
            setDialog(null)
          }}
        />
      )}
    </div>
  )
}
