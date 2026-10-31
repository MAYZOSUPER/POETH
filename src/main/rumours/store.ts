import { app } from 'electron'
import path from 'path'
import { emptyRumoursUser, normalizeRumoursUser, type RumoursUserState } from '@shared/rumours/marks'
import { readJson, writeJsonAtomic } from '../services/atomicJson'

// Выбранные слухи и пометки игрока (S65): %APPDATA%/POETH/rumours.json. Только на этом ПК, в сеть не уходит.
// Ни текста буфера, ни данных персонажа здесь нет — только id слухов, свой тир, «не беру» и своя заметка.

let cache: RumoursUserState | null = null
let writing: Promise<void> = Promise.resolve()

function dataFile(): string {
  return path.join(app.getPath('userData'), 'rumours.json')
}

export async function getRumoursUser(): Promise<RumoursUserState> {
  if (!cache) cache = normalizeRumoursUser(await readJson<unknown>(dataFile(), null))
  return cache
}

/** Правка и запись по очереди (компаньон и оверлей могут писать одновременно). */
export async function updateRumoursUser(fn: (s: RumoursUserState) => RumoursUserState): Promise<RumoursUserState> {
  const next = fn(await getRumoursUser())
  cache = next
  writing = writing
    .then(() => writeJsonAtomic(dataFile(), next))
    .catch((e) => {
      console.error('[rumours] не удалось сохранить rumours.json:', e)
    })
  await writing
  return next
}

/** Для тестов и смены профиля: забыть кэш. */
export function resetRumoursUserCache(): void {
  cache = null
}

export { emptyRumoursUser }
