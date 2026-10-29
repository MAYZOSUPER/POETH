// Флаг вкладки «Билд» (v0.2, S35). До релиза вкладка скрыта; для разработки — переменная окружения
// POETH_BUILD=1 (её будут читать main и preload, как POETH_ADVISOR у советника; tests/pob/flag.test.ts).
// Когда лид добавит GameFeatures.build в src/shared/games.ts (замороженный файл), флаг возьмёт его оттуда;
// пока поля нет — вкладка только по флагу разработки.

import type { GameDef } from '../games'

export const BUILD_ENV = 'POETH_BUILD'

/** Флаг разработки из окружения процесса. */
export function buildDevFlag(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[BUILD_ENV] === '1'
}

/** Вкладка «Билд» в игре: включена таблицей игр или флагом разработки (разбор PoB есть только для PoE 1). */
export function buildOn(def: GameDef, dev: boolean): boolean {
  const released = (def.features as Readonly<Partial<Record<'build', boolean>>>).build === true
  return released || (dev && def.id === 'poe1')
}
