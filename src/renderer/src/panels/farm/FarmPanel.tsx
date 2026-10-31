import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import type { GameId } from '@shared/games'
import type { FarmFindResult, FarmRun, FarmState } from '@shared/types/farm'
import { useLang, useT } from '../../i18n'
import { farmTicking, useFarmStore } from '../../store/useFarmStore'
import { Ico, Rich, Switch, useSimple } from '../deals/common'
import {
  chaos,
  clock,
  currentRunMs,
  exAmount,
  exBase,
  income,
  incomeEx,
  latestDivineRate,
  profitCells,
  rate,
  runFindsEx,
  runName,
  sessionMs,
  when,
  type ProfitCell
} from './format'
import './farm.css'

// Раздел «Сессия фарма» (S11b) по макету дизайнера «Богатство»: без сессии — «Начать сессию» и
// прошлые сессии; во время сессии — плитки (доход в час, карт в час, среднее время карты, смерти)
// и забеги сессии с текущей картой сверху. Ниже — все забеги и включение виджета поверх игры.
// Самодостаточна (свой стор и словарь dict/farm.ts); ставит S11a во вкладку «Богатство».
// Доход — по прибыли забегов от учёта богатства S11a (группой, если снимок между картами не успел).
// PoE 2 (S69, черновик до макета «Сессия фарма PoE 2»): та же панель для трекера запущенной игры;
// ярус T1–T16, доход в exalted — по прибыли сессии от «Богатства» (S70), без неё — по находкам
// («+ находка» к забегу). Во вкладку «Богатство» PoE 2 панель ставит S70.

/**
 * Что нужно плитке дохода S11a (panels/wealth/IncomeTile): прибыль сессии и время без пауз. PoE 2 (S70) —
 * game 'poe2' и profitEx / findsEx в exalted (profitChaos — null).
 */
export interface FarmIncomeInput {
  /** сумма прибылей забегов сессии; null — ещё ни одной */
  profitChaos: number | null
  /** время сессии без пауз (мс) */
  activeMs: number
  /** есть завершённые забеги без прибыли — «считаем…» */
  pending: boolean
  game?: GameId
  /** PoE 2: прибыль сессии от «Богатства»; null — не посчитана */
  profitEx?: number | null
  /** PoE 2: Σ цен находок сессии; null — нет находок с ценой */
  findsEx?: number | null
}

export interface FarmPanelProps {
  /** S11a: своя плитка дохода (курс div и «нужен вход» — из стора S11a); без неё — встроенная */
  renderIncome?: (input: FarmIncomeInput) => ReactNode
  /** S11a: тайник не читается без входа — у забегов «—» вместо «считаем…» (и во встроенной плитке) */
  needLogin?: boolean
}

const HOUR = 3_600_000

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [active])
  return now
}

/** Ярус: PoE 1 — T1–T17 по уровню области, PoE 2 — T1–T16 путевого камня (считает трекер). */
function tierText(run: Pick<FarmRun, 'kind' | 'tier' | 'areaLevel'>, t: ReturnType<typeof useT>): string {
  if (run.kind === 'map' && run.tier !== null) return `T${run.tier}`
  return run.kind === 'other' ? t('farm.kind.other') : t('farm.level', { level: run.areaLevel })
}

const gameOf = (state: FarmState): GameId => state.game ?? 'poe1'
const isPoe2 = (state: FarmState): boolean => state.game === 'poe2'

/** Ячейка «Прибыль» PoE 2: сумма находок забега в ex. */
function FindsCell({ run, lang, open }: { run: FarmRun; lang: 'ru' | 'en'; open: boolean }) {
  const t = useT()
  const v = runFindsEx(run)
  const n = run.finds?.length ?? 0
  if (v === null) return <td className="is-num is-faint">{n > 0 ? t('farm.poe2.finds.noPrice', { n }) : open ? t('farm.run.running') : '—'}</td>
  return (
    <td className="is-num is-good" title={t('farm.poe2.finds.title', { n })}>
      {t('farm.ex', { n: exAmount(v, lang, true) })}
    </td>
  )
}

/** «Виджет поверх игры» — в шапке раздела (по макету); «Скрыть» на виджете выключает его же. */
function WidgetSwitch({ state }: { state: FarmState }) {
  const t = useT()
  const setConfig = useFarmStore((s) => s.setConfig)
  return (
    <span title={t('farm.widget.hint')}>
      <Switch on={state.config.overlayWidget} onChange={(v) => void setConfig({ overlayWidget: v })}>
        {t('farm.widget.toggle')}
      </Switch>
    </span>
  )
}

function Deaths({ n }: { n: number }) {
  return n > 0 ? (
    <span className="ui-tally ui-tally--bad">
      <Ico name="death" />
      {n}
    </span>
  ) : (
    <span className="ui-tally ui-tally--zero">0</span>
  )
}

// ---------------------------------------------------------------- без сессии

function IdleView({ state }: { state: FarmState }) {
  const t = useT()
  const lang = useLang()
  const simple = useSimple()
  const busy = useFarmStore((s) => s.busy)
  const start = useFarmStore((s) => s.start)
  const game = gameOf(state)
  const poe2 = isPoe2(state)
  return (
    <>
      <div className="fm-sess-top">
        <span className="fm-grow" />
        <WidgetSwitch state={state} />
      </div>
      <div className="ui-empty fm-empty">
        <Ico name="map" size="lg" />
        <span className="ui-empty__title">{t('farm.title')}</span>
        <span className="fm-empty__text">{t('farm.idle.text')}</span>
        <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={() => void start()}>
          <Ico name="play" />
          {t('farm.session.start')}
        </button>
        {simple && <span className="fm-empty__hint">{t(poe2 ? 'farm.poe2.idle.hint' : 'farm.idle.hint')}</span>}
        {state.current && (
          <span className="fm-empty__hint">
            {t('farm.idle.inMap', { map: runName(state.current, game), time: clock(state.current.activeMs) })}
          </span>
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
                <th className="is-num">{t('farm.past.maps')}</th>
                <th className="is-num">{t('farm.past.perHour')}</th>
                <th className="is-num">{t('farm.past.total')}</th>
              </tr>
            </thead>
            <tbody>
              {state.sessions.map((s) => {
                if (poe2) {
                  // PoE 2: прибыль сессии от «Богатства», без неё — находки (в exalted)
                  const total = exBase(s.stats)
                  const perHour = s.stats.exPerHour ?? null
                  return (
                    <tr key={s.id}>
                      <td className="fm-nowrap">{when(s.startedAt, lang)}</td>
                      <td className="fm-nowrap">{clock(s.stats.durationMs)}</td>
                      <td className="is-num">{s.stats.maps}</td>
                      <td className="is-num">{perHour !== null ? incomeEx(perHour, s.profit?.exPerDiv ?? null, lang).main : '—'}</td>
                      <td
                        className={`is-num ${total === null ? 'is-faint' : total < 0 ? 'is-bad' : 'is-good'}`}
                        title={total !== null && s.stats.profitEx == null ? t('farm.poe2.byFinds') : undefined}
                      >
                        {total !== null ? t('farm.ex', { n: exAmount(total, lang, true) }) : '—'}
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={s.id}>
                    <td className="fm-nowrap">{when(s.startedAt, lang)}</td>
                    <td className="fm-nowrap">{clock(s.stats.durationMs)}</td>
                    <td className="is-num">{s.stats.maps}</td>
                    <td className="is-num">
                      {s.stats.profitPerHour !== null
                        ? income(s.stats.profitPerHour, latestDivineRate(state.runs.filter((r) => r.sessionId === s.id)), lang).main
                        : '—'}
                    </td>
                    <td className={`is-num ${s.stats.profitChaos === null ? 'is-faint' : s.stats.profitChaos < 0 ? 'is-bad' : 'is-good'}`}>
                      {s.stats.profitChaos !== null ? t('farm.chaos', { n: chaos(s.stats.profitChaos, lang, true) }) : '—'}
                    </td>
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

// ---------------------------------------------------------------- сессия идёт

function Kpis({ state, now, props }: { state: FarmState; now: number; props: FarmPanelProps }) {
  const t = useT()
  const lang = useLang()
  const stats = state.stats
  if (!stats) return null
  const dur = sessionMs(state, now)
  const rated = dur >= 60_000
  const na = '—'
  const sid = state.session?.id
  const sessionRuns = state.runs.filter((r) => r.sessionId === sid)
  const poe2 = isPoe2(state)
  // у PoE 2 прибыли по тайнику нет — «считаем…» не бывает
  const pending = !poe2 && [...profitCells(sessionRuns).values()].some((c) => c.kind === 'pending')
  const perHour = rated && stats.profitChaos !== null ? stats.profitChaos / (dur / HOUR) : null
  const inc = perHour !== null ? income(perHour, latestDivineRate(sessionRuns), lang) : null
  const baseEx = exBase(stats)
  const incEx = poe2 && rated && baseEx !== null ? incomeEx(baseEx / (dur / HOUR), state.session?.profit?.exPerDiv ?? null, lang) : null
  return (
    <div className="ui-stats ui-stats--lead">
      {props.renderIncome ? (
        props.renderIncome({
          profitChaos: stats.profitChaos,
          activeMs: dur,
          pending,
          ...(poe2 ? { game: 'poe2' as const, profitEx: stats.profitEx ?? null, findsEx: stats.findsEx ?? null } : {})
        })
      ) : poe2 ? (
        <div className="ui-stat ui-stat--hero" title={t('farm.poe2.income.q')}>
          <span className="ui-label">{t('farm.stat.income')}</span>
          <b className="ui-stat__value">{incEx ? incEx.main : na}</b>
          <span className="ui-stat__sub">
            {incEx
              ? `${incEx.sub} · ${t(stats.profitEx != null ? 'farm.poe2.bySession' : 'farm.poe2.byFinds')}`
              : t('farm.poe2.income.wait')}
          </span>
        </div>
      ) : props.needLogin ? (
        <div className="ui-stat ui-stat--hero ui-stat--empty">
          <span className="ui-label">{t('farm.stat.income')}</span>
          <b className="ui-stat__value">{t('farm.stat.income.login')}</b>
        </div>
      ) : (
        <div className="ui-stat ui-stat--hero" title={inc ? undefined : t('farm.stat.income.wait')}>
          <span className="ui-label">{t('farm.stat.income')}</span>
          <b className="ui-stat__value">{inc ? inc.main : na}</b>
          <span className="ui-stat__sub">{inc ? inc.sub : pending ? t('farm.run.counting') : t('farm.stat.income.waitShort')}</span>
        </div>
      )}
      <div className="ui-stat">
        <span className="ui-label">{t('farm.stat.perHour')}</span>
        <b className="ui-stat__value">{rated ? rate(stats.maps / (dur / HOUR), lang) : na}</b>
        <span className="ui-stat__sub">{t('farm.stat.perHour.sub', { n: stats.maps })}</span>
      </div>
      <div className="ui-stat">
        <span className="ui-label">{t('farm.stat.avg')}</span>
        <b className="ui-stat__value">{stats.avgMapMs !== null ? clock(stats.avgMapMs) : na}</b>
        <span className="ui-stat__sub">{stats.fastestMapMs !== null ? t('farm.stat.avg.sub', { time: clock(stats.fastestMapMs) }) : ' '}</span>
      </div>
      <div className="ui-stat">
        <span className="ui-label">
          {t('farm.stat.deaths')}
          <span className="ui-q" title={t('farm.stat.deaths.q')}>
            ?
          </span>
        </span>
        <b className="ui-stat__value">{stats.deaths}</b>
        <span className="ui-stat__sub">
          {stats.deaths > 0
            ? t('farm.stat.deaths.sub', { n: stats.mapsWithDeaths, of: stats.maps })
            : t('farm.stat.deaths.none')}
        </span>
      </div>
    </div>
  )
}

function SessionRuns({ state, now, props }: { state: FarmState; now: number; props: FarmPanelProps }) {
  const t = useT()
  const lang = useLang()
  const simple = useSimple()
  const sid = state.session?.id
  const done = state.runs.filter((r) => r.sessionId === sid)
  const current = state.current && state.current.sessionId === sid ? state.current : null
  const game = gameOf(state)
  const poe2 = isPoe2(state)
  const total = done.reduce((a, r) => a + (r.profit?.chaos ?? 0), 0)
  const anyProfit = done.some((r) => r.profit) || !!current?.profit
  // PoE 2: итог — находки забегов сессии в ex
  const findsTotal = poe2 ? state.stats?.findsEx ?? null : null
  const expert = !simple
  const cells = profitCells(done)
  const low = (c: { low: boolean }) => (c.low ? t('farm.profit.low') : undefined)
  const profitCell = (c: ProfitCell | undefined, open: boolean) => {
    if (!c || c.kind === 'pending') {
      const text = open ? t('farm.run.running') : props.needLogin ? '—' : t('farm.run.counting')
      return <td className="is-num is-faint">{text}</td>
    }
    if (c.kind === 'inGroup') {
      return (
        <td className="is-num is-faint" title={t('farm.profit.inGroup', { n: c.runs })}>
          ≈{t('farm.chaos', { n: chaos(c.share, lang, true) })}
        </td>
      )
    }
    const tone = c.chaos < 0 ? 'is-bad' : 'is-good'
    const title = [c.kind === 'group' ? t('farm.profit.group', { n: c.runs }) : '', low(c) ?? ''].filter(Boolean).join(' ')
    return (
      <td className={`is-num ${tone}${c.low ? ' fm-low' : ''}`} title={title || undefined}>
        {t('farm.chaos', { n: chaos(c.chaos, lang, true) })}
        {c.kind === 'group' && <span className="fm-group"> {t('farm.profit.groupShort', { n: c.runs })}</span>}
      </td>
    )
  }
  /** c в мин: своя прибыль или доля группы ÷ время этой карты; PoE 2 — ex находок в мин */
  const perMin = (r: FarmRun, c: ProfitCell | undefined) => {
    if (poe2) {
      const v = runFindsEx(r)
      return v === null || r.activeMs < 60_000 ? '—' : rate(v / (r.activeMs / 60_000), lang)
    }
    if (!c || c.kind === 'pending' || r.activeMs < 60_000) return '—'
    const v = c.kind === 'own' ? c.chaos : c.share
    return rate(v / (r.activeMs / 60_000), lang)
  }

  return (
    <>
      <div className="ui-label">
        <Ico name="history" size="sm" />
        {t('farm.runs.session')}
        <span className="ui-label__grow" />
        {!poe2 && anyProfit && !props.needLogin && (
          <span className="fm-total">
            {t('farm.runs.total')} <b className={total < 0 ? 'fm-loss' : ''}>{t('farm.chaos', { n: chaos(total, lang, true) })}</b>
          </span>
        )}
        {findsTotal !== null && (
          <span className="fm-total" title={t('farm.poe2.byFinds')}>
            {t('farm.runs.total')} <b>{t('farm.ex', { n: exAmount(findsTotal, lang, true) })}</b>
          </span>
        )}
      </div>
      {!current && done.length === 0 ? (
        <p className="fm-p">{t('farm.runs.sessionEmpty')}</p>
      ) : (
        <div className="ui-box fm-tablewrap">
          <table className="ui-table">
            <thead>
              <tr>
                <th className="fm-n">#</th>
                <th>{t('farm.col.map')}</th>
                <th className="is-num">{t('farm.col.time')}</th>
                <th className="is-num">{t(poe2 ? 'farm.poe2.col.finds' : 'farm.col.profit')}</th>
                {expert && <th className="is-num">{t(poe2 ? 'farm.poe2.col.perMin' : 'farm.col.perMin')}</th>}
                <th className="is-num">{t('farm.col.deaths')}</th>
              </tr>
            </thead>
            <tbody>
              {current && (
                <tr className="is-now">
                  <td className="fm-n">{done.length + 1}</td>
                  <td>
                    {runName(current, game)}
                    <span className="ui-table__aside">{tierText(current, t)}</span>
                  </td>
                  <td className="is-num fm-now-time">{clock(currentRunMs(state, now))}</td>
                  {poe2 ? (
                    <FindsCell run={current} lang={lang} open />
                  ) : (
                    profitCell(current.profit ? { kind: 'own', chaos: current.profit.chaos, low: !!current.profit.low } : undefined, true)
                  )}
                  {expert && <td className="is-num">—</td>}
                  <td className="is-num">
                    <Deaths n={current.deaths} />
                  </td>
                </tr>
              )}
              {done.map((r, i) => (
                <tr key={r.id}>
                  <td className="fm-n">{done.length - i}</td>
                  <td>
                    {runName(r, game)}
                    <span className="ui-table__aside">{tierText(r, t)}</span>
                  </td>
                  <td className="is-num">{clock(r.activeMs)}</td>
                  {poe2 ? <FindsCell run={r} lang={lang} open={false} /> : profitCell(cells.get(r.id), false)}
                  {expert && <td className="is-num">{perMin(r, cells.get(r.id))}</td>}
                  <td className="is-num">
                    <Deaths n={r.deaths} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

/** PoE 2: прибыль сессии от «Богатства» (S70) — снимок или ввод в начале и в конце. */
function SessionProfitLine({ state }: { state: FarmState }) {
  const t = useT()
  const lang = useLang()
  const p = state.session?.profit
  if (!p) return <p className="fm-p fm-faint">{t('farm.poe2.sessionProfit.none')}</p>
  return (
    <p className="fm-p">
      {t('farm.poe2.sessionProfit', {
        n: exAmount(p.ex, lang, true),
        how: t(p.source === 'snapshot' ? 'farm.poe2.sessionProfit.snapshot' : 'farm.poe2.sessionProfit.manual'),
        time: when(p.at, lang)
      })}
    </p>
  )
}

const num = (s: string): number => Number(s.replace(',', '.').trim())

/**
 * PoE 2: находки забега — того, к которому добавит «+ находка» (открытый; в убежище после карты он ещё
 * открыт; иначе последний забег сессии). Ручной ввод — черновик до макета; окно цены зовёт тот же
 * farm:addFind с source 'ctrlD'.
 */
function FindsBox({ state }: { state: FarmState }) {
  const t = useT()
  const lang = useLang()
  const addFind = useFarmStore((s) => s.addFind)
  const removeFind = useFarmStore((s) => s.removeFind)
  const [open, setOpen] = useState(false)
  const [what, setWhat] = useState('')
  const [qty, setQty] = useState('1')
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const sid = state.session?.id
  const run = state.current ?? state.runs.find((r) => r.sessionId === sid) ?? null
  const finds = run?.finds ?? []

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const r: FarmFindResult = await addFind({
      ref: what,
      qty: qty.trim() ? num(qty) : 1,
      valueEx: value.trim() ? num(value) : null,
      source: 'manual'
    })
    if (r.ok) {
      setWhat('')
      setQty('1')
      setValue('')
      setError(null)
      setOpen(false)
    } else {
      setError(t(`farm.poe2.find.err.${r.reason}`))
    }
  }

  return (
    <>
      <div className="ui-label">
        <Ico name="coins" size="sm" />
        {run ? t('farm.poe2.finds.of', { map: runName(run, 'poe2') }) : t('farm.poe2.finds')}
        <span className="ui-label__grow" />
        <button type="button" className="ui-btn ui-btn--sm" disabled={!run} aria-expanded={open} onClick={() => setOpen(!open)}>
          {t('farm.poe2.find.add')}
        </button>
      </div>
      {open && run && (
        <form className="fm-find-form" onSubmit={(e) => void submit(e)}>
          <label className="ui-field fm-find-form__what">
            <span className="ui-field__label">{t('farm.poe2.find.what')}</span>
            <input
              className="ui-input"
              value={what}
              maxLength={200}
              required
              placeholder={t('farm.poe2.find.what.ph')}
              onChange={(e) => setWhat(e.target.value)}
            />
          </label>
          <label className="ui-field fm-find-form__num">
            <span className="ui-field__label">{t('farm.poe2.find.qty')}</span>
            <input className="ui-input ui-input--num" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <label className="ui-field fm-find-form__num">
            <span className="ui-field__label">{t('farm.poe2.find.value')}</span>
            <input
              className="ui-input ui-input--num"
              inputMode="decimal"
              value={value}
              placeholder="—"
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <button type="submit" className="ui-btn ui-btn--primary ui-btn--sm">
            {t('farm.poe2.find.save')}
          </button>
          {error && <span className="ui-field__error fm-find-form__err">{error}</span>}
        </form>
      )}
      {!run ? (
        <p className="fm-p">{t('farm.poe2.finds.noRun')}</p>
      ) : finds.length === 0 ? (
        <p className="fm-p">{t('farm.poe2.finds.empty')}</p>
      ) : (
        <div className="ui-box fm-tablewrap">
          <table className="ui-table">
            <tbody>
              {[...finds].reverse().map((f) => (
                <tr key={f.id}>
                  <td>
                    {f.name ?? f.ref}
                    {f.qty > 1 && <span className="ui-table__aside">×{f.qty}</span>}
                  </td>
                  <td className="fm-faint fm-nowrap">{t(f.source === 'ctrlD' ? 'farm.poe2.find.src.ctrlD' : 'farm.poe2.find.src.manual')}</td>
                  <td className={`is-num ${f.valueEx === null ? 'is-faint' : 'is-good'}`}>
                    {f.valueEx === null ? '—' : t('farm.ex', { n: exAmount(f.valueEx, lang, true) })}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                      title={t('farm.poe2.find.remove')}
                      aria-label={t('farm.poe2.find.remove')}
                      onClick={() => void removeFind(run.id, f.id)}
                    >
                      <Ico name="trash" size="sm" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function RunningView({ state, now, props }: { state: FarmState; now: number; props: FarmPanelProps }) {
  const t = useT()
  const simple = useSimple()
  const poe2 = isPoe2(state)
  const busy = useFarmStore((s) => s.busy)
  const pause = useFarmStore((s) => s.pause)
  const resume = useFarmStore((s) => s.resume)
  const stop = useFarmStore((s) => s.stop)
  const paused = state.session?.pausedAt !== null
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
        <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => void stop()}>
          <Ico name="stop" />
          {t('farm.session.stop')}
        </button>
      </div>
      <Kpis state={state} now={now} props={props} />
      {poe2 && <SessionProfitLine state={state} />}
      {simple && (
        <div className="ui-hint fm-hint">
          <Ico name="info" />
          <span>
            <Rich text={t(poe2 ? 'farm.poe2.hint.running' : 'farm.hint.running')} />
          </span>
        </div>
      )}
      <SessionRuns state={state} now={now} props={props} />
      {poe2 && <FindsBox state={state} />}
    </>
  )
}

// ---------------------------------------------------------------- все забеги

function AllRuns({ runs, game }: { runs: FarmRun[]; game: GameId }) {
  const t = useT()
  const lang = useLang()
  const poe2 = game === 'poe2'
  const removeRun = useFarmStore((s) => s.removeRun)
  const clear = useFarmStore((s) => s.clear)
  const [open, setOpen] = useState(false)
  if (runs.length === 0) return null
  const onClear = (): void => {
    if (window.confirm(t('farm.runs.clearConfirm'))) void clear()
  }
  // по макету — кнопка под таблицей, как «Все изменения» у тайника
  const toggle = (
    <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm fm-all__btn" aria-expanded={open} onClick={() => setOpen(!open)}>
      {t('farm.runs.all', { n: runs.length })}
      <Ico name={open ? 'chev-d' : 'chev-r'} />
    </button>
  )
  if (!open) return toggle
  return (
    <div className="fm-all">
      {toggle}
      <div className="fm-all__bar">
        <span className="fm-p fm-faint">{t('farm.how')}</span>
        <span className="fm-grow" />
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onClear}>
          <Ico name="trash" />
          {t('farm.runs.clear')}
        </button>
      </div>
      <div className="ui-box fm-tablewrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>{t('farm.col.when')}</th>
              <th>{t('farm.col.map')}</th>
              <th className="is-num">{t('farm.col.time')}</th>
              <th className="is-num" title={t('farm.col.entries.title')}>
                {t('farm.col.entries')}
              </th>
              <th className="is-num">{t(poe2 ? 'farm.poe2.col.finds' : 'farm.col.profit')}</th>
              <th className="is-num">{t('farm.col.deaths')}</th>
              <th aria-label={t('farm.runs.remove')} />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="fm-nowrap fm-faint">{when(r.startTs, lang)}</td>
                <td>
                  {runName(r, game)}
                  <span className="ui-table__aside">{tierText(r, t)}</span>
                </td>
                <td className="is-num">{clock(r.activeMs)}</td>
                <td className="is-num">{r.entries}</td>
                {poe2 ? (
                  <FindsCell run={r} lang={lang} open={false} />
                ) : (
                  <td className={`is-num ${!r.profit ? 'is-faint' : r.profit.chaos < 0 ? 'is-bad' : 'is-good'}`}>
                    {r.profit ? t('farm.chaos', { n: chaos(r.profit.chaos, lang, true) }) : '—'}
                  </td>
                )}
                <td className="is-num">
                  <Deaths n={r.deaths} />
                </td>
                <td>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                    title={t('farm.runs.remove')}
                    aria-label={t('farm.runs.remove')}
                    onClick={() => void removeRun(r.id)}
                  >
                    <Ico name="trash" size="sm" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- панель

export function FarmPanel(props: FarmPanelProps = {}) {
  const t = useT()
  const ready = useFarmStore((s) => s.ready)
  const state = useFarmStore((s) => s.state)
  const log = useFarmStore((s) => s.log)
  const init = useFarmStore((s) => s.init)
  const now = useNow(farmTicking(state))

  useEffect(() => {
    let off: (() => void) | undefined
    let disposed = false
    void init().then((fn) => (disposed ? fn() : (off = fn)))
    return () => {
      disposed = true
      off?.()
    }
  }, [init])

  if (!ready || !state) return <div className="ui-empty">{t('farm.loading')}</div>

  return (
    <div className="fm">
      {log && !log.supported && (
        <div className="ui-banner ui-banner--info">
          <Ico name="info" />
          <span>{t('farm.log.unsupported')}</span>
        </div>
      )}
      {log && log.supported && !log.connected && (
        <div className="ui-banner ui-banner--bad">
          <Ico name="warn" />
          <span>{t('farm.log.off')}</span>
        </div>
      )}

      {state.session ? <RunningView state={state} now={now} props={props} /> : <IdleView state={state} />}

      <AllRuns runs={state.runs} game={gameOf(state)} />
    </div>
  )
}
