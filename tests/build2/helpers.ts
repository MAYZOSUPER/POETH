import { readFileSync } from 'fs'
import { join, resolve } from 'path'
import { inflateNode } from '@shared/advisor/codecNode'
import { importPob2Code } from '@shared/pob/import'
import type { Pob2Build } from '@shared/pob/poe2'
import { POE2_GEMS_FILE, POE2_TREE_FILE, parsePoe2Gems, parsePoe2Tree, type Poe2GemData, type Poe2TreeData } from '@shared/poe2/build/data'
import { fixtureCode } from '../pob/fixtures'

// Общее для tests/build2 (S66): данные resources/data/poe2/build и фикстуры PoB2 — три настоящих кода из
// tests/fixtures/pob (S35) и сборная фикстура прокачки tests/fixtures/pob2 (make-leveling.mjs).

export const DATA2 = resolve(__dirname, '../../resources/data/poe2')
export const tree = parsePoe2Tree(JSON.parse(readFileSync(join(DATA2, POE2_TREE_FILE), 'utf8'))) as Poe2TreeData
export const gems = parsePoe2Gems(JSON.parse(readFileSync(join(DATA2, POE2_GEMS_FILE), 'utf8'))) as Poe2GemData

export const POB2_DIR = join(__dirname, '..', 'fixtures', 'pob2')

/** Фикстуры PoB2: имя → код. */
export const POB2_FIXTURES: Record<string, () => string> = {
  amazon: () => fixtureCode('poe2-pobbin-amazon'),
  stormweaver: () => fixtureCode('poe2-pobbin-stormweaver'),
  pathfinder: () => fixtureCode('poe2-pobbin-pathfinder'),
  'leveling-amazon': () => readFileSync(join(POB2_DIR, 'leveling-amazon.txt'), 'utf8').trim()
}

export function pob2(name: keyof typeof POB2_FIXTURES | string): Pob2Build {
  const res = importPob2Code(POB2_FIXTURES[name](), inflateNode)
  if (!res.ok) throw new Error(`${name}: ${res.error}`)
  return res.build
}
