import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { validateRumoursFile, type RumourRecord, type RumoursFile } from '@shared/rumours/schema'

// Общее для тестов «Слухов журнала» (S65): встроенный файл данных и короткая запись для правок.

export const ROOT = resolve(__dirname, '../..')
export const DATA_FILE = join(ROOT, 'resources/data/poe2/rumours/rumours.json')

export function bundledRaw(): unknown {
  return JSON.parse(readFileSync(DATA_FILE, 'utf8'))
}

/** Встроенный файл, прошедший валидатор (тест падает, если он битый). */
export function bundled(): RumoursFile {
  const v = validateRumoursFile(bundledRaw())
  if (!v.ok) throw new Error(v.error)
  return v.value.file
}

export function rec(id: string, patch: Partial<RumourRecord> = {}): RumourRecord {
  return {
    id,
    area: `Area_${id.replace(/-/g, '_')}`,
    text: { en: `${id} en...`, ru: `${id} ру...` },
    island: { en: `${id} isle`, ru: `${id} остров` },
    category: 'expedition',
    bosses: [],
    rewards: [],
    risks: [],
    difficulty: 2,
    tier: 2,
    note: { ru: 'строка', en: 'line' },
    checked: null,
    ...patch
  }
}
