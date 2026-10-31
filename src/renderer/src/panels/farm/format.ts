import type { GameId } from '@shared/games'
import type { FarmRun, FarmState, FarmStats } from '@shared/types/farm'

// Форматирование трекера карт (S11b; PoE 2 — S69) — общее для панели компаньона и виджета оверлея.
// Время в снимке посчитано на момент state.at и «тикает» дальше на стороне окна. PoE 2 считает в exalted.

/** Время текущего забега на момент `now`. */
export function currentRunMs(state: FarmState, now: number): number {
  const run = state.current
  if (!run) return 0
  return run.activeMs + (state.ticking ? Math.max(0, now - state.at) : 0)
}

/** Сессия идёт и не на паузе — её время тикает. */
export function sessionTicking(state: FarmState): boolean {
  return !!state.session && state.session.pausedAt === null
}

/** Время сессии без пауз на момент `now`. */
export function sessionMs(state: FarmState, now: number): number {
  if (!state.stats) return 0
  return state.stats.durationMs + (sessionTicking(state) ? Math.max(0, now - state.at) : 0)
}

/** «4:07», «1:02:03»; withHours — всегда с часами («0:00:14», часы сессии). */
export function clock(ms: number, withHours = false): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (n: number): string => String(n).padStart(2, '0')
  return h > 0 || withHours ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`
}

/** Число с одним знаком после запятой по языку («7,5» / «7.5»). */
export function rate(v: number, lang: 'ru' | 'en'): string {
  return v.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1, minimumFractionDigits: v < 10 ? 1 : 0 })
}

/** Хаосы: целые с разделителем тысяч; signed — «+» у прибыли (минус у убытка — всегда). */
export function chaos(v: number, lang: 'ru' | 'en', signed = false): string {
  const n = Math.round(v)
  const s = n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')
  return signed && n > 0 ? `+${s}` : s
}

/**
 * Доход в час по макету: главная цифра в div (под ней ≈ chaos), пока доход меньше 1 div в час —
 * наоборот. Без курса div — только chaos.
 */
export function income(perHourChaos: number, chaosPerDivine: number | null, lang: 'ru' | 'en'): { main: string; sub: string } {
  const perHour = lang === 'ru' ? 'в час' : 'per hour'
  if (!chaosPerDivine || !(chaosPerDivine > 0)) return { main: `${chaos(perHourChaos, lang)} chaos`, sub: perHour }
  const div = perHourChaos / chaosPerDivine
  const loc = lang === 'ru' ? 'ru-RU' : 'en-US'
  const divText = (d: number, digits: number): string => d.toLocaleString(loc, { maximumFractionDigits: digits })
  return Math.abs(div) >= 1
    ? { main: `${divText(div, 1)} div`, sub: `≈ ${chaos(perHourChaos, lang)} chaos ${perHour}` }
    : { main: `${chaos(perHourChaos, lang)} chaos`, sub: `≈ ${divText(div, 2)} div` }
}

/**
 * Ячейка «Прибыль» забега. Прибыль от S11a приходит на последний забег группы (profit.runs > 1, когда
 * лимит сайта не дал снять снимок тайника между картами); предыдущие runs − 1 — «в группе» с долей.
 */
export type ProfitCell =
  | { kind: 'own'; chaos: number; low: boolean }
  | { kind: 'group'; chaos: number; share: number; runs: number; low: boolean }
  | { kind: 'inGroup'; share: number; runs: number; low: boolean }
  | { kind: 'pending' }

/** Ячейки прибыли завершённых забегов; `runs` — свежие сверху (как в истории). */
export function profitCells(runs: FarmRun[]): Map<string, ProfitCell> {
  const out = new Map<string, ProfitCell>()
  let left = 0
  let group: { share: number; runs: number; low: boolean } | null = null
  for (const r of runs) {
    const p = r.profit
    if (p) {
      const low = p.low === true
      if (p.runs > 1) {
        group = { share: p.chaos / p.runs, runs: p.runs, low }
        left = p.runs - 1
        out.set(r.id, { kind: 'group', chaos: p.chaos, ...group })
      } else {
        left = 0
        out.set(r.id, { kind: 'own', chaos: p.chaos, low })
      }
    } else if (left > 0 && group) {
      left -= 1
      out.set(r.id, { kind: 'inGroup', ...group })
    } else {
      out.set(r.id, { kind: 'pending' })
    }
  }
  return out
}

/** Свежий курс div → chaos из прибылей забегов (S11a кладёт его в каждую прибыль). */
export function latestDivineRate(runs: FarmRun[]): number | null {
  for (const r of runs) if (r.profit?.divineRate) return r.profit.divineRate
  return null
}

/**
 * «Карта» для строки: имя на языке клиента, иначе id без префикса — PoE 1 MapWorlds, PoE 2 Map
 * (MapBluff → Bluff, MapHideoutFarmlands_Claimable → Hideout Farmlands).
 */
export function runName(run: Pick<FarmRun, 'areaName' | 'areaId'>, game: GameId = 'poe1'): string {
  if (run.areaName) return run.areaName
  if (game === 'poe2') {
    const id = run.areaId.replace(/^Map_?/, '').replace(/_Claimable$/, '')
    return id.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim() || run.areaId
  }
  return run.areaId.replace(/^MapWorlds/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
}

// ---------------------------------------------------------------- PoE 2: exalted, находки

/** Σ цен находок забега в exalted; null — ни одной с ценой. */
export function runFindsEx(run: Pick<FarmRun, 'finds'>): number | null {
  const priced = (run.finds ?? []).filter((f) => f.valueEx !== null)
  return priced.length ? priced.reduce((a, f) => a + (f.valueEx as number), 0) : null
}

/** Exalted: меньше 10 — с одним знаком, дальше целые; signed — «+» у прибыли. */
export function exAmount(v: number, lang: 'ru' | 'en', signed = false): string {
  const digits = Math.abs(v) < 10 ? 1 : 0
  const s = v.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: digits })
  return signed && v > 0 ? `+${s}` : s
}

/** Чем считать доход PoE 2: прибыль сессии от «Богатства» (S70), без неё — находки. */
export function exBase(stats: Pick<FarmStats, 'profitEx' | 'findsEx'> | null | undefined): number | null {
  return stats?.profitEx ?? stats?.findsEx ?? null
}

/**
 * Доход в час PoE 2 по макету PoE 1: от 1 div в час — главная цифра в div (под ней ≈ ex), меньше —
 * наоборот. Без курса ex → div — только ex.
 */
export function incomeEx(perHourEx: number, exPerDiv: number | null, lang: 'ru' | 'en'): { main: string; sub: string } {
  const perHour = lang === 'ru' ? 'в час' : 'per hour'
  if (!exPerDiv || !(exPerDiv > 0)) return { main: `${exAmount(perHourEx, lang)} ex`, sub: perHour }
  const div = perHourEx / exPerDiv
  const loc = lang === 'ru' ? 'ru-RU' : 'en-US'
  const divText = (d: number, digits: number): string => d.toLocaleString(loc, { maximumFractionDigits: digits })
  return Math.abs(div) >= 1
    ? { main: `${divText(div, 1)} div`, sub: `≈ ${exAmount(perHourEx, lang)} ex ${perHour}` }
    : { main: `${exAmount(perHourEx, lang)} ex`, sub: `≈ ${divText(div, 2)} div` }
}

/** «28.10 21:40» / «10/28 21:40». */
export function when(ts: number, lang: 'ru' | 'en'): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  const date = lang === 'ru' ? `${p(d.getDate())}.${p(d.getMonth() + 1)}` : `${p(d.getMonth() + 1)}/${p(d.getDate())}`
  return `${date} ${p(d.getHours())}:${p(d.getMinutes())}`
}
