import type { FarmRun, FarmState } from '@shared/types/farm'

// Форматирование трекера карт (S11b) — общее для панели компаньона и виджета оверлея.
// Время в снимке посчитано на момент state.at и «тикает» дальше на стороне окна.

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

/** «4:07», «1:02:03». */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const p = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`
}

/** Число с одним знаком после запятой по языку («7,5» / «7.5»). */
export function rate(v: number, lang: 'ru' | 'en'): string {
  return v.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1, minimumFractionDigits: v < 10 ? 1 : 0 })
}

/** Хаосы: целые с разделителем тысяч, знак минуса у убытка. */
export function chaos(v: number, lang: 'ru' | 'en'): string {
  return Math.round(v).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')
}

/** «Карта» для строки: имя на языке клиента, иначе id без префикса MapWorlds. */
export function runName(run: Pick<FarmRun, 'areaName' | 'areaId'>): string {
  if (run.areaName) return run.areaName
  return run.areaId.replace(/^MapWorlds/, '').replace(/([a-z])([A-Z])/g, '$1 $2')
}

/** «28.10 21:40» / «10/28 21:40». */
export function when(ts: number, lang: 'ru' | 'en'): string {
  const d = new Date(ts)
  const p = (n: number): string => String(n).padStart(2, '0')
  const date = lang === 'ru' ? `${p(d.getDate())}.${p(d.getMonth() + 1)}` : `${p(d.getMonth() + 1)}/${p(d.getDate())}`
  return `${date} ${p(d.getHours())}:${p(d.getMinutes())}`
}
