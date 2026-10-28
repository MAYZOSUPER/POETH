// Флаг вкладки «Что фармить» (S16). В релизе v0.1.0 вкладка скрыта: GameDef.features.advisor = false.
// Для разработки — переменная окружения POETH_ADVISOR=1 (её читают main и preload; tests/advisor/flag.test.ts).

import type { GameDef } from '../games'

export const ADVISOR_ENV = 'POETH_ADVISOR'

/** Флаг разработки из окружения процесса. */
export function advisorDevFlag(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[ADVISOR_ENV] === '1'
}

/** Советник в игре: включён таблицей игр или флагом разработки (данные стратегий есть только для PoE 1). */
export function advisorOn(def: GameDef, dev: boolean): boolean {
  return def.features.advisor || (dev && def.id === 'poe1')
}
