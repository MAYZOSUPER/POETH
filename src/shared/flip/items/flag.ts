// Флаг подвкладки «Обмен → Предметы» (S33). Раскрыта лидом 30.10 для проверки в игре перед v0.1.0.
// Для разработки — переменная окружения POETH_ITEMFLIP=1 (её читают main и preload; tests/flip/items/flag.test.ts).
// Включить для всех — решение лида: поменять ITEMFLIP_RELEASED (games.ts не трогаем — он заморожен).

import type { GameDef } from '../../games'

export const ITEMFLIP_ENV = 'POETH_ITEMFLIP'

/** Выпущено ли для всех игроков. */
export const ITEMFLIP_RELEASED = true

/** Флаг разработки из окружения процесса. */
export function itemFlipDevFlag(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[ITEMFLIP_ENV] === '1'
}

/** Предметы во вкладке «Обмен»: только PoE 1 (снимок цен — по лигам PoE 1), выпущено или флаг разработки. */
export function itemFlipOn(def: Pick<GameDef, 'id'>, dev: boolean, released = ITEMFLIP_RELEASED): boolean {
  return def.id === 'poe1' && (released || dev)
}
