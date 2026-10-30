// «Играть по этому гайду» (S59, §6.4; чистый модуль, tests/starters/play.test.ts): скачанный код PoB стартера →
// модель билда (разбор S35) + сверка отпечатка с проверенной версией (§2.4). Отпечаток не совпал — не ошибка:
// «Автор обновил PoB после нашей проверки» (обычно он улучшает билд), игрок может продолжить.
// Здесь же подсказки для инструмента лида (tools/starters/add-starter.mjs): главный навык, класс, версия игры
// и «ведёт по актам» — из самого PoB.

import { decodePobCode, type PobInflate } from '../pob/decode'
import type { PobImportError } from '../pob/import'
import { parsePobXml, type PobBuild } from '../pob/model'
import { resolveStages } from '../pob/stages'
import { mainSkill } from '../build/library'
import { pobFingerprint } from './fingerprint'
import { STARTER_CLASSES, patchOf, type StarterClass, type StarterLeveling } from './schema'

export type StarterCodeResult =
  | { ok: true; build: PobBuild; fingerprint: string }
  | { ok: false; error: PobImportError; detail?: string }

/** Код PoB → модель и отпечаток канонического XML без <Import>. */
export function importStarterCode(code: string, inflate: PobInflate, sha256: (text: string) => string): StarterCodeResult {
  const dec = decodePobCode(code, inflate)
  if (!dec.ok) return { ok: false, error: dec.error }
  const res = parsePobXml(dec.xml)
  if (!res.ok) return { ok: false, error: res.error, detail: res.detail }
  const fingerprint = pobFingerprint(dec.xml, sha256)
  if (!fingerprint) return { ok: false, error: 'not-pob' }
  return { ok: true, build: res.build, fingerprint }
}

/** PoB изменился после нашей проверки (отпечаток другой). */
export function pobChanged(checkedSha256: string, fingerprint: string): boolean {
  return checkedSha256 !== fingerprint
}

/** Этапы прокачки по актам и уровням (без «всей кампании» одним деревом и без карт). */
export function levelingStages(build: PobBuild): number {
  return resolveStages(build).stages.filter((s) => s.leveling && s.guess.kind !== 'maps' && !s.guess.campaign).length
}

/** «Ведёт по актам»: от трёх этапов по актам — да, один-два или одно дерево на всю кампанию — частично, нет — нет. */
export function levelingHint(build: PobBuild): StarterLeveling {
  const n = levelingStages(build)
  if (n >= 3) return 'acts'
  if (n > 0 || resolveStages(build).stages.some((s) => s.leveling)) return 'partial'
  return 'none'
}

export interface StarterFacts {
  class: StarterClass | null
  ascendancy: string | null
  skill: { en: string; gem: string | null }
  /** версия игры активного дерева (`3_30` → `3.30`) */
  patch: string | null
  leveling: StarterLeveling
  /** этапов прокачки по актам и уровням */
  stages: number
}

/** Что можно взять из самого PoB для записи стартера (лид проверяет глазами). */
export function starterFacts(build: PobBuild): StarterFacts {
  const spec = build.specs[build.activeSpec] ?? build.specs[0]
  const main = mainSkill(build)
  return {
    class: STARTER_CLASSES.find((c) => c === build.className) ?? null,
    ascendancy: build.ascendClassName && build.ascendClassName !== 'None' ? build.ascendClassName : null,
    skill: { en: main.name, gem: main.gemId },
    patch: patchOf(spec?.treeVersion ?? build.targetVersion),
    leveling: levelingHint(build),
    stages: levelingStages(build)
  }
}
