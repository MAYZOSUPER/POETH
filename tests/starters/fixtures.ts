import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import type { StarterRecord } from '@shared/starters/schema'

// Общее для тестов «Стартеров» (S59): выдуманные записи из tests/fixtures/starters (ссылки и id — не настоящие,
// отпечатки — от фикстур PoB tests/fixtures/pob/*).

export const FIX = resolve(__dirname, '../fixtures/starters')
export const POB_FIX = resolve(__dirname, '../fixtures/pob')

export function readFix(dir: string, file: string): string {
  return readFileSync(join(FIX, dir, file), 'utf8')
}

/** Чтение папки фикстур так, как его делает main (нет файла — null). */
export const reader =
  (dir: string) =>
  async (file: string): Promise<string | null> => {
    try {
      return readFix(dir, file)
    } catch {
      return null
    }
  }

/** Хорошая запись (копия), поля можно поменять. */
export function record(patch: Record<string, unknown> = {}): StarterRecord & Record<string, unknown> {
  const base = JSON.parse(readFix('good', '3.30.json')).starters[1] as StarterRecord
  return { ...JSON.parse(JSON.stringify(base)), ...patch }
}
